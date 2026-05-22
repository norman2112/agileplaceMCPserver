import { CONFIG } from "../config.mjs";
import { fetchWithTimeout, stripHtml } from "../helpers.mjs";
import { getActiveAccountConfig } from "../account-context.mjs";

const { DEFAULT_BOARD_ID, MAX_DESC } = CONFIG;

function currentApiBase() {
  return getActiveAccountConfig().url;
}

function currentHeaders() {
  const token = getActiveAccountConfig().token;
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

const API_BASE = {
  toString() {
    return currentApiBase();
  },
  endsWith(suffix) {
    return currentApiBase().endsWith(suffix);
  },
};

const HEADERS = new Proxy(
  {},
  {
    get(_target, prop) {
      return currentHeaders()[prop];
    },
    ownKeys() {
      return Reflect.ownKeys(currentHeaders());
    },
    getOwnPropertyDescriptor(_target, prop) {
      return {
        enumerable: true,
        configurable: true,
        value: currentHeaders()[prop],
      };
    },
  }
);

export function getIoPath() {
  // Check if API_BASE ends with /io (more precise than includes)
  return API_BASE.endsWith("/io") ? "" : "/io";
}

export function normalizeBoardId(value) {
  if (value === undefined || value === null) return undefined;
  const str = `${value}`.trim();
  return str.length > 0 ? str : undefined;
}

export function formatFetchError(resp, context, rawText) {
  const msg = (rawText || "").replace(/<[^>]+>/g, "").slice(0, 500);
  return `${context} failed: ${resp.status} ${resp.statusText} = ${msg}`;
}

/** Error with HTTP status from a failed fetch response (use instead of `new Error(formatFetchError(...))`). */
export function fetchResponseError(resp, context, rawText) {
  const err = new Error(formatFetchError(resp, context, rawText));
  err.statusCode = resp.status;
  return err;
}

// 🔧 Normalize date to YYYY-MM-DD format for API
// Accepts YYYY-MM-DD or YYYY-MM-DDT00:00:00Z and returns YYYY-MM-DD
function normalizeDate(dateString) {
  if (!dateString) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return dateString;
  const dateMatch = dateString.match(/^(\d{4}-\d{2}-\d{2})/);
  if (dateMatch) return dateMatch[1];
  return dateString;
}

export function sanitizeCardInput(card = {}) {
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
export function validateCardTypeId(cardTypeId) {
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

export async function prepareCardPayload(cardInput = {}, { resolveTypeName = true, cardTypes } = {}) {
  const {
    boardId,
    laneId,
    plannedStartDate,
    plannedFinishDate,
    isHeader,
    cardHeader,
    cardTypeId,
    cardTypeName,
    ...rest
  } = cardInput;

  const sanitized = sanitizeCardInput(rest);

  const body = {
    title: sanitized.title,
    description: sanitized.description,
    destination: {
      boardId: boardId || DEFAULT_BOARD_ID,
      laneId: laneId || undefined,
    },
  };

  if (plannedStartDate) body.plannedStart = normalizeDate(plannedStartDate);
  if (plannedFinishDate) body.plannedFinish = normalizeDate(plannedFinishDate);
  if (isHeader !== undefined) body.isHeader = isHeader;
  if (cardHeader) body.customId = cardHeader.toUpperCase();

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

// ----------------
// AgilePlace APIs
// ----------------

export async function createCard(cardInput = {}, options = {}) {
  const { body } = await prepareCardPayload(cardInput, options);
  const ioPath = getIoPath();

  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/card`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw fetchResponseError(resp, "Create card", text);
  }

  return resp.json();
}

/** AgilePlace card priority values (see markdown/apiDocs.md — Update Card automation). */
export const CARD_PRIORITY_VALUES = ["normal", "low", "high", "critical"];
const CARD_PRIORITY_SET = new Set(CARD_PRIORITY_VALUES);

export const DEPENDENCY_TIMING_VALUES = [
  "finishToStart",
  "startToStart",
  "startToFinish",
  "finishToFinish",
];

// Build JSON Patch operations for card update (shared by updateCard and batchUpdateCards)
export function buildUpdateOperations({
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
    operations.push({ op: "replace", path: "/typeId", value: validateCardTypeId(cardTypeId) });
  }
  if (priority !== undefined) {
    if (!CARD_PRIORITY_SET.has(priority)) {
      throw new Error(
        `Invalid priority "${priority}". Must be one of: ${CARD_PRIORITY_VALUES.join(", ")}`
      );
    }
    operations.push({ op: "replace", path: "/priority", value: priority });
  }

  return operations;
}

// Utility: patch a card using an RFC 6902 JSON Patch operations array.
// Kept separate so card-specific tools (like custom field setters) can reuse it.
export async function patchCardOperations({ cardId, operations, context = "Patch card" }) {
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
    throw fetchResponseError(resp, context, text);
  }

  return resp.json();
}

export async function updateCard({ cardId, ...updates }) {
  const operations = buildUpdateOperations(updates);
  if (operations.length === 0) {
    throw new Error("At least one field to update is required.");
  }
  return patchCardOperations({ cardId, operations, context: "Update card" });
}

// Utility: add tags to a card (PATCH with add operations)
export async function addCardTags(cardId, tags) {
  if (!Array.isArray(tags) || tags.length === 0) {
    throw new Error("tags must be a non-empty array of strings.");
  }
  const uniqueTags = [...new Set(tags.map(tag => String(tag).trim()).filter(Boolean))];
  if (uniqueTags.length === 0) throw new Error("No valid tags to add.");
  const operations = uniqueTags.map(tag => ({ op: "add", path: "/tags/-", value: tag }));
  const ioPath = getIoPath();

  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/card/${cardId}`, {
    method: "PATCH",
    headers: HEADERS,
    body: JSON.stringify(operations),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw fetchResponseError(resp, "Add card tags", text);
  }
  return resp.json();
}

/** Build JSON Patch ops to remove specific tags (AgilePlace uses `value` to identify the tag string). */
export function buildRemoveCardTagOperations(tags) {
  if (!Array.isArray(tags) || tags.length === 0) {
    throw new Error("tags must be a non-empty array of strings.");
  }
  const operations = tags
    .map(tag => ({ op: "remove", path: "/tags", value: String(tag).trim() }))
    .filter(op => op.value);
  if (operations.length === 0) throw new Error("No valid tags to remove.");
  return operations;
}

// Utility: remove tags from a card (PATCH with remove operations)
export async function removeCardTags(cardId, tags) {
  const operations = buildRemoveCardTagOperations(tags);
  const ioPath = getIoPath();

  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/card/${cardId}`, {
    method: "PATCH",
    headers: HEADERS,
    body: JSON.stringify(operations),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw fetchResponseError(resp, "Remove card tags", text);
  }
  return resp.json();
}

// Utility: connect parent and child cards
export async function connectCards(parentId, childIds) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/card/connections`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({
      cardIds: [parentId],
      connections: { children: childIds },
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw fetchResponseError(resp, "Connect cards", text);
  }

  return resp.json();
}

// Utility: connect existing cards (parent to children)
export async function connectExistingCards(parentId, childIds) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/card/${parentId}/connection/many`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({
      connectedCardIds: childIds,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw fetchResponseError(resp, "Connect existing cards", text);
  }

  return resp.json();
}

// Utility: create a comment on a card (POST /io/card/:cardId/comment)
export async function createCardCommentApi(cardId, text) {
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
    throw fetchResponseError(resp, "Create card comment", bodyText);
  }

  return resp.json().catch(() => ({}));
}

// Utility: assign users to one or more cards (POST /io/card/assign)
export async function assignUsersToCardsApi(cardIds, userIds) {
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
    throw fetchResponseError(resp, "Assign users to cards", text);
  }

  return resp.json().catch(() => ({}));
}

// Utility: delete card connections (DELETE /io/card/connections)
export async function deleteCardConnectionsApi(cardIds, connections) {
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
    throw fetchResponseError(resp, "Delete card connections", text);
  }

  return resp.json().catch(() => ({}));
}

// Utility: list cards on a board (GET /io/board/:boardId/card). Supports limit/offset per API docs.
export async function listCards(boardId, { limit, offset } = {}) {
  const ioPath = getIoPath();
  const params = new URLSearchParams();
  if (limit !== undefined && limit !== null) params.set("limit", String(limit));
  if (offset !== undefined && offset !== null) params.set("offset", String(offset));
  const qs = params.toString();
  const url = `${API_BASE}${ioPath}/board/${boardId}/card${qs ? `?${qs}` : ""}`;
  const resp = await fetchWithTimeout(url, {
    method: "GET",
    headers: HEADERS,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw fetchResponseError(resp, "List cards", text);
  }

  return resp.json();
}

// Utility: list available card types for a board
export async function listCardTypes(boardId) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/board/${boardId}/cardType`, {
    method: "GET",
    headers: HEADERS,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw fetchResponseError(resp, "List card types", text);
  }

  return resp.json();
}

// Utility: list boards (GET /io/board)
export async function listBoardsApi({ search, boards, limit = 200 } = {}) {
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
    throw fetchResponseError(resp, "List boards", text);
  }
  return resp.json();
}

// Utility: get board details (GET /io/board/:boardId)
export async function getBoard(boardId) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/board/${boardId}`, {
    method: "GET",
    headers: HEADERS,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw fetchResponseError(resp, "Get board", text);
  }
  return resp.json();
}

// Utility: update board (PATCH /io/board/:boardId)
export async function updateBoardApi(boardId, updates) {
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
    throw fetchResponseError(resp, "Update board", text);
  }
  const updated = Object.keys(body);
  const data = resp.status === 204 ? {} : await resp.json().catch(() => ({}));
  return { id: data.id ?? boardId, updated };
}

// Utility: archive a board (POST /io/board/:boardId/archive)
export async function archiveBoardApi(boardId) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/board/${boardId}/archive`, {
    method: "POST",
    headers: HEADERS,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw fetchResponseError(resp, "Archive board", text);
  }
}

// Utility: restore a board from archive (POST /io/board/:boardId/unarchive)
export async function unarchiveBoardApi(boardId) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/board/${boardId}/unarchive`, {
    method: "POST",
    headers: HEADERS,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw fetchResponseError(resp, "Unarchive board", text);
  }
}

// Utility: create a board (POST /io/board)
export async function createBoardApi({ title, description, level, customBoardUrl } = {}) {
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
    throw fetchResponseError(resp, "Create board", text);
  }

  return resp.json();
}

// Utility: duplicate a board (POST /io/board with fromBoardId)
export async function duplicateBoardApi({
  fromBoardId,
  title,
  description,
  includeCards = true,
  includeExistingUsers = true,
  baseWipOnCardSize,
  excludeCompletedAndArchiveViolations,
  isShared,
  sharedBoardRole,
} = {}) {
  const ioPath = getIoPath();
  if (!fromBoardId || typeof fromBoardId !== "string" || fromBoardId.trim() === "") {
    throw new Error("fromBoardId is required to duplicate a board.");
  }
  if (!title || typeof title !== "string" || title.trim() === "") {
    throw new Error("title is required to duplicate a board.");
  }

  const body = {
    fromBoardId: fromBoardId.trim(),
    title: title.trim(),
    includeCards: includeCards ?? true,
    includeExistingUsers: includeExistingUsers ?? true,
  };

  if (description !== undefined) body.description = description;
  if (baseWipOnCardSize !== undefined) body.baseWipOnCardSize = baseWipOnCardSize;
  if (excludeCompletedAndArchiveViolations !== undefined) {
    body.excludeCompletedAndArchiveViolations = excludeCompletedAndArchiveViolations;
  }
  if (isShared !== undefined) body.isShared = isShared;
  if (sharedBoardRole !== undefined) body.sharedBoardRole = sharedBoardRole;

  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/board`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw fetchResponseError(resp, "Duplicate board", text);
  }

  return resp.json();
}

