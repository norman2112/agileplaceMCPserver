#!/usr/bin/env node
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load config.env file silently to avoid MCP protocol interference
const originalConsole = { log: console.log, error: console.error, info: console.info, warn: console.warn };
console.log = console.error = console.info = console.warn = () => {};
dotenv.config({ path: join(__dirname, "config.env") });
Object.assign(console, originalConsole); // Restore console methods

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import fetch from "node-fetch";
import express from "express";
import { z } from "zod";

const API_BASE = process.env.AGILEPLACE_URL;
const API_TOKEN = process.env.AGILEPLACE_TOKEN;
const DEFAULT_BOARD_ID = process.env.AGILEPLACE_BOARD_ID;

if (!API_BASE) {
  console.error("❌ Missing AGILEPLACE_URL env var");
  process.exit(1);
}

if (!API_TOKEN) {
  console.error("❌ Missing AGILEPLACE_TOKEN env var");
  process.exit(1);
}

if (!DEFAULT_BOARD_ID) {
  console.error("❌ Missing AGILEPLACE_BOARD_ID env var");
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
    throw new Error("OKR integration not configured. Set OKR_BASE_URL, OKR_CLIENT_ID, and OKR_CLIENT_SECRET in config.env");
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
    throw new Error(`Failed to obtain OKR access token from ${tokenUrl}: ${err.message}`);
  }
}

