#!/usr/bin/env node
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync, readFileSync } from "fs";
import os from "os";

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getDefaultClaudeDesktopConfigPath() {
  if (process.env.CLAUDE_DESKTOP_CONFIG_PATH) return process.env.CLAUDE_DESKTOP_CONFIG_PATH;

  // Claude Desktop config default locations
  // macOS: ~/Library/Application Support/Claude/claude_desktop_config.json
  // Windows: %APPDATA%\Claude\claude_desktop_config.json
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

  // If the repo's MCP server is configured under the common key name, prefer it.
  if (mcpServers?.agileplace) return "agileplace";

  // If there is exactly one configured server, use it.
  if (keys.length === 1) return keys[0];

  // Try to match by the args containing this server's path.
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

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { ListResourcesRequestSchema, ReadResourceRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { registerBoardTools } from "./src/tools/boards.mjs";
import { registerCardTypeTools } from "./src/tools/card-types.mjs";
import { registerLaneTools } from "./src/tools/lanes.mjs";
import { registerTagTools } from "./src/tools/tags.mjs";
import { registerCommentTools } from "./src/tools/comments.mjs";
import fetch from "node-fetch";
import express from "express";
import { z } from "zod";

function nowIso() {
  return new Date().toISOString();
}

function truncateString(value, max = 300) {
  if (typeof value !== "string") return value;
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…(${value.length - max} more chars)`;
}

function redactForLogs(value, depth = 0) {
  const MAX_DEPTH = 6;
  const MAX_ARRAY = 30;

  if (depth > MAX_DEPTH) return "[Truncated]";
  if (value === null || value === undefined) return value;

  if (typeof value === "string") return truncateString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return String(value);

  if (Array.isArray(value)) {
    const sliced = value.slice(0, MAX_ARRAY).map(v => redactForLogs(v, depth + 1));
    return value.length > MAX_ARRAY ? [...sliced, `[+${value.length - MAX_ARRAY} more]`] : sliced;
  }

  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const key = String(k);
      if (/(token|secret|password|authorization|api[_-]?key)/i.test(key)) {
        out[key] = "[REDACTED]";
        continue;
      }
      out[key] = redactForLogs(v, depth + 1);
    }
    return out;
  }

  return truncateString(String(value));
}

function normalizeError(err) {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
      cause: err.cause instanceof Error ? { name: err.cause.name, message: err.cause.message, stack: err.cause.stack } : err.cause,
    };
  }
  return { name: "UnknownError", message: String(err) };
}

function logError(context, err, meta) {
  const safeMeta = meta ? redactForLogs(meta) : undefined;
  const normalized = normalizeError(err);
  console.error(`[${nowIso()}] ERROR ${context}: ${normalized.message}`);
  if (safeMeta !== undefined) {
    try {
      console.error(`[${nowIso()}] META ${context}: ${JSON.stringify(safeMeta)}`);
    } catch {
      console.error(`[${nowIso()}] META ${context}: [unserializable]`);
    }
  }
  if (normalized.stack) console.error(normalized.stack);
  if (normalized.cause) {
    try {
      console.error(`[${nowIso()}] CAUSE ${context}: ${JSON.stringify(redactForLogs(normalized.cause))}`);
    } catch {
      console.error(`[${nowIso()}] CAUSE ${context}: [unserializable]`);
    }
  }
}

function configSourceLabel() {
  return "Claude Desktop config (`claude_desktop_config.json` → `mcpServers.<server>.env`) or process environment variables";
}

function missingVarMessage(varName) {
  const cfgPath = claudeConfigLoadResult?.configPath || "claude_desktop_config.json";
  return `❌ Missing ${varName}. Set it in Claude Desktop config (${cfgPath} → mcpServers.<server>.env.${varName}) or as a process environment variable.`;
}

process.on("unhandledRejection", (reason) => {
  logError("unhandledRejection", reason);
});

process.on("uncaughtException", (err) => {
  logError("uncaughtException", err);
  // Uncaught exceptions leave the process in an unknown state.
  process.exit(1);
});

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

// OKR Configuration
const OKR_BASE = process.env.OKR_BASE_URL;
const OKR_CLIENT_ID = process.env.OKR_CLIENT_ID;
const OKR_CLIENT_SECRET = process.env.OKR_CLIENT_SECRET;
const OKR_TOKEN = process.env.OKR_TOKEN; // Direct token (alternative to OAuth2 exchange)
const OKR_DEFAULT_LIMIT = Math.min(Number(process.env.OKR_DEFAULT_LIMIT || 200), 500);

// Extract region from OKR_BASE_URL (e.g., api-us.okrs.planview.com -> us)
function getOkrRegion() {
  if (!OKR_BASE) return "us"; // default
  const match = OKR_BASE.match(/api-([a-z]+)\.okrs\.planview\.com/);
  return match ? match[1] : "us";
}

// Token cache for OAuth2 access tokens
let okrAccessToken = null;
let okrTokenExpiry = null;

const HEADERS = {
  Authorization: `Bearer ${API_TOKEN}`,
  "Content-Type": "application/json",
  Accept: "application/json",
};

const MAX_CARDS = Number(process.env.MAX_CARDS || 15);
const MAX_DESC = Number(process.env.MAX_DESC || 800);
const FETCH_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS || 25000);
const OKR_FETCH_TIMEOUT_MS = Number(process.env.OKR_FETCH_TIMEOUT_MS || FETCH_TIMEOUT_MS);
const STORY_LIMIT = Math.min(5, MAX_CARDS);
const PORT = Number(process.env.PORT || 3333);

function normalizeBoardId(value) {
  if (value === undefined || value === null) return undefined;
  const str = `${value}`.trim();
  return str.length > 0 ? str : undefined;
}

async function fetchWithTimeout(url, opts = {}, ms = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } catch (err) {
    const name = err?.name ? String(err.name) : "";
    if (name === "AbortError") {
      throw new Error(`Request timed out after ${ms}ms for ${url}`, { cause: err });
    }
    throw new Error(`Request failed for ${url}: ${err?.message || err}`, { cause: err });
  } finally {
    clearTimeout(timer);
  }
}

// OKR OAuth2 token exchange
// Token endpoint: https://<region>.id.planview.com/io/v1/oauth2/token
async function getOkrAccessToken() {
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

    const resp = await fetchWithTimeout(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
      },
      body: formData.toString(),
    }, OKR_FETCH_TIMEOUT_MS);

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
async function fetchOkrJson(path, queryParams = {}) {
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

  const resp = await fetchWithTimeout(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  }, OKR_FETCH_TIMEOUT_MS);

  if (!resp.ok) {
    const text = await resp.text();
    const operation = path.includes("/key-results") ? "Get key results" : "List objectives";
    
    // If 401 (Unauthorized), token might be expired - clear cache and retry once
    if (resp.status === 401 && !OKR_TOKEN) {
      // Clear token cache to force refresh
      okrAccessToken = null;
      okrTokenExpiry = null;
      
      // Get a fresh token and retry the request
      const freshToken = await getOkrAccessToken();
      const retryResp = await fetchWithTimeout(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${freshToken}`,
          Accept: "application/json",
        },
      }, OKR_FETCH_TIMEOUT_MS);
      
      if (retryResp.ok) {
        return retryResp.json();
      }
      // If retry also fails, fall through to error handling
      const retryText = await retryResp.text();
      throw new Error(`${operation} failed: ${retryResp.status} ${retryResp.statusText} - Token refresh attempted but still failed. ${retryText.slice(0, 200)}`);
    }
    
    if (resp.status === 401 || resp.status === 403) {
      throw new Error(`${operation} failed: ${resp.status} ${resp.statusText} - Check OKR credentials permissions. ${text.slice(0, 200)}`);
    }
    if (resp.status === 429) {
      throw new Error(`${operation} failed: ${resp.status} ${resp.statusText} - Rate limit exceeded. ${text.slice(0, 200)}`);
    }
    
    throw new Error(formatFetchError(resp, `OKR ${operation}`, text));
  }

  return resp.json();
}

// 🔧 Normalize date to YYYY-MM-DD format for API
// Accepts YYYY-MM-DD or YYYY-MM-DDT00:00:00Z and returns YYYY-MM-DD
function normalizeDate(dateString) {
  if (!dateString) return undefined;
  // If already in YYYY-MM-DD format, return as-is
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return dateString;
  }
  // If in ISO format (YYYY-MM-DDT00:00:00Z), extract just the date part
  const dateMatch = dateString.match(/^(\d{4}-\d{2}-\d{2})/);
  if (dateMatch) {
    return dateMatch[1];
  }
  // Return as-is if format is unrecognized (let API handle validation)
  return dateString;
}

function stripHtml(text) {
  return typeof text === "string" ? text.replace(/<[^>]*>/g, "") : "";
}

function sanitizeCardInput(card = {}) {
  const titleSource = stripHtml(card.title ?? "").trim().slice(0, 140);
  if (!titleSource) {
    throw new Error("Card title is required.");
  }

  const description = card.description
    ? stripHtml(card.description).trim().slice(0, MAX_DESC)
    : "";

  let tags;
  if (Array.isArray(card.tags)) {
    tags = card.tags
      .map(tag => stripHtml(`${tag}`.trim()))
      .filter(Boolean)
      .slice(0, 10);
  }

  return {
    ...card,
    title: titleSource,
    description,
    tags,
  };
}

function respondText(...parts) {
  // Convert all parts to strings and filter out empty ones
  const message = parts
    .map(part => {
      // Convert to string, handling null/undefined
      if (part === null || part === undefined) return "";
      return String(part);
    })
    .filter(part => part.trim().length > 0)
    .join("\n\n");
  
  // Ensure we always return a non-empty string for MCP protocol compliance
  const text = message && message.trim().length > 0 ? message : "Operation completed successfully.";
  
  // Return properly formatted MCP response with exactly one content item
  return {
    content: [
      {
        type: "text",
        text: text,
      },
    ],
  };
}

// Resolve a human-friendly card type name to its numeric id for a board
async function resolveCardTypeId({ boardId, cardTypeName }) {
  if (!cardTypeName) return undefined;
  const response = await listCardTypes(boardId);
  const cardTypes = response.cardTypes || [];
  const normalizedLookup = cardTypeName.trim().toLowerCase();
  const match = cardTypes.find(ct => (ct.name || "").trim().toLowerCase() === normalizedLookup);
  if (!match) {
    throw new Error(`Unknown card type name: "${cardTypeName}". Use listCardTypes to see valid names.`);
  }
  return match.id; // API expects id as string
}

// Utility: create a single card
function validateCardTypeId(cardTypeId) {
  if (cardTypeId === undefined) return undefined;
  if (typeof cardTypeId === "string" && cardTypeId.trim() === "") {
    console.warn("Warning: Empty cardTypeId provided, skipping typeId field");
    return undefined;
  }
  if (typeof cardTypeId === "string" && !/^[1-9]\d*$/.test(cardTypeId)) {
    throw new Error(
      `Invalid cardTypeId format: "${cardTypeId}". Must be a numeric string starting with 1-9 (e.g., "2372827607")`
    );
  }
  return cardTypeId;
}

async function prepareCardPayload(cardInput = {}, { resolveTypeName = true, cardTypes } = {}) {
  const {
    boardId,
    laneId,
    plannedStartDate,
    plannedFinishDate,
    isHeader,
    cardHeader,
    cardTypeId,
    cardTypeName,
  } = cardInput;

  const sanitized = sanitizeCardInput(cardInput);

  const body = {
    destination: laneId ? { boardId, laneId } : { boardId },
    title: sanitized.title,
    description: sanitized.description,
    plannedStart: normalizeDate(plannedStartDate),
    plannedFinish: normalizeDate(plannedFinishDate),
    isHeader,
  };

  if (cardHeader !== undefined) {
    body.customId = cardHeader.toUpperCase();
  }

  const validCardTypeId = validateCardTypeId(cardTypeId);
  if (validCardTypeId) {
    body.typeId = validCardTypeId;
  }

  if (resolveTypeName && cardTypeName && !body.typeId) {
    if (Array.isArray(cardTypes) && cardTypes.length > 0) {
      const normalizedLookup = cardTypeName.trim().toLowerCase();
      const match = cardTypes.find(
        ct => (ct.name || "").trim().toLowerCase() === normalizedLookup
      );
      if (!match) {
        throw new Error(`Unknown card type name: "${cardTypeName}". Use listCardTypes to see valid names.`);
      }
      body.typeId = `${match.id}`;
    } else {
      const resolvedId = await resolveCardTypeId({ boardId, cardTypeName });
      body.typeId = resolvedId;
    }
  }

  if (sanitized.tags && sanitized.tags.length > 0) {
    body.tags = sanitized.tags;
  }

  return { body, sanitized, cardTypeName, boardId };
}

function formatFetchError(resp, context, rawText) {
  const msg = (rawText || "").replace(/<[^>]+>/g, "").slice(0, 500);
  return `${context} failed: ${resp.status} ${resp.statusText} = ${msg}`;
}

async function createCard(cardInput = {}, options = {}) {
  const { body } = await prepareCardPayload(cardInput, options);

  const resp = await fetchWithTimeout(`${API_BASE}/card`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(formatFetchError(resp, "Create card", text));
  }

  return resp.json();
}

