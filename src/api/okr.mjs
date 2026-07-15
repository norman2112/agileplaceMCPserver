import { CONFIG, configSourceLabel } from "../config.mjs";
import { fetchWithTimeout } from "../helpers.mjs";
import { fetchResponseError } from "./agileplace.mjs";

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

function clearOkrTokenCache() {
  okrAccessToken = null;
  okrTokenExpiry = null;
}

// OKR OAuth2 token exchange
// Token endpoint: https://<region>.id.planview.com/io/v1/oauth2/token
export async function getOkrAccessToken() {
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
      throw fetchResponseError(resp, "OKR token exchange", text);
    }

    const data = await resp.json();
    okrAccessToken = data.access_token;
    const expiresIn = (data.expires_in || 3600) * 1000;
    okrTokenExpiry = Date.now() + expiresIn;
    return okrAccessToken;
  } catch (err) {
    throw new Error(`Failed to obtain OKR access token from ${tokenUrl}: ${err?.message || err}`, { cause: err });
  }
}

async function resolveOkrAccessToken() {
  if (!OKR_BASE) {
    throw new Error(
      `OKR integration not configured. Set OKR_BASE_URL in ${configSourceLabel()}.`
    );
  }
  if (OKR_TOKEN) {
    return OKR_TOKEN;
  }
  if (OKR_CLIENT_ID && OKR_CLIENT_SECRET) {
    return getOkrAccessToken();
  }
  throw new Error(
    `OKR integration not configured. Set OKR_TOKEN or (OKR_CLIENT_ID and OKR_CLIENT_SECRET) in ${configSourceLabel()}.`
  );
}

/**
 * Run an OKR HTTP call with one 401 refresh-and-retry (OAuth2 and static OKR_TOKEN).
 */
async function withOkrAuth(fn) {
  let accessToken = await resolveOkrAccessToken();

  const run = async token => fn(token);

  try {
    return await run(accessToken);
  } catch (err) {
    if (err?.statusCode !== 401) {
      throw err;
    }
    if (!OKR_TOKEN) {
      clearOkrTokenCache();
      accessToken = await getOkrAccessToken();
    }
    return await run(accessToken);
  }
}

function okrErrorFromResponse(resp, operation, text) {
  // Always go through fetchResponseError so bodies stay server-side only.
  if (resp.status === 401 || resp.status === 403) {
    const err = fetchResponseError(resp, operation, text);
    err.message = `${operation} failed: ${resp.status} ${resp.statusText} — check OKR credentials/permissions`;
    return err;
  }
  if (resp.status === 429) {
    const err = fetchResponseError(resp, operation, text);
    err.message = `${operation} failed: ${resp.status} ${resp.statusText} — rate limit exceeded`;
    return err;
  }
  return fetchResponseError(resp, operation, text);
}

// OKR HTTP client helper
export async function fetchOkrJson(path, queryParams = {}) {
  const queryString = new URLSearchParams(
    Object.entries(queryParams).filter(([_, v]) => v !== undefined && v !== null)
  ).toString();
  const url = `${OKR_BASE}/api/rest/v1${path}${queryString ? `?${queryString}` : ""}`;
  const operation = path.includes("/key-results") ? "Get key results" : "List objectives";

  return withOkrAuth(async accessToken => {
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
      throw okrErrorFromResponse(resp, `OKR ${operation}`, text);
    }

    return resp.json();
  });
}

/** Build PATCH body with only defined, non-null fields (snake_case API keys). */
export function buildOkrPatchBody(fields) {
  const body = {};
  for (const [key, value] of Object.entries(fields || {})) {
    if (value !== undefined && value !== null) {
      body[key] = value;
    }
  }
  if (Object.keys(body).length === 0) {
    throw new Error("At least one field to update is required.");
  }
  return body;
}

/** POST/PATCH/DELETE to Planview OKR REST API (write operations). */
export async function mutateOkrJson(path, { method = "POST", body } = {}) {
  const url = `${OKR_BASE}/api/rest/v1${path}`;

  return withOkrAuth(async accessToken => {
    const resp = await fetchWithTimeout(
      url,
      {
        method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      },
      OKR_FETCH_TIMEOUT_MS
    );

    if (!resp.ok) {
      const text = await resp.text();
      throw okrErrorFromResponse(resp, `OKR ${method} ${path}`, text);
    }
    return resp.json().catch(() => ({}));
  });
}

export { OKR_DEFAULT_LIMIT };
