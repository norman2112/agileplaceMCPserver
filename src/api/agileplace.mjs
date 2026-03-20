import { CONFIG, configSourceLabel } from "../config.mjs";
import { fetchWithTimeout, stripHtml } from "../helpers.mjs";

const {
  API_BASE,
  HEADERS,
  DEFAULT_BOARD_ID,
  MAX_CARDS,
  MAX_DESC,
  STORY_LIMIT,
  FETCH_TIMEOUT_MS,
} = CONFIG;

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
    throw new Error(formatFetchError(resp, "Create card", text));
  }

  return resp.json();
}

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
    throw new Error(formatFetchError(resp, context, text));
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
  const operations = tags.map(tag => ({ op: "add", path: "/tags/-", value: String(tag).trim() })).filter(op => op.value);
  if (operations.length === 0) throw new Error("No valid tags to add.");
  const ioPath = getIoPath();

  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/card/${cardId}`, {
    method: "PATCH",
    headers: HEADERS,
    body: JSON.stringify(operations),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(formatFetchError(resp, "Add card tags", text));
  }
  return resp.json();
}

// Utility: remove tags from a card (PATCH with remove operations)
export async function removeCardTags(cardId, tags) {
  if (!Array.isArray(tags) || tags.length === 0) {
    throw new Error("tags must be a non-empty array of strings.");
  }
  const operations = tags.map(tag => ({ op: "remove", path: "/tags", value: String(tag).trim() })).filter(op => op.value);
  if (operations.length === 0) throw new Error("No valid tags to remove.");
  const ioPath = getIoPath();

  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/card/${cardId}`, {
    method: "PATCH",
    headers: HEADERS,
    body: JSON.stringify(operations),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(formatFetchError(resp, "Remove card tags", text));
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
    throw new Error(formatFetchError(resp, "Connect cards", text));
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
    throw new Error(formatFetchError(resp, "Connect existing cards", text));
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
    throw new Error(formatFetchError(resp, "Create card comment", bodyText));
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
    throw new Error(formatFetchError(resp, "Assign users to cards", text));
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
    throw new Error(formatFetchError(resp, "Delete card connections", text));
  }

  return resp.json().catch(() => ({}));
}

// Utility: list all cards on a board
export async function listCards(boardId) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/board/${boardId}/card`, {
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
export async function listCardTypes(boardId) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/board/${boardId}/cardType`, {
    method: "GET",
    headers: HEADERS,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(formatFetchError(resp, "List card types", text));
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
    throw new Error(formatFetchError(resp, "List boards", text));
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
    throw new Error(formatFetchError(resp, "Get board", text));
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
    throw new Error(formatFetchError(resp, "Update board", text));
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
    throw new Error(formatFetchError(resp, "Archive board", text));
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
    throw new Error(formatFetchError(resp, "Create board", text));
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
    throw new Error(formatFetchError(resp, "Update board layout", text));
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
    throw new Error(formatFetchError(resp, "Get lane card counts", text));
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
    throw new Error(formatFetchError(resp, "Get board custom fields", text));
  }

  return resp.json();
}

// Utility: update board custom fields (PATCH /io/board/:boardId/customfield)
export async function updateBoardCustomFieldsApi(boardId, updates) {
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
export async function bulkUpdateCardsApi(cardIds, updates) {
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
    throw new Error(formatFetchError(resp, "Set card tags", text));
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
    throw new Error(formatFetchError(resp, "Create card type", text));
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
    throw new Error(formatFetchError(resp, "Update card type", text));
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
    throw new Error(formatFetchError(resp, "Delete card type", text));
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
    throw new Error(formatFetchError(resp, "Update lane", text));
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
    throw new Error(formatFetchError(resp, "Delete card", text));
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
    throw new Error(formatFetchError(resp, "Batch delete cards", text));
  }
}

