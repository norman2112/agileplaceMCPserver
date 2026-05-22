const DEFAULT_ACCOUNT_NAME = "default";

function normalizeAccountName(name) {
  const raw = typeof name === "string" ? name.trim() : "";
  return raw ? raw.toLowerCase() : DEFAULT_ACCOUNT_NAME;
}

function parseAccountsFromEnv() {
  const discovered = new Map();
  const names = new Set();

  for (const key of Object.keys(process.env)) {
    const tokenMatch = key.match(/^AGILEPLACE_([A-Z0-9_]+)_TOKEN$/);
    const urlMatch = key.match(/^AGILEPLACE_([A-Z0-9_]+)_URL$/);
    if (tokenMatch) names.add(tokenMatch[1]);
    if (urlMatch) names.add(urlMatch[1]);
  }

  for (const upperName of names) {
    const token = process.env[`AGILEPLACE_${upperName}_TOKEN`];
    const url = process.env[`AGILEPLACE_${upperName}_URL`];
    if (!token || !url) continue;

    const normalizedName = normalizeAccountName(upperName);
    // Alias is derived from env var token between AGILEPLACE_ and _{URL|TOKEN}.
    // Example: AGILEPLACE_DEFAULT_URL/TOKEN -> alias "default" (canonical).
    discovered.set(normalizedName, {
      name: normalizedName,
      token: String(token),
      url: String(url).replace(/\/+$/, ""),
    });
  }

  return discovered;
}

const ACCOUNTS = parseAccountsFromEnv();
const HAS_DEFAULT_ACCOUNT = ACCOUNTS.has(DEFAULT_ACCOUNT_NAME);

if (!HAS_DEFAULT_ACCOUNT) {
  console.error(
    "Warning: No default AgilePlace account is configured. Set AGILEPLACE_DEFAULT_URL and AGILEPLACE_DEFAULT_TOKEN."
  );
}

function getAvailableAccountsMessage() {
  const names = listAccountNames();
  return names.length > 0 ? names.join(", ") : "(none configured)";
}

export function listAccountNames() {
  return [...ACCOUNTS.keys()].sort((a, b) => {
    if (a === DEFAULT_ACCOUNT_NAME && b !== DEFAULT_ACCOUNT_NAME) return -1;
    if (b === DEFAULT_ACCOUNT_NAME && a !== DEFAULT_ACCOUNT_NAME) return 1;
    return a.localeCompare(b);
  });
}

export function getDefaultAccountName() {
  return HAS_DEFAULT_ACCOUNT ? DEFAULT_ACCOUNT_NAME : null;
}

export function resolveAccountConfig(requestedAccount) {
  const normalized = normalizeAccountName(requestedAccount);
  const found = ACCOUNTS.get(normalized);
  if (!found) {
    throw new Error(`Unknown account "${normalized}". Available accounts: ${getAvailableAccountsMessage()}`);
  }
  return found;
}

