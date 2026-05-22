import { z } from "zod";
import { CONFIG } from "../config.mjs";
import { respondText, wrapToolHandler } from "../helpers.mjs";
import {
  listCardTypes as listCardTypesApi,
  createCardTypeApi,
  updateCardTypeApi,
  deleteCardTypeApi,
  updateBoardApi,
} from "../api/agileplace.mjs";

const { DEFAULT_BOARD_ID } = CONFIG;

export function validateSetupCardTypesDeleteFlags(deleteStockTypes, confirmDeleteStockTypes) {
  if (deleteStockTypes === true && confirmDeleteStockTypes !== true) {
    throw new Error(
      "deleteStockTypes is destructive. Set confirmDeleteStockTypes: true to confirm deletion of pre-existing card types."
    );
  }
}

export function registerCardTypeTools(mcp) {
  // List available card types
  mcp.registerTool(
    "listCardTypes",
    {
      description:
        "List available card types for a board. Returns card type IDs, names, colors, and whether each is the board default.",
      inputSchema: {
        boardId: z.string().optional(),
      },
    },
    wrapToolHandler("listCardTypes", async ({ boardId }) => {
      const resolvedBoardId = boardId || DEFAULT_BOARD_ID;
      if (!resolvedBoardId) {
        throw new Error('Board ID is required. Provide "boardId".');
      }

      const response = await listCardTypesApi(resolvedBoardId);
      const cardTypes = response.cardTypes || [];

      const cardTypesList = cardTypes.length > 0
        ? cardTypes
            .map(
              ct =>
                `ID: ${ct.id || "N/A"} | Name: ${ct.name || "N/A"} | Color: ${
                  ct.colorHex || "N/A"
                } | isDefault: ${!!ct.isDefault}`
            )
            .join("\n")
        : "No card types found";

      const text = `Found ${cardTypes.length} card type(s) on board ${resolvedBoardId} (source: ${
        boardId ? "boardId parameter" : "tool default"
      }):\n${cardTypesList}`;

      // Preserve original response shape (single text content item)
      return {
        content: [
          {
            type: "text",
            text,
          },
        ],
      };
    })
  );

  // Create card type
  mcp.registerTool(
    "createCardType",
    {
      description:
        "Create a card type on a board. Requires name and colorHex (e.g. #B8D4E8).",
      inputSchema: {
        boardId: z.string(),
        name: z.string(),
        colorHex: z.string(),
        isCardType: z.boolean().optional(),
        isTaskType: z.boolean().optional(),
      },
    },
    wrapToolHandler(
      "createCardType",
      async ({ boardId, name, colorHex, isCardType = true, isTaskType = false }) => {
        const ct = await createCardTypeApi(boardId, {
          name,
          colorHex,
          isCardType,
          isTaskType,
        });
        return respondText(
          `Created card type "${ct.name}" (ID: ${ct.id})`,
          JSON.stringify(ct, null, 2)
        );
      }
    )
  );

  // Update card type
  mcp.registerTool(
    "updateCardType",
    {
      description:
        "Rename, recolor, or adjust flags on an existing card type in place via PATCH /io/board/:boardId/cardType/:cardTypeId — same type ID is preserved and cards already using that type stay on it (unlike delete+create or setupCardTypes wipes, which reassign cards). Partial updates: only send fields to change. Supported: name, colorHex (e.g. #B8D4E8), isCardType, isTaskType. This is the card-type analogue to updateLane: targeted branding without recreating the type.",
      inputSchema: {
        boardId: z.string(),
        cardTypeId: z.string(),
        name: z.string().optional(),
        colorHex: z.string().optional(),
        isCardType: z.boolean().optional(),
        isTaskType: z.boolean().optional(),
      },
    },
    wrapToolHandler(
      "updateCardType",
      async ({ boardId, cardTypeId, name, colorHex, isCardType, isTaskType }) => {
        const ct = await updateCardTypeApi(boardId, cardTypeId, {
          name,
          colorHex,
          isCardType,
          isTaskType,
        });
        return respondText(
          `Updated card type ${cardTypeId}`,
          JSON.stringify(ct, null, 2)
        );
      }
    )
  );

  // Set default card type by ID or name
  mcp.registerTool(
    "setDefaultCardType",
    {
      description:
        "Set the board's default card type to an existing type by cardTypeId or cardTypeName.",
      inputSchema: {
        boardId: z.string(),
        cardTypeId: z.string().optional(),
        cardTypeName: z.string().optional(),
      },
    },
    wrapToolHandler(
      "setDefaultCardType",
      async ({ boardId, cardTypeId, cardTypeName }) => {
        if (!cardTypeId && !cardTypeName) {
          throw new Error("Provide cardTypeId or cardTypeName.");
        }

        let resolvedCardTypeId = cardTypeId ? String(cardTypeId) : null;
        let resolvedName = cardTypeName || null;
        if (!resolvedCardTypeId) {
          const current = await listCardTypesApi(boardId);
          const cardTypes = current.cardTypes || [];
          const lookup = cardTypeName.trim().toLowerCase();
          const match = cardTypes.find(
            ct => (ct.name || "").trim().toLowerCase() === lookup
          );
          if (!match) {
            throw new Error(
              `Card type "${cardTypeName}" not found on board ${boardId}.`
            );
          }
          resolvedCardTypeId = String(match.id);
          resolvedName = match.name;
        }

        await updateBoardApi(boardId, { defaultCardType: resolvedCardTypeId });
        return respondText(
          `Set default card type on board ${boardId} to ${resolvedName || resolvedCardTypeId} (ID: ${resolvedCardTypeId})`
        );
      }
    )
  );

  // Delete card type
  mcp.registerTool(
    "deleteCardType",
    {
      description: "Delete a card type from a board.",
      inputSchema: {
        boardId: z.string(),
        cardTypeId: z.string(),
      },
    },
    wrapToolHandler(
      "deleteCardType",
      async ({ boardId, cardTypeId }) => {
        await deleteCardTypeApi(boardId, cardTypeId);
        return respondText(`Deleted card type ${cardTypeId}`);
      }
    )
  );

  // Batch create card types (server-side loop over POST /cardType)
  mcp.registerTool(
    "batchCreateCardTypes",
    {
      description:
        "Create multiple card types on a board in one call. Returns per-type success/failure and created IDs. Server loops internally — no native batch API exists.",
      inputSchema: {
        boardId: z.string(),
        cardTypes: z.array(
          z.object({
            name: z.string(),
            colorHex: z.string().describe("Hex color, e.g. #1a1a2e"),
            isCardType: z.boolean().optional(),
            isTaskType: z.boolean().optional(),
          })
        ),
      },
    },
    wrapToolHandler(
      "batchCreateCardTypes",
      async ({ boardId, cardTypes }) => {
        const results = [];

        for (const ct of cardTypes || []) {
          try {
            const created = await createCardTypeApi(boardId, {
              name: ct.name,
              colorHex: ct.colorHex,
              isCardType: ct.isCardType ?? true,
              isTaskType: ct.isTaskType ?? false,
            });
            results.push({
              name: ct.name,
              id: created.id,
              success: true,
            });
          } catch (err) {
            results.push({
              name: ct.name,
              success: false,
              error: err?.message ?? String(err),
            });
          }
        }

        const successCount = results.filter(r => r.success).length;
        const failureCount = results.length - successCount;

        return respondText(
          `Batch create card types on board ${boardId}: ${successCount} succeeded, ${failureCount} failed`,
          `Results:\n${JSON.stringify(
            {
              boardId,
              created: results,
            },
            null,
            2
          )}`
        );
      }
    )
  );

  // Batch delete card types (skips default card type and default task type)
  mcp.registerTool(
    "batchDeleteCardTypes",
    {
      description:
        "Delete multiple card types from a board. By default, skips default card type and default task type. Set force=true (with promoteDefaultToCardTypeId or promoteDefaultToCardTypeName) to reassign default first, then allow deleting the former default. Returns per-type success/failure.",
      inputSchema: {
        boardId: z.string(),
        cardTypeIds: z
          .array(z.string())
          .describe("Array of card type IDs to delete"),
        force: z
          .boolean()
          .optional()
          .describe(
            "If true and the current default card type is in cardTypeIds, reassign default first using promoteDefaultToCardTypeId or promoteDefaultToCardTypeName."
          ),
        promoteDefaultToCardTypeId: z.string().optional(),
        promoteDefaultToCardTypeName: z.string().optional(),
      },
    },
    wrapToolHandler(
      "batchDeleteCardTypes",
      async ({
        boardId,
        cardTypeIds,
        force = false,
        promoteDefaultToCardTypeId,
        promoteDefaultToCardTypeName,
      }) => {
        const current = await listCardTypesApi(boardId);
        const cardTypes = current.cardTypes || [];

        let defaultCardTypeId = cardTypes.find(ct => ct.isDefault)?.id;
        const defaultTaskTypeId = cardTypes.find(ct => ct.isDefaultTaskType)
          ?.id;
        const deletingDefaultCardType =
          defaultCardTypeId &&
          (cardTypeIds || []).some(
            id => String(id) === String(defaultCardTypeId)
          );

        if (deletingDefaultCardType && force) {
          if (
            !promoteDefaultToCardTypeId &&
            !promoteDefaultToCardTypeName
          ) {
            throw new Error(
              "force=true requires promoteDefaultToCardTypeId or promoteDefaultToCardTypeName when deleting the current default card type."
            );
          }

          let nextDefault = null;
          if (promoteDefaultToCardTypeId) {
            nextDefault = cardTypes.find(
              ct => String(ct.id) === String(promoteDefaultToCardTypeId)
            );
          } else if (promoteDefaultToCardTypeName) {
            const lookup = promoteDefaultToCardTypeName.trim().toLowerCase();
            nextDefault = cardTypes.find(
              ct => (ct.name || "").trim().toLowerCase() === lookup
            );
          }

          if (!nextDefault) {
            throw new Error(
              "Requested promoted default card type was not found on this board."
            );
          }
          if (String(nextDefault.id) === String(defaultCardTypeId)) {
            throw new Error(
              "Promoted default card type cannot be the same as the card type being deleted."
            );
          }
          if (
            (cardTypeIds || []).some(id => String(id) === String(nextDefault.id))
          ) {
            throw new Error(
              "Promoted default card type is also included in cardTypeIds for deletion. Remove it from the delete list."
            );
          }

          await updateBoardApi(boardId, { defaultCardType: String(nextDefault.id) });
          defaultCardTypeId = String(nextDefault.id);
        }

        const deleted = [];

        for (const id of cardTypeIds || []) {
          if (defaultCardTypeId && String(id) === String(defaultCardTypeId)) {
            deleted.push({
              id,
              success: false,
              error: force
                ? "Cannot delete current default card type"
                : "Cannot delete default card type (use force=true and promoteDefaultToCardTypeId or promoteDefaultToCardTypeName)",
              skipped: true,
            });
            continue;
          }
          if (defaultTaskTypeId && String(id) === String(defaultTaskTypeId)) {
            deleted.push({
              id,
              success: false,
              error: "Cannot delete default task type",
              skipped: true,
            });
            continue;
          }

          try {
            await deleteCardTypeApi(boardId, id);
            deleted.push({ id, success: true });
          } catch (err) {
            deleted.push({
              id,
              success: false,
              error: err?.message ?? String(err),
            });
          }
        }

        const successCount = deleted.filter(r => r.success).length;
        const failureCount = deleted.length - successCount;

        return respondText(
          `Batch delete card types on board ${boardId}: ${successCount} succeeded, ${failureCount} failed`,
          `Results:\n${JSON.stringify(
            {
              boardId,
              deleted,
            },
            null,
            2
          )}`
        );
      }
    )
  );

  // Composite: setup card types for a board in one call
  mcp.registerTool(
    "setupCardTypes",
    {
      description:
        "Complete card type setup for a board in one call: creates custom types and sets a default (additive by default). To delete pre-existing stock types, set deleteStockTypes and confirmDeleteStockTypes to true.",
      inputSchema: {
        boardId: z.string(),
        cardTypes: z.array(
          z.object({
            name: z.string(),
            colorHex: z.string(),
            isCardType: z.boolean().optional(),
            isTaskType: z.boolean().optional(),
          })
        ),
        defaultCardTypeName: z
          .string()
          .describe(
            "Name of the card type to set as the board's default card type (resolved from post-operation board state; can be newly created or already existing)"
          ),
        deleteStockTypes: z
          .boolean()
          .optional()
          .describe(
            "DESTRUCTIVE: when true, deletes all pre-existing card types on the board before creating new ones. Default: false (additive). Requires confirmDeleteStockTypes: true."
          ),
        confirmDeleteStockTypes: z
          .boolean()
          .optional()
          .describe(
            "Required when deleteStockTypes is true. Must be true to confirm irreversible deletion of stock card types."
          ),
      },
    },
    wrapToolHandler(
      "setupCardTypes",
      async ({
        boardId,
        cardTypes,
        defaultCardTypeName,
        deleteStockTypes,
        confirmDeleteStockTypes,
      }) => {
        validateSetupCardTypesDeleteFlags(deleteStockTypes, confirmDeleteStockTypes);
        const report = {
          boardId,
          created: [],
          defaultSet: null,
          deleted: [],
          errors: [],
        };

        // Step 0: Snapshot existing types before creating new ones
        const existing = await listCardTypesApi(boardId);
        const existingTypes = existing.cardTypes || [];
        const existingIds = new Set(
          existingTypes
            .map(ct => ct.id)
            .filter(id => id !== undefined && id !== null)
            .map(id => String(id))
        );

        // Step 1: Create all requested card types
        const typeMap = {}; // name -> id
        for (const ct of cardTypes || []) {
          try {
            const created = await createCardTypeApi(boardId, {
              name: ct.name,
              colorHex: ct.colorHex,
              isCardType: ct.isCardType ?? true,
              isTaskType: ct.isTaskType ?? false,
            });
            const idStr = String(created.id);
            typeMap[ct.name] = idStr;
            report.created.push({ name: ct.name, id: idStr });
          } catch (err) {
            report.errors.push({
              phase: "create",
              name: ct.name,
              error: err?.message ?? String(err),
            });
          }
        }

        // Step 2: Resolve and set default card type from current board state
        let defaultId = null;
        const currentAfterCreate = await listCardTypesApi(boardId);
        const cardTypesAfterCreate = currentAfterCreate.cardTypes || [];
        const defaultLookup = (defaultCardTypeName || "").trim().toLowerCase();
        const defaultType = cardTypesAfterCreate.find(
          ct => (ct.name || "").trim().toLowerCase() === defaultLookup
        );
        if (defaultType?.id !== undefined && defaultType?.id !== null) {
          defaultId = String(defaultType.id);
        }
        if (defaultId) {
          try {
            await updateBoardApi(boardId, { defaultCardType: defaultId });
            report.defaultSet = {
              name: defaultCardTypeName,
              id: defaultId,
            };
          } catch (err) {
            report.errors.push({
              phase: "setDefault",
              error: err?.message ?? String(err),
            });
          }
        } else {
          report.errors.push({
            phase: "setDefault",
            error: `Card type "${defaultCardTypeName}" not found on board after setup`,
          });
        }

        // Step 3: Delete stock types that existed before we started (opt-in only)
        if (deleteStockTypes === true) {
          const current = await listCardTypesApi(boardId);
          const currentTypes = current.cardTypes || [];
          const defaultTaskTypeId = currentTypes.find(
            ct => ct.isDefaultTaskType
          )?.id;
          const newDefaultCardId = defaultId;

          for (const ct of currentTypes) {
            const idStr = String(ct.id);
            // Only consider types that existed before setup started
            if (!existingIds.has(idStr)) continue;
            // Never delete the default task type or the new default card type
            if (
              (defaultTaskTypeId &&
                String(defaultTaskTypeId) === String(idStr)) ||
              (newDefaultCardId && String(newDefaultCardId) === String(idStr))
            ) {
              continue;
            }

            try {
              await deleteCardTypeApi(boardId, idStr);
              report.deleted.push({ name: ct.name, id: idStr });
            } catch (err) {
              report.errors.push({
                phase: "delete",
                name: ct.name,
                id: idStr,
                error: err?.message ?? String(err),
              });
            }
          }
        }

        const summary = `Created ${report.created.length}, set default to "${defaultCardTypeName}", deleted ${report.deleted.length} stock types, ${report.errors.length} errors`;

        return respondText(
          summary,
          `Details:\n${JSON.stringify(
            {
              ...report,
              typeMap,
              summary,
            },
            null,
            2
          )}`
        );
      }
    )
  );
}

