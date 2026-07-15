import { z } from "zod";
import { CONFIG } from "../config.mjs";
import { respondText, wrapToolHandler } from "../helpers.mjs";
import {
  createCard,
  updateCard as updateCardApi,
  listCards,
  listCardsInLanesApi,
  listCardTypes,
  getCardById,
  getBoard,
  getBoardCustomFieldsApi,
  patchCardOperations,
  deleteCardApi,
  batchDeleteCardsApi,
  moveCardToLaneApi,
  bulkUpdateCardsApi,
  assignUsersToCardsApi,
  assignCardToPlanningIncrementApi,
  connectCards,
  connectExistingCards,
  getConnectionChildren,
  searchCardsApi,
  summarizeCard,
  prepareCardPayload,
  normalizeBoardId,
  buildUpdateOperations,
  CARD_PRIORITY_VALUES,
} from "../api/agileplace.mjs";
import { resolveLaneId, getDefaultDropLaneId } from "../lane-utils.mjs";
import { jsonPatchValueSchema } from "../patch-schemas.mjs";
import { MAX_BULK_IDS, MAX_TAG_VALUES } from "../limits.mjs";

const cardPrioritySchema = z.enum(CARD_PRIORITY_VALUES);

const { DEFAULT_BOARD_ID, MAX_CARDS } = CONFIG;

// ---------------------------------------------------------------------------
// Local helpers (only used by tools in this module)
// ---------------------------------------------------------------------------

const BATCH_UPDATE_MAX = 50;

/** Default page size for listCards / listCardIds (matches prior ~20 cap on listCardIds). */
const DEFAULT_LIST_CARDS_LIMIT = 20;
const MAX_LIST_CARDS_LIMIT = 500;

/** Apply defaults when limit/offset omitted (invalid values rejected by zod on tool inputs). */
function resolveListCardsPagination(limit, offset) {
  return {
    limit: limit ?? DEFAULT_LIST_CARDS_LIMIT,
    offset: offset ?? 0,
  };
}

function resolveListCardsTotal(response, offset, returned) {
  const raw = response?.pageMeta?.totalRecords;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  return offset + returned;
}

/**
 * Batch update cards (parallel PATCH, per-item success/failure).
 * Copied from the original server.mjs utility — only used by the
 * batchUpdateCards tool so it lives here rather than in the shared API layer.
 */