// Build JSON Patch operations for card update (shared by updateCard and batchUpdateCards)
function buildUpdateOperations({
  title,
  description,
  plannedStartDate,
  plannedFinishDate,
  isHeader,
  cardHeader,
  cardTypeId,
  priority,
}) {
  const operations = [];

  if (title !== undefined) {
    operations.push({ op: "replace", path: "/title", value: title });
  }
  if (description !== undefined) {
    operations.push({ op: "replace", path: "/description", value: description });
  }
  if (plannedStartDate !== undefined) {
    operations.push({ op: "replace", path: "/plannedStart", value: normalizeDate(plannedStartDate) });
  }
  if (plannedFinishDate !== undefined) {
    operations.push({ op: "replace", path: "/plannedFinish", value: normalizeDate(plannedFinishDate) });
  }
  if (isHeader !== undefined) {
    operations.push({ op: "replace", path: "/isHeader", value: isHeader });
  }
  if (cardHeader !== undefined) {
    operations.push({ op: "replace", path: "/customId", value: cardHeader.toUpperCase() });
  }
  if (cardTypeId !== undefined && cardTypeId !== "") {
    operations.push({ op: "replace", path: "/typeId", value: String(cardTypeId) });
  }
  if (priority !== undefined) {
    const validPriorities = ["normal", "low", "high", "critical"];
    if (!validPriorities.includes(priority)) {
      throw new Error(`Invalid priority "${priority}". Must be one of: ${validPriorities.join(", ")}`);
    }
    operations.push({ op: "replace", path: "/priority", value: priority });
  }

  return operations;
}

// Utility: patch a card using RFC 6902 JSON Patch operations array.
async function patchCardOperations({ cardId, operations, context = "Patch card" }) {
  if (!Array.isArray(operations) || operations.length === 0) {
    throw new Error("At least one JSON Patch operation is required.");
  }

  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/card/${cardId}`, {
    method: "PATCH",
    headers: HEADERS,
    body: JSON.stringify(operations),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(formatFetchError(resp, context, text));
  }

  return resp.json();
}

function extractCustomFieldValue(card, fieldId) {
  const cf = card?.customFields;
  if (!cf) return null;

  const fid = String(fieldId);

  // Common expected shape: customFields is an object keyed by fieldId.
  if (cf && typeof cf === "object" && !Array.isArray(cf)) {
    const direct = cf[fid] !== undefined ? cf[fid] : cf[String(fieldId)];
    if (direct !== undefined) {
      if (direct && typeof direct === "object" && "value" in direct) return direct.value ?? null;
      return direct ?? null;
    }

    // Fallback: object might be keyed by indices with `{ fieldId, value }` entries inside values.
    for (const value of Object.values(cf)) {
      if (!value || typeof value !== "object") continue;
      const vFieldId = value.fieldId ?? value.id;
      if (vFieldId !== undefined && String(vFieldId) === fid) {
        if ("value" in value) return value.value ?? null;
        return value.value ?? null;
      }
    }

    return null;
  }

  // Alternate shape: customFields is an array of `{ fieldId, value }` entries.
  if (Array.isArray(cf)) {
    const found = cf.find(entry => {
      if (!entry || typeof entry !== "object") return false;
      const entryFieldId = entry.fieldId ?? entry.id;
      return entryFieldId !== undefined && String(entryFieldId) === fid;
    });
    if (!found) return null;
    const v = found.value !== undefined ? found.value : found.fieldValue;
    return v === undefined ? null : v;
  }

  return null;
}

function buildCardCustomFieldsResponse({ boardId, cardId, card, boardFields }) {
  const fields = (boardFields || []).map(f => {
    const fid = String(f.id);
    const type = f.type ?? "";
    const value = extractCustomFieldValue(card, fid);
    const helpText = f.helpText ?? "";
    const choices = (type === "choice" || type === "multi") ? f.choiceConfiguration?.choices ?? null : null;

    return {
      fieldId: fid,
      label: f.label ?? "",
      type,
      value: value === undefined ? null : value,
      helpText,
      choices,
    };
  });

  return {
    boardId: String(boardId ?? ""),
    cardId: String(cardId ?? ""),
    fields,
  };
}

// Utility: update a card
async function updateCard({
  cardId,
  title,
  description,
  plannedStartDate,
  plannedFinishDate,
  isHeader,
  cardHeader,
  cardTypeId,
  priority,
  boardId, // optional: when provided with cardTypeId, validates type exists on board
}) {
  if (cardTypeId !== undefined && cardTypeId !== "" && boardId) {
    const ctResponse = await listCardTypes(boardId);
    const cardTypes = ctResponse.cardTypes || [];
    const exists = cardTypes.some((ct) => String(ct.id) === String(cardTypeId));
    if (!exists) {
      throw new Error(`cardTypeId "${cardTypeId}" not found on board ${boardId}. Use listCardTypes to see valid ids.`);
    }
  }

  const operations = buildUpdateOperations({
    title,
    description,
    plannedStartDate,
    plannedFinishDate,
    isHeader,
    cardHeader,
    cardTypeId,
    priority,
  });

  if (operations.length === 0) {
    throw new Error("At least one update field is required (title, description, plannedStartDate, plannedFinishDate, isHeader, cardHeader, cardTypeId, or priority).");
  }
  return patchCardOperations({ cardId, operations, context: "Update card" });
}

const BATCH_UPDATE_MAX = 50;

// Utility: batch update cards (parallel PATCH, per-item success/failure)
async function batchUpdateCards(updates, boardId) {
  if (updates.length > BATCH_UPDATE_MAX) {
    throw new Error(`Maximum ${BATCH_UPDATE_MAX} cards per batch. Received ${updates.length}.`);
  }

  let validTypeIds;
  if (boardId) {
    const ctResponse = await listCardTypes(boardId);
    validTypeIds = new Set((ctResponse.cardTypes || []).map((ct) => String(ct.id)));
  }

  const results = await Promise.allSettled(
    updates.map(async (item) => {
      const { cardId, title, description, cardHeader, plannedStartDate, plannedFinishDate, isHeader, cardTypeId, priority } = item;
      if (cardTypeId !== undefined && cardTypeId !== "" && validTypeIds && !validTypeIds.has(String(cardTypeId))) {
        return { cardId, success: false, error: `cardTypeId "${cardTypeId}" not found on board. Use listCardTypes to see valid ids.` };
      }
      const operations = buildUpdateOperations({
        title,
        description,
        plannedStartDate,
        plannedFinishDate,
        isHeader,
        cardHeader,
        cardTypeId,
        priority,
      });

      if (operations.length === 0) {
        return { cardId, success: false, error: "No update fields provided" };
      }

      const resp = await fetchWithTimeout(`${API_BASE}/card/${cardId}`, {
        method: "PATCH",
        headers: HEADERS,
        body: JSON.stringify(operations),
      });

      if (!resp.ok) {
        const text = await resp.text();
        return { cardId, success: false, error: `${resp.status}: ${(text || resp.statusText || "").slice(0, 200)}` };
      }

      const updated = await resp.json();
      return { cardId, success: true, card: { id: updated.id, title: updated.title } };
    })
  );

  const parsed = results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    return { cardId: updates[i]?.cardId ?? "?", success: false, error: r.reason?.message ?? String(r.reason) };
  });

  return {
    results: parsed,
    successCount: parsed.filter((p) => p.success).length,
    failureCount: parsed.filter((p) => !p.success).length,
  };
}

// Utility: connect parent and child cards
async function connectCards(parentId, childIds) {
  const resp = await fetchWithTimeout(`${API_BASE}/card/connections`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({
      cardIds: [parentId],
      connections: { children: childIds },
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(formatFetchError(resp, "Connect cards", text));
  }

  return resp.json();
}

// Utility: connect existing cards (parent to children)
async function connectExistingCards(parentId, childIds) {
  const resp = await fetchWithTimeout(`${API_BASE}/card/${parentId}/connection/many`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({
      connectedCardIds: childIds,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(formatFetchError(resp, "Connect existing cards", text));
  }

  return resp.json();
}

// Utility: create a comment on a card (POST /io/card/:cardId/comment)
async function createCardCommentApi(cardId, text) {
  const ioPath = getIoPath();
  if (!text || typeof text !== "string" || text.trim() === "") {
    throw new Error("Comment text is required.");
  }
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/card/${cardId}/comment`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({ text }),
  });

  if (!resp.ok) {
    const bodyText = await resp.text();
    throw new Error(formatFetchError(resp, "Create card comment", bodyText));
  }

  return resp.json().catch(() => ({}));
}

// Utility: assign users to one or more cards (POST /io/card/assign)
async function assignUsersToCardsApi(cardIds, userIds) {
  const ioPath = getIoPath();
  if (!Array.isArray(cardIds) || cardIds.length === 0) {
    throw new Error("cardIds must be a non-empty array of strings.");
  }
  if (!Array.isArray(userIds) || userIds.length === 0) {
    throw new Error("userIds must be a non-empty array of strings.");
  }

  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/card/assign`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({ cardIds, userIds }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(formatFetchError(resp, "Assign users to cards", text));
  }

  return resp.json().catch(() => ({}));
}

// Utility: delete card connections (DELETE /io/card/connections)
async function deleteCardConnectionsApi(cardIds, connections) {
  const ioPath = getIoPath();
  if (!Array.isArray(cardIds) || cardIds.length === 0) {
    throw new Error("cardIds must be a non-empty array of strings.");
  }
  const body = { cardIds };
  if (connections && typeof connections === "object") {
    body.connections = connections;
  }

  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/card/connections`, {
    method: "DELETE",
    headers: HEADERS,
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(formatFetchError(resp, "Delete card connections", text));
  }

  return resp.json().catch(() => ({}));
}

// Utility: list all cards on a board
async function listCards(boardId) {
  const resp = await fetchWithTimeout(`${API_BASE}/board/${boardId}/card`, {
    method: "GET",
    headers: HEADERS,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(formatFetchError(resp, "List cards", text));
  }

  return resp.json();
}

// Utility: list available card types for a board
async function listCardTypes(boardId) {
  const resp = await fetchWithTimeout(`${API_BASE}/board/${boardId}/cardType`, {
    method: "GET",
    headers: HEADERS,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(formatFetchError(resp, "List card types", text));
  }

  return resp.json();
}

// Helper to determine if we need to add /io prefix to API paths
function getIoPath() {
  // Check if API_BASE ends with /io (more precise than includes)
  return API_BASE.endsWith('/io') ? '' : '/io';
}

// Utility: list boards (GET /io/board)
async function listBoardsApi({ search, boards, limit = 200 } = {}) {
  const ioPath = getIoPath();
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (boards) params.set("boards", Array.isArray(boards) ? boards.join(",") : boards);
  if (limit) params.set("limit", String(limit));
  const qs = params.toString();
  const url = `${API_BASE}${ioPath}/board${qs ? `?${qs}` : ""}`;
  const resp = await fetchWithTimeout(url, { method: "GET", headers: HEADERS });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(formatFetchError(resp, "List boards", text));
  }
  return resp.json();
}

// Utility: get board details (GET /io/board/:boardId) - for listLanes
async function getBoard(boardId) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/board/${boardId}`, {
    method: "GET",
    headers: HEADERS,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(formatFetchError(resp, "Get board", text));
  }
  return resp.json();
}

// Utility: update board (PATCH /io/board/:boardId)
async function updateBoardApi(boardId, updates) {
  const ioPath = getIoPath();
  const allowed = [
    "title",
    "description",
    "defaultCardType",
    "defaultTaskType",
    "allowUsersToDeleteCards",
    "isShared",
    "sharedBoardRole",
    "baseWipOnCardSize",
    "excludeCompletedAndArchiveViolations",
    "customBoardUrl",
    "enableCustomIcon",
    "customIconFieldLabel",
    "allowPlanviewIntegration",
    "level",
  ];
  const body = {};
  for (const key of allowed) {
    if (updates[key] !== undefined) body[key] = updates[key];
  }
  if (Object.keys(body).length === 0) {
    throw new Error("At least one property to update is required.");
  }
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/board/${boardId}`, {
    method: "PATCH",
    headers: HEADERS,
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(formatFetchError(resp, "Update board", text));
  }
  const updated = Object.keys(body);
  const data = resp.status === 204 ? {} : await resp.json().catch(() => ({}));
  return { id: data.id ?? boardId, updated };
}

// Utility: archive a board (POST /io/board/:boardId/archive)
async function archiveBoardApi(boardId) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/board/${boardId}/archive`, {
    method: "POST",
    headers: HEADERS,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(formatFetchError(resp, "Archive board", text));
  }
}

// Utility: create a board (POST /io/board)
async function createBoardApi({ title, description, level, customBoardUrl } = {}) {
  const ioPath = getIoPath();
  if (!title || typeof title !== "string" || title.trim() === "") {
    throw new Error("title is required to create a board.");
  }
  const body = { title: title.trim() };
  if (description !== undefined) body.description = description;
  if (level !== undefined) body.level = level;
  if (customBoardUrl !== undefined) body.customBoardUrl = customBoardUrl;

  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/board`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(formatFetchError(resp, "Create board", text));
  }

  return resp.json();
}

// Utility: update board layout (PUT /io/board/:boardId/layout)
async function updateBoardLayoutApi(boardId, layout) {
  const ioPath = getIoPath();
  if (!layout || typeof layout !== "object") {
    throw new Error("layout object is required to update board layout.");
  }

  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/board/${boardId}/layout`, {
    method: "PUT",
    headers: HEADERS,
    body: JSON.stringify(layout),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(formatFetchError(resp, "Update board layout", text));
  }

  return resp.json().catch(() => ({}));
}

// Utility: get current board lane layout plus checksum via GET /io/board/:boardId
async function getBoardLayoutWithChecksum(boardId) {
  const board = await getBoard(boardId);
  const lanes = Array.isArray(board.lanes) ? board.lanes : [];
  const layoutChecksum = board.layoutChecksum || board.laneLayoutChecksum || board.checksum;
  return { lanes, layoutChecksum };
}

// Utility: GET lane card counts to ensure a lane is empty before deletion
async function getLaneCardCounts(boardId, laneIds) {
  const ioPath = getIoPath();
  const ids = Array.isArray(laneIds) ? laneIds : [laneIds];
  const params = new URLSearchParams();
  params.set("lanes", ids.join(","));
  const url = `${API_BASE}${ioPath}/board/${boardId}/laneCount?${params.toString()}`;
  const resp = await fetchWithTimeout(url, {
    method: "GET",
    headers: HEADERS,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(formatFetchError(resp, "Get lane card counts", text));
  }
  return resp.json();
}

// Utility: get board custom fields (GET /io/board/:boardId/customfield)
async function getBoardCustomFieldsApi(boardId) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/board/${boardId}/customfield`, {
    method: "GET",
    headers: HEADERS,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(formatFetchError(resp, "Get board custom fields", text));
  }

  return resp.json();
}