function ensureLayoutObjectForUpdate(layout) {
  if (layout === null || layout === undefined) {
    throw new Error("layout object is required to update board layout.");
  }

  if (typeof layout === "string") {
    const trimmed = layout.trim();
    if (!trimmed) {
      throw new Error("layout object is required to update board layout.");
    }
    try {
      return JSON.parse(trimmed);
    } catch (err) {
      const msg = err?.message ? String(err.message) : String(err);
      throw new Error(
        `layout must be valid JSON (object or array) when passed as a string: ${msg}`
      );
    }
  }

  if (typeof layout === "object") {
    return layout;
  }

  throw new Error("layout object is required to update board layout.");
}

function normalizeLaneForLayoutPut(lane) {
  if (!lane || typeof lane !== "object") return {};

  const {
    id,
    name,
    title,
    laneType,
    type,
    laneClassType,
    classType,
    index,
    columns,
    orientation,
    isConnectionDoneLane,
    isDefaultDropLane,
    wipLimit,
    description,
    children,
  } = lane;

  const normalized = {
    // Preserve id if present (existing lanes); cloned layouts may omit id.
    ...(id !== undefined ? { id } : {}),
    title: (title ?? name ?? "").toString(),
    type: (type ?? laneType) || "inProcess",
    classType: (classType ?? laneClassType) || "active",
    index: typeof index === "number" ? index : 0,
    columns: typeof columns === "number" ? columns : 1,
    orientation: orientation || "vertical",
    isConnectionDoneLane: !!isConnectionDoneLane,
    isDefaultDropLane: !!isDefaultDropLane,
    wipLimit: typeof wipLimit === "number" ? wipLimit : 0,
    description: description ?? null,
    children: [],
  };

  if (Array.isArray(children) && children.length > 0) {
    normalized.children = children.map(child => normalizeLaneForLayoutPut(child));
  }

  return normalized;
}