async function batchUpdateCards(updates, boardId, { dryRun = false } = {}) {
  if (updates.length > BATCH_UPDATE_MAX) {
    throw new Error(`Maximum ${BATCH_UPDATE_MAX} cards per batch. Received ${updates.length}.`);
  }

  let validTypeIds;
  if (boardId) {
    const ctResponse = await listCardTypes(boardId);
    validTypeIds = new Set((ctResponse.cardTypes || []).map((ct) => String(ct.id)));
  }

  const previews = [];
  for (const item of updates) {
    const { cardId, title, description, cardHeader, plannedStartDate, plannedFinishDate, isHeader, cardTypeId, priority } = item;
    if (cardTypeId !== undefined && cardTypeId !== "" && validTypeIds && !validTypeIds.has(String(cardTypeId))) {
      previews.push({ cardId, success: false, error: `cardTypeId "${cardTypeId}" not found on board. Use listCardTypes to see valid ids.` });
      continue;
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
      previews.push({ cardId, success: false, error: "No update fields provided" });
      continue;
    }
    previews.push({ cardId, success: true, operations, wouldChangeType: cardTypeId != null && cardTypeId !== "" });
  }

  if (dryRun) {
    return {
      dryRun: true,
      results: previews.map(p => ({
        cardId: p.cardId,
        success: p.success,
        error: p.error,
        operations: p.operations,
        wouldChangeType: p.wouldChangeType,
      })),
      successCount: previews.filter(p => p.success).length,
      failureCount: previews.filter(p => !p.success).length,
    };
  }

  const results = await Promise.allSettled(
    previews.map(async (preview) => {
      if (!preview.success) return preview;
      const { cardId, operations } = preview;
      try {
        await patchCardOperations({ cardId, operations, context: "Batch update card" });
        const fresh = await getCardById(cardId);
        return { cardId, success: true, card: summarizeCard(fresh) };
      } catch (err) {
        return { cardId, success: false, error: err?.message ?? String(err) };
      }
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

async function resolveMoveLaneTarget({ boardId, laneId, laneName }) {
  if (laneId) return String(laneId);
  if (!laneName) throw new Error("laneId or laneName is required.");
  const resolvedBoardId = boardId || DEFAULT_BOARD_ID;
  if (!resolvedBoardId) throw new Error('boardId is required when using laneName (to resolve lane title).');
  const board = await getBoard(resolvedBoardId);
  return resolveLaneId(board.lanes || [], { laneName });
}

async function bulkMoveCards({ cardIds, laneId, laneName, boardId, wipOverrideReason, atomic }) {
  const resolvedLaneId = await resolveMoveLaneTarget({ boardId, laneId, laneName });
  const parsed = [];

  const runOne = async cardId => {
    const updated = await moveCardToLaneApi(cardId, resolvedLaneId, wipOverrideReason);
    return { cardId, success: true, laneId: updated.lane?.id ?? resolvedLaneId };
  };

  if (atomic) {
    for (const cardId of cardIds) {
      try {
        parsed.push(await runOne(cardId));
      } catch (err) {
        parsed.push({ cardId, success: false, error: err?.message ?? String(err) });
        throw new Error(
          `Atomic bulk move stopped at card ${cardId}: ${err?.message ?? err}. ${parsed.filter(p => p.success).length} card(s) were already moved (no rollback).`
        );
      }
    }
  } else {
    const results = await Promise.allSettled(cardIds.map(runOne));
    results.forEach((r, i) => {
      if (r.status === "fulfilled") parsed.push(r.value);
      else parsed.push({ cardId: cardIds[i] ?? "?", success: false, error: r.reason?.message ?? String(r.reason) });
    });
  }

  return { laneId: resolvedLaneId, results: parsed };
}

/**
 * Validates parameter structure before API call for connected cards.
 */
function validateConnectedCards(parent, children) {
  const errors = [];

  if (!parent?.title) errors.push("Parent must have title");
  if (!Array.isArray(children)) errors.push("Children must be an array");
  if (children.length === 0) {
    errors.push(
      "Must have at least one child. If you need to create an orphan card, use batchCreateCards instead."
    );
  }

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

/**
 * Build JSON Patch ops for card customFields (PATCH /io/card/:cardId).
 * Uses /customFields/- to append new fields; replace at index when field already exists.
 * API docs: collection is an array of { fieldId, value }; tags use /- for append (same pattern).
 */
export function buildCardCustomFieldPatchOperations(fields, card) {
  const existing = Array.isArray(card?.customFields) ? card.customFields : [];
  const indexByFieldId = new Map();
  existing.forEach((entry, idx) => {
    if (!entry || typeof entry !== "object") return;
    const fid = entry.fieldId ?? entry.id;
    if (fid !== undefined && fid !== null) indexByFieldId.set(String(fid), idx);
  });

  const operations = [];
  for (const f of fields) {
    const fieldId = String(f.fieldId);
    const patchValue = { fieldId, value: f.value };
    const idx = indexByFieldId.get(fieldId);

    if (f.value === null) {
      if (idx !== undefined) {
        operations.push({ op: "remove", path: `/customFields/${idx}` });
      }
      continue;
    }

    if (idx !== undefined) {
      operations.push({ op: "replace", path: `/customFields/${idx}`, value: patchValue });
    } else {
      operations.push({ op: "add", path: "/customFields/-", value: patchValue });
    }
  }

  if (operations.length === 0) {
    throw new Error("No custom field operations to apply.");
  }
  return operations;
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
      description: [
        "Create one or more cards on an AgilePlace board. Only title is required per card. BoardId defaults from env if omitted.",
        "Lane: each card may include optional laneId; otherwise batch-level laneId applies; if both omitted, cards use the board default drop lane.",
        `At most ${MAX_CARDS} cards are processed per call (see AGILEPLACE_MAX_CARDS_PER_BATCH / MAX_CARDS in server config). Extra cards are skipped with a warning.`,
        "Use listCardTypes for valid cardTypeId values (numeric strings like '2372827607').",
      ].join(" "),
      inputSchema: {
        boardId: z.string().optional(),
        laneId: z
          .string()
          .optional()
          .describe("Default lane for cards that omit per-card laneId"),
        dryRun: z.boolean().optional(),
        cards: z.array(
          z.object({
            title: z.string(),
            laneId: z
              .string()
              .optional()
              .describe("Destination lane for this card; overrides batch-level laneId when set"),
            parentCardId: z
              .string()
              .optional()
              .describe("After create, connect this card as a child of parentCardId (cross-board supported)"),
            description: z.string().optional(),
            plannedStartDate: z.string().optional(),
            plannedFinishDate: z.string().optional(),
            isHeader: z.boolean().optional(),
            cardHeader: z
              .string()
              .optional()
              .describe("Display header text (maps to customId); freeform, not enum-validated"),
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
        throw new Error('Board ID is required. Provide "boardId".');
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
          `Only the first ${limitedCards.length} cards were processed (of ${cards.length}). Raise AGILEPLACE_MAX_CARDS_PER_BATCH or MAX_CARDS (max 200) if you need a higher limit.`
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
          const effectiveLaneId = c.laneId ?? laneId;
          const { body, sanitized } = await prepareCardPayload(
            { ...c, boardId: resolvedBoardId, laneId: effectiveLaneId },
            { resolveTypeName: false }
          );
          summary.push({
            title: sanitized.title,
            description: sanitized.description,
            destination: body.destination,
            laneId: body.destination?.laneId ?? effectiveLaneId ?? null,
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

      const boardForDefault = await getBoard(resolvedBoardId);
      const defaultDropLaneId = getDefaultDropLaneId(boardForDefault.lanes || []);

      const resultsSettled = await Promise.allSettled(
        normalizedCards.map(c =>
          createCard(
            {
              boardId: resolvedBoardId,
              laneId: c.laneId ?? laneId,
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
      const connectionErrors = [];

      for (let index = 0; index < resultsSettled.length; index++) {
        const result = resultsSettled[index];
        const src = normalizedCards[index];
        if (result.status !== "fulfilled") {
          errors.push({
            title: src?.title ?? "(unknown)",
            error: result.reason?.message ?? String(result.reason),
          });
          continue;
        }
        const card = result.value;
        createdCards.push(card);
        if (src?.parentCardId) {
          try {
            await connectExistingCards(String(src.parentCardId), [String(card.id)]);
          } catch (err) {
            connectionErrors.push({
              cardId: card.id,
              parentCardId: src.parentCardId,
              error: err?.message ?? String(err),
            });
          }
        }
      }

      return respondText(
        cardTypeOptionsText,
        warnings.length ? `Warnings:\n${warnings.join("\n")}` : "",
        `Created ${createdCards.length} card(s) on board ${resolvedBoardId}`
          + (errors.length ? ` (${errors.length} failed)` : ""),
        `Results:\n${JSON.stringify(
          {
            defaultDropLaneId,
            created: createdCards.map(c => ({
              id: c.id,
              title: c.title,
              laneId: c.lane?.id ?? c.laneId,
            })),
            errors,
            connectionErrors,
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
          laneId: z.string().optional(),
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
            laneId: z.string().optional(),
            description: z.string().optional(),
            plannedStartDate: z.string().optional(),
            plannedFinishDate: z.string().optional(),
            isHeader: z.boolean().optional(),
            cardHeader: z.string().optional(),
            cardTypeId: z.string().optional(),
            cardTypeName: z.string().optional(),
          })
        ),
        connectionGroups: z
          .array(
            z.object({
              parentCardId: z.string(),
              childCardIds: z.array(z.string()).min(1).max(MAX_BULK_IDS),
            })
          )
          .optional()
          .describe("Connect existing cards only (no create). Multiple parent→children groups in one call."),
      },
    },
    wrapToolHandler("batchCreateConnectedCards", async ({ boardId, parent, children, dryRun, connectionGroups }) => {
      const resolvedBoardId = boardId || DEFAULT_BOARD_ID;
      if (!resolvedBoardId) {
        throw new Error('Board ID is required. Provide "boardId".');
      }

      if (connectionGroups?.length) {
        if (dryRun) {
          return respondText(
            `Dry run: would connect ${connectionGroups.length} parent group(s)`,
            JSON.stringify({ dryRun: true, connectionGroups }, null, 2)
          );
        }
        const results = [];
        for (const g of connectionGroups) {
          await connectExistingCards(g.parentCardId, g.childCardIds);
          results.push({ parentCardId: g.parentCardId, childCount: g.childCardIds.length, success: true });
        }
        return respondText(
          `Connected ${results.length} parent group(s)`,
          JSON.stringify({ results }, null, 2)
        );
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
        laneId: parent.laneId,
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
          laneId: c.laneId,
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
            value: z.union([z.string(), z.number(), z.null(), z.array(z.string()).max(MAX_TAG_VALUES)]),
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

      const operations = buildCardCustomFieldPatchOperations(fields, card);

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
      description: [
        "List cards on a board using POST /io/card/list with limit and offset (server-side pagination).",
        "Includes cards in collapsed lane subtrees (the board card-face GET endpoint omits those).",
        `Defaults: limit ${DEFAULT_LIST_CARDS_LIMIT}, offset 0. Max limit ${MAX_LIST_CARDS_LIMIT}.`,
        "Response JSON includes total, limit, offset, returned, hasMore, and cards. Use hasMore and offset+limit for the next page.",
        "Descriptions are often empty in list responses (API omits long text). Use getCard for full description, or set includeDescriptions=true to re-fetch each card on the page (slower).",
        "Optionally set includeChildren to append child card summaries per listed card.",
      ].join(" "),
      inputSchema: {
        boardId: z.string().optional(),
        includeDescriptions: z
          .boolean()
          .optional()
          .describe("Re-fetch each listed card via getCard to populate description (N parallel calls)"),
        includeChildren: z.boolean().optional(),
        limit: z
          .number()
          .int()
          .min(1)
          .max(MAX_LIST_CARDS_LIMIT)
          .optional()
          .describe(`Page size (default ${DEFAULT_LIST_CARDS_LIMIT}, max ${MAX_LIST_CARDS_LIMIT})`),
        offset: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe("Start index into the board’s card list (default 0)"),
      },
    },
    wrapToolHandler("listCards", async ({ boardId, includeChildren = false, includeDescriptions = false, limit, offset }) => {
      const resolvedBoardId = boardId || DEFAULT_BOARD_ID;
      if (!resolvedBoardId) {
        throw new Error('Board ID is required. Provide "boardId".');
      }
      const { limit: lim, offset: off } = resolveListCardsPagination(limit, offset);
      const response = await listCards(resolvedBoardId, { limit: lim, offset: off });
      const rawCards = response.cards || [];
      const total = resolveListCardsTotal(response, off, rawCards.length);
      const returned = rawCards.length;
      const hasMore = off + returned < total;

      // Create a simplified response format
      let cardList = rawCards.map(c => {
        const base = {
          id: c.id,
          title: c.title,
          description: c.description || "",
          plannedStartDate: c.plannedStart,
          plannedFinishDate: c.plannedFinish,
          isHeader: c.isHeader || false,
          laneId: c.laneId ?? c.lane?.id,
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

      if (includeDescriptions && cardList.length > 0) {
        const fullCards = await Promise.all(cardList.map(c => getCardById(c.id)));
        cardList = cardList.map((c, i) => ({
          ...c,
          description: fullCards[i]?.description ?? c.description ?? "",
        }));
      }

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

      const envelope = {
        total,
        limit: lim,
        offset: off,
        returned,
        hasMore,
        cards: cardList,
      };

      const rangeLabel =
        returned === 0 ? "no cards in this range" : `rows ${off + 1}–${off + returned} of ${total}`;
      const nextHint = hasMore ? ` Next page: same call with offset=${off + lim} (limit=${lim}).` : "";

      return respondText(
        `Found ${total} card(s) on board ${resolvedBoardId}. Showing ${rangeLabel}.${nextHint}`,
        cardList.map(c => `ID: ${c.id} | Title: ${c.title} | Type: ${c.cardType}`).join("\n"),
        `JSON:\n${JSON.stringify(envelope, null, 2)}`
      );
    })
  );

  // ---- updateCard ----
  mcp.registerTool(
    "updateCard",
    {
      description:
        "Update a card's title, description, dates, card header (customId — freeform display text, not enum-validated), card type, or priority by cardId. cardTypeId changes the card's type (same as changeCardType). boardId is optional and only used to validate cardTypeId against that board.",
      inputSchema: {
        cardId: z.string(),
        title: z.string().optional(),
        description: z.string().optional(),
        plannedStartDate: z.string().optional(),
        plannedFinishDate: z.string().optional(),
        isHeader: z.boolean().optional(),
        cardHeader: z.string().optional(),
        cardTypeId: z.string().optional(),
        priority: cardPrioritySchema.optional(),
        boardId: z.string().optional(),
      },
    },
    wrapToolHandler("updateCard", async ({ cardId, title, description, plannedStartDate, plannedFinishDate, isHeader, cardHeader, cardTypeId, priority, boardId }) => {
      await updateCardApi({
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
      const fresh = await getCardById(cardId);

      return respondText(
        `Updated card ${cardId}`,
        `Result:\n${JSON.stringify(summarizeCard(fresh), null, 2)}`
      );
    })
  );

  // ---- batchUpdateCards ----
  mcp.registerTool(
    "batchUpdateCards",
    {
      description: [
        "Update multiple cards with different updates per card. Each item needs cardId (required) plus any of: title, description, cardHeader, plannedStartDate, plannedFinishDate, isHeader, cardTypeId (re-types the card), priority.",
        "Returns per-card success/failure with post-update card summary (re-fetched). Max 50 cards per call.",
        "boardId is optional — only validates cardTypeId against that board. dryRun previews JSON Patch operations without applying.",
        "For the same update on many cards, use bulkUpdateCards instead.",
      ].join(" "),
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
          priority: cardPrioritySchema.optional(),
        })),
        boardId: z.string().optional().describe("Optional; validates cardTypeId only"),
        dryRun: z.boolean().optional(),
      },
    },
    wrapToolHandler("batchUpdateCards", async ({ updates, boardId, dryRun }) => {
      const result = await batchUpdateCards(updates, boardId || undefined, { dryRun: !!dryRun });
      const label = dryRun ? "Batch update dry run" : "Batch update";

      return respondText(
        `${label}: ${result.successCount} succeeded, ${result.failureCount} failed`,
        `Results:\n${JSON.stringify(result, null, 2)}`
      );
    })
  );

  // ---- bulkUpdateCards ----
  mcp.registerTool(
    "bulkUpdateCards",
    {
      description: [
        "Apply the same updates to multiple cards in one API call. Uses the native bulk endpoint.",
        "For different updates per card, use batchUpdateCards instead.",
        "Updates use JSON Patch: /title, /typeId, /description, /customId, /plannedStart, /plannedFinish, /laneId, /wipOverrideComment (with /laneId for WIP override), /tags, /priority (normal|low|high|critical), /size, /isBlocked, /blockReason.",
        "dryRun validates payload only (does not call API).",
      ].join(" "),
      inputSchema: {
        cardIds: z.array(z.string()).max(MAX_BULK_IDS),
        updates: z.array(z.object({
          op: z.enum(["replace", "add", "remove"]),
          path: z.string(),
          value: jsonPatchValueSchema.optional(),
        })),
        dryRun: z.boolean().optional(),
      },
    },
    wrapToolHandler("bulkUpdateCards", async ({ cardIds, updates, dryRun }) => {
      if (dryRun) {
        return respondText(
          `Dry run: would bulk-update ${cardIds.length} card(s)`,
          JSON.stringify({ dryRun: true, cardIds, updates }, null, 2)
        );
      }
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
      description:
        "Move one card to a lane (PATCH /laneId). Use laneName + boardId instead of laneId to resolve by title (substring match). wipOverrideReason sets /wipOverrideComment when moving past WIP limits.",
      inputSchema: {
        cardId: z.string(),
        laneId: z.string().optional(),
        laneName: z.string().optional(),
        boardId: z.string().optional(),
        wipOverrideReason: z.string().optional(),
      },
    },
    wrapToolHandler("moveCardToLane", async ({ cardId, laneId, laneName, boardId, wipOverrideReason }) => {
      const resolvedLaneId = await resolveMoveLaneTarget({ boardId, laneId, laneName });
      const updated = await moveCardToLaneApi(cardId, resolvedLaneId, wipOverrideReason);
      return respondText(
        `Moved card ${cardId} to lane ${resolvedLaneId}`,
        JSON.stringify({ id: updated.id, laneId: updated.lane?.id ?? resolvedLaneId }, null, 2)
      );
    })
  );

  mcp.registerTool(
    "moveCardToLaneByName",
    {
      description: "Alias for moveCardToLane when using laneName instead of laneId.",
      inputSchema: {
        cardId: z.string(),
        boardId: z.string(),
        laneName: z.string(),
        wipOverrideReason: z.string().optional(),
      },
    },
    wrapToolHandler("moveCardToLaneByName", async args => {
      const resolvedLaneId = await resolveMoveLaneTarget(args);
      const updated = await moveCardToLaneApi(args.cardId, resolvedLaneId, args.wipOverrideReason);
      return respondText(
        `Moved card ${args.cardId} to lane "${args.laneName}" (${resolvedLaneId})`,
        JSON.stringify({ id: updated.id, laneId: resolvedLaneId }, null, 2)
      );
    })
  );

  // ---- bulkMoveCardsToLane ----
  mcp.registerTool(
    "bulkMoveCardsToLane",
    {
      description:
        "Move many cards to the same lane. Parallel by default; atomic=true stops on first failure (already-moved cards are not rolled back). wipOverrideReason for WIP limit overrides. Use laneName + boardId instead of laneId.",
      inputSchema: {
        cardIds: z.array(z.string()).min(1).max(MAX_BULK_IDS),
        laneId: z.string().optional(),
        laneName: z.string().optional(),
        boardId: z.string().optional(),
        wipOverrideReason: z.string().optional(),
        atomic: z.boolean().optional(),
      },
    },
    wrapToolHandler("bulkMoveCardsToLane", async args => {
      const { results, laneId } = await bulkMoveCards(args);
      const ok = results.filter(p => p.success).length;
      return respondText(
        `Bulk move to lane ${laneId}: ${ok} succeeded, ${results.length - ok} failed`,
        `Results:\n${JSON.stringify(results, null, 2)}`
      );
    })
  );

  // ---- bulkAssignCardsToIncrement ----
  mcp.registerTool(
    "bulkAssignCardsToIncrement",
    {
      description:
        "Assign many cards to the same planning increment. PATCHes each card with a JSON Patch add to /planningIncrementIds/- (concurrency 5).",
      inputSchema: {
        cardIds: z.array(z.string()).min(1).max(MAX_BULK_IDS),
        incrementId: z.string(),
      },
    },
    wrapToolHandler("bulkAssignCardsToIncrement", async ({ cardIds, incrementId }) => {
      const ids = Array.isArray(cardIds) ? cardIds : [];
      const CONCURRENCY = 5;
      const results = [];

      for (let i = 0; i < ids.length; i += CONCURRENCY) {
        const chunk = ids.slice(i, i + CONCURRENCY);
        const settled = await Promise.allSettled(
          chunk.map(async cardId => {
            const updated = await assignCardToPlanningIncrementApi(cardId, incrementId);
            return { cardId, success: true, id: updated?.id != null ? String(updated.id) : cardId };
          })
        );

        settled.forEach((r, idx) => {
          const id = chunk[idx];
          if (r.status === "fulfilled") {
            results.push(r.value);
          } else {
            results.push({
              cardId: id != null ? String(id) : "?",
              success: false,
              error: r.reason?.message ?? String(r.reason),
            });
          }
        });
      }

      const ok = results.filter(p => p.success).length;
      return respondText(
        `Bulk assign to increment ${incrementId}: ${ok} succeeded, ${results.length - ok} failed`,
        `Results:\n${JSON.stringify(results, null, 2)}`
      );
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
        cardIds: z.array(z.string()).max(MAX_BULK_IDS),
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
        cardIds: z.array(z.string()).max(MAX_BULK_IDS),
        userIds: z.array(z.string()).max(MAX_BULK_IDS),
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

  mcp.registerTool(
    "searchCards",
    {
      description:
        "Search card titles and external headers (customId) via GET /io/card?search=. Omit boardId to search account-wide; pass boardIds[] to search multiple boards and merge results.",
      inputSchema: {
        search: z.string(),
        boardId: z.string().optional(),
        boardIds: z.array(z.string()).max(MAX_BULK_IDS).optional(),
        limit: z.number().int().min(1).max(500).optional(),
        offset: z.number().int().min(0).optional(),
      },
    },
    wrapToolHandler("searchCards", async ({ search, boardId, boardIds, limit, offset }) => {
      const result = await searchCardsApi({ search, boardId, boardIds, limit, offset });
      return respondText(
        `Found ${result.total} card(s) matching "${result.search}"`,
        JSON.stringify(result, null, 2)
      );
    })
  );

  mcp.registerTool(
    "changeCardType",
    {
      description:
        "Change a card's type (same as updateCard with cardTypeId). boardId optional for cardTypeId validation on that board.",
      inputSchema: {
        cardId: z.string(),
        cardTypeId: z.string(),
        boardId: z.string().optional(),
      },
    },
    wrapToolHandler("changeCardType", async ({ cardId, cardTypeId, boardId }) => {
      await updateCardApi({ cardId, cardTypeId, boardId });
      const fresh = await getCardById(cardId);
      return respondText(
        `Changed card ${cardId} type`,
        JSON.stringify(summarizeCard(fresh), null, 2)
      );
    })
  );

  mcp.registerTool(
    "distributeCardsAcrossLanes",
    {
      description:
        "Spread cardIds across lanes by percentage weights (e.g. 30/25/25/20). Percentages should sum to ~100. Resolves laneName per slot when laneId omitted.",
      inputSchema: {
        boardId: z.string(),
        cardIds: z.array(z.string()).min(1).max(MAX_BULK_IDS),
        distribution: z.array(
          z.object({
            laneId: z.string().optional(),
            laneName: z.string().optional(),
            percent: z.number().min(0).max(100),
          })
        ).min(1),
        wipOverrideReason: z.string().optional(),
      },
    },
    wrapToolHandler("distributeCardsAcrossLanes", async ({ boardId, cardIds, distribution, wipOverrideReason }) => {
      const board = await getBoard(boardId);
      const slots = distribution.map(d => ({
        laneId: resolveLaneId(board.lanes || [], { laneId: d.laneId, laneName: d.laneName }),
        percent: d.percent,
      }));
      const totalPct = slots.reduce((s, x) => s + x.percent, 0);
      if (Math.abs(totalPct - 100) > 1) {
        throw new Error(`Distribution percents sum to ${totalPct}; should be ~100.`);
      }
      const assignments = [];
      let cursor = 0;
      for (let i = 0; i < slots.length; i++) {
        const count =
          i === slots.length - 1
            ? cardIds.length - cursor
            : Math.round((cardIds.length * slots[i].percent) / 100);
        const slice = cardIds.slice(cursor, cursor + count);
        cursor += count;
        for (const cardId of slice) {
          assignments.push({ cardId, laneId: slots[i].laneId });
        }
      }
      const settled = await Promise.allSettled(
        assignments.map(({ cardId, laneId }) =>
          moveCardToLaneApi(cardId, laneId, wipOverrideReason).then(() => ({
            cardId,
            laneId,
            success: true,
          }))
        )
      );
      const results = settled.map((r, i) => {
        const { cardId, laneId } = assignments[i];
        if (r.status === "fulfilled") return r.value;
        return {
          cardId,
          laneId,
          success: false,
          error: r.reason?.message ?? String(r.reason),
        };
      });
      const ok = results.filter(r => r.success).length;
      return respondText(
        `Distributed ${ok}/${cardIds.length} card(s) across ${slots.length} lane(s)`,
        JSON.stringify({ assignments: results }, null, 2)
      );
    })
  );

  mcp.registerTool(
    "assignLaneCardsToIncrement",
    {
      description:
        "Assign all cards in a lane (on one board) to a planning increment. Paginates through lane cards then bulk-assigns.",
      inputSchema: {
        boardId: z.string(),
        laneId: z.string().optional(),
        laneName: z.string().optional(),
        incrementId: z.string(),
        limit: z.number().int().min(1).max(500).optional(),
      },
    },
    wrapToolHandler("assignLaneCardsToIncrement", async ({ boardId, laneId, laneName, incrementId, limit }) => {
      const board = await getBoard(boardId);
      const resolvedLaneId = resolveLaneId(board.lanes || [], { laneId, laneName });
      const cards = await listCardsInLanesApi(boardId, [resolvedLaneId], { limit: limit ?? 500 });
      const cardIds = cards.map(c => String(c.id));
      if (cardIds.length === 0) {
        return respondText(`No cards in lane ${resolvedLaneId} on board ${boardId}`);
      }
      const CONCURRENCY = 5;
      const results = [];
      for (let i = 0; i < cardIds.length; i += CONCURRENCY) {
        const chunk = cardIds.slice(i, i + CONCURRENCY);
        const settled = await Promise.allSettled(
          chunk.map(async cardId => {
            await assignCardToPlanningIncrementApi(cardId, incrementId);
            return { cardId, success: true };
          })
        );
        settled.forEach((r, idx) => {
          if (r.status === "fulfilled") results.push(r.value);
          else results.push({ cardId: chunk[idx], success: false, error: r.reason?.message ?? String(r.reason) });
        });
      }
      const ok = results.filter(r => r.success).length;
      return respondText(
        `Assigned ${ok}/${cardIds.length} card(s) in lane ${resolvedLaneId} to increment ${incrementId}`,
        JSON.stringify({ laneId: resolvedLaneId, results }, null, 2)
      );
    })
  );

  // ---- listCardIds ----
  mcp.registerTool(
    "listCardIds",
    {
      description: [
        "List card id, title, and tags for one page of a board (same pagination as listCards).",
        `Defaults: limit ${DEFAULT_LIST_CARDS_LIMIT}, offset 0. Max limit ${MAX_LIST_CARDS_LIMIT}.`,
        "Response JSON includes total, limit, offset, returned, hasMore, and cards (id, title, tags).",
      ].join(" "),
      inputSchema: {
        boardId: z.string().optional(),
        limit: z
          .number()
          .int()
          .min(1)
          .max(MAX_LIST_CARDS_LIMIT)
          .optional()
          .describe(`Page size (default ${DEFAULT_LIST_CARDS_LIMIT}, max ${MAX_LIST_CARDS_LIMIT})`),
        offset: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe("Start index into the board’s card list (default 0)"),
      },
    },
    wrapToolHandler("listCardIds", async ({ boardId, limit, offset }) => {
      const resolvedBoardId = boardId || DEFAULT_BOARD_ID;
      if (!resolvedBoardId) {
        throw new Error('Board ID is required. Provide "boardId".');
      }
      const { limit: lim, offset: off } = resolveListCardsPagination(limit, offset);
      const response = await listCards(resolvedBoardId, { limit: lim, offset: off });
      const rawCards = response.cards || [];
      const total = resolveListCardsTotal(response, off, rawCards.length);
      const returned = rawCards.length;
      const hasMore = off + returned < total;

      const cardList = rawCards.map(c => `${c.id}: ${c.title}`).join("\n");
      const cardData = rawCards.map(c => ({
        id: c.id,
        title: c.title,
        tags: Array.isArray(c.tags) ? c.tags : [],
      }));

      const envelope = {
        total,
        limit: lim,
        offset: off,
        returned,
        hasMore,
        cards: cardData,
      };

      const rangeLabel =
        returned === 0 ? "no cards in this range" : `rows ${off + 1}–${off + returned} of ${total}`;
      const nextHint = hasMore ? ` Next page: same call with offset=${off + lim} (limit=${lim}).` : "";

      return respondText(
        `Found ${total} card(s) on board ${resolvedBoardId}. Showing ${rangeLabel}.${nextHint}`,
        cardList,
        `JSON:\n${JSON.stringify(envelope, null, 2)}`
      );
    })
  );
}