// Utility: update board custom fields (PATCH /io/board/:boardId/customfield)
async function updateBoardCustomFieldsApi(boardId, updates) {
  const ioPath = getIoPath();
  const body = updates && typeof updates === "object" ? updates : {};
  if (Object.keys(body).length === 0) {
    throw new Error("At least one custom field update is required.");
  }

  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/board/${boardId}/customfield`, {
    method: "PATCH",
    headers: HEADERS,
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(formatFetchError(resp, "Update board custom fields", text));
  }

  return resp.json().catch(() => ({}));
}

// Utility: bulk update cards - SAME updates applied to ALL specified cards (PATCH /io/card/bulk)
async function bulkUpdateCardsApi(cardIds, updates) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/card/bulk`, {
    method: "PATCH",
    headers: HEADERS,
    body: JSON.stringify({ cardIds, updates }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(formatFetchError(resp, "Bulk update cards", text));
  }
  // 202 Accepted - may return empty body
  return resp.status === 204 ? {} : resp.json().catch(() => ({}));
}

// Utility: set (replace) all tags on a card
async function setCardTags(cardId, tags) {
  const operations = [{ op: "replace", path: "/tags", value: Array.isArray(tags) ? tags.map((t) => String(t).trim()).filter(Boolean) : [] }];
  const resp = await fetchWithTimeout(`${API_BASE}/card/${cardId}`, {
    method: "PATCH",
    headers: HEADERS,
    body: JSON.stringify(operations),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(formatFetchError(resp, "Set card tags", text));
  }
  return resp.json();
}

// Utility: create card type (POST /io/board/:boardId/cardType)
async function createCardTypeApi(boardId, { name, colorHex, isCardType = true, isTaskType = false }) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/board/${boardId}/cardType`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({ name, colorHex, isCardType, isTaskType }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(formatFetchError(resp, "Create card type", text));
  }
  return resp.json();
}

// Utility: update card type (PATCH /io/board/:boardId/cardType/:cardTypeId)
async function updateCardTypeApi(boardId, cardTypeId, { name, colorHex, isCardType, isTaskType }) {
  const ioPath = getIoPath();
  const body = {};
  if (name !== undefined) body.name = name;
  if (colorHex !== undefined) body.colorHex = colorHex;
  if (isCardType !== undefined) body.isCardType = isCardType;
  if (isTaskType !== undefined) body.isTaskType = isTaskType;
  if (Object.keys(body).length === 0) throw new Error("At least one field to update is required.");
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/board/${boardId}/cardType/${cardTypeId}`, {
    method: "PATCH",
    headers: HEADERS,
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(formatFetchError(resp, "Update card type", text));
  }
  return resp.json();
}

// Utility: delete card type (DELETE /io/board/:boardId/cardType/:cardTypeId)
async function deleteCardTypeApi(boardId, cardTypeId) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/board/${boardId}/cardType/${cardTypeId}`, {
    method: "DELETE",
    headers: HEADERS,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(formatFetchError(resp, "Delete card type", text));
  }
}

// Utility: update lane (PATCH /io/board/:boardId/lane/:laneId)
async function updateLaneApi(boardId, laneId, { title, description, wipLimit, isDefaultDropLane, cardStatus }) {
  const ioPath = getIoPath();
  const body = {};
  if (title !== undefined) body.title = title;
  if (description !== undefined) body.description = description;
  if (wipLimit !== undefined) body.wipLimit = wipLimit;
  if (isDefaultDropLane !== undefined) body.isDefaultDropLane = isDefaultDropLane;
  if (cardStatus !== undefined) body.cardStatus = cardStatus;
  if (Object.keys(body).length === 0) throw new Error("At least one field to update is required.");
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/board/${boardId}/lane/${laneId}`, {
    method: "PATCH",
    headers: HEADERS,
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(formatFetchError(resp, "Update lane", text));
  }
  return resp.json();
}

// Utility: delete single card (DELETE /io/card/:cardId)
async function deleteCardApi(cardId) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/card/${cardId}`, {
    method: "DELETE",
    headers: HEADERS,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(formatFetchError(resp, "Delete card", text));
  }
}

// Utility: batch delete cards (DELETE /io/card/ with body)
async function batchDeleteCardsApi(cardIds) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/card/`, {
    method: "DELETE",
    headers: HEADERS,
    body: JSON.stringify({ cardIds }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(formatFetchError(resp, "Batch delete cards", text));
  }
}

// Utility: move card to lane (PATCH /io/card/:cardId with laneId)
async function moveCardToLaneApi(cardId, laneId) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/card/${cardId}`, {
    method: "PATCH",
    headers: HEADERS,
    body: JSON.stringify([{ op: "replace", path: "/laneId", value: laneId }]),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(formatFetchError(resp, "Move card to lane", text));
  }
  return resp.json();
}

// Utility: get dependencies for a specific card
async function getCardDependencies(cardId, includeFaces = true) {
  const ioPath = getIoPath();
  const queryParams = includeFaces ? '?includeFaces=true' : '';
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/card/${cardId}/dependency${queryParams}`, {
    method: "GET",
    headers: HEADERS,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(formatFetchError(resp, "Get card dependencies", text));
  }

  return resp.json();
}

// Utility: update an existing dependency (PATCH /io/card/dependency)
async function updateCardDependencyApi(payload) {
  const ioPath = getIoPath();
  const body = payload && typeof payload === "object" ? payload : {};
  if (Object.keys(body).length === 0) {
    throw new Error("Dependency update payload is required.");
  }
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/card/dependency`, {
    method: "PATCH",
    headers: HEADERS,
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(formatFetchError(resp, "Update card dependency", text));
  }

  return resp.json().catch(() => ({}));
}

// Utility: delete a dependency (DELETE /io/card/dependency)
async function deleteCardDependencyApi(payload) {
  const ioPath = getIoPath();
  const body = payload && typeof payload === "object" ? payload : {};
  if (Object.keys(body).length === 0) {
    throw new Error("Dependency delete payload is required.");
  }
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/card/dependency`, {
    method: "DELETE",
    headers: HEADERS,
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(formatFetchError(resp, "Delete card dependency", text));
  }

  return resp.json().catch(() => ({}));
}

// Utility: list all cards on a board with dependencies and parent-child relationships included
async function listCardsWithDependencies(boardId) {
  const ioPath = getIoPath();
  const queryParams = `?board=${boardId}&include=dependencies,parentCards`;
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/card${queryParams}`, {
    method: "GET",
    headers: HEADERS,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(formatFetchError(resp, "List cards with dependencies", text));
  }

  return resp.json();
}

// Utility: planning series (PI Planning) APIs
async function listPlanningSeriesApi() {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/series`, {
    method: "GET",
    headers: HEADERS,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(formatFetchError(resp, "List planning series", text));
  }
  return resp.json();
}

async function createPlanningSeriesApi(payload) {
  const ioPath = getIoPath();
  const body = payload && typeof payload === "object" ? payload : {};
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/series`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(formatFetchError(resp, "Create planning series", text));
  }
  return resp.json();
}

async function getPlanningSeriesApi(seriesId) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/series/${seriesId}`, {
    method: "GET",
    headers: HEADERS,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(formatFetchError(resp, "Get planning series", text));
  }
  return resp.json();
}

async function updatePlanningSeriesApi(seriesId, updates) {
  const ioPath = getIoPath();
  const body = updates && typeof updates === "object" ? updates : {};
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/series/${seriesId}`, {
    method: "PATCH",
    headers: HEADERS,
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(formatFetchError(resp, "Update planning series", text));
  }
  return resp.json().catch(() => ({}));
}

async function deletePlanningSeriesApi(seriesId) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/series/${seriesId}`, {
    method: "DELETE",
    headers: HEADERS,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(formatFetchError(resp, "Delete planning series", text));
  }
}

async function createIncrementApi(seriesId, payload) {
  const ioPath = getIoPath();
  const body = payload && typeof payload === "object" ? payload : {};
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/series/${seriesId}/increment`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(formatFetchError(resp, "Create planning increment", text));
  }
  return resp.json();
}

async function listIncrementsApi(seriesId) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/series/${seriesId}/increment`, {
    method: "GET",
    headers: HEADERS,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(formatFetchError(resp, "List planning increments", text));
  }
  return resp.json();
}

async function updateIncrementApi(seriesId, incrementId, updates) {
  const ioPath = getIoPath();
  const body = updates && typeof updates === "object" ? updates : {};
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/series/${seriesId}/increment/${incrementId}`, {
    method: "PATCH",
    headers: HEADERS,
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(formatFetchError(resp, "Update planning increment", text));
  }
  return resp.json().catch(() => ({}));
}

async function deleteIncrementApi(seriesId, incrementId) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/series/${seriesId}/increment/${incrementId}`, {
    method: "DELETE",
    headers: HEADERS,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(formatFetchError(resp, "Delete planning increment", text));
  }
}

async function getIncrementStatusApi(seriesId, incrementId, category) {
  const ioPath = getIoPath();
  const path = category
    ? `${API_BASE}${ioPath}/series/${seriesId}/increment/${incrementId}/status/${category}`
    : `${API_BASE}${ioPath}/series/${seriesId}/increment/${incrementId}/status`;
  const resp = await fetchWithTimeout(path, {
    method: "GET",
    headers: HEADERS,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(formatFetchError(resp, "Get increment status", text));
  }
  return resp.json();
}

// Utility: get a single card with parent-child relationships
async function getCardWithRelationships(cardId) {
  const ioPath = getIoPath();
  const queryParams = `?cards=${cardId}&include=parentCards`;
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/card${queryParams}`, {
    method: "GET",
    headers: HEADERS,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(formatFetchError(resp, "Get card with relationships", text));
  }

  const data = await resp.json();
  return data.cards?.[0] || null;
}

// Utility: get parent cards for a card via connection/parents API (full card details)
async function getConnectionParents(cardId) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/card/${cardId}/connection/parents`, {
    method: "GET",
    headers: HEADERS,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(formatFetchError(resp, "Get connection parents", text));
  }

  const data = await resp.json();
  return data.cards || [];
}

// Utility: comments CRUD
async function getCardCommentsApi(cardId) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/card/${cardId}/comment`, {
    method: "GET",
    headers: HEADERS,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(formatFetchError(resp, "Get card comments", text));
  }
  return resp.json();
}

async function updateCardCommentApi(cardId, commentId, text) {
  const ioPath = getIoPath();
  if (!text || typeof text !== "string" || text.trim() === "") {
    throw new Error("Comment text is required.");
  }
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/card/${cardId}/comment/${commentId}`, {
    method: "PUT",
    headers: HEADERS,
    body: JSON.stringify({ text }),
  });
  if (!resp.ok) {
    const bodyText = await resp.text();
    throw new Error(formatFetchError(resp, "Update card comment", bodyText));
  }
  return resp.json().catch(() => ({}));
}

async function deleteCardCommentApi(cardId, commentId) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/card/${cardId}/comment/${commentId}`, {
    method: "DELETE",
    headers: HEADERS,
  });
  if (!resp.ok) {
    const bodyText = await resp.text();
    throw new Error(formatFetchError(resp, "Delete card comment", bodyText));
  }
}

// Utility: reporting & statistics
async function getBoardThroughputReportApi(boardId) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/reporting/boardHealth/${boardId}/throughput`, {
    method: "GET",
    headers: HEADERS,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(formatFetchError(resp, "Get board throughput report", text));
  }
  return resp.json();
}

async function getBoardWipReportApi(boardId) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/reporting/boardHealth/${boardId}/wip`, {
    method: "GET",
    headers: HEADERS,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(formatFetchError(resp, "Get board WIP report", text));
  }
  return resp.json();
}

async function getLaneBottleneckReportApi(boardId) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/reporting/boardHealth/${boardId}/laneBottleneck`, {
    method: "GET",
    headers: HEADERS,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(formatFetchError(resp, "Get lane bottleneck report", text));
  }
  return resp.json();
}

async function getCardStatisticsApi(cardId) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/card/${cardId}/statistics`, {
    method: "GET",
    headers: HEADERS,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(formatFetchError(resp, "Get card statistics", text));
  }
  return resp.json();
}

async function getCardActivityApi(cardId) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/card/${cardId}/activity`, {
    method: "GET",
    headers: HEADERS,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(formatFetchError(resp, "Get card activity", text));
  }
  return resp.json();
}

// Utility: user APIs
async function getCurrentUserApi() {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/user/me`, {
    method: "GET",
    headers: HEADERS,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(formatFetchError(resp, "Get current user", text));
  }
  return resp.json();
}

async function listUsersApi() {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/user`, {
    method: "GET",
    headers: HEADERS,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(formatFetchError(resp, "List users", text));
  }
  return resp.json();
}