function normalizeLayoutForUpdate(layout) {
  // Accept either a full layout object ({ lanes, layoutChecksum }) or a bare lanes array.
  let lanes;
  let layoutChecksum;

  if (Array.isArray(layout)) {
    lanes = layout;
  } else if (layout && typeof layout === "object") {
    if (Array.isArray(layout.lanes)) {
      lanes = layout.lanes;
    }
    layoutChecksum =
      layout.layoutChecksum || layout.laneLayoutChecksum || layout.checksum;
  }

  if (!Array.isArray(lanes)) {
    throw new Error(
      "layout.lanes array is required to update board layout."
    );
  }

  const normalizedLanes = lanes.map(l => normalizeLaneForLayoutPut(l));

  const body = {
    lanes: normalizedLanes,
  };

  if (layoutChecksum !== undefined) {
    body.layoutChecksum = layoutChecksum;
  }

  return body;
}

// Utility: update board layout (PUT /io/board/:boardId/layout)
export async function updateBoardLayoutApi(boardId, layout) {
  const ioPath = getIoPath();
  const rawLayout = ensureLayoutObjectForUpdate(layout);
  const body = normalizeLayoutForUpdate(rawLayout);

  const resp = await fetchWithTimeout(
    `${API_BASE}${ioPath}/board/${boardId}/layout`,
    {
    method: "PUT",
    headers: HEADERS,
      body: JSON.stringify(body),
    }
  );

  if (!resp.ok) {
    const text = await resp.text();
    throw fetchResponseError(resp, "Update board layout", text);
  }

  return resp.json().catch(() => ({}));
}

// Utility: GET lane card counts to ensure a lane is empty before deletion
export async function getLaneCardCounts(boardId, laneIds) {
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
    throw fetchResponseError(resp, "Get lane card counts", text);
  }
  return resp.json();
}

// Utility: get board custom fields (GET /io/board/:boardId/customfield)
export async function getBoardCustomFieldsApi(boardId) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/board/${boardId}/customfield`, {
    method: "GET",
    headers: HEADERS,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw fetchResponseError(resp, "Get board custom fields", text);
  }

  return resp.json();
}

// Utility: update board custom fields (PATCH /io/board/:boardId/customfield)
export async function updateBoardCustomFieldsApi(boardId, updates) {
  const ioPath = getIoPath();
  if (!Array.isArray(updates)) {
    const receivedType = updates === null ? "null" : typeof updates;
    throw new Error(
      `Expected "updates" to be a JSON Patch array (RFC 6902). Got: ${receivedType}.`
    );
  }
  if (updates.length === 0) {
    throw new Error(
      "Expected \"updates\" to be a non-empty JSON Patch array (RFC 6902)."
    );
  }
  const body = updates;

  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/board/${boardId}/customfield`, {
    method: "PATCH",
    headers: HEADERS,
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw fetchResponseError(resp, "Update board custom fields", text);
  }

  return resp.json().catch(() => ({}));
}

