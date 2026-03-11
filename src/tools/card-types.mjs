import { z } from "zod";
import { CONFIG, configSourceLabel } from "../config.mjs";
import { respondText, wrapToolHandler } from "../helpers.mjs";
import {
  listCardTypes as listCardTypesApi,
  createCardTypeApi,
  updateCardTypeApi,
  deleteCardTypeApi,
  updateBoardApi,
} from "../api/agileplace.mjs";

const { DEFAULT_BOARD_ID } = CONFIG;

export function registerCardTypeTools(mcp) {
  // List available card types
  mcp.registerTool(
    "listCardTypes",
    {
      description:
        "List available card types for a board. Returns card type IDs and names. If boardId is not provided, defaults to AGILEPLACE_BOARD_ID from Claude Desktop config (`claude_desktop_config.json` → `mcpServers.<server>.env`) or process environment variables. Always use the default board unless the user explicitly specifies a different board.",
      inputSchema: {
        boardId: z.string().optional(),
      },
    },
    wrapToolHandler("listCardTypes", async ({ boardId }) => {
      const resolvedBoardId = boardId || DEFAULT_BOARD_ID;
      if (!resolvedBoardId) {
        throw new Error(
          `Board ID is required. Provide "boardId" or set AGILEPLACE_BOARD_ID in ${configSourceLabel()}.`
        );
      }

      const response = await listCardTypesApi(resolvedBoardId);
      const cardTypes = response.cardTypes || [];

      const cardTypesList = cardTypes.length > 0
        ? cardTypes
            .map(ct => `ID: ${ct.id || "N/A"} | Name: ${ct.name || "N/A"}`)
            .join("\n")
        : "No card types found";

      const text = `Found ${cardTypes.length} card type(s) on board ${resolvedBoardId} (source: ${
        boardId ? "boardId parameter" : "default AGILEPLACE_BOARD_ID"
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
        "Update a card type. Partial updates - only include fields to change.",
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
        "Delete multiple card types from a board. Automatically skips default card type and default task type (cannot be deleted). Returns per-type success/failure.",
      inputSchema: {
        boardId: z.string(),
        cardTypeIds: z
          .array(z.string())
          .describe("Array of card type IDs to delete"),
      },
    },
    wrapToolHandler(
      "batchDeleteCardTypes",
      async ({ boardId, cardTypeIds }) => {
        const current = await listCardTypesApi(boardId);
        const cardTypes = current.cardTypes || [];

        const defaultCardTypeId = cardTypes.find(ct => ct.isDefault)?.id;
        const defaultTaskTypeId = cardTypes.find(ct => ct.isDefaultTaskType)
          ?.id;

        const deleted = [];

        for (const id of cardTypeIds || []) {
          if (defaultCardTypeId && String(id) === String(defaultCardTypeId)) {
            deleted.push({
              id,
              success: false,
              error: "Cannot delete default card type",
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
        "Complete card type setup for a board in one call: creates custom types, sets a default, and optionally deletes all stock types while preserving the default task type.",
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
            "Name of the card type (from cardTypes array) to set as the board's default card type"
          ),
        deleteStockTypes: z
          .boolean()
          .optional()
          .describe(
            "If true, deletes all pre-existing card types except the default task type"
          ),
      },
    },
    wrapToolHandler(
      "setupCardTypes",
      async ({ boardId, cardTypes, defaultCardTypeName, deleteStockTypes }) => {
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

        // Step 2: Set default card type
        const defaultId = typeMap[defaultCardTypeName];
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
            error: `Card type "${defaultCardTypeName}" not found in created types`,
          });
        }

        // Step 3: Delete stock types that existed before we started
        if (deleteStockTypes !== false) {
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