async function getUserByIdApi(userId) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/user/${userId}`, {
    method: "GET",
    headers: HEADERS,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(formatFetchError(resp, "Get user", text));
  }
  return resp.json();
}

// Utility: get child cards for a card via connection/children API (full card details)
async function getConnectionChildren(cardId, limit = 200) {
  const ioPath = getIoPath();
  const queryParams = `?limit=${limit}`;
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/card/${cardId}/connection/children${queryParams}`, {
    method: "GET",
    headers: HEADERS,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(formatFetchError(resp, "Get connection children", text));
  }

  const data = await resp.json();
  return data.cards || [];
}

// Helper: map API card to parent/child summary (id, title, cardType, laneId, relationship, tags, optional dates)
function toParentChildSummary(card, relationship) {
  const cardType = card.type?.title ?? card.type?.name ?? card.cardType?.name ?? card.cardType?.title ?? "";
  const laneId = card.laneId ?? card.lane?.id ?? "";
  const summary = {
    id: String(card.id ?? ""),
    title: card.title ?? "",
    cardType: String(cardType),
    relationship,
    tags: Array.isArray(card.tags) ? card.tags : [],
  };
  if (laneId) summary.laneId = String(laneId);
  if (card.plannedStart) summary.plannedStartDate = card.plannedStart;
  if (card.plannedFinish) summary.plannedFinishDate = card.plannedFinish;
  return summary;
}

// Utility: fetch a single card by ID (for title lookup)
async function getCardById(cardId) {
  const ioPath = getIoPath();
  // Request customFields so card-level custom field tools can read values.
  const queryParams = `?cards=${cardId}&include=customFields&includeDetails=Y`;
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/card${queryParams}`, {
    method: "GET",
    headers: HEADERS,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(formatFetchError(resp, "Get card by ID", text));
  }

  const data = await resp.json();
  return data.cards?.[0] || null;
}

// Initialize MCP server
const mcp = new McpServer({ name: "agileplace", version: "1.4.0" });

function wrapToolHandler(toolName, handler) {
  return async (input, ...rest) => {
    try {
      return await handler(input, ...rest);
    } catch (err) {
      // Make Zod validation errors readable
      if (err instanceof z.ZodError) {
        const issues = err.issues?.map(i => ({
          path: i.path?.join("."),
          message: i.message,
          code: i.code,
        }));
        logError(`tool:${toolName}`, err, { input, zodIssues: issues });
        throw new Error(`Invalid tool input for ${toolName}: ${JSON.stringify(issues || err.issues || [], null, 2)}`, { cause: err });
      }

      logError(`tool:${toolName}`, err, { input });
      throw err;
    }
  };
}

// Ensure all tool errors are logged (stderr) with context, instead of disappearing.
const _registerTool = mcp.registerTool.bind(mcp);
mcp.registerTool = (name, definition, handler) =>
  _registerTool(name, definition, wrapToolHandler(name, handler));

// Register tools from modules
registerBoardTools(mcp);
registerCardTypeTools(mcp);
registerLaneTools(mcp);
registerTagTools(mcp);
registerCommentTools(mcp);

// Removed duplicate test resource - using registerAppResource version below

// Register MCP App UI resource using official helper function
const DEPENDENCY_GRAPH_URI = "ui://agileplace/dependency-graph";

registerAppResource(
  mcp,
  DEPENDENCY_GRAPH_URI,
  DEPENDENCY_GRAPH_URI,
  { mimeType: RESOURCE_MIME_TYPE },
  async () => {
    const htmlPath = join(__dirname, "ui", "dependency-graph-mcp-app.html");
    try {
      console.error(`[UI Resource] Reading MCP App HTML from: ${htmlPath}`);
      const htmlContent = readFileSync(htmlPath, "utf-8");
      console.error(`[UI Resource] Successfully read ${htmlContent.length} bytes`);
      
      return {
        contents: [{
          uri: DEPENDENCY_GRAPH_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: htmlContent,
        }],
      };
    } catch (error) {
      console.error(`[UI Resource] Error reading file: ${error.message}`);
      console.error(`[UI Resource] Path attempted: ${htmlPath}`);
      console.error(`[UI Resource] __dirname: ${__dirname}`);
      throw new Error(`Failed to read UI resource: ${error.message}`);
    }
  }
);

// Simple test tool following official MCP Apps docs pattern
const TEST_UI_URI = "ui://agileplace/simple-test";

const app = express();

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    caps: {
      MAX_CARDS,
      MAX_DESC,
      FETCH_TIMEOUT_MS,
      STORY_LIMIT,
    },
  });
});

app.use((err, _req, res, _next) => {
  console.error("Health endpoint error:", err);
  res.status(500).json({ error: err.message || "Internal Server Error" });
});

let healthServer;
if (process.env.DISABLE_HEALTH_SERVER !== "1") {
  healthServer = app.listen(PORT, () => {
    console.error(`MCP server health endpoint listening on :${PORT}`);
  });

  healthServer.on("error", err => {
    if (err?.code === "EADDRINUSE") {
      console.error(`Health endpoint disabled: port ${PORT} already in use.`);
    } else {
      console.error("Health endpoint error:", err);
    }
  });
}

// ---------------- Tools ----------------

// (Board tools moved to src/tools/boards.mjs)

// Batch create cards
mcp.registerTool(
  "batchCreateCards",
  {
    description:
      "Create one or more cards on an AgilePlace board. Only title is required. BoardId will default if not provided. Use listCardTypes to get valid cardTypeId values (must be numeric strings like '2372827607').",
    inputSchema: {
      boardId: z.string().optional(),
      laneId: z.string().optional(),
      dryRun: z.boolean().optional(),
      cards: z.array(
        z.object({
          title: z.string(),
          description: z.string().optional(),
          plannedStartDate: z.string().optional(),
          plannedFinishDate: z.string().optional(),
          isHeader: z.boolean().optional(),
          cardHeader: z.string().optional(),
          cardTypeId: z.string().optional(),
          cardTypeName: z.string().optional(),
        })
      ),
    },
  },
  async ({ boardId, laneId, cards, dryRun }) => {
    const fromCards = Array.isArray(cards)
      ? normalizeBoardId(cards.find(card => normalizeBoardId(card?.boardId))?.boardId)
      : undefined;
    const resolvedBoardId =
      normalizeBoardId(boardId) ||
      fromCards ||
      normalizeBoardId(DEFAULT_BOARD_ID);
    if (!resolvedBoardId) {
      throw new Error(`Board ID is required. Provide "boardId" or set AGILEPLACE_BOARD_ID in ${configSourceLabel()}.`);
    }
    const cardTypesResponse = await listCardTypes(resolvedBoardId);
    const cardTypes = cardTypesResponse.cardTypes || [];
    const cardTypeOptionsText = cardTypes.length
      ? `Card types on board ${resolvedBoardId}:\n${cardTypes
          .map(ct => `• ${ct.id}: ${ct.name}`)
          .join("\n")}`
      : `No card types are configured on board ${resolvedBoardId}.`;
    const cardTypeIdSet = new Set(cardTypes.map(ct => `${ct.id}`));
    const cardTypeNameMap = new Map(
      cardTypes.map(ct => [(ct.name || "").trim().toLowerCase(), `${ct.id}`])
    );
    const warnings = [];

    const limitedCards = Array.isArray(cards) ? cards.slice(0, MAX_CARDS) : [];
    if (Array.isArray(cards) && cards.length > limitedCards.length) {
      console.warn(`batchCreateCards: trimming cards array to MAX_CARDS (${MAX_CARDS}).`);
      warnings.push(
        `Only the first ${limitedCards.length} cards were processed (of ${cards.length}). Increase MAX_CARDS if you need a higher limit.`
      );
    }
    const normalizedCards = limitedCards.map(card => {
      if (!card) return card;
      let chosenTypeId;
      let sourceDescription;

      if (card.cardTypeId) {
        const trimmedId = `${card.cardTypeId}`.trim();
        if (cardTypeIdSet.has(trimmedId)) {
          chosenTypeId = trimmedId;
          sourceDescription = `cardTypeId=${trimmedId}`;
        } else {
          warnings.push(
            `Card "${card.title}": requested cardTypeId "${trimmedId}" not found on this board. Using default card type.`
          );
        }
      } else if (card.cardTypeName) {
        const lookup = card.cardTypeName.trim().toLowerCase();
        if (cardTypeNameMap.has(lookup)) {
          chosenTypeId = cardTypeNameMap.get(lookup);
          sourceDescription = `cardTypeName=${card.cardTypeName}`;
        } else {
          warnings.push(
            `Card "${card.title}": requested cardTypeName "${card.cardTypeName}" not found on this board. Using default card type.`
          );
        }
      }

      if (chosenTypeId) {
        return {
          ...card,
          cardTypeId: chosenTypeId,
          cardTypeName: undefined,
          __cardTypeSource: sourceDescription,
        };
      }

      return {
        ...card,
        cardTypeId: undefined,
        cardTypeName: undefined,
        __cardTypeSource: "default",
      };
    });

    if (dryRun) {
      const summary = [];
      for (const c of normalizedCards) {
        const { body, sanitized } = await prepareCardPayload(
          { ...c, boardId: resolvedBoardId, laneId },
          { resolveTypeName: false }
        );
        summary.push({
          title: sanitized.title,
          description: sanitized.description,
          destination: body.destination,
          cardTypeId: body.typeId ?? c.cardTypeId ?? null,
          cardTypeSource: c?.__cardTypeSource,
          tags: sanitized.tags || [],
        });
      }

      return respondText(
        cardTypeOptionsText,
        warnings.length ? `Warnings:\n${warnings.join("\n")}` : "",
        `Dry run: would create ${summary.length} card(s) on board ${resolvedBoardId}`,
        `Details:\n${JSON.stringify({ dryRun: true, wouldCreate: summary }, null, 2)}`
      );
    }

    const results = [];
    for (const c of normalizedCards) {
      const created = await createCard({
        boardId: resolvedBoardId,
        laneId,
        title: c.title,
        description: c.description || "",
        plannedStartDate: c.plannedStartDate,
        plannedFinishDate: c.plannedFinishDate,
        isHeader: c.isHeader,
        cardHeader: c.cardHeader,
        cardTypeId: c.cardTypeId,
        cardTypeName: c.cardTypeName,
      }, { resolveTypeName: false, cardTypes });
      results.push(created);
    }

    return respondText(
      cardTypeOptionsText,
      warnings.length ? `Warnings:\n${warnings.join("\n")}` : "",
      `Created ${results.length} card(s) on board ${resolvedBoardId}`,
      `Results:\n${JSON.stringify(
        results.map(c => ({ id: c.id, title: c.title, description: c.description })),
        null,
        2
      )}`
    );
  }
);

/**
 * Validates parameter structure before API call for connected cards
 * @param {Object} parent - Parent card object
 * @param {Array} children - Array of child cards
 * @returns {Object} { valid: boolean, errors: string[] }
 */
function validateConnectedCards(parent, children) {
  const errors = [];
  
  if (!parent?.title) errors.push("Parent must have title");
  if (!Array.isArray(children)) errors.push("Children must be an array");
  if (children.length === 0) errors.push("Must have at least one child");
  
  children.forEach((child, i) => {
    if (!child.title) errors.push(`Child ${i} missing title`);
  });
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Creates parent-child card relationships
 * @param {Object} params - Function parameters
 * @param {string} params.boardId - Optional board ID (defaults to AGILEPLACE_BOARD_ID)
 * @param {Object} params.parent - Parent card (Initiative level)
 * @param {string} params.parent.title - Required
 * @param {string} params.parent.cardTypeId - Optional, use numeric string (e.g., "2227070079")
 * @param {string} params.parent.cardTypeName - Optional, alternative to cardTypeId
 * @param {string} params.parent.description - Optional
 * @param {string} params.parent.plannedStartDate - ISO format (YYYY-MM-DD), optional
 * @param {string} params.parent.plannedFinishDate - ISO format (YYYY-MM-DD), optional
 * @param {boolean} params.parent.isHeader - Optional
 * @param {string} params.parent.cardHeader - Optional
 * @param {Array} params.children - Array of child cards (Epic level)
 * @param {string} params.children[].title - Required
 * @param {string} params.children[].cardTypeId - Optional, use numeric string (e.g., "2044073078")
 * @param {string} params.children[].cardTypeName - Optional, alternative to cardTypeId
 * @param {string} params.children[].description - Optional
 * @param {string} params.children[].plannedStartDate - ISO format (YYYY-MM-DD), optional
 * @param {string} params.children[].plannedFinishDate - ISO format (YYYY-MM-DD), optional
 * @param {boolean} params.children[].isHeader - Optional
 * @param {string} params.children[].cardHeader - Optional
 * @param {boolean} params.dryRun - If true, validate only without creating cards
 * @returns {Promise} Created parent and children with IDs
 */
// Batch create connected cards
mcp.registerTool(
  "batchCreateConnectedCards",
  {
    description:
      "Create a parent card and connect one or more child cards to it. Only parent.title and child.title are required. Use listCardTypes to get valid cardTypeId values. Supports dryRun mode for validation.",
    inputSchema: {
      boardId: z.string().optional(),
      dryRun: z.boolean().optional(),
      parent: z.object({
        title: z.string(),
        description: z.string().optional(),
        plannedStartDate: z.string().optional(),
        plannedFinishDate: z.string().optional(),
        isHeader: z.boolean().optional(),
        cardHeader: z.string().optional(),
        cardTypeId: z.string().optional(),
        cardTypeName: z.string().optional(),
      }),
      children: z.array(
        z.object({
          title: z.string(),
          description: z.string().optional(),
          plannedStartDate: z.string().optional(),
          plannedFinishDate: z.string().optional(),
          isHeader: z.boolean().optional(),
          cardHeader: z.string().optional(),
          cardTypeId: z.string().optional(),
          cardTypeName: z.string().optional(),
        })
      ),
    },
  },
  async ({ boardId, parent, children, dryRun }) => {
    const resolvedBoardId = boardId || DEFAULT_BOARD_ID;
    if (!resolvedBoardId) {
      throw new Error(`Board ID is required. Provide "boardId" or set AGILEPLACE_BOARD_ID in ${configSourceLabel()}.`);
    }

    // Validate parameters
    const validation = validateConnectedCards(parent, children);
    if (!validation.valid) {
      throw new Error(`Validation errors: ${validation.errors.join(", ")}`);
    }

    const limitedChildren = Array.isArray(children) ? children.slice(0, MAX_CARDS) : [];
    if (Array.isArray(children) && children.length > limitedChildren.length) {
      console.warn(`batchCreateConnectedCards: trimming children array to MAX_CARDS (${MAX_CARDS}).`);
    }

    // Get card types for validation and dry run preview
    const cardTypesResponse = await listCardTypes(resolvedBoardId);
    const cardTypes = cardTypesResponse.cardTypes || [];

    if (dryRun) {
      // Prepare parent card payload for preview
      const parentPreview = await prepareCardPayload(
        { ...parent, boardId: resolvedBoardId },
        { resolveTypeName: false, cardTypes }
      );

      // Prepare children card payloads for preview
      const childrenPreview = [];
      for (const child of limitedChildren) {
        const childPreview = await prepareCardPayload(
          { ...child, boardId: resolvedBoardId },
          { resolveTypeName: false, cardTypes }
        );
        childrenPreview.push({
          title: childPreview.sanitized.title,
          description: childPreview.sanitized.description,
          cardTypeId: childPreview.body.typeId ?? child.cardTypeId ?? null,
          cardTypeName: child.cardTypeName ?? null,
          plannedStart: childPreview.body.plannedStart ?? null,
          plannedFinish: childPreview.body.plannedFinish ?? null,
        });
      }

      return respondText(
        `Dry run: would create parent "${parentPreview.sanitized.title}" with ${childrenPreview.length} child card(s) on board ${resolvedBoardId}`,
        `Details:\n${JSON.stringify(
          {
            dryRun: true,
            wouldCreate: {
              parent: {
                title: parentPreview.sanitized.title,
                description: parentPreview.sanitized.description,
                cardTypeId: parentPreview.body.typeId ?? parent.cardTypeId ?? null,
                cardTypeName: parent.cardTypeName ?? null,
                plannedStart: parentPreview.body.plannedStart ?? null,
                plannedFinish: parentPreview.body.plannedFinish ?? null,
              },
              children: childrenPreview,
            },
          },
          null,
          2
        )}`
      );
    }

    // Step 1: create parent
    const parentCard = await createCard({
      boardId: resolvedBoardId,
      title: parent.title,
      description: parent.description || "",
      plannedStartDate: parent.plannedStartDate,
      plannedFinishDate: parent.plannedFinishDate,
      isHeader: parent.isHeader,
      cardHeader: parent.cardHeader,
      cardTypeId: parent.cardTypeId,
      cardTypeName: parent.cardTypeName,
    }, { resolveTypeName: true, cardTypes });

    // Step 2: create children
    const childCards = [];
    for (const c of limitedChildren) {
      const child = await createCard({
        boardId: resolvedBoardId,
        title: c.title,
        description: c.description || "",
        plannedStartDate: c.plannedStartDate,
        plannedFinishDate: c.plannedFinishDate,
        isHeader: c.isHeader,
        cardHeader: c.cardHeader,
        cardTypeId: c.cardTypeId,
        cardTypeName: c.cardTypeName,
      }, { resolveTypeName: true, cardTypes });
      childCards.push(child);
    }

    // Step 3: connect children to parent
    await connectCards(parentCard.id, childCards.map(c => c.id));

    return respondText(
      `Created parent "${parent.title}" with ${childCards.length} child card(s) on board ${resolvedBoardId}`,
      `Details:\n${JSON.stringify(
        {
          parent: { id: parentCard.id, title: parentCard.title },
          children: childCards.map(c => ({ id: c.id, title: c.title })),
        },
        null,
        2
      )}`
    );
  }
);

// Get a single card by ID
mcp.registerTool(
  "getCard",
  {
    description: "Get a single card by ID. Wraps the AgilePlace GET card endpoint and returns a simplified summary plus full JSON.",
    inputSchema: {
      cardId: z.string(),
    },
  },
  async ({ cardId }) => {
    const card = await getCardById(cardId);
    if (!card) {
      return respondText(`No card found with ID ${cardId}`);
    }
    const summary = {
      id: String(card.id ?? ""),
      title: card.title ?? "",
      description: card.description ?? "",
      laneId: card.laneId ?? card.lane?.id ?? null,
      cardType: card.type?.title ?? card.type?.name ?? card.cardType?.name ?? card.cardType?.title ?? "",
      priority: card.priority ?? null,
      size: card.size ?? null,
      tags: Array.isArray(card.tags) ? card.tags : [],
    };
    return respondText(
      `Card ${summary.id}: ${summary.title}`,
      JSON.stringify(summary, null, 2),
      `JSON:\n${JSON.stringify(card, null, 2)}`
    );
  }
);

// Get card custom field values with metadata context
mcp.registerTool(
  "getCardCustomFields",
  {
    description:
      "Get the card's custom field values (customFields) plus board custom field metadata (label/type/helpText) for context.",
    inputSchema: {
      cardId: z.string(),
    },
  },
  async ({ cardId }) => {
    const card = await getCardById(cardId);
    if (!card) {
      return respondText(`No card found with ID ${cardId}`);
    }

    const boardId = card?.board?.id ? String(card.board.id) : null;
    if (!boardId) throw new Error(`Unable to determine boardId for card ${cardId}`);

    const boardFieldsResp = await getBoardCustomFieldsApi(boardId);
    const boardFields = boardFieldsResp?.customFields || [];

    const response = buildCardCustomFieldsResponse({
      boardId,
      cardId,
      card,
      boardFields,
    });

    return respondText(`Card ${cardId} custom fields`, JSON.stringify(response, null, 2));
  }
);

// Set custom field values on a card via JSON Patch
mcp.registerTool(
  "setCardCustomFields",
  {
    description:
      "Set one or more custom field values on a card using JSON Patch on PATCH /io/card/:cardId. Null clears the custom field.",
    inputSchema: {
      cardId: z.string(),
      fields: z
        .array(
          z.object({
            fieldId: z.string().min(1),
            value: z.union([z.string(), z.number(), z.null(), z.array(z.string())]),
          })
        )
        .min(1),
    },
  },
  async ({ cardId, fields }) => {
    const card = await getCardById(cardId);
    if (!card) throw new Error(`No card found with ID ${cardId}`);

    const boardId = card?.board?.id ? String(card.board.id) : null;
    if (!boardId) throw new Error(`Unable to determine boardId for card ${cardId}`);

    const boardFieldsResp = await getBoardCustomFieldsApi(boardId);
    const boardFields = boardFieldsResp?.customFields || [];
    const metaByFieldId = new Map(boardFields.map(f => [String(f.id), f]));

    const warnIfMismatch = (expectedType, rawValue, fieldId) => {
      if (!expectedType || rawValue === null || rawValue === undefined) return;

      const type = String(expectedType);
      const value = rawValue;

      const ok =
        (type === "number" && typeof value === "number") ||
        ((type === "text" || type === "choice" || type === "date") && typeof value === "string") ||
        (type === "multi" && Array.isArray(value) && value.every(v => typeof v === "string"));

      if (!ok) {
        console.warn(
          `setCardCustomFields: fieldId=${fieldId} expected type=${type} but got value type=${
            Array.isArray(value) ? "array" : typeof value
          }`
        );
      }
    };

    fields.forEach(f => {
      const meta = metaByFieldId.get(String(f.fieldId));
      warnIfMismatch(meta?.type, f.value, f.fieldId);
    });

    const operations = fields.map(f => ({
      op: "add",
      path: "/customFields/0",
      value: {
        fieldId: String(f.fieldId),
        value: f.value,
      },
    }));

    await patchCardOperations({
      cardId,
      operations,
      context: "Set card custom fields",
    });

    const updated = await getCardById(cardId);
    if (!updated) throw new Error(`Unable to re-fetch updated card ${cardId}`);

    const updatedBoardFieldsResp = await getBoardCustomFieldsApi(boardId);
    const updatedBoardFields = updatedBoardFieldsResp?.customFields || [];

    const response = buildCardCustomFieldsResponse({
      boardId,
      cardId,
      card: updated,
      boardFields: updatedBoardFields,
    });

    return respondText(`Updated card ${cardId} custom fields`, JSON.stringify(response, null, 2));
  }
);

// List cards on a board
mcp.registerTool(
  "listCards",
  {
    description: "List cards on a board. Returns count and first 10 cards (id, title, description, dates, header flag). Optionally include child card summaries when includeChildren is true.",
    inputSchema: {
      boardId: z.string().optional(),
      includeChildren: z.boolean().optional(),
    },
  },
  async ({ boardId, includeChildren = false }) => {
    const resolvedBoardId = boardId || DEFAULT_BOARD_ID;
    if (!resolvedBoardId) {
      throw new Error(`Board ID is required. Provide \"boardId\" or set AGILEPLACE_BOARD_ID in ${configSourceLabel()}.`);
    }
    const response = await listCards(resolvedBoardId);
    const cards = response.cards || [];
    const totalRecords = response.pageMeta?.totalRecords || cards.length;
    const sliceCards = cards.slice(0, 10);

    // Create a simplified response format
    let cardList = sliceCards.map(c => {
      const base = {
        id: c.id,
        title: c.title,
        description: c.description || "",
        plannedStartDate: c.plannedStart,
        plannedFinishDate: c.plannedFinish,
        isHeader: c.isHeader || false,
        laneId: c.laneId,
        cardType: c.cardType?.name ?? c.type?.title ?? c.type?.name,
        priority: c.priority,
        size: c.size,
        tags: Array.isArray(c.tags) ? c.tags : [],
      };
      if (includeChildren) {
        base.children = []; // Populated below
      }
      return base;
    });

    if (includeChildren && cardList.length > 0) {
      const childResults = await Promise.all(
        cardList.map(c => getConnectionChildren(c.id))
      );
      cardList = cardList.map((c, i) => {
        const childCards = childResults[i] || [];
        c.children = childCards.map(ch => ({
          id: String(ch.id ?? ""),
          title: ch.title ?? "",
          cardType: ch.type?.title ?? ch.type?.name ?? ch.cardType?.name ?? ch.cardType?.title ?? "",
        }));
        return c;
      });
    }

    return respondText(
      `Found ${totalRecords} cards on board ${resolvedBoardId}. Here are the first ${cardList.length} cards:`,
      cardList.map(c => `ID: ${c.id} | Title: ${c.title} | Type: ${c.cardType}`).join("\n"),
      `JSON:\n${JSON.stringify(cardList, null, 2)}`
    );
  }
);