// Utility: bulk update cards - SAME updates applied to ALL specified cards (PATCH /io/card/bulk)
export async function bulkUpdateCardsApi(cardIds, updates) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/card/bulk`, {
    method: "PATCH",
    headers: HEADERS,
    body: JSON.stringify({ cardIds, updates }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw fetchResponseError(resp, "Bulk update cards", text);
  }
  // 202 Accepted - may return empty body
  return resp.status === 204 ? {} : resp.json().catch(() => ({}));
}

// Utility: set (replace) all tags on a card
export async function setCardTags(cardId, tags) {
  const ioPath = getIoPath();
  const operations = [{
    op: "replace",
    path: "/tags",
    value: Array.isArray(tags) ? tags.map(t => String(t).trim()).filter(Boolean) : [],
  }];
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/card/${cardId}`, {
    method: "PATCH",
    headers: HEADERS,
    body: JSON.stringify(operations),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw fetchResponseError(resp, "Set card tags", text);
  }
  return resp.json();
}

// Utility: create card type (POST /io/board/:boardId/cardType)
export async function createCardTypeApi(boardId, { name, colorHex, isCardType = true, isTaskType = false }) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/board/${boardId}/cardType`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({ name, colorHex, isCardType, isTaskType }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw fetchResponseError(resp, "Create card type", text);
  }
  return resp.json();
}

// Utility: update card type (PATCH /io/board/:boardId/cardType/:cardTypeId)
export async function updateCardTypeApi(boardId, cardTypeId, { name, colorHex, isCardType, isTaskType }) {
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
    throw fetchResponseError(resp, "Update card type", text);
  }
  return resp.json();
}

// Utility: delete card type (DELETE /io/board/:boardId/cardType/:cardTypeId)
export async function deleteCardTypeApi(boardId, cardTypeId) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/board/${boardId}/cardType/${cardTypeId}`, {
    method: "DELETE",
    headers: HEADERS,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw fetchResponseError(resp, "Delete card type", text);
  }
}

// Utility: update lane (PATCH /io/board/:boardId/lane/:laneId)
export async function updateLaneApi(boardId, laneId, { title, description, wipLimit, isDefaultDropLane, cardStatus }) {
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
    throw fetchResponseError(resp, "Update lane", text);
  }
  return resp.json();
}

// Utility: delete single card (DELETE /io/card/:cardId)
export async function deleteCardApi(cardId) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/card/${cardId}`, {
    method: "DELETE",
    headers: HEADERS,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw fetchResponseError(resp, "Delete card", text);
  }
}

// Utility: batch delete cards (DELETE /io/card/ with body)
export async function batchDeleteCardsApi(cardIds) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/card/`, {
    method: "DELETE",
    headers: HEADERS,
    body: JSON.stringify({ cardIds }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw fetchResponseError(resp, "Batch delete cards", text);
  }
}

/** Compact card summary for tool responses (post-update re-fetch). */
export function summarizeCard(card) {
  if (!card) return null;
  return {
    id: String(card.id ?? ""),
    title: card.title ?? "",
    description: card.description ?? "",
    laneId: card.laneId ?? card.lane?.id ?? null,
    boardId: card.board?.id ?? card.boardId ?? null,
    cardType: card.type?.title ?? card.type?.name ?? card.cardType?.name ?? card.cardType?.title ?? "",
    priority: card.priority,
    cardHeader: card.customId?.value ?? card.customId ?? null,
    tags: Array.isArray(card.tags) ? card.tags : [],
  };
}

// Utility: move card to lane (PATCH /io/card/:cardId with laneId; optional WIP override comment)
export async function moveCardToLaneApi(cardId, laneId, wipOverrideReason) {
  const operations = [];
  if (wipOverrideReason && String(wipOverrideReason).trim()) {
    operations.push({
      op: "replace",
      path: "/wipOverrideComment",
      value: String(wipOverrideReason).trim(),
    });
  }
  operations.push({ op: "replace", path: "/laneId", value: laneId });
  return patchCardOperations({ cardId, operations, context: "Move card to lane" });
}

// Search cards by title/customId (GET /io/card). Omit board for account-wide search.
export async function searchCardsApi({
  search,
  boardId,
  boardIds,
  limit = 200,
  offset = 0,
} = {}) {
  if (!search || !String(search).trim()) {
    throw new Error("search is required.");
  }
  const ioPath = getIoPath();
  const query = String(search).trim();

  async function searchOneBoard(bid) {
    const params = new URLSearchParams();
    params.set("search", query);
    params.set("limit", String(limit));
    params.set("offset", String(offset));
    params.set("select", "both");
    if (bid) params.set("board", String(bid));
    const url = `${API_BASE}${ioPath}/card?${params.toString()}`;
    const resp = await fetchWithTimeout(url, { method: "GET", headers: HEADERS });
    if (!resp.ok) {
      const text = await resp.text();
      throw fetchResponseError(resp, "Search cards", text);
    }
    return resp.json();
  }

  const boardsToQuery =
    boardIds?.length > 0 ? boardIds.map(String) : boardId ? [String(boardId)] : [null];

  const responses = await Promise.all(boardsToQuery.map(bid => searchOneBoard(bid)));
  const seen = new Set();
  const cards = [];
  for (const data of responses) {
    for (const c of data.cards || []) {
      const id = String(c.id);
      if (seen.has(id)) continue;
      seen.add(id);
      cards.push({
        id,
        title: c.title ?? "",
        boardId: c.board?.id ?? c.boardId ?? null,
        boardTitle: c.board?.title ?? null,
        laneId: c.laneId ?? c.lane?.id ?? null,
        cardType: c.type?.title ?? c.type?.name ?? "",
        customId: c.customId?.value ?? c.customId ?? null,
      });
    }
  }
  return { cards, total: cards.length, search: query };
}

