import { CONFIG, configSourceLabel } from "../config.mjs";
import { fetchWithTimeout } from "../helpers.mjs";
import { formatFetchError } from "./agileplace.mjs";

const {
  OKR_BASE,
  OKR_CLIENT_ID,
  OKR_CLIENT_SECRET,
  OKR_TOKEN,
  OKR_DEFAULT_LIMIT,
  OKR_FETCH_TIMEOUT_MS,
} = CONFIG;

// Extract region from OKR_BASE_URL (e.g., api-us.okrs.planview.com -> us)
export function getOkrRegion() {
  if (!OKR_BASE) return "us"; // default
  const match = OKR_BASE.match(/api-([a-z]+)\.okrs\.planview\.com/);
  return match ? match[1] : "us";
}

// Token cache for OAuth2 access tokens
let okrAccessToken = null;
let okrTokenExpiry = null;

// OKR OAuth2 token exchange
// Token endpoint: https://<region>.id.planview.com/io/v1/oauth2/token
export async function getOkrAccessToken() {
  // Return cached token if still valid (with 5 minute buffer)
  if (okrAccessToken && okrTokenExpiry && Date.now() < okrTokenExpiry - 300000) {
    return okrAccessToken;
  }

  if (!OKR_BASE || !OKR_CLIENT_ID || !OKR_CLIENT_SECRET) {
    throw new Error(
      `OKR integration not configured. Set OKR_BASE_URL, OKR_CLIENT_ID, and OKR_CLIENT_SECRET in ${configSourceLabel()}.`
    );
  }

  const region = getOkrRegion();
  const tokenUrl = `https://${region}.id.planview.com/io/v1/oauth2/token`;

  try {
    const formData = new URLSearchParams();
    formData.append("grant_type", "client_credentials");
    formData.append("client_id", OKR_CLIENT_ID);
    formData.append("client_secret", OKR_CLIENT_SECRET);

    const resp = await fetchWithTimeout(
      tokenUrl,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: formData.toString(),
      },
      OKR_FETCH_TIMEOUT_MS
    );

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Token exchange failed: ${resp.status} ${resp.statusText} - ${text}`);
    }

    const data = await resp.json();
    okrAccessToken = data.access_token;
    // Default to 1 hour expiry if not provided, with 5 minute buffer
    const expiresIn = (data.expires_in || 3600) * 1000;
    okrTokenExpiry = Date.now() + expiresIn;
    return okrAccessToken;
  } catch (err) {
    throw new Error(`Failed to obtain OKR access token from ${tokenUrl}: ${err?.message || err}`, { cause: err });
  }
}

// OKR HTTP client helper
export async function fetchOkrJson(path, queryParams = {}) {
  if (!OKR_BASE) {
    throw new Error(
      `OKR integration not configured. Set OKR_BASE_URL in ${configSourceLabel()}.`
    );
  }

  // Use OKR_TOKEN if provided, otherwise exchange OAuth2 credentials for token
  let accessToken;
  if (OKR_TOKEN) {
    accessToken = OKR_TOKEN;
  } else if (OKR_CLIENT_ID && OKR_CLIENT_SECRET) {
    accessToken = await getOkrAccessToken();
  } else {
    throw new Error(
      `OKR integration not configured. Set OKR_TOKEN or (OKR_CLIENT_ID and OKR_CLIENT_SECRET) in ${configSourceLabel()}.`
    );
  }

  const queryString = new URLSearchParams(
    Object.entries(queryParams).filter(([_, v]) => v !== undefined && v !== null)
  ).toString();
  const url = `${OKR_BASE}/api/rest/v1${path}${queryString ? `?${queryString}` : ""}`;

  const resp = await fetchWithTimeout(
    url,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    },
    OKR_FETCH_TIMEOUT_MS
  );

  if (!resp.ok) {
    const text = await resp.text();
    const operation = path.includes("/key-results") ? "Get key results" : "List objectives";

    // If 401 (Unauthorized), token might be expired - clear cache and retry once
    if (resp.status === 401 && !OKR_TOKEN) {
      okrAccessToken = null;
      okrTokenExpiry = null;

      const freshToken = await getOkrAccessToken();
      const retryResp = await fetchWithTimeout(
        url,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${freshToken}`,
            Accept: "application/json",
          },
        },
        OKR_FETCH_TIMEOUT_MS
      );

      if (retryResp.ok) {
        return retryResp.json();
      }
      const retryText = await retryResp.text();
      throw new Error(
        `${operation} failed: ${retryResp.status} ${retryResp.statusText} - Token refresh attempted but still failed. ${retryText.slice(0, 200)}`
      );
    }

    if (resp.status === 401 || resp.status === 403) {
      throw new Error(
        `${operation} failed: ${resp.status} ${resp.statusText} - Check OKR credentials permissions. ${text.slice(0, 200)}`
      );
    }
    if (resp.status === 429) {
      throw new Error(
        `${operation} failed: ${resp.status} ${resp.statusText} - Rate limit exceeded. ${text.slice(0, 200)}`
      );
    }

    throw new Error(formatFetchError(resp, `OKR ${operation}`, text));
  }

  return resp.json();
}

export { OKR_DEFAULT_LIMIT };