// OKR HTTP client helper
async function fetchOkrJson(path, queryParams = {}) {
  if (!OKR_BASE) {
    throw new Error("OKR integration not configured. Set OKR_BASE_URL in config.env");
  }

  // Use OKR_TOKEN if provided, otherwise exchange OAuth2 credentials for token
  let accessToken;
  if (OKR_TOKEN) {
    accessToken = OKR_TOKEN;
  } else if (OKR_CLIENT_ID && OKR_CLIENT_SECRET) {
    accessToken = await getOkrAccessToken();
  } else {
    throw new Error("OKR integration not configured. Set OKR_TOKEN or both OKR_CLIENT_ID and OKR_CLIENT_SECRET in config.env");
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
  const message = parts
    .filter(part => typeof part === "string" && part.trim().length > 0)
    .join("\n\n");
  return {
    content: [
      {
        type: "text",
        text: message || "",
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

// Utility: update a card
async function updateCard({
  cardId,
  title,
  description,
  plannedStartDate,
  plannedFinishDate,
  isHeader,
  cardHeader,
}) {
  // Build JSON Patch operations array
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

  const resp = await fetchWithTimeout(`${API_BASE}/card/${cardId}`, {
    method: "PATCH",
    headers: HEADERS,
    body: JSON.stringify(operations),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(formatFetchError(resp, "Update card", text));
  }

  return resp.json();
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

// Initialize MCP server
const mcp = new McpServer({ name: "agileplace", version: "1.4.0" });

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

// List available card types
mcp.registerTool(
  "listCardTypes",
  {
    description: "List available card types for a board. Returns card type IDs and names. If boardId is not provided, defaults to AGILEPLACE_BOARD_ID from config.env. Always use the boardId from config.env unless the user explicitly specifies a different board.",
    inputSchema: {
      boardId: z.string().optional(),
    },
  },
  async ({ boardId }) => {
    const resolvedBoardId = boardId || DEFAULT_BOARD_ID;
    if (!resolvedBoardId) {
      throw new Error("Board ID is required. Either provide boardId parameter or set AGILEPLACE_BOARD_ID environment variable.");
    }
    
    const response = await listCardTypes(resolvedBoardId);
    const cardTypes = response.cardTypes || [];

    return {
      content: [
        { 
          type: "text", 
          text: `Found ${cardTypes.length} card types on board ${resolvedBoardId} (from ${boardId ? 'parameter' : 'AGILEPLACE_BOARD_ID in config.env'}):\n${cardTypes.map(ct => `ID: ${ct.id} | Name: ${ct.name}`).join('\n')}` 
        }
      ],
    };
  }
);

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
      throw new Error("Board ID is required. Either provide boardId parameter or set AGILEPLACE_BOARD_ID environment variable.");
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
        `Only the first ${limitedCards.length} cards were processed (of ${cards.length}). Increase MAX_CARDS env var if you need a higher limit.`
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
 * @param {string} params.boardId - Optional board ID (defaults to env var)
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
      throw new Error("Board ID is required. Either provide boardId parameter or set AGILEPLACE_BOARD_ID environment variable.");
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

// List cards on a board
mcp.registerTool(
  "listCards",
  {
    description: "List cards on a board. Returns count and first 10 cards (id, title, description, dates, header flag).",
    inputSchema: {
      boardId: z.string().optional(),
    },
  },
  async ({ boardId }) => {
    const resolvedBoardId = boardId || DEFAULT_BOARD_ID;
    if (!resolvedBoardId) {
      throw new Error("Board ID is required. Either provide boardId parameter or set AGILEPLACE_BOARD_ID environment variable.");
    }
    const response = await listCards(resolvedBoardId);
    const cards = response.cards || [];
    const totalRecords = response.pageMeta?.totalRecords || cards.length;

    // Create a simplified response format
    const cardList = cards.slice(0, 10).map(c => ({
      id: c.id,
      title: c.title,
      description: c.description || "",
      plannedStartDate: c.plannedStart,
      plannedFinishDate: c.plannedFinish,
      isHeader: c.isHeader || false,
      laneId: c.laneId,
      cardType: c.cardType?.name,
      priority: c.priority,
      size: c.size
    }));

    return respondText(
      `Found ${totalRecords} cards on board ${resolvedBoardId}. Here are the first ${cardList.length} cards:`,
      cardList.map(c => `ID: ${c.id} | Title: ${c.title} | Type: ${c.cardType}`).join("\n"),
      `JSON:\n${JSON.stringify(cardList, null, 2)}`
    );
  }
);

// Update card title/description
mcp.registerTool(
  "updateCard",
  {
    description: "Update a card's title, description, dates, or card header (customId) by cardId.",
    inputSchema: {
      cardId: z.string(),
      title: z.string().optional(),
      description: z.string().optional(),
      plannedStartDate: z.string().optional(),
      plannedFinishDate: z.string().optional(),
      isHeader: z.boolean().optional(),
      cardHeader: z.string().optional(),
    },
  },
  async ({ cardId, title, description, plannedStartDate, plannedFinishDate, isHeader, cardHeader }) => {
    const updated = await updateCard({ cardId, title, description, plannedStartDate, plannedFinishDate, isHeader, cardHeader });

    return respondText(
      `Updated card ${cardId}`,
      `Result:\n${JSON.stringify(
        {
          id: updated.id,
          title: updated.title,
          description: updated.description,
          cardHeader: updated.customId?.value,
        },
        null,
        2
      )}`
    );
  }
);

// Connect existing cards
mcp.registerTool(
  "connectExistingCards",
  {
    description: "Connect existing cards by creating parent-child relationships. Provide a parent card ID and an array of child card IDs.",
    inputSchema: {
      parentCardId: z.string(),
      childCardIds: z.array(z.string()),
    },
  },
  async ({ parentCardId, childCardIds }) => {
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

// Get card IDs and titles (simplified format)
mcp.registerTool(
  "getCardIds",
  {
    description: "Get a simple list of card IDs and titles from the board. Returns a basic text format that's easy to parse.",
    inputSchema: {
      boardId: z.string().optional(),
    },
  },
  async ({ boardId }) => {
    const resolvedBoardId = boardId || DEFAULT_BOARD_ID;
    if (!resolvedBoardId) {
      throw new Error("Board ID is required. Either provide boardId parameter or set AGILEPLACE_BOARD_ID environment variable.");
    }
    const response = await listCards(resolvedBoardId);
    const cards = response.cards || [];
    const totalRecords = response.pageMeta?.totalRecords || cards.length;

    // Create a simple text format
    const cardList = cards.slice(0, 20).map(c => `${c.id}: ${c.title}`).join('\n');

    return respondText(
      `Found ${totalRecords} cards on board ${resolvedBoardId}. Here are the first ${Math.min(20, cards.length)} cards with their IDs:`,
      cardList
    );
  }
);

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
      throw new Error("Board ID is required. Either provide boardId parameter or set AGILEPLACE_BOARD_ID environment variable.");
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
      throw new Error(`Failed to create Epic hierarchy: ${error.message}`);
    }
  }
);

// List Objectives (OKR)
mcp.registerTool(
  "okr_listObjectives",
  {
    description: "Lists objectives with paging. Returns objectives array and page metadata.",
    inputSchema: {
      limit: z.number().optional(),
      offset: z.number().optional(),
    },
  },
  async ({ limit, offset }) => {
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

    const summary = `Found ${objectives.length} objective(s)${totalRecords ? ` (total: ${totalRecords})` : ""}`;
    const objectivesList = objectives.length > 0
      ? objectives.map(obj => `ID: ${obj.id} | Name: ${obj.name || "N/A"}`).join("\n")
      : "No objectives found";

    return respondText(
      summary,
      objectivesList,
      `JSON:\n${JSON.stringify({ total_records: totalRecords, objectives }, null, 2)}`
    );
  }
);

// Get Key Results for an Objective (OKR)
mcp.registerTool(
  "okr_getKeyResults",
  {
    description: "Lists key results for a specific objective ID.",
    inputSchema: {
      objectiveId: z.string(),
    },
  },
  async ({ objectiveId }) => {
    if (!objectiveId || typeof objectiveId !== "string" || objectiveId.trim() === "") {
      throw new Error("objectiveId is required and must be a non-empty string");
    }

    const response = await fetchOkrJson(`/objectives/${objectiveId}/key-results`);
    // API returns: { "key_results": [...] }
    const keyResults = response.key_results || [];

    const summary = `Found ${keyResults.length} key result(s) for objective ${objectiveId}`;
    const keyResultsList = keyResults.length > 0
      ? keyResults.map(kr => `ID: ${kr.id} | Name: ${kr.name || "N/A"}`).join("\n")
      : "No key results found";

    return respondText(
      summary,
      keyResultsList,
      `JSON:\n${JSON.stringify({ objectiveId, key_results: keyResults }, null, 2)}`
    );
  }
);

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
      warnings.push("⚠️ Warning: AGILEPLACE_BOARD_ID is not set in config.env");
    }
    if (!healthInfo.config.okr.configured) {
      warnings.push("⚠️ Warning: OKR integration not configured. Set OKR_BASE_URL and OKR_CLIENT_ID/OKR_CLIENT_SECRET (or OKR_TOKEN) in config.env");
    }

    return respondText(
      `MCP Server Health Check`,
      `Status: ${healthInfo.ok ? "✅ Healthy" : "❌ Unhealthy"}`,
      `Configuration:\n${JSON.stringify(healthInfo.config, null, 2)}`,
      warnings.length > 0 ? warnings.join("\n") : ""
    );
  }
);

// Start server over stdio
await mcp.connect(new StdioServerTransport());

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