// List cards in lane(s) via POST /io/card/list
export async function listCardsInLanesApi(boardId, laneIds, { limit = 500, offset = 0 } = {}) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/card/list`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({
      board: String(boardId),
      lanes: laneIds.map(String),
      limit,
      offset,
      select: "both",
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw fetchResponseError(resp, "List cards in lanes", text);
  }
  const data = await resp.json();
  return data.cards || [];
}

export async function linkExternalToCardApi(cardId, { label, url }) {
  if (!label?.trim() || !url?.trim()) {
    throw new Error("label and url are required for external link.");
  }
  return patchCardOperations({
    cardId,
    operations: [{ op: "add", path: "/externalLink", value: { label: label.trim(), url: url.trim() } }],
    context: "Link external URL to card",
  });
}

// Utility: get dependencies for a specific card
export async function getCardDependencies(cardId, includeFaces = true) {
  const ioPath = getIoPath();
  const queryParams = includeFaces ? '?includeFaces=true' : '';
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/card/${cardId}/dependency${queryParams}`, {
    method: "GET",
    headers: HEADERS,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw fetchResponseError(resp, "Get card dependencies", text);
  }

  return resp.json();
}

function normalizeDependencyUpdates(updates) {
  const list = Array.isArray(updates) ? updates : [updates];
  if (list.length === 0) {
    throw new Error("At least one dependency update is required.");
  }
  return list.map((item, index) => {
    const cardId = item?.cardId != null ? String(item.cardId).trim() : "";
    const dependsOnCardId =
      item?.dependsOnCardId != null ? String(item.dependsOnCardId).trim() : "";
    const timing = item?.timing ?? "finishToStart";
    if (!cardId || !dependsOnCardId) {
      throw new Error(`Dependency update at index ${index} requires cardId and dependsOnCardId.`);
    }
    if (!DEPENDENCY_TIMING_VALUES.includes(timing)) {
      throw new Error(
        `Invalid timing "${timing}" at index ${index}. Must be one of: ${DEPENDENCY_TIMING_VALUES.join(", ")}`
      );
    }
    return { cardId, dependsOnCardId, timing };
  });
}

// Utility: update dependencies (PATCH /io/card/dependency — body is a JSON array)
export async function updateCardDependencyApi(updates) {
  const ioPath = getIoPath();
  const body = normalizeDependencyUpdates(updates);
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/card/dependency`, {
    method: "PATCH",
    headers: HEADERS,
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw fetchResponseError(resp, "Update card dependency", text);
  }

  return resp.json().catch(() => ({}));
}

// Utility: delete dependencies (DELETE /io/card/dependency)
export async function deleteCardDependencyApi({ cardIds, dependsOnCardIds }) {
  const ioPath = getIoPath();
  const ids = Array.isArray(cardIds) ? cardIds.map(String).filter(Boolean) : [];
  const depIds = Array.isArray(dependsOnCardIds)
    ? dependsOnCardIds.map(String).filter(Boolean)
    : [];
  if (ids.length === 0 || depIds.length === 0) {
    throw new Error("cardIds and dependsOnCardIds must each be non-empty arrays.");
  }
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/card/dependency`, {
    method: "DELETE",
    headers: HEADERS,
    body: JSON.stringify({ cardIds: ids, dependsOnCardIds: depIds }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw fetchResponseError(resp, "Delete card dependency", text);
  }

  return resp.json().catch(() => ({}));
}

export async function createCardDependencyApi(cardId, dependsOnCardId, timing = "finishToStart") {
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
    throw fetchResponseError(resp, "Create card dependency", text);
  }

  return resp.json().catch(() => ({}));
}

// Utility: list all cards on a board with dependencies and parent-child relationships included
export async function listCardsWithDependencies(boardId) {
  const ioPath = getIoPath();
  const queryParams = `?board=${boardId}&include=dependencies,parentCards`;
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/card${queryParams}`, {
    method: "GET",
    headers: HEADERS,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw fetchResponseError(resp, "List cards with dependencies", text);
  }

  return resp.json();
}

// Utility: get a single card with parent-child relationships
export async function getCardWithRelationships(cardId) {
  const ioPath = getIoPath();
  const queryParams = `?cards=${cardId}&include=parentCards`;
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/card${queryParams}`, {
    method: "GET",
    headers: HEADERS,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw fetchResponseError(resp, "Get card with relationships", text);
  }

  const data = await resp.json();
  return data.cards?.[0] || null;
}

// Utility: get parent cards for a card via connection/parents API (full card details)
export async function getConnectionParents(cardId) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/card/${cardId}/connection/parents`, {
    method: "GET",
    headers: HEADERS,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw fetchResponseError(resp, "Get connection parents", text);
  }

  const data = await resp.json();
  return data.cards || [];
}

// Utility: get child cards for a card via connection/children API (full card details)
export async function getConnectionChildren(cardId, limit = 200) {
  const ioPath = getIoPath();
  const queryParams = `?limit=${limit}`;
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/card/${cardId}/connection/children${queryParams}`, {
    method: "GET",
    headers: HEADERS,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw fetchResponseError(resp, "Get connection children", text);
  }

  const data = await resp.json();
  return data.cards || [];
}

// Helper: map API card to parent/child summary (id, title, cardType, laneId, relationship, tags, optional dates)
export function toParentChildSummary(card, relationship) {
  const cardType = card.type?.title ?? card.type?.name ?? card.cardType?.name ?? card.cardType?.title ?? "";
  const laneId = card.laneId ?? card.lane?.id ?? "";
  const boardId = card.board?.id ?? card.boardId ?? "";
  const summary = {
    id: String(card.id ?? ""),
    title: card.title ?? "",
    cardType: String(cardType),
    relationship,
    tags: Array.isArray(card.tags) ? card.tags : [],
  };
  if (laneId) summary.laneId = String(laneId);
  if (boardId) {
    summary.boardId = String(boardId);
    if (card.board?.title) summary.boardTitle = card.board.title;
  }
  if (card.plannedStart) summary.plannedStartDate = card.plannedStart;
  if (card.plannedFinish) summary.plannedFinishDate = card.plannedFinish;
  return summary;
}