// Update card title/description/dates/type/priority
mcp.registerTool(
  "updateCard",
  {
    description: "Update a card's title, description, dates, card header (customId), card type, or priority by cardId. Provide boardId optionally to validate cardTypeId against the board.",
    inputSchema: {
      cardId: z.string(),
      title: z.string().optional(),
      description: z.string().optional(),
      plannedStartDate: z.string().optional(),
      plannedFinishDate: z.string().optional(),
      isHeader: z.boolean().optional(),
      cardHeader: z.string().optional(),
      cardTypeId: z.string().optional(),
      priority: z.enum(["normal", "low", "high", "critical"]).optional(),
      boardId: z.string().optional(),
    },
  },
  async ({ cardId, title, description, plannedStartDate, plannedFinishDate, isHeader, cardHeader, cardTypeId, priority, boardId }) => {
    const updated = await updateCard({
      cardId,
      title,
      description,
      plannedStartDate,
      plannedFinishDate,
      isHeader,
      cardHeader,
      cardTypeId,
      priority,
      boardId,
    });

    return respondText(
      `Updated card ${cardId}`,
      `Result:\n${JSON.stringify(
        {
          id: updated.id,
          title: updated.title,
          description: updated.description,
          cardHeader: updated.customId?.value,
          cardType: updated.type?.title ?? updated.type?.name,
          priority: updated.priority,
        },
        null,
        2
      )}`
    );
  }
);

// Batch update cards - different updates per card (parallel PATCH calls)
mcp.registerTool(
  "batchUpdateCards",
  {
    description: "Update multiple cards with different updates per card. Each item needs cardId (required) plus any of: title, description, cardHeader, plannedStartDate, plannedFinishDate, isHeader, cardTypeId, priority. Returns per-card success/failure. Max 50 cards per call. For the same update on many cards, use bulkUpdateCards instead.",
    inputSchema: {
      updates: z.array(z.object({
        cardId: z.string(),
        title: z.string().optional(),
        description: z.string().optional(),
        cardHeader: z.string().optional(),
        plannedStartDate: z.string().optional(),
        plannedFinishDate: z.string().optional(),
        isHeader: z.boolean().optional(),
        cardTypeId: z.string().optional(),
        priority: z.enum(["normal", "low", "high", "critical"]).optional(),
      })),
      boardId: z.string().optional(),
    },
  },
  async ({ updates, boardId }) => {
    const result = await batchUpdateCards(updates, boardId || undefined);

    return respondText(
      `Batch update: ${result.successCount} succeeded, ${result.failureCount} failed`,
      `Results:\n${JSON.stringify(result.results, null, 2)}`
    );
  }
);