// Utility: move card to lane (PATCH /io/card/:cardId with laneId)
export async function moveCardToLaneApi(cardId, laneId) {
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
export async function getCardDependencies(cardId, includeFaces = true) {
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
export async function updateCardDependencyApi(payload) {
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
export async function deleteCardDependencyApi(payload) {
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
export async function listCardsWithDependencies(boardId) {
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
    throw new Error(formatFetchError(resp, "Get card with relationships", text));
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
    throw new Error(formatFetchError(resp, "Get connection parents", text));
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
    throw new Error(formatFetchError(resp, "Get connection children", text));
  }

  const data = await resp.json();
  return data.cards || [];
}

// Helper: map API card to parent/child summary (id, title, cardType, laneId, relationship, tags, optional dates)
export function toParentChildSummary(card, relationship) {
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

// Comments CRUD
export async function getCardCommentsApi(cardId) {
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
    throw new Error(formatFetchError(resp, "Update card comment", bodyText));
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
    throw new Error(formatFetchError(resp, "Delete card comment", bodyText));
  }
}

// Planning series APIs
export async function listPlanningSeriesApi() {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/series`, { method: "GET", headers: HEADERS });
  if (!resp.ok) { const text = await resp.text(); throw new Error(formatFetchError(resp, "List planning series", text)); }
  return resp.json();
}

export async function createPlanningSeriesApi(payload) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/series`, {
    method: "POST", headers: HEADERS, body: JSON.stringify(payload && typeof payload === "object" ? payload : {}),
  });
  if (!resp.ok) { const text = await resp.text(); throw new Error(formatFetchError(resp, "Create planning series", text)); }
  return resp.json();
}

export async function getPlanningSeriesApi(seriesId) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/series/${seriesId}`, { method: "GET", headers: HEADERS });
  if (!resp.ok) { const text = await resp.text(); throw new Error(formatFetchError(resp, "Get planning series", text)); }
  return resp.json();
}

export async function updatePlanningSeriesApi(seriesId, updates) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/series/${seriesId}`, {
    method: "PATCH", headers: HEADERS, body: JSON.stringify(updates && typeof updates === "object" ? updates : {}),
  });
  if (!resp.ok) { const text = await resp.text(); throw new Error(formatFetchError(resp, "Update planning series", text)); }
  return resp.json().catch(() => ({}));
}

export async function deletePlanningSeriesApi(seriesId) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/series/${seriesId}`, { method: "DELETE", headers: HEADERS });
  if (!resp.ok) { const text = await resp.text(); throw new Error(formatFetchError(resp, "Delete planning series", text)); }
}

export async function createIncrementApi(seriesId, payload) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/series/${seriesId}/increment`, {
    method: "POST", headers: HEADERS, body: JSON.stringify(payload && typeof payload === "object" ? payload : {}),
  });
  if (!resp.ok) { const text = await resp.text(); throw new Error(formatFetchError(resp, "Create planning increment", text)); }
  return resp.json();
}

export async function listIncrementsApi(seriesId) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/series/${seriesId}/increment`, { method: "GET", headers: HEADERS });
  if (!resp.ok) { const text = await resp.text(); throw new Error(formatFetchError(resp, "List planning increments", text)); }
  return resp.json();
}

export async function updateIncrementApi(seriesId, incrementId, updates) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/series/${seriesId}/increment/${incrementId}`, {
    method: "PATCH", headers: HEADERS, body: JSON.stringify(updates && typeof updates === "object" ? updates : {}),
  });
  if (!resp.ok) { const text = await resp.text(); throw new Error(formatFetchError(resp, "Update planning increment", text)); }
  return resp.json().catch(() => ({}));
}

export async function deleteIncrementApi(seriesId, incrementId) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/series/${seriesId}/increment/${incrementId}`, { method: "DELETE", headers: HEADERS });
  if (!resp.ok) { const text = await resp.text(); throw new Error(formatFetchError(resp, "Delete planning increment", text)); }
}

export async function getIncrementStatusApi(seriesId, incrementId, category) {
  const ioPath = getIoPath();
  const path = category
    ? `${API_BASE}${ioPath}/series/${seriesId}/increment/${incrementId}/status/${category}`
    : `${API_BASE}${ioPath}/series/${seriesId}/increment/${incrementId}/status`;
  const resp = await fetchWithTimeout(path, { method: "GET", headers: HEADERS });
  if (!resp.ok) { const text = await resp.text(); throw new Error(formatFetchError(resp, "Get increment status", text)); }
  return resp.json();
}

// User APIs
export async function getCurrentUserApi() {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/user/me`, { method: "GET", headers: HEADERS });
  if (!resp.ok) { const text = await resp.text(); throw new Error(formatFetchError(resp, "Get current user", text)); }
  return resp.json();
}