// Comments CRUD
export async function getCardCommentsApi(cardId) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/card/${cardId}/comment`, {
    method: "GET",
    headers: HEADERS,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw fetchResponseError(resp, "Get card comments", text);
  }
  return resp.json();
}

export async function updateCardCommentApi(cardId, commentId, text) {
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
    throw fetchResponseError(resp, "Update card comment", bodyText);
  }
  return resp.json().catch(() => ({}));
}

export async function deleteCardCommentApi(cardId, commentId) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/card/${cardId}/comment/${commentId}`, {
    method: "DELETE",
    headers: HEADERS,
  });
  if (!resp.ok) {
    const bodyText = await resp.text();
    throw fetchResponseError(resp, "Delete card comment", bodyText);
  }
}

// Planning series APIs
export async function listPlanningSeriesApi() {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/series`, { method: "GET", headers: HEADERS });
  if (!resp.ok) { const text = await resp.text(); throw fetchResponseError(resp, "List planning series", text); }
  return resp.json();
}

export async function createPlanningSeriesApi({
  label,
  timeZone,
  allowAllBoards,
  boardIds,
} = {}) {
  if (!label || typeof label !== "string" || label.trim() === "") {
    throw new Error("label is required to create a planning series.");
  }
  const body = {
    label: label.trim(),
    allowAllBoards: allowAllBoards ?? false,
  };
  if (timeZone !== undefined && timeZone !== null && String(timeZone).trim() !== "") {
    body.timeZone = String(timeZone).trim();
  }
  if (boardIds !== undefined && boardIds !== null) {
    body.boardIds = boardIds;
  }

  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/series`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw fetchResponseError(resp, "Create planning series", text);
  }
  return resp.json();
}

export async function getPlanningSeriesApi(seriesId) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/series/${seriesId}`, { method: "GET", headers: HEADERS });
  if (!resp.ok) { const text = await resp.text(); throw fetchResponseError(resp, "Get planning series", text); }
  return resp.json();
}

export async function updatePlanningSeriesApi(seriesId, updates) {
  const ioPath = getIoPath();
  const body =
    updates && typeof updates === "object" && updates.updates && typeof updates.updates === "object"
      ? updates.updates
      : updates && typeof updates === "object"
        ? updates
        : {};
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/series/${seriesId}`, {
    method: "PATCH",
    headers: HEADERS,
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw fetchResponseError(resp, "Update planning series", text);
  }
  return resp.json().catch(() => ({}));
}

function seriesTimestamp(series) {
  return series?.updatedOn || series?.modifiedOn || series?.lastModified || null;
}

/** Merge board IDs onto a planning series (GET → merge → PATCH with retry on concurrent edits). */
export async function addBoardsToPlanningSeriesApi(seriesId, boardIds) {
  if (!Array.isArray(boardIds) || boardIds.length === 0) {
    throw new Error("boardIds must be a non-empty array.");
  }
  const toAdd = [...new Set(boardIds.map(String))];
  const MAX_ATTEMPTS = 3;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const series = await getPlanningSeriesApi(seriesId);
    const beforeTs = seriesTimestamp(series);
    const existing = Array.isArray(series.boardIds) ? series.boardIds.map(String) : [];
    const merged = [...new Set([...existing, ...toAdd])];
    const added = toAdd.filter(id => !existing.includes(id));

    if (added.length === 0) {
      return { ...series, boardIds: merged, addedBoardIds: [] };
    }

    await updatePlanningSeriesApi(seriesId, { boardIds: merged });
    const after = await getPlanningSeriesApi(seriesId);
    const afterIds = new Set(
      (Array.isArray(after.boardIds) ? after.boardIds : []).map(String)
    );
    const allPresent = toAdd.every(id => afterIds.has(id));
    const afterTs = seriesTimestamp(after);

    if (allPresent) {
      const addedBoardIds = toAdd.filter(id => !existing.includes(id));
      return { ...after, boardIds: [...afterIds], addedBoardIds };
    }

    if (afterTs && beforeTs && afterTs !== beforeTs && attempt < MAX_ATTEMPTS) {
      continue;
    }

    if (attempt === MAX_ATTEMPTS) {
      throw new Error(
        `Failed to add all boards to planning series ${seriesId} after ${MAX_ATTEMPTS} attempts (concurrent updates may have overwritten changes). Missing: ${toAdd.filter(id => !afterIds.has(id)).join(", ")}`
      );
    }
  }

  throw new Error(`Failed to add boards to planning series ${seriesId}.`);
}

export async function deletePlanningSeriesApi(seriesId) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/series/${seriesId}`, { method: "DELETE", headers: HEADERS });
  if (!resp.ok) { const text = await resp.text(); throw fetchResponseError(resp, "Delete planning series", text); }
}

export async function createIncrementApi(
  seriesId,
  { label, startDate, endDate, parentPlanningIncrementId } = {}
) {
  if (!seriesId || typeof seriesId !== "string" || seriesId.trim() === "") {
    throw new Error("seriesId is required to create a planning increment.");
  }
  if (!label || typeof label !== "string" || label.trim() === "") {
    throw new Error("label is required to create a planning increment.");
  }
  if (!startDate || typeof startDate !== "string" || startDate.trim() === "") {
    throw new Error("startDate is required to create a planning increment (YYYY-MM-DD).");
  }
  if (!endDate || typeof endDate !== "string" || endDate.trim() === "") {
    throw new Error("endDate is required to create a planning increment (YYYY-MM-DD).");
  }

  const body = {
    label: label.trim(),
    startDate: startDate.trim(),
    endDate: endDate.trim(),
  };
  if (parentPlanningIncrementId !== undefined) {
    body.parentPlanningIncrementId = parentPlanningIncrementId;
  }

  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/series/${seriesId.trim()}/increment`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw fetchResponseError(resp, "Create planning increment", text);
  }
  return resp.json();
}

