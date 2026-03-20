import { z } from "zod";
import { CONFIG, configSourceLabel } from "../config.mjs";
import { respondText, wrapToolHandler, fetchWithTimeout } from "../helpers.mjs";
import {
  createCard,
  updateCard as updateCardApi,
  listCards,
  listCardTypes,
  getCardById,
  getBoardCustomFieldsApi,
  patchCardOperations,
  deleteCardApi,
  batchDeleteCardsApi,
  moveCardToLaneApi,
  bulkUpdateCardsApi,
  assignUsersToCardsApi,
  connectCards,
  getConnectionChildren,
  prepareCardPayload,
  normalizeBoardId,
  buildUpdateOperations,
  formatFetchError,
  getIoPath,
} from "../api/agileplace.mjs";

const { DEFAULT_BOARD_ID, MAX_CARDS, API_BASE, HEADERS } = CONFIG;

// ---------------------------------------------------------------------------
// Local helpers (only used by tools in this module)
// ---------------------------------------------------------------------------

const BATCH_UPDATE_MAX = 50;

/**
 * Batch update cards (parallel PATCH, per-item success/failure).
 * Copied from the original server.mjs utility — only used by the
 * batchUpdateCards tool so it lives here rather than in the shared API layer.
 */
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

      const resp = await fetchWithTimeout(`${API_BASE}${getIoPath()}/card/${cardId}`, {
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

/**
 * Validates parameter structure before API call for connected cards.
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

function extractCustomFieldValue(card, fieldId) {
  const cf = card?.customFields;
  if (!cf) return null;

  const fid = String(fieldId);

  // Common expected shape: customFields is an object keyed by fieldId.
  if (cf && typeof cf === "object" && !Array.isArray(cf)) {
    const direct = cf[fid] !== undefined ? cf[fid] : cf[String(fieldId)];
    if (direct !== undefined) {
      // Some APIs wrap values like `{ value: "..." }`.
      if (direct && typeof direct === "object" && "value" in direct) return direct.value ?? null;
      return direct ?? null;
    }

    // Fallback: if an object is keyed by indices but each value contains `{ fieldId, value }`.
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
    const choices =
      (type === "choice" || type === "multi") ? f.choiceConfiguration?.choices ?? null : null;

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

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function registerCardTools(mcp) {
  // ---- batchCreateCards ----
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
    wrapToolHandler("batchCreateCards", async ({ boardId, laneId, cards, dryRun }) => {
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

      const resultsSettled = await Promise.allSettled(
        normalizedCards.map(c =>
          createCard(
            {
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
            },
            { resolveTypeName: false, cardTypes }
          )
        )
      );

      const createdCards = [];
      const errors = [];

      resultsSettled.forEach((result, index) => {
        const src = normalizedCards[index];
        if (result.status === "fulfilled") {
          createdCards.push(result.value);
        } else {
          errors.push({
            title: src?.title ?? "(unknown)",
            error: result.reason?.message ?? String(result.reason),
          });
        }
      });

      return respondText(
        cardTypeOptionsText,
        warnings.length ? `Warnings:\n${warnings.join("\n")}` : "",
        `Created ${createdCards.length} card(s) on board ${resolvedBoardId}`
          + (errors.length ? ` (${errors.length} failed)` : ""),
        `Results:\n${JSON.stringify(
          {
            created: createdCards.map(c => ({
              id: c.id,
              title: c.title,
              description: c.description,
            })),
            errors,
          },
          null,
          2
        )}`
      );
    })
  );

  // ---- batchCreateConnectedCards ----
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
    wrapToolHandler("batchCreateConnectedCards", async ({ boardId, parent, children, dryRun }) => {
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
    })
  );

  // ---- getCard ----
  mcp.registerTool(
    "getCard",
    {
      description: "Get a single card by ID. Wraps the AgilePlace GET card endpoint and returns a simplified summary plus full JSON.",
      inputSchema: {
        cardId: z.string(),
      },
    },
    wrapToolHandler("getCard", async ({ cardId }) => {
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
    })
  );

  // ---- getCardCustomFields ----
  mcp.registerTool(
    "getCardCustomFields",
    {
      description:
        "Get the card's custom field values (customFields) plus board custom field metadata (label/type/helpText) for context.",
      inputSchema: {
        cardId: z.string(),
      },
    },
    wrapToolHandler("getCardCustomFields", async ({ cardId }) => {
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
    })
  );

  // ---- setCardCustomFields ----
  mcp.registerTool(
    "setCardCustomFields",
    {
      description:
        "Set one or more custom field values on a card using JSON Patch on PATCH /io/card/:cardId. Null clears the custom field.",
      inputSchema: {
        cardId: z.string(),
        fields: z.array(
          z.object({
            fieldId: z.string().min(1),
            value: z.union([z.string(), z.number(), z.null(), z.array(z.string())]),
          })
        ).min(1),
      },
    },
    wrapToolHandler("setCardCustomFields", async ({ cardId, fields }) => {
      const card = await getCardById(cardId);
      if (!card) throw new Error(`No card found with ID ${cardId}`);
      const boardId = card?.board?.id ? String(card.board.id) : null;
      if (!boardId) throw new Error(`Unable to determine boardId for card ${cardId}`);

      const boardFieldsResp = await getBoardCustomFieldsApi(boardId);
      const boardFields = boardFieldsResp?.customFields || [];
      const metaByFieldId = new Map(boardFields.map(f => [String(f.id), f]));

      // Optional best-effort warning to catch obvious type mismatches.
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

      // RFC 6902 JSON Patch: add/replace via customFields array.
      // The AgilePlace API accepts `value: { fieldId, value }` at path `/customFields/0`.
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
    })
  );

  // ---- listCards ----
  mcp.registerTool(
    "listCards",
    {
      description: "List cards on a board. Returns count and first 10 cards (id, title, description, dates, header flag). Optionally include child card summaries when includeChildren is true.",
      inputSchema: {
        boardId: z.string().optional(),
        includeChildren: z.boolean().optional(),
      },
    },
    wrapToolHandler("listCards", async ({ boardId, includeChildren = false }) => {
      const resolvedBoardId = boardId || DEFAULT_BOARD_ID;
      if (!resolvedBoardId) {
        throw new Error(`Board ID is required. Provide "boardId" or set AGILEPLACE_BOARD_ID in ${configSourceLabel()}.`);
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
    })
  );

  // ---- updateCard ----
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
    wrapToolHandler("updateCard", async ({ cardId, title, description, plannedStartDate, plannedFinishDate, isHeader, cardHeader, cardTypeId, priority, boardId }) => {
      const updated = await updateCardApi({
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
    })
  );

  // ---- batchUpdateCards ----
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
    wrapToolHandler("batchUpdateCards", async ({ updates, boardId }) => {
      const result = await batchUpdateCards(updates, boardId || undefined);

      return respondText(
        `Batch update: ${result.successCount} succeeded, ${result.failureCount} failed`,
        `Results:\n${JSON.stringify(result.results, null, 2)}`
      );
    })
  );

  // ---- bulkUpdateCards ----
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
    wrapToolHandler("bulkUpdateCards", async ({ cardIds, updates }) => {
      await bulkUpdateCardsApi(cardIds, updates);
      return respondText(
        `Bulk update accepted for ${cardIds.length} card(s)`,
        `202 Accepted. Same ${updates.length} operation(s) applied to all cards.`
      );
    })
  );

  // ---- moveCardToLane ----
  mcp.registerTool(
    "moveCardToLane",
    {
      description: "Move a card to a different lane.",
      inputSchema: {
        cardId: z.string(),
        laneId: z.string(),
      },
    },
    wrapToolHandler("moveCardToLane", async ({ cardId, laneId }) => {
      const updated = await moveCardToLaneApi(cardId, laneId);
      return respondText(`Moved card ${cardId} to lane ${laneId}`, JSON.stringify({ id: updated.id, laneId: updated.lane?.id }, null, 2));
    })
  );

  // ---- deleteCard ----
  mcp.registerTool(
    "deleteCard",
    {
      description: "Delete a single card. Board setting 'Allow users to delete cards' must be enabled.",
      inputSchema: {
        cardId: z.string(),
      },
    },
    wrapToolHandler("deleteCard", async ({ cardId }) => {
      await deleteCardApi(cardId);
      return respondText(`Deleted card ${cardId}`);
    })
  );

  // ---- batchDeleteCards ----
  mcp.registerTool(
    "batchDeleteCards",
    {
      description: "Delete multiple cards in one call. All cards must be on the same board. Board setting 'Allow users to delete cards' must be enabled.",
      inputSchema: {
        cardIds: z.array(z.string()),
      },
    },
    wrapToolHandler("batchDeleteCards", async ({ cardIds }) => {
      await batchDeleteCardsApi(cardIds);
      return respondText(`Deleted ${cardIds.length} card(s)`);
    })
  );

  // ---- assignUsersToCards ----
  mcp.registerTool(
    "assignUsersToCards",
    {
      description: "Assign one or more users to one or more cards using the native assign endpoint.",
      inputSchema: {
        cardIds: z.array(z.string()),
        userIds: z.array(z.string()),
      },
    },
    wrapToolHandler("assignUsersToCards", async ({ cardIds, userIds }) => {
      const result = await assignUsersToCardsApi(cardIds, userIds);
      return respondText(
        `Assigned ${userIds.length} user(s) to ${cardIds.length} card(s)`,
        JSON.stringify(result, null, 2)
      );
    })
  );

  // ---- listCardIds ----
  mcp.registerTool(
    "listCardIds",
    {
      description: "List a simple set of card IDs and titles from the board. Returns a basic text format that's easy to parse, plus JSON with tags for each card.",
      inputSchema: {
        boardId: z.string().optional(),
      },
    },
    wrapToolHandler("listCardIds", async ({ boardId }) => {
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
    })
  );
}