export async function listUsersApi() {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/user`, { method: "GET", headers: HEADERS });
  if (!resp.ok) { const text = await resp.text(); throw new Error(formatFetchError(resp, "List users", text)); }
  return resp.json();
}

export async function getUserByIdApi(userId) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/user/${userId}`, { method: "GET", headers: HEADERS });
  if (!resp.ok) { const text = await resp.text(); throw new Error(formatFetchError(resp, "Get user", text)); }
  return resp.json();
}

// Reporting APIs
export async function getBoardThroughputReportApi(boardId) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/reporting/boardHealth/${boardId}/throughput`, { method: "GET", headers: HEADERS });
  if (!resp.ok) { const text = await resp.text(); throw new Error(formatFetchError(resp, "Get board throughput report", text)); }
  return resp.json();
}

export async function getBoardWipReportApi(boardId) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/reporting/boardHealth/${boardId}/wip`, { method: "GET", headers: HEADERS });
  if (!resp.ok) { const text = await resp.text(); throw new Error(formatFetchError(resp, "Get board WIP report", text)); }
  return resp.json();
}

export async function getLaneBottleneckReportApi(boardId) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/reporting/boardHealth/${boardId}/laneBottleneck`, { method: "GET", headers: HEADERS });
  if (!resp.ok) { const text = await resp.text(); throw new Error(formatFetchError(resp, "Get lane bottleneck report", text)); }
  return resp.json();
}

export async function getCardStatisticsApi(cardId) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/card/${cardId}/statistics`, { method: "GET", headers: HEADERS });
  if (!resp.ok) { const text = await resp.text(); throw new Error(formatFetchError(resp, "Get card statistics", text)); }
  return resp.json();
}

export async function getCardActivityApi(cardId) {
  const ioPath = getIoPath();
  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/card/${cardId}/activity`, { method: "GET", headers: HEADERS });
  if (!resp.ok) { const text = await resp.text(); throw new Error(formatFetchError(resp, "Get card activity", text)); }
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
    throw new Error(formatFetchError(resp, "Get card by ID", text));
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
    throw new Error(formatFetchError(resp, "List attachments", text));
  }
  const data = await resp.json();
  return data.attachments || [];
}

export async function createAttachmentApi(cardId, fileName, fileContent, description) {
  const ioPath = getIoPath();
  const boundary = "----MCPBoundary" + Date.now();
  const body = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="description"',
    "",
    description ?? "",
    `--${boundary}`,
    `Content-Disposition: form-data; name="file"; filename="${fileName}"`,
    "Content-Type: application/octet-stream",
    "",
    typeof fileContent === "string" ? fileContent : String(fileContent),
    `--${boundary}--`,
  ].join("\r\n");

  const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/card/${cardId}/attachment`, {
    method: "POST",
    headers: {
      ...HEADERS,
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(formatFetchError(resp, "Create attachment", text));
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
    throw new Error(formatFetchError(resp, "Delete attachment", text));
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
    throw new Error(formatFetchError(resp, "List automations", text));
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
    throw new Error(formatFetchError(resp, "Get automation", text));
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
    throw new Error(formatFetchError(resp, "Trigger board custom event", text));
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
    throw new Error(formatFetchError(resp, "Trigger card custom event", text));
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
    throw new Error(formatFetchError(resp, "Get automation audit", text));
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
    throw new Error(formatFetchError(resp, "Export board history", text));
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
    throw new Error(formatFetchError(resp, "List scoring templates", text));
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
    throw new Error(formatFetchError(resp, "Get board scoring", text));
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
    throw new Error(formatFetchError(resp, "Set scoring session", text));
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
    throw new Error(formatFetchError(resp, "Update card score", text));
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
    throw new Error(formatFetchError(resp, "Apply scoring to cards", text));
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
    throw new Error(formatFetchError(resp, "Delete card scores", text));
  }
}