/** Append a planning increment id to a card (JSON Patch add to /planningIncrementIds/-). */
export async function assignCardToPlanningIncrementApi(cardId, incrementId) {
  if (!incrementId || typeof incrementId !== "string" || incrementId.trim() === "") {
    throw new Error("incrementId is required.");
  }
  return patchCardOperations({
    cardId,
    operations: [{ op: "add", path: "/planningIncrementIds/-", value: incrementId.trim() }],
    context: "Assign card to planning increment",
  });
}

export async function listIncrementsApi(seriesId) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/series/${seriesId}/increment`, { method: "GET", headers: HEADERS });
  if (!resp.ok) { const text = await resp.text(); throw fetchResponseError(resp, "List planning increments", text); }
  return resp.json();
}

export async function updateIncrementApi(seriesId, incrementId, updates) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/series/${seriesId}/increment/${incrementId}`, {
    method: "PATCH", headers: HEADERS, body: JSON.stringify(updates && typeof updates === "object" ? updates : {}),
  });
  if (!resp.ok) { const text = await resp.text(); throw fetchResponseError(resp, "Update planning increment", text); }
  return resp.json().catch(() => ({}));
}

export async function deleteIncrementApi(seriesId, incrementId) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/series/${seriesId}/increment/${incrementId}`, { method: "DELETE", headers: HEADERS });
  if (!resp.ok) { const text = await resp.text(); throw fetchResponseError(resp, "Delete planning increment", text); }
}

export async function getIncrementStatusApi(seriesId, incrementId, category) {
  const ioPath = getIoPath();
  const path = category
    ? `${API_BASE}${ioPath}/series/${seriesId}/increment/${incrementId}/status/${category}`
    : `${API_BASE}${ioPath}/series/${seriesId}/increment/${incrementId}/status`;
  const resp = await fetchWithTimeout(path, { method: "GET", headers: HEADERS });
  if (!resp.ok) { const text = await resp.text(); throw fetchResponseError(resp, "Get increment status", text); }
  return resp.json();
}

// User APIs
export async function getCurrentUserApi() {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/user/me`, { method: "GET", headers: HEADERS });
  if (!resp.ok) { const text = await resp.text(); throw fetchResponseError(resp, "Get current user", text); }
  return resp.json();
}

export async function listUsersApi() {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/user`, { method: "GET", headers: HEADERS });
  if (!resp.ok) { const text = await resp.text(); throw fetchResponseError(resp, "List users", text); }
  return resp.json();
}

export async function getUserByIdApi(userId) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/user/${userId}`, { method: "GET", headers: HEADERS });
  if (!resp.ok) { const text = await resp.text(); throw fetchResponseError(resp, "Get user", text); }
  return resp.json();
}

// Reporting APIs
export async function getBoardThroughputReportApi(boardId) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/reporting/boardHealth/${boardId}/throughput`, { method: "GET", headers: HEADERS });
  if (!resp.ok) { const text = await resp.text(); throw fetchResponseError(resp, "Get board throughput report", text); }
  return resp.json();
}

export async function getBoardWipReportApi(boardId) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/reporting/boardHealth/${boardId}/wip`, { method: "GET", headers: HEADERS });
  if (!resp.ok) { const text = await resp.text(); throw fetchResponseError(resp, "Get board WIP report", text); }
  return resp.json();
}

export async function getLaneBottleneckReportApi(boardId) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/reporting/boardHealth/${boardId}/laneBottleneck`, { method: "GET", headers: HEADERS });
  if (!resp.ok) { const text = await resp.text(); throw fetchResponseError(resp, "Get lane bottleneck report", text); }
  return resp.json();
}

export async function getCardStatisticsApi(cardId) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/card/${cardId}/statistics`, { method: "GET", headers: HEADERS });
  if (!resp.ok) { const text = await resp.text(); throw fetchResponseError(resp, "Get card statistics", text); }
  return resp.json();
}

export async function getCardActivityApi(cardId) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/card/${cardId}/activity`, { method: "GET", headers: HEADERS });
  if (!resp.ok) { const text = await resp.text(); throw fetchResponseError(resp, "Get card activity", text); }
  return resp.json();
}

// Utility: fetch a single card by ID (for title lookup)
export async function getCardById(cardId) {
  const ioPath = getIoPath();
  // Request customFields so tools can read/write card-level custom field values.
  const queryParams = `?cards=${cardId}&include=customFields&includeDetails=Y`;
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/card${queryParams}`, {
    method: "GET",
    headers: HEADERS,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw fetchResponseError(resp, "Get card by ID", text);
  }

  const data = await resp.json();
  return data.cards?.[0] || null;
}

// ----------------
// Attachments
// ----------------

