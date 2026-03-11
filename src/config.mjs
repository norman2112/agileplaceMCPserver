import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync, readFileSync } from "fs";
import os from "os";

// These helpers are moved from the original server.mjs. Behavior is preserved.

function getDefaultClaudeDesktopConfigPath() {
  if (process.env.CLAUDE_DESKTOP_CONFIG_PATH) return process.env.CLAUDE_DESKTOP_CONFIG_PATH;

  // Claude Desktop config default locations
  // macOS: ~/Library/Application Support/Claude/claude_desktop_config.json
  // Windows: %APPDATA%\\Claude\\claude_desktop_config.json
  // Linux (best-effort): ~/.config/Claude/claude_desktop_config.json
  if (process.platform === "darwin") {
    return join(os.homedir(), "Library", "Application Support", "Claude", "claude_desktop_config.json");
  }
  if (process.platform === "win32") {
    const appData = process.env.APPDATA || join(os.homedir(), "AppData", "Roaming");
    return join(appData, "Claude", "claude_desktop_config.json");
  }
  return join(os.homedir(), ".config", "Claude", "claude_desktop_config.json");
}

function safeReadJsonFile(filePath) {
  const raw = readFileSync(filePath, "utf8");
  try {
    return JSON.parse(raw);
  } catch (err) {
    const msg = err?.message ? String(err.message) : String(err);
    throw new Error(`Failed to parse JSON at ${filePath}: ${msg}`);
  }
}

function pickMcpServerKey(mcpServers) {
  const keys = Object.keys(mcpServers || {}).filter(Boolean);
  if (keys.length === 0) return undefined;

  // Allow explicit override.
  const requestedKey = (process.env.CLAUDE_MCP_SERVER_KEY || "").trim();
  if (requestedKey && mcpServers?.[requestedKey]) return requestedKey;

  // Prefer common key if present.
  if (mcpServers?.agileplace) return "agileplace";

  // If there is exactly one configured server, use it.
  if (keys.length === 1) return keys[0];

  // Try to match by the args containing this server's path.
  const __filename = fileURLToPath(import.meta.url);
  for (const key of keys) {
    const args = mcpServers?.[key]?.args;
    if (!Array.isArray(args)) continue;
    if (args.some(a => typeof a === "string" && (a === __filename || a.endsWith("/server.mjs") || a.endsWith("\\server.mjs")))) {
      return key;
    }
  }

  // Fall back to the first key for determinism.
  return keys[0];
}

function loadEnvFromClaudeDesktopConfig() {
  const configPath = getDefaultClaudeDesktopConfigPath();
  if (!existsSync(configPath)) {
    return { loaded: false, configPath, reason: "not_found" };
  }

  const configJson = safeReadJsonFile(configPath);
  const mcpServers = configJson?.mcpServers;
  if (!mcpServers || typeof mcpServers !== "object") {
    return { loaded: false, configPath, reason: "missing_mcpServers" };
  }

  const serverKey = pickMcpServerKey(mcpServers);
  if (!serverKey) {
    return { loaded: false, configPath, reason: "empty_mcpServers" };
  }

  const env = mcpServers?.[serverKey]?.env;
  if (!env || typeof env !== "object") {
    return { loaded: false, configPath, serverKey, reason: "missing_env" };
  }

  // Populate process.env from Claude config, but do not override explicitly set env vars.
  for (const [key, value] of Object.entries(env)) {
    if (process.env[key] !== undefined) continue;
    if (value === undefined || value === null) continue;
    process.env[key] = String(value);
  }

  return { loaded: true, configPath, serverKey };
}

// Load env from Claude Desktop config (no config.env fallback).
// Keep this silent to avoid stdout interference with MCP stdio.
const originalConsole = { log: console.log, error: console.error, info: console.info, warn: console.warn };
console.log = console.error = console.info = console.warn = () => {};
let claudeConfigLoadResult;
try {
  claudeConfigLoadResult = loadEnvFromClaudeDesktopConfig();
} catch (err) {
  claudeConfigLoadResult = { loaded: false, configPath: getDefaultClaudeDesktopConfigPath(), reason: "error", error: err };
}
Object.assign(console, originalConsole); // Restore console methods
if (claudeConfigLoadResult?.reason === "error") {
  console.error(`❌ Failed loading Claude Desktop config JSON: ${claudeConfigLoadResult?.error?.message || claudeConfigLoadResult?.error}`);
  process.exit(1);
}

export function configSourceLabel() {
  return "Claude Desktop config (`claude_desktop_config.json` → `mcpServers.<server>.env`) or process environment variables";
}

export function missingVarMessage(varName) {
  const cfgPath = claudeConfigLoadResult?.configPath || "claude_desktop_config.json";
  return `❌ Missing ${varName}. Set it in Claude Desktop config (${cfgPath} → mcpServers.<server>.env.${varName}) or as a process environment variable.`;
}

function buildConfig() {
  const API_BASE = process.env.AGILEPLACE_URL;
  const API_TOKEN = process.env.AGILEPLACE_TOKEN;
  const DEFAULT_BOARD_ID = process.env.AGILEPLACE_BOARD_ID;

  if (!API_BASE) {
    console.error(missingVarMessage("AGILEPLACE_URL"));
    process.exit(1);
  }

  if (!API_TOKEN) {
    console.error(missingVarMessage("AGILEPLACE_TOKEN"));
    process.exit(1);
  }

  if (!DEFAULT_BOARD_ID) {
    console.error(missingVarMessage("AGILEPLACE_BOARD_ID"));
    process.exit(1);
  }

  // OKR configuration
  const OKR_BASE = process.env.OKR_BASE_URL;
  const OKR_CLIENT_ID = process.env.OKR_CLIENT_ID;
  const OKR_CLIENT_SECRET = process.env.OKR_CLIENT_SECRET;
  const OKR_TOKEN = process.env.OKR_TOKEN || null;
  const OKR_DEFAULT_LIMIT = Math.min(Number(process.env.OKR_DEFAULT_LIMIT || 200), 500);

  const MAX_CARDS = Number(process.env.MAX_CARDS || 15);
  const MAX_DESC = Number(process.env.MAX_DESC || 800);
  const FETCH_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS || 25000);
  const OKR_FETCH_TIMEOUT_MS = Number(process.env.OKR_FETCH_TIMEOUT_MS || FETCH_TIMEOUT_MS);
  const STORY_LIMIT = Math.min(5, MAX_CARDS);
  const PORT = Number(process.env.PORT || 3333);

  const HEADERS = {
    Authorization: `Bearer ${API_TOKEN}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  return {
    API_BASE,
    API_TOKEN,
    DEFAULT_BOARD_ID,
    OKR_BASE,
    OKR_CLIENT_ID,
    OKR_CLIENT_SECRET,
    OKR_TOKEN,
    OKR_DEFAULT_LIMIT,
    MAX_CARDS,
    MAX_DESC,
    FETCH_TIMEOUT_MS,
    OKR_FETCH_TIMEOUT_MS,
    STORY_LIMIT,
    PORT,
    HEADERS,
  };
}

export const CONFIG = buildConfig();

export function loadConfig() {
  return CONFIG;
}