// Bulk update cards - SAME update applied to ALL specified cards (uses PATCH /io/card/bulk)
mcp.registerTool(
  "bulkUpdateCards",
  {
    description: "Apply the same updates to multiple cards in one API call. Uses the native bulk endpoint. For different updates per card, use batchUpdateCards instead. Updates use JSON Patch format: [{ op, path, value }]. Supported paths: /title, /typeId, /description, /customId, /plannedStart, /plannedFinish, /laneId, /tags/-, /tags, /priority, /size, /isBlocked, /blockReason.",
    inputSchema: {
      cardIds: z.array(z.string()),
      updates: z.array(z.object({
        op: z.enum(["replace", "add", "remove"]),
        path: z.string(),
        value: z.any().optional(),
      })),
    },
  },
  async ({ cardIds, updates }) => {
    await bulkUpdateCardsApi(cardIds, updates);
    return respondText(
      `Bulk update accepted for ${cardIds.length} card(s)`,
      `202 Accepted. Same ${updates.length} operation(s) applied to all cards.`
    );
  }
);

// Connect existing cards
mcp.registerTool(
  "connectExistingCards",
  {
    description: "Connect existing cards by creating parent-child relationships. Provide a parent card ID and an array of child card IDs. Optional boardId for context (not used by API).",
    inputSchema: {
      parentCardId: z.string(),
      childCardIds: z.array(z.string()),
      boardId: z.string().optional(),
    },
  },
  async ({ parentCardId, childCardIds, boardId: _boardId }) => {
    const result = await connectExistingCards(parentCardId, childCardIds);

    return respondText(
      `Connected ${childCardIds.length} child card(s) to parent card ${parentCardId}`,
      `Details:\n${JSON.stringify(
        {
          parent: result.card,
          connections: result.connections,
        },
        null,
        2
      )}`
    );
  }
);

// Dependencies: update and delete
mcp.registerTool(
  "updateCardDependency",
  {
    description: "Update an existing dependency relationship between cards. Pass the payload expected by PATCH /io/card/dependency.",
    inputSchema: {
      payload: z.any(),
    },
  },
  async ({ payload }) => {
    const result = await updateCardDependencyApi(payload);
    return respondText(
      "Updated card dependency",
      JSON.stringify(result, null, 2)
    );
  }
);

mcp.registerTool(
  "deleteCardDependency",
  {
    description: "Delete a dependency relationship between cards. Pass the payload expected by DELETE /io/card/dependency.",
    inputSchema: {
      payload: z.any(),
    },
  },
  async ({ payload }) => {
    const result = await deleteCardDependencyApi(payload);
    return respondText(
      "Deleted card dependency",
      JSON.stringify(result, null, 2)
    );
  }
);

// Get card relationships (dependencies and parent-child)
mcp.registerTool(
  "get_card_relationships",
  {
    description: "Get all relationships and dependencies for a specific card. Returns upstream dependencies (what blocks this card), downstream dependencies (what this card blocks), parent cards with full details (id, title, cardType, laneId, tags), and child cards with full details.",
    inputSchema: {
      cardId: z.string(),
      includeFaces: z.boolean().optional(),
      boardId: z.string().optional(),
    },
  },
  async ({ cardId, includeFaces = true, boardId: _boardId }) => {
    try {
      // Fetch dependencies, parents, and children in parallel
      const [depResponse, parentCards, childCards] = await Promise.all([
        getCardDependencies(cardId, includeFaces),
        getConnectionParents(cardId),
        getConnectionChildren(cardId),
      ]);
      const { dependencies } = depResponse;

      // Transform dependencies to more useful format
      const upstream = (dependencies || [])
        .filter(d => d.direction === "incoming")
        .map(d => ({
          cardId: d.cardId,
          title: d.face?.title,
          timing: d.timing,
          relationship: "blocks this card",
          createdOn: d.createdOn,
          details: d.face,
        }));

      const downstream = (dependencies || [])
        .filter(d => d.direction === "outgoing")
        .map(d => ({
          cardId: d.cardId,
          title: d.face?.title,
          timing: d.timing,
          relationship: "blocked by this card",
          createdOn: d.createdOn,
          details: d.face,
        }));

      // Map parents and children to full summary format (id, title, cardType, laneId, relationship)
      const parents = parentCards.map(p => toParentChildSummary(p, "parent of this card"));
      const children = childCards.map(c => toParentChildSummary(c, "child of this card"));

      const totalRelationships = upstream.length + downstream.length + parents.length + children.length;

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            cardId,
            dependencies: {
              upstream,
              downstream,
              total: upstream.length + downstream.length,
            },
            parentChild: {
              parents,
              children,
            },
            totalRelationships,
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error fetching relationships: ${error.message}`,
        }],
        isError: true,
      };
    }
  }
);

// Get card children (lightweight child lookup)
mcp.registerTool(
  "getCardChildren",
  {
    description: "Fetch just the children of a given card. Returns parent info and child cards with id, title, cardType, laneId, and optional dates. Useful for cascade workflows and hierarchy traversal.",
    inputSchema: {
      cardId: z.string(),
      includeFaces: z.boolean().optional(),
      boardId: z.string().optional(),
    },
  },
  async ({ cardId, includeFaces = false, boardId: _boardId }) => {
    const [parentCard, childCards] = await Promise.all([
      getCardById(cardId),
      getConnectionChildren(cardId),
    ]);

    const parentTitle = parentCard?.title ?? "";

    const children = childCards.map(c => {
      const cardType = c.type?.title ?? c.type?.name ?? c.cardType?.name ?? c.cardType?.title ?? "";
      const child = {
        id: String(c.id ?? ""),
        title: c.title ?? "",
        cardType: String(cardType),
      };
      const laneId = c.laneId ?? c.lane?.id;
      if (laneId) child.laneId = String(laneId);
      if (c.plannedStart) child.plannedStartDate = c.plannedStart;
      if (c.plannedFinish) child.plannedFinishDate = c.plannedFinish;
      return child;
    });

    const result = {
      parentCardId: cardId,
      parentTitle,
      children,
      childCount: children.length,
    };

    return {
      content: [{
        type: "text",
        text: JSON.stringify(result, null, 2),
      }],
    };
  }
);

// Get board dependency graph - using registerAppTool helper
registerAppTool(
  mcp,
  "get_board_dependency_graph",
  {
    title: "Board Dependency Graph",
    description: "Get complete dependency graph for an entire board. Returns all cards with their relationships formatted for graph visualization. Includes interactive UI for exploring the dependency graph.",
    inputSchema: {
      boardId: z.string().optional(),
    },
    _meta: {
      ui: {
        resourceUri: DEPENDENCY_GRAPH_URI,
      },
    },
  },
  async ({ boardId }) => {
    const resolvedBoardId = boardId || DEFAULT_BOARD_ID;
    if (!resolvedBoardId) {
      throw new Error(`Board ID is required. Provide "boardId" or set AGILEPLACE_BOARD_ID in ${configSourceLabel()}.`);
    }

    try {
      // Fetch all cards with dependencies included
      const response = await listCardsWithDependencies(resolvedBoardId);
      const { cards } = response;

      // Build nodes array
      const nodes = cards.map(card => ({
        id: card.id,
        title: card.title,
        description: card.description,
        laneId: card.lane?.id,
        laneName: card.lane?.title,
        laneType: card.lane?.laneType,
        priority: card.priority,
        size: card.size,
        color: card.color,
        tags: card.tags || [],
        assignedUsers: (card.assignedUsers || []).map(u => ({
          id: u.id,
          name: u.fullName,
          email: u.emailAddress,
        })),
        assignedTeams: (card.assignedTeams || []).map(t => ({
          id: t.id,
          name: t.title,
        })),
        dates: {
          plannedStart: card.plannedStart,
          plannedFinish: card.plannedFinish,
          actualStart: card.actualStart,
          actualFinish: card.actualFinish,
        },
        cardType: card.type?.title,
        isBlocked: card.blockedStatus?.isBlocked || false,
        blockReason: card.blockedStatus?.reason,
        customFields: card.customFields || {},
        parentCards: (card.parentCards || [])
          .filter(p => p && p.id) // Only include parents with valid IDs
          .map(p => ({
            id: p.id,
            title: p.title,
          })),
      }));

      // Build edges array from dependencies and parent-child relationships
      const edges = [];
      const cardMap = new Map(cards.map(c => [c.id, c]));

      cards.forEach(card => {
        // Add dependency edges
        const deps = card.dependencies || { incoming: [], outgoing: [] };

        // Incoming = other cards that block this card
        deps.incoming.forEach(dep => {
          edges.push({
            from: dep.cardId,
            to: card.id,
            type: "blocks",
            timing: dep.timing,
            createdOn: dep.createdOn,
          });
        });

        // Outgoing = cards that this card blocks
        deps.outgoing.forEach(dep => {
          edges.push({
            from: card.id,
            to: dep.cardId,
            type: "blocks",
            timing: dep.timing,
            createdOn: dep.createdOn,
          });
        });

        // Add parent-child edges
        const parentCards = card.parentCards || [];
        parentCards.forEach(parent => {
          // Only create edge if parent has a valid ID
          if (parent && parent.id) {
            edges.push({
              from: parent.id,
              to: card.id,
              type: "parent",
              relationship: "parent-child",
            });
          }
        });
      });

      // Remove duplicate edges and filter out invalid ones
      const validEdges = edges.filter(e => e.from && e.to); // Ensure both from and to exist
      const uniqueEdges = Array.from(
        new Map(validEdges.map(e => [`${e.from}-${e.to}-${e.type}`, e])).values()
      );

      // Separate edges by type
      const dependencyEdges = uniqueEdges.filter(e => e.type === "blocks");
      const parentChildEdges = uniqueEdges.filter(e => e.type === "parent");

      // Calculate graph statistics
      const blockedCards = nodes.filter(n => n.isBlocked).length;
      const cardsWithDependencies = new Set([
        ...dependencyEdges.map(e => e.from),
        ...dependencyEdges.map(e => e.to),
      ]).size;
      const cardsWithParentChild = new Set([
        ...parentChildEdges.map(e => e.from),
        ...parentChildEdges.map(e => e.to),
      ]).size;

      // Return both the graph data and a reference to the UI resource
      // Claude Desktop will automatically load the UI resource when the tool is invoked
      const graphData = {
        boardId: resolvedBoardId,
        nodes,
        edges: uniqueEdges,
        statistics: {
          totalCards: nodes.length,
          dependencies: {
            total: dependencyEdges.length,
            cardsWithDependencies,
            averagePerCard: nodes.length > 0 ? (dependencyEdges.length / nodes.length).toFixed(2) : "0",
          },
          parentChild: {
            total: parentChildEdges.length,
            cardsWithParentChild,
            averagePerCard: nodes.length > 0 ? (parentChildEdges.length / nodes.length).toFixed(2) : "0",
          },
          totalRelationships: uniqueEdges.length,
          blockedCards,
        },
      };

      // Return both content and structuredContent - structuredContent is what the UI receives
      const result = {
        content: [
          {
            type: "text",
            text: JSON.stringify(graphData, null, 2),
          },
        ],
        structuredContent: graphData, // This is passed to the UI via app.ontoolresult
      };
      
      // Log the result structure for debugging
      console.error(`[get_board_dependency_graph] Returning result with structuredContent:`, {
        hasStructuredContent: !!result.structuredContent,
        structuredContentKeys: result.structuredContent ? Object.keys(result.structuredContent) : [],
        nodeCount: result.structuredContent?.nodes?.length || 0,
        edgeCount: result.structuredContent?.edges?.length || 0,
      });
      
      return result;
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error fetching board dependency graph: ${error.message}`,
        }],
        isError: true,
      };
    }
  }
);

// Create card dependency (optional - for future drag-and-drop updates)
mcp.registerTool(
  "create_card_dependency",
  {
    description: "Create a dependency relationship between cards. Use when one card blocks or depends on another.",
    inputSchema: {
      cardId: z.string(),
      dependsOnCardId: z.string(),
      timing: z.enum(["finishToStart", "startToStart", "startToFinish", "finishToFinish"]).optional(),
    },
  },
  async ({ cardId, dependsOnCardId, timing = "finishToStart" }) => {
    try {
      const ioPath = getIoPath();
      const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/card/dependency`, {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify({
          cardIds: [String(cardId)],
          dependsOnCardIds: [String(dependsOnCardId)],
          timing,
        }),
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(formatFetchError(resp, "Create card dependency", text));
      }

      return respondText(
        `Dependency created: Card ${cardId} now depends on Card ${dependsOnCardId} (${timing})`
      );
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error creating dependency: ${error.message}`,
        }],
        isError: true,
      };
    }
  }
);

// (Board update/layout/custom field tools moved to src/tools/boards.mjs)

// Move card to lane
mcp.registerTool(
  "moveCardToLane",
  {
    description: "Move a card to a different lane.",
    inputSchema: {
      cardId: z.string(),
      laneId: z.string(),
    },
  },
  async ({ cardId, laneId }) => {
    const updated = await moveCardToLaneApi(cardId, laneId);
    return respondText(`Moved card ${cardId} to lane ${laneId}`, JSON.stringify({ id: updated.id, laneId: updated.lane?.id }, null, 2));
  }
);

// Delete cards
mcp.registerTool(
  "deleteCard",
  {
    description: "Delete a single card. Board setting 'Allow users to delete cards' must be enabled.",
    inputSchema: {
      cardId: z.string(),
    },
  },
  async ({ cardId }) => {
    await deleteCardApi(cardId);
    return respondText(`Deleted card ${cardId}`);
  }
);

mcp.registerTool(
  "batchDeleteCards",
  {
    description: "Delete multiple cards in one call. All cards must be on the same board. Board setting 'Allow users to delete cards' must be enabled.",
    inputSchema: {
      cardIds: z.array(z.string()),
    },
  },
  async ({ cardIds }) => {
    await batchDeleteCardsApi(cardIds);
    return respondText(`Deleted ${cardIds.length} card(s)`);
  }
);