export async function listAttachmentsApi(cardId) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/card/${cardId}/attachment`, {
    method: "GET",
    headers: HEADERS,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw fetchResponseError(resp, "List attachments", text);
  }
  const data = await resp.json();
  return data.attachments || [];
}

// eslint-disable-next-line no-control-regex -- intentional: reject control chars in filenames
const FORBIDDEN_ATTACHMENT_FILENAME = /["\r\n\x00-\x1f]/;

export function assertValidAttachmentFileName(fileName) {
  if (typeof fileName !== "string" || !fileName.trim()) {
    throw new Error("fileName must be a non-empty string");
  }
  if (FORBIDDEN_ATTACHMENT_FILENAME.test(fileName)) {
    throw new Error(
      `fileName contains forbidden characters (quotes, CR/LF, or control chars): ${JSON.stringify(fileName)}`
    );
  }
}

function attachmentBytes(fileContent, contentEncoding = "utf8") {
  if (Buffer.isBuffer(fileContent)) return fileContent;
  if (fileContent instanceof Uint8Array) return Buffer.from(fileContent);
  if (typeof fileContent !== "string") {
    throw new Error("fileContent must be a string, Buffer, or Uint8Array");
  }
  if (contentEncoding === "base64") {
    return Buffer.from(fileContent, "base64");
  }
  return Buffer.from(fileContent, "utf8");
}

export async function createAttachmentApi(
  cardId,
  fileName,
  fileContent,
  description,
  { contentType, contentEncoding = "utf8" } = {}
) {
  assertValidAttachmentFileName(fileName);
  const ioPath = getIoPath();
  const bytes = attachmentBytes(fileContent, contentEncoding);
  const form = new FormData();
  if (description !== undefined && description !== null && description !== "") {
    form.append("description", String(description));
  }
  const blob = new Blob([bytes], { type: contentType || "application/octet-stream" });
  form.append("file", blob, fileName);

  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/card/${cardId}/attachment`, {
    method: "POST",
    headers: {
      Authorization: HEADERS.Authorization,
      Accept: HEADERS.Accept,
    },
    body: form,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw fetchResponseError(resp, "Create attachment", text);
  }
  return resp.json();
}

export async function deleteAttachmentApi(cardId, attachmentId) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(
    `${API_BASE}${ioPath}/card/${cardId}/attachment/${attachmentId}`,
    { method: "DELETE", headers: HEADERS }
  );
  if (!resp.ok) {
    const text = await resp.text();
    throw fetchResponseError(resp, "Delete attachment", text);
  }
}

// ----------------
// Automations
// ----------------

export async function listAutomationsApi(boardId) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/board/${boardId}/automation`, {
    method: "GET",
    headers: HEADERS,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw fetchResponseError(resp, "List automations", text);
  }
  const data = await resp.json();
  return data.cardAutomations || [];
}

export async function getAutomationApi(boardId, automationId) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(
    `${API_BASE}${ioPath}/board/${boardId}/automation/${automationId}`,
    { method: "GET", headers: HEADERS }
  );
  if (!resp.ok) {
    const text = await resp.text();
    throw fetchResponseError(resp, "Get automation", text);
  }
  return resp.json();
}

export async function triggerBoardCustomEventApi(boardId, eventName) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/board/${boardId}/automation/customevent`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({ eventName }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw fetchResponseError(resp, "Trigger board custom event", text);
  }
  return resp.json().catch(() => ({}));
}

export async function triggerCardCustomEventApi(cardId, eventName) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/card/${cardId}/automation/customevent`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({ eventName }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw fetchResponseError(resp, "Trigger card custom event", text);
  }
  return resp.json().catch(() => ({}));
}

export async function getAutomationAuditApi(boardId, automationId) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(
    `${API_BASE}${ioPath}/board/${boardId}/automation/${automationId}/audit`,
    { method: "GET", headers: HEADERS }
  );
  if (!resp.ok) {
    const text = await resp.text();
    throw fetchResponseError(resp, "Get automation audit", text);
  }
  return resp.json();
}

// ----------------
// Board history export (CSV)
// ----------------

export async function exportBoardHistoryApi(boardId) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/board/${boardId}/export`, {
    method: "GET",
    headers: HEADERS,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw fetchResponseError(resp, "Export board history", text);
  }
  return resp.text();
}

// ----------------
// Card scoring (WSJF)
// ----------------

export async function listScoringTemplatesApi(boardId) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/board/${boardId}/scoring/template`, {
    method: "GET",
    headers: HEADERS,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw fetchResponseError(resp, "List scoring templates", text);
  }
  const data = await resp.json();
  return Array.isArray(data) ? data : data.templates || [];
}

export async function getBoardScoringApi(boardId) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/board/${boardId}/scoring`, {
    method: "GET",
    headers: HEADERS,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw fetchResponseError(resp, "Get board scoring", text);
  }
  return resp.json();
}

export async function setScoringSessionApi(boardId, templateId, templateVersion, cardIds) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/board/${boardId}/scoring`, {
    method: "PATCH",
    headers: HEADERS,
    body: JSON.stringify({
      template: { id: templateId, version: templateVersion },
      cardIds: Array.isArray(cardIds) ? cardIds : [cardIds],
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw fetchResponseError(resp, "Set scoring session", text);
  }
}

export async function updateCardScoreApi(boardId, cardId, payload) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(
    `${API_BASE}${ioPath}/board/${boardId}/scoring/card/${cardId}`,
    {
      method: "PUT",
      headers: HEADERS,
      body: JSON.stringify(payload),
    }
  );
  if (!resp.ok) {
    const text = await resp.text();
    throw fetchResponseError(resp, "Update card score", text);
  }
}

export async function applyScoringToCardsApi(boardId, cardIds) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/board/${boardId}/scoring/apply`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({ cardIds: Array.isArray(cardIds) ? cardIds : [cardIds] }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw fetchResponseError(resp, "Apply scoring to cards", text);
  }
}

export async function deleteCardScoresApi(boardId, cardIds) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/card/scoring`, {
    method: "DELETE",
    headers: HEADERS,
    body: JSON.stringify({ boardId, cardIds: Array.isArray(cardIds) ? cardIds : [cardIds] }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw fetchResponseError(resp, "Delete card scores", text);
  }
}