// Assign users to cards
mcp.registerTool(
  "assignUsersToCards",
  {
    description: "Assign one or more users to one or more cards using the native assign endpoint.",
    inputSchema: {
      cardIds: z.array(z.string()),
      userIds: z.array(z.string()),
    },
  },
  async ({ cardIds, userIds }) => {
    const result = await assignUsersToCardsApi(cardIds, userIds);
    return respondText(
      `Assigned ${userIds.length} user(s) to ${cardIds.length} card(s)`,
      JSON.stringify(result, null, 2)
    );
  }
);

// Delete card connections
mcp.registerTool(
  "deleteCardConnections",
  {
    description: "Delete parent/child connections for one or more cards. Provide cardIds and optional connections object (e.g., { children: [ids], parents: [ids] }).",
    inputSchema: {
      cardIds: z.array(z.string()),
      connections: z
        .object({
          children: z.array(z.string()).optional(),
          parents: z.array(z.string()).optional(),
        })
        .optional(),
    },
  },
  async ({ cardIds, connections }) => {
    const result = await deleteCardConnectionsApi(cardIds, connections);
    return respondText(
      `Deleted connections for ${cardIds.length} card(s)`,
      JSON.stringify(result, null, 2)
    );
  }
);

// Planning series (PI Planning)
mcp.registerTool(
  "listPlanningSeries",
  {
    description: "List planning series (PI Planning) in the workspace.",
    inputSchema: {},
  },
  async () => {
    const result = await listPlanningSeriesApi();
    return respondText(
      "Planning series list",
      JSON.stringify(result, null, 2)
    );
  }
);

// Reporting & flow metrics
mcp.registerTool(
  "getBoardThroughputReport",
  {
    description: "Get throughput report for a board.",
    inputSchema: {
      boardId: z.string().optional(),
    },
  },
  async ({ boardId }) => {
    const resolvedBoardId = boardId || DEFAULT_BOARD_ID;
    if (!resolvedBoardId) {
      throw new Error(`Board ID is required. Provide \"boardId\" or set AGILEPLACE_BOARD_ID in ${configSourceLabel()}.`);
    }
    const result = await getBoardThroughputReportApi(resolvedBoardId);
    return respondText(
      `Throughput report for board ${resolvedBoardId}`,
      JSON.stringify(result, null, 2)
    );
  }
);

mcp.registerTool(
  "getBoardWipReport",
  {
    description: "Get WIP report for a board.",
    inputSchema: {
      boardId: z.string().optional(),
    },
  },
  async ({ boardId }) => {
    const resolvedBoardId = boardId || DEFAULT_BOARD_ID;
    if (!resolvedBoardId) {
      throw new Error(`Board ID is required. Provide \"boardId\" or set AGILEPLACE_BOARD_ID in ${configSourceLabel()}.`);
    }
    const result = await getBoardWipReportApi(resolvedBoardId);
    return respondText(
      `WIP report for board ${resolvedBoardId}`,
      JSON.stringify(result, null, 2)
    );
  }
);

mcp.registerTool(
  "getLaneBottleneckReport",
  {
    description: "Get lane bottleneck report for a board.",
    inputSchema: {
      boardId: z.string().optional(),
    },
  },
  async ({ boardId }) => {
    const resolvedBoardId = boardId || DEFAULT_BOARD_ID;
    if (!resolvedBoardId) {
      throw new Error(`Board ID is required. Provide \"boardId\" or set AGILEPLACE_BOARD_ID in ${configSourceLabel()}.`);
    }
    const result = await getLaneBottleneckReportApi(resolvedBoardId);
    return respondText(
      `Lane bottleneck report for board ${resolvedBoardId}`,
      JSON.stringify(result, null, 2)
    );
  }
);

mcp.registerTool(
  "getCardStatistics",
  {
    description: "Get statistics for a card (cycle time, lead time, etc., depending on AgilePlace configuration).",
    inputSchema: {
      cardId: z.string(),
    },
  },
  async ({ cardId }) => {
    const result = await getCardStatisticsApi(cardId);
    return respondText(
      `Statistics for card ${cardId}`,
      JSON.stringify(result, null, 2)
    );
  }
);

mcp.registerTool(
  "getCardActivity",
  {
    description: "Get activity history for a card.",
    inputSchema: {
      cardId: z.string(),
    },
  },
  async ({ cardId }) => {
    const result = await getCardActivityApi(cardId);
    return respondText(
      `Activity for card ${cardId}`,
      JSON.stringify(result, null, 2)
    );
  }
);

// Users
mcp.registerTool(
  "getCurrentUser",
  {
    description: "Get the current AgilePlace user (user/me).",
    inputSchema: {},
  },
  async () => {
    const result = await getCurrentUserApi();
    return respondText(
      "Current user",
      JSON.stringify(result, null, 2)
    );
  }
);

mcp.registerTool(
  "listUsers",
  {
    description: "List users in the AgilePlace workspace.",
    inputSchema: {},
  },
  async () => {
    const result = await listUsersApi();
    return respondText(
      "Users",
      JSON.stringify(result, null, 2)
    );
  }
);

mcp.registerTool(
  "getUser",
  {
    description: "Get a single user by ID.",
    inputSchema: {
      userId: z.string(),
    },
  },
  async ({ userId }) => {
    const result = await getUserByIdApi(userId);
    return respondText(
      `User ${userId}`,
      JSON.stringify(result, null, 2)
    );
  }
);

mcp.registerTool(
  "createPlanningSeries",
  {
    description: "Create a planning series (PI). Payload is passed directly to POST /io/series.",
    inputSchema: {
      payload: z.any(),
    },
  },
  async ({ payload }) => {
    const result = await createPlanningSeriesApi(payload);
    return respondText(
      "Created planning series",
      JSON.stringify(result, null, 2)
    );
  }
);

mcp.registerTool(
  "getPlanningSeries",
  {
    description: "Get a single planning series by ID.",
    inputSchema: {
      seriesId: z.string(),
    },
  },
  async ({ seriesId }) => {
    const result = await getPlanningSeriesApi(seriesId);
    return respondText(
      `Planning series ${seriesId}`,
      JSON.stringify(result, null, 2)
    );
  }
);

mcp.registerTool(
  "updatePlanningSeries",
  {
    description: "Update a planning series by ID. Payload is passed directly to PATCH /io/series/:seriesId.",
    inputSchema: {
      seriesId: z.string(),
      updates: z.any(),
    },
  },
  async ({ seriesId, updates }) => {
    const result = await updatePlanningSeriesApi(seriesId, updates);
    return respondText(
      `Updated planning series ${seriesId}`,
      JSON.stringify(result, null, 2)
    );
  }
);

mcp.registerTool(
  "deletePlanningSeries",
  {
    description: "Delete a planning series by ID.",
    inputSchema: {
      seriesId: z.string(),
    },
  },
  async ({ seriesId }) => {
    await deletePlanningSeriesApi(seriesId);
    return respondText(`Deleted planning series ${seriesId}`);
  }
);

mcp.registerTool(
  "createPlanningIncrement",
  {
    description: "Create an increment within a planning series.",
    inputSchema: {
      seriesId: z.string(),
      payload: z.any(),
    },
  },
  async ({ seriesId, payload }) => {
    const result = await createIncrementApi(seriesId, payload);
    return respondText(
      `Created increment in series ${seriesId}`,
      JSON.stringify(result, null, 2)
    );
  }
);

mcp.registerTool(
  "listPlanningIncrements",
  {
    description: "List increments for a planning series.",
    inputSchema: {
      seriesId: z.string(),
    },
  },
  async ({ seriesId }) => {
    const result = await listIncrementsApi(seriesId);
    return respondText(
      `Increments for series ${seriesId}`,
      JSON.stringify(result, null, 2)
    );
  }
);

mcp.registerTool(
  "updatePlanningIncrement",
  {
    description: "Update an increment within a planning series.",
    inputSchema: {
      seriesId: z.string(),
      incrementId: z.string(),
      updates: z.any(),
    },
  },
  async ({ seriesId, incrementId, updates }) => {
    const result = await updateIncrementApi(seriesId, incrementId, updates);
    return respondText(
      `Updated increment ${incrementId} in series ${seriesId}`,
      JSON.stringify(result, null, 2)
    );
  }
);

mcp.registerTool(
  "deletePlanningIncrement",
  {
    description: "Delete an increment from a planning series.",
    inputSchema: {
      seriesId: z.string(),
      incrementId: z.string(),
    },
  },
  async ({ seriesId, incrementId }) => {
    await deleteIncrementApi(seriesId, incrementId);
    return respondText(`Deleted increment ${incrementId} from series ${seriesId}`);
  }
);

mcp.registerTool(
  "getPlanningIncrementStatus",
  {
    description: "Get status for a planning increment, optionally filtered by category.",
    inputSchema: {
      seriesId: z.string(),
      incrementId: z.string(),
      category: z.string().optional(),
    },
  },
  async ({ seriesId, incrementId, category }) => {
    const result = await getIncrementStatusApi(seriesId, incrementId, category);
    return respondText(
      `Status for increment ${incrementId} in series ${seriesId}`,
      JSON.stringify(result, null, 2)
    );
  }
);

const listCardIdsToolDefinition = {
  description: "List a simple set of card IDs and titles from the board. Returns a basic text format that's easy to parse, plus JSON with tags for each card.",
  inputSchema: {
    boardId: z.string().optional(),
  },
};

const listCardIdsToolHandler = async ({ boardId }) => {
  const resolvedBoardId = boardId || DEFAULT_BOARD_ID;
  if (!resolvedBoardId) {
    throw new Error(`Board ID is required. Provide "boardId" or set AGILEPLACE_BOARD_ID in ${configSourceLabel()}.`);
  }
  const response = await listCards(resolvedBoardId);
  const cards = response.cards || [];
  const totalRecords = response.pageMeta?.totalRecords || cards.length;
  const sliceCards = cards.slice(0, 20);

  const cardList = sliceCards.map(c => `${c.id}: ${c.title}`).join("\n");
  const cardData = sliceCards.map(c => ({
    id: c.id,
    title: c.title,
    tags: Array.isArray(c.tags) ? c.tags : [],
  }));

  return respondText(
    `Found ${totalRecords} cards on board ${resolvedBoardId}. Here are the first ${sliceCards.length} cards with their IDs:`,
    cardList,
    `JSON:\n${JSON.stringify(cardData, null, 2)}`
  );
};

// List card IDs and titles (simple format)
mcp.registerTool("listCardIds", listCardIdsToolDefinition, listCardIdsToolHandler);

// Create Epic hierarchy (Epic -> Features -> Stories)
mcp.registerTool(
  "createEpicHierarchy",
  {
    description: "Create a complete Epic -> Features -> Stories hierarchy in one operation. Each feature can have multiple stories as children. Use listCardTypes to get valid cardTypeId values.",
    inputSchema: {
      boardId: z.string().optional(),
      dryRun: z.boolean().optional(),
      epic: z.object({
        title: z.string(),
        description: z.string().optional(),
        plannedStartDate: z.string().optional(),
        plannedFinishDate: z.string().optional(),
        isHeader: z.boolean().optional(),
        cardHeader: z.string().optional(),
        cardTypeId: z.string().optional(),
        cardTypeName: z.string().optional(),
      }),
      features: z.array(z.object({
        title: z.string(),
        description: z.string().optional(),
        plannedStartDate: z.string().optional(),
        plannedFinishDate: z.string().optional(),
        isHeader: z.boolean().optional(),
        cardHeader: z.string().optional(),
        cardTypeId: z.string().optional(),
        cardTypeName: z.string().optional(),
        stories: z.array(z.object({
          title: z.string(),
          description: z.string().optional(),
          plannedStartDate: z.string().optional(),
          plannedFinishDate: z.string().optional(),
          isHeader: z.boolean().optional(),
          cardHeader: z.string().optional(),
          cardTypeId: z.string().optional(),
          cardTypeName: z.string().optional(),
        })).optional(),
      })),
    },
  },
  async ({ boardId, epic, features, dryRun }) => {
    const resolvedBoardId = boardId || DEFAULT_BOARD_ID;
    if (!resolvedBoardId) {
      throw new Error(`Board ID is required. Provide "boardId" or set AGILEPLACE_BOARD_ID in ${configSourceLabel()}.`);
    }

    const limitedFeatures = Array.isArray(features) ? features.slice(0, MAX_CARDS) : [];
    if (Array.isArray(features) && features.length > limitedFeatures.length) {
      console.warn(`createEpicHierarchy: trimming features array to MAX_CARDS (${MAX_CARDS}).`);
    }

    const storyLimit = STORY_LIMIT;

    if (dryRun) {
      const epicPreview = await prepareCardPayload(
        { ...epic, boardId: resolvedBoardId },
        { resolveTypeName: false }
      );

      const featuresPreview = [];
      for (const feature of limitedFeatures) {
        const featurePreview = await prepareCardPayload(
          { ...feature, boardId: resolvedBoardId },
          { resolveTypeName: false }
        );
        const originalStories = Array.isArray(feature.stories) ? feature.stories : [];
        const limitedStories = originalStories.slice(0, storyLimit).map(story => {
          const sanitizedStory = sanitizeCardInput(story);
          return {
            title: sanitizedStory.title,
            description: sanitizedStory.description,
            cardTypeId: validateCardTypeId(story.cardTypeId) ?? null,
            cardTypeName: story.cardTypeName ?? null,
            tags: sanitizedStory.tags || [],
          };
        });

        if (originalStories.length > limitedStories.length) {
          console.warn(`createEpicHierarchy dryRun: trimming stories array for feature ${featurePreview.sanitized.title} to STORY_LIMIT (${storyLimit}).`);
        }

        featuresPreview.push({
          title: featurePreview.sanitized.title,
          description: featurePreview.sanitized.description,
          cardTypeId: featurePreview.body.typeId ?? feature.cardTypeId ?? null,
          cardTypeName: feature.cardTypeName ?? null,
          tags: featurePreview.sanitized.tags || [],
          stories: limitedStories,
        });
      }

      return respondText(
        `Dry run: would create epic "${epicPreview.sanitized.title}" with ${featuresPreview.length} feature(s)`,
        `Details:\n${JSON.stringify(
          {
            dryRun: true,
            wouldCreate: {
              epic: {
                title: epicPreview.sanitized.title,
                description: epicPreview.sanitized.description,
                cardTypeId: epicPreview.body.typeId ?? epic.cardTypeId ?? null,
                cardTypeName: epic.cardTypeName ?? null,
                tags: epicPreview.sanitized.tags || [],
              },
              features: featuresPreview,
            },
          },
          null,
          2
        )}`
      );
    }

    try {
      // Step 1: Create Epic
      const epicCard = await createCard({
        boardId: resolvedBoardId,
        title: epic.title,
        description: epic.description || "",
        plannedStartDate: epic.plannedStartDate,
        plannedFinishDate: epic.plannedFinishDate,
        isHeader: epic.isHeader,
        cardHeader: epic.cardHeader,
        cardTypeId: epic.cardTypeId,
        cardTypeName: epic.cardTypeName
      });

      // Step 2: Create Features and connect to Epic
      const featureCards = [];
      for (const feature of limitedFeatures) {
        const featureCard = await createCard({
          boardId: resolvedBoardId,
          title: feature.title,
          description: feature.description || "",
          plannedStartDate: feature.plannedStartDate,
          plannedFinishDate: feature.plannedFinishDate,
          isHeader: feature.isHeader,
          cardHeader: feature.cardHeader,
          cardTypeId: feature.cardTypeId,
          cardTypeName: feature.cardTypeName
        });
        featureCards.push(featureCard);
      }

      // Connect features to epic
      await connectCards(epicCard.id, featureCards.map(c => c.id));

      // Step 3: For each feature, create and connect stories
      for (let i = 0; i < featureCards.length; i++) {
        const featureCard = featureCards[i];
        const sourceFeature = limitedFeatures[i];
        const originalStories = Array.isArray(sourceFeature?.stories) ? sourceFeature.stories : [];
        const featureStories = originalStories.slice(0, storyLimit);
        if (originalStories.length > featureStories.length) {
          console.warn(`createEpicHierarchy: trimming stories array for feature ${featureCard.title} to STORY_LIMIT (${storyLimit}).`);
        }
        
        if (featureStories.length > 0) {
          // Create stories for this feature
          const storyCards = [];
          for (const story of featureStories) {
            const createdStory = await createCard({
              boardId: resolvedBoardId,
              title: story.title,
              description: story.description || "",
              plannedStartDate: story.plannedStartDate,
              plannedFinishDate: story.plannedFinishDate,
              isHeader: story.isHeader,
              cardHeader: story.cardHeader,
              cardTypeId: story.cardTypeId,
              cardTypeName: story.cardTypeName
            });
            storyCards.push(createdStory);
          }
          
          // Connect stories to the feature
          await connectCards(featureCard.id, storyCards.map(c => c.id));
        }
      }

      const totalFeatures = limitedFeatures.length;
      const totalStories = limitedFeatures.reduce(
        (total, f) => total + (Array.isArray(f.stories) ? Math.min(f.stories.length, storyLimit) : 0),
        0
      );

      return respondText(
        `Created Epic hierarchy: "${epic.title}" with ${totalFeatures} features and ${totalStories} stories`,
        `Details:\n${JSON.stringify(
          {
            epic: { id: epicCard.id, title: epicCard.title },
            features: featureCards.map(f => ({ id: f.id })),
          },
          null,
          2
        )}`
      );
    } catch (error) {
      throw new Error(`Failed to create Epic hierarchy: ${error?.message || error}`, { cause: error });
    }
  }
);

const okrListObjectivesToolDefinition = {
  description:
    "List objectives with paging. Returns objectives array and page metadata. Defaults to only objectives where scope_type='Board' (override with scopeType: 'All' or a specific value).",
  inputSchema: {
    limit: z.number().optional(),
    offset: z.number().optional(),
    scopeType: z.string().optional(), // e.g., "Board" (default), "All" to disable filtering
  },
};

const okrListObjectivesToolHandler = async ({ limit, offset, scopeType }) => {
  const queryParams = {};
  if (limit !== undefined) {
    queryParams.limit = Math.min(limit, 500);
  } else {
    queryParams.limit = OKR_DEFAULT_LIMIT;
  }
  if (offset !== undefined) {
    queryParams.offset = offset;
  }

  const response = await fetchOkrJson("/objectives", queryParams);
  // API returns: { "fetch_objectives": { "total_records": 1100, "objectives": [...] } }
  const fetchObjectives = response.fetch_objectives || {};
  const objectives = fetchObjectives.objectives || [];
  const totalRecords = fetchObjectives.total_records || objectives.length;

  const desiredScope = (scopeType ?? "Board").trim();
  const filteredObjectives =
    desiredScope.toLowerCase() === "all"
      ? objectives
      : objectives.filter(obj => (obj?.scope_type || "") === desiredScope);

  const summary = `Found ${filteredObjectives.length} objective(s)${desiredScope && desiredScope.toLowerCase() !== "all" ? ` where scope_type="${desiredScope}"` : ""}${totalRecords ? ` (total: ${totalRecords})` : ""}`;
  const objectivesList =
    filteredObjectives.length > 0
      ? filteredObjectives.map(obj => `ID: ${obj.id} | Name: ${obj.name || "N/A"}`).join("\n")
      : "No objectives found";

  return respondText(
    summary,
    objectivesList,
    `JSON:\n${JSON.stringify(
      { total_records: totalRecords, filtered_records: filteredObjectives.length, filter: { scope_type: desiredScope }, objectives: filteredObjectives },
      null,
      2
    )}`
  );
};

// OKR: list objectives
mcp.registerTool("okrListObjectives", okrListObjectivesToolDefinition, okrListObjectivesToolHandler);
const okrGetKeyResultsToolDefinition = {
  description: "List key results for a specific objective ID.",
  inputSchema: {
    objectiveId: z.string(),
  },
};

const okrGetKeyResultsToolHandler = async ({ objectiveId }) => {
  if (!objectiveId || typeof objectiveId !== "string" || objectiveId.trim() === "") {
    throw new Error('objectiveId is required and must be a non-empty string');
  }

  const response = await fetchOkrJson(`/objectives/${objectiveId}/key-results`);
  // API returns: { "key_results": [...] }
  const keyResults = response.key_results || [];

  const summary = `Found ${keyResults.length} key result(s) for objective ${objectiveId}`;
  const keyResultsList =
    keyResults.length > 0
      ? keyResults.map(kr => `ID: ${kr.id} | Name: ${kr.name || "N/A"}`).join("\n")
      : "No key results found";

  return respondText(
    summary,
    keyResultsList,
    `JSON:\n${JSON.stringify({ objectiveId, key_results: keyResults }, null, 2)}`
  );
};

// OKR: get key results
mcp.registerTool("okrGetKeyResults", okrGetKeyResultsToolDefinition, okrGetKeyResultsToolHandler);

// Health check tool for Claude to verify server status
mcp.registerTool(
  "checkHealth",
  {
    description: "Check the health status of the MCP server. Returns server configuration and status. Use this to verify the server is running correctly.",
    inputSchema: {},
  },
  async () => {
    const warnings = [];
    
    const healthInfo = {
      ok: true,
      server: "agileplace-mcp",
      version: "1.4.0",
      config: {
        agileplace: {
          apiBase: API_BASE,
          hasToken: !!API_TOKEN,
          defaultBoardId: DEFAULT_BOARD_ID || "not set",
        },
        okr: {
          baseUrl: OKR_BASE || "not set",
          hasClientId: !!OKR_CLIENT_ID,
          hasClientSecret: !!OKR_CLIENT_SECRET,
          hasDirectToken: !!OKR_TOKEN,
          configured: !!(OKR_BASE && (OKR_TOKEN || (OKR_CLIENT_ID && OKR_CLIENT_SECRET))),
          region: OKR_BASE ? getOkrRegion() : "not set",
          tokenCached: !!(okrAccessToken && okrTokenExpiry),
          tokenExpiresAt: okrTokenExpiry ? new Date(okrTokenExpiry).toISOString() : null,
        },
        limits: {
          maxCards: MAX_CARDS,
          maxDesc: MAX_DESC,
          storyLimit: STORY_LIMIT,
          okrDefaultLimit: OKR_DEFAULT_LIMIT,
        },
        timeouts: {
          fetchTimeoutMs: FETCH_TIMEOUT_MS,
          okrFetchTimeoutMs: OKR_FETCH_TIMEOUT_MS,
        },
        server: {
          healthPort: PORT,
          healthServerEnabled: !!healthServer && healthServer.listening,
        },
      },
    };

    // Collect warnings
    if (healthInfo.config.agileplace.defaultBoardId === "not set") {
      warnings.push("⚠️ Warning: AGILEPLACE_BOARD_ID is not set in Claude Desktop config or process environment variables");
    }
    if (!healthInfo.config.okr.configured) {
      warnings.push("⚠️ Warning: OKR integration not configured. Set OKR_BASE_URL and (OKR_CLIENT_ID/OKR_CLIENT_SECRET) or OKR_TOKEN in Claude Desktop config or process environment variables");
    }

    return respondText(
      `MCP Server Health Check`,
      `Status: ${healthInfo.ok ? "✅ Healthy" : "❌ Unhealthy"}`,
      `Configuration:\n${JSON.stringify(healthInfo.config, null, 2)}`,
      warnings.length > 0 ? warnings.join("\n") : ""
    );
  }
);

// Start server - support both stdio (Claude Desktop) and HTTP (testing)
const USE_HTTP = process.argv.includes("--http") || process.env.MCP_HTTP === "1";
const HTTP_PORT = Number(process.env.MCP_HTTP_PORT || 3001);

if (USE_HTTP) {
  // HTTP mode for testing with basic-host
  // Use the mcp instance we already created with all tools/resources registered
  const httpApp = createMcpExpressApp({ host: "0.0.0.0" });
  
  // Create a transport for the shared server instance
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  
  // Connect the mcp server to HTTP transport
  await mcp.connect(transport);
  
  // Serve the simple test UI at /test so you can open http://localhost:3001/test in a browser
  httpApp.get("/test", (_req, res) => {
    try {
      const htmlPath = join(__dirname, "ui", "mcp-ui-test.html");
      const html = readFileSync(htmlPath, "utf-8");
      res.setHeader("Content-Type", "text/html");
      res.send(html);
    } catch (e) {
      res.status(500).send(`Error: ${e.message}`);
    }
  });

  httpApp.get("/", (_req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.send(`
      <!DOCTYPE html>
      <html>
        <head><title>MCP Server</title></head>
        <body style="font-family: system-ui; padding: 2rem;">
          <h1>AgilePlace MCP Server (HTTP mode)</h1>
          <p>MCP endpoint: <a href="/mcp">/mcp</a></p>
          <p><a href="/test">/test</a> — open the simple test UI HTML (green screen). Script may not connect outside an MCP host.</p>
          <p><strong>localhost:8080</strong> is <em>not</em> this server. It is <strong>basic-host</strong> from the ext-apps repo. To get 8080 you must clone and run basic-host separately.</p>
        </body>
      </html>
    `);
  });

  httpApp.all("/mcp", async (req, res) => {
    res.on("close", () => {
      // Don't close transport on each request in shared mode
    });
    
    try {
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("MCP HTTP error:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });
  
  const httpServer = httpApp.listen(HTTP_PORT, (err) => {
    if (err) {
      console.error("Failed to start HTTP server:", err);
      process.exit(1);
    }
    console.error(`MCP HTTP server listening on http://localhost:${HTTP_PORT}/mcp`);
    console.error(`\nTo test with basic-host:`);
    console.error(`1. Clone: git clone https://github.com/modelcontextprotocol/ext-apps.git`);
    console.error(`2. cd ext-apps/examples/basic-host && npm install`);
    console.error(`3. Run: SERVERS='["http://localhost:${HTTP_PORT}/mcp"]' npm start`);
    console.error(`4. Open: http://localhost:8080\n`);
  });
  
  // Keep process alive for HTTP mode
  process.on("SIGTERM", () => {
    httpServer.close(() => process.exit(0));
  });
  process.on("SIGINT", () => {
    httpServer.close(() => process.exit(0));
  });
} else {
  // Stdio mode for Claude Desktop
  try {
    await mcp.connect(new StdioServerTransport());
  } catch (err) {
    logError("mcp.connect", err);
    if (healthServer) {
      try {
        healthServer.close();
      } catch (closeErr) {
        logError("healthServer.close", closeErr);
      }
    }
    process.exit(1);
  }
}

// Graceful shutdown handlers
function gracefulShutdown(signal) {
  console.error(`Received ${signal}, shutting down gracefully...`);
  if (healthServer) {
    try {
      healthServer.close(() => {
        console.error("Health server closed");
        process.exit(0);
      });
    } catch (err) {
      console.error("Error closing health server:", err);
      process.exit(1);
    }
  } else {
    process.exit(0);
  }
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

process.on("exit", () => {
  if (healthServer) {
    try {
      healthServer.close();
    } catch (err) {
      console.error("Error closing health server:", err);
    }
  }
});