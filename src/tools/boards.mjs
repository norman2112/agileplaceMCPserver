import { z } from "zod";
import { respondText } from "../helpers.mjs";
import { CONFIG } from "../config.mjs";
import { jsonPatchOperationSchema, laneLayoutNodeSchema } from "../patch-schemas.mjs";
import {
  listBoardsApi,
  archiveBoardApi,
  unarchiveBoardApi,
  createBoardApi,
  duplicateBoardApi,
  updateBoardApi,
  updateBoardLayoutApi,
  getBoardCustomFieldsApi,
  updateBoardCustomFieldsApi,
  exportBoardHistoryApi,
} from "../api/agileplace.mjs";
import { MAX_BULK_IDS, MAX_TAG_VALUES } from "../limits.mjs";

const { DEFAULT_BOARD_ID } = CONFIG;
const boardCustomFieldChoiceConfigurationSchema = z
  .object({
    choices: z.array(z.string()).max(MAX_TAG_VALUES).optional(),
  })
  .passthrough();

/** Full field definition for createBoardCustomFields (matches PATCH value docs; no icon keys). */
const BOARD_CUSTOM_FIELD_TYPES = ["text", "number", "date", "choice", "multi"];

const boardCustomFieldCreateSchema = z
  .object({
    label: z.string(),
    helpText: z.string().optional(),
    type: z.enum(BOARD_CUSTOM_FIELD_TYPES),
    index: z.number().int().optional(),
    choiceConfiguration: boardCustomFieldChoiceConfigurationSchema.optional(),
  })
  .strict();

/** Partial update for patchBoardCustomField (replace body). */
const boardCustomFieldPatchSchema = z
  .object({
    label: z.string().optional(),
    helpText: z.string().optional(),
    type: z.string().min(1).optional(),
    index: z.number().int().optional(),
    choiceConfiguration: boardCustomFieldChoiceConfigurationSchema.optional(),
  })
  .strict()
  .refine(v => Object.keys(v).length > 0, {
    message: "changes must include at least one property",
  });

const BOARD_CUSTOM_FIELD_VALUE_KEYS = new Set([
  "label",
  "helpText",
  "type",
  "index",
  "choiceConfiguration",
]);

/**
 * Reject unknown keys in add/replace `value` objects for PATCH /board/:id/customfield.
 * GET responses may include iconName/iconColor for display; those are not in the PATCH contract.
 */
function assertBoardCustomFieldPatchValueShape(value, opIndex) {
  if (value === undefined || value === null) return;
  if (typeof value !== "object" || Array.isArray(value)) return;
  const unknown = Object.keys(value).filter(k => !BOARD_CUSTOM_FIELD_VALUE_KEYS.has(k));
  if (unknown.length > 0) {
    throw new Error(
      `updates[${opIndex}].value: unknown key(s): ${unknown.join(", ")}. ` +
        `Accepted keys: ${[...BOARD_CUSTOM_FIELD_VALUE_KEYS].join(", ")}. ` +
        "iconName/iconColor on fields are not settable via this endpoint (see POST /io/board/:boardId/customIcon for custom icons)."
    );
  }
}

function validateBoardCustomFieldPatchArray(updates) {
  updates.forEach((op, i) => {
    if (op.op === "add" || op.op === "replace") {
      assertBoardCustomFieldPatchValueShape(op.value, i);
    }
  });
}

export function registerBoardTools(mcp) {
  // Create a new board
  mcp.registerTool(
    "createBoard",
    {
      description: "Create a new AgilePlace board. At minimum, provide a title. Optionally include description, level, and customBoardUrl.",
      inputSchema: {
        title: z.string(),
        description: z.string().optional(),
        level: z.number().min(1).max(4).optional(),
        customBoardUrl: z.string().optional(),
      },
    },
    async ({ title, description, level, customBoardUrl }) => {
      const board = await createBoardApi({ title, description, level, customBoardUrl });
      const effectiveTitle = board?.title ?? title;
      const summary = {
        id: board.id,
        title: board.title ?? effectiveTitle,
        description: board.description,
        level: board.level,
        customBoardUrl: board.customBoardUrl,
      };
      return respondText(
        `Created board "${effectiveTitle}" (ID: ${summary.id})`,
        JSON.stringify(summary, null, 2)
      );
    }
  );

  // Duplicate an existing board
  mcp.registerTool(
    "duplicateBoard",
    {
      description:
        "Duplicate an existing board, including lanes, card types, cards, comments, custom fields, dependencies, and (optionally) users. For an empty board, use createBoard instead.",
      inputSchema: {
        fromBoardId: z.string(),
        title: z.string(),
        description: z.string().optional(),
        includeCards: z.boolean().optional(),
        includeExistingUsers: z.boolean().optional(),
        baseWipOnCardSize: z.boolean().optional(),
        excludeCompletedAndArchiveViolations: z.boolean().optional(),
        isShared: z.boolean().optional(),
        sharedBoardRole: z
          .enum(["none", "boardReader", "boardUser", "boardManager", "boardAdministrator"])
          .optional(),
      },
    },
    async ({
      fromBoardId,
      title,
      description,
      includeCards = true,
      includeExistingUsers = true,
      baseWipOnCardSize,
      excludeCompletedAndArchiveViolations,
      isShared,
      sharedBoardRole,
    }) => {
      const board = await duplicateBoardApi({
        fromBoardId,
        title,
        description,
        includeCards,
        includeExistingUsers,
        baseWipOnCardSize,
        excludeCompletedAndArchiveViolations,
        isShared,
        sharedBoardRole,
      });
      const effectiveTitle = board?.title ?? title;
      const summary = {
        id: board.id,
        title: board.title ?? effectiveTitle,
      };
      return respondText(
        `Duplicated board "${fromBoardId}" into "${effectiveTitle}" (ID: ${summary.id})`,
        JSON.stringify(summary, null, 2)
      );
    }
  );

  // List boards
  mcp.registerTool(
    "listBoards",
    {
      description: "List boards. Supports optional search (title filter) and boards (filter by IDs). Returns id, title, description for each board.",
      inputSchema: {
        search: z.string().optional(),
        boards: z.union([z.string(), z.array(z.string()).max(MAX_BULK_IDS)]).optional(),
        limit: z.number().optional(),
      },
    },
    async ({ search, boards, limit }) => {
      const boardIds = typeof boards === "string" ? boards.split(",").map((s) => s.trim()) : boards;
      const response = await listBoardsApi({ search, boards: boardIds, limit });
      const boardsList = response.boards || [];
      const text = boardsList.length === 0
        ? "No boards found."
        : boardsList.map((b) => `ID: ${b.id} | ${b.title}${b.description ? ` | ${b.description}` : ""}`).join("\n");
      return respondText(
        `Found ${boardsList.length} board(s)`,
        text,
        `JSON:\n${JSON.stringify(boardsList.map((b) => ({ id: b.id, title: b.title, description: b.description })), null, 2)}`
      );
    }
  );

  // Archive a board
  mcp.registerTool(
    "archiveBoard",
    {
      description: "Archive a single board. Administrators retain read-only access. Use unarchiveBoard to restore.",
      inputSchema: {
        boardId: z.string(),
      },
    },
    async ({ boardId }) => {
      await archiveBoardApi(boardId);
      return respondText(`Archived board ${boardId}`);
    }
  );

  mcp.registerTool(
    "unarchiveBoard",
    {
      description:
        "Restore an archived board (POST /io/board/:boardId/unarchive). Requires Account Administrator role.",
      inputSchema: {
        boardId: z.string(),
      },
    },
    async ({ boardId }) => {
      await unarchiveBoardApi(boardId);
      return respondText(`Unarchived board ${boardId}`);
    }
  );

  // Batch archive boards
  mcp.registerTool(
    "batchArchiveBoards",
    {
      description: "Archive multiple boards. Calls the archive endpoint for each board. Returns per-board success/failure.",
      inputSchema: {
        boardIds: z.array(z.string()).max(MAX_BULK_IDS),
      },
    },
    async ({ boardIds }) => {
      const results = await Promise.allSettled(
        boardIds.map(async (boardId) => {
          try {
            await archiveBoardApi(boardId);
            return { boardId, success: true };
          } catch (err) {
            return { boardId, success: false, error: err.message };
          }
        })
      );
      const parsed = results.map((r, i) => {
        if (r.status === "fulfilled") return r.value;
        return { boardId: boardIds[i] ?? "?", success: false, error: r.reason?.message ?? String(r.reason) };
      });
      const successCount = parsed.filter((p) => p.success).length;
      const failureCount = parsed.filter((p) => !p.success).length;
      return respondText(
        `Batch archive: ${successCount} succeeded, ${failureCount} failed`,
        `Results:\n${JSON.stringify(parsed, null, 2)}`
      );
    }
  );

  // Update board settings
  mcp.registerTool(
    "updateBoard",
    {
      description:
        "Update board settings: default card type, default task type, title, description, WIP options, sharing, and other board-level config. Only send properties you wish to change. Requires at least Board Manager role. Use listCardTypes to get valid defaultCardType/defaultTaskType ids.",
      inputSchema: {
        boardId: z.string(),
        title: z.string().optional(),
        description: z.string().optional(),
        defaultCardType: z.string().optional(),
        defaultTaskType: z.string().optional(),
        allowUsersToDeleteCards: z.boolean().optional(),
        isShared: z.boolean().optional(),
        sharedBoardRole: z
          .enum(["none", "boardReader", "boardUser", "boardManager", "boardAdministrator"])
          .optional(),
        baseWipOnCardSize: z.boolean().optional(),
        excludeCompletedAndArchiveViolations: z.boolean().optional(),
        customBoardUrl: z.string().optional(),
        enableCustomIcon: z.boolean().optional(),
        customIconFieldLabel: z.string().optional(),
        allowPlanviewIntegration: z.boolean().optional(),
        level: z.number().min(1).max(4).optional(),
      },
    },
    async (args) => {
      const { boardId, ...updates } = args;
      const { id, updated } = await updateBoardApi(boardId, updates);
      const result = { boardId: String(id), updated, success: true };
      return respondText(
        `Updated board ${id}: ${updated.length} setting(s) changed (${updated.join(", ")})`,
        JSON.stringify(result, null, 2)
      );
    }
  );

  // Update board lane layout
  mcp.registerTool(
    "updateBoardLayout",
    {
      description:
        "Update the lane layout for a board (PUT /io/board/:boardId/layout). Pass either { lanes, layoutChecksum? } as returned by getBoardLayout, or a bare lanes array (checksum optional on object form).",
      inputSchema: {
        boardId: z.string(),
        layout: z.union([
          z.object({
            lanes: z.array(laneLayoutNodeSchema),
            layoutChecksum: z.string().optional(),
            laneLayoutChecksum: z.string().optional(),
            checksum: z.string().optional(),
          }),
          z.array(laneLayoutNodeSchema),
        ]),
      },
    },
    async ({ boardId, layout }) => {
      const result = await updateBoardLayoutApi(boardId, layout);
      return respondText(
        `Updated layout for board ${boardId}`,
        JSON.stringify(result || { boardId }, null, 2)
      );
    }
  );

  // Board custom fields
  mcp.registerTool(
    "getBoardCustomFields",
    {
      description: "Get custom fields configuration for a board.",
      inputSchema: {
        boardId: z.string().optional(),
      },
    },
    async ({ boardId }) => {
      const resolvedBoardId = boardId || DEFAULT_BOARD_ID;
      if (!resolvedBoardId) {
        throw new Error('Board ID is required. Provide "boardId".');
      }
      const fields = await getBoardCustomFieldsApi(resolvedBoardId);
      return respondText(
        `Fetched custom fields for board ${resolvedBoardId}`,
        JSON.stringify(fields, null, 2)
      );
    }
  );

  mcp.registerTool(
    "updateBoardCustomFields",
    {
      description: [
        "Update board custom fields via PATCH /io/board/:boardId/customfield.",
        "updates must be a non-empty JSON Patch array (RFC 6902).",
        "Each operation shape: { op, path, value? }.",
        "Common operations:",
        '- Add field: {"op":"add","path":"/","value":{"label":"Submitter","type":"text"}}',
        '- Replace existing field: {"op":"replace","path":"/<fieldId>","value":{"label":"New Label","type":"text"}}',
        '- Remove field: {"op":"remove","path":"/<fieldId>"}',
        'Choice example: {"op":"add","path":"/","value":{"label":"Sentiment","type":"choice","choiceConfiguration":{"choices":["Positive","Neutral","Negative"]}}}',
        "If your payload is not an array, the tool returns a shape-specific error.",
        "Each add/replace value object may only include: label, helpText, type, index, choiceConfiguration (per API). Unknown keys (e.g. iconName) are rejected before calling AgilePlace.",
      ].join("\n"),
      inputSchema: {
        boardId: z.string().optional(),
        updates: z.array(jsonPatchOperationSchema).min(1),
      },
    },
    async ({ boardId, updates }) => {
      const resolvedBoardId = boardId || DEFAULT_BOARD_ID;
      if (!resolvedBoardId) {
        throw new Error('Board ID is required. Provide "boardId".');
      }
      validateBoardCustomFieldPatchArray(updates);
      const result = await updateBoardCustomFieldsApi(resolvedBoardId, updates);
      return respondText(
        `Updated custom fields for board ${resolvedBoardId}`,
        JSON.stringify(result || { boardId: resolvedBoardId }, null, 2)
      );
    }
  );

  mcp.registerTool(
    "createBoardCustomField",
    {
      description:
        "Create one board custom field (JSON Patch add to /io/board/:boardId/customfield). Types: text, number, date, choice, multi.",
      inputSchema: {
        boardId: z.string().optional(),
        field: boardCustomFieldCreateSchema,
      },
    },
    async ({ boardId, field }) => {
      const resolvedBoardId = boardId || DEFAULT_BOARD_ID;
      if (!resolvedBoardId) {
        throw new Error('Board ID is required. Provide "boardId".');
      }
      const updates = [{ op: "add", path: "/", value: field }];
      const result = await updateBoardCustomFieldsApi(resolvedBoardId, updates);
      return respondText(
        `Created custom field "${field.label}" on board ${resolvedBoardId}`,
        JSON.stringify(result || { boardId: resolvedBoardId, field }, null, 2)
      );
    }
  );

  mcp.registerTool(
    "createBoardCustomFields",
    {
      description:
        "Create multiple board custom fields without hand-writing JSON Patch. Same as repeated createBoardCustomField.",
      inputSchema: {
        boardId: z.string().optional(),
        fields: z.array(boardCustomFieldCreateSchema).min(1),
      },
    },
    async ({ boardId, fields }) => {
      const resolvedBoardId = boardId || DEFAULT_BOARD_ID;
      if (!resolvedBoardId) {
        throw new Error('Board ID is required. Provide "boardId".');
      }
      const updates = fields.map(field => ({
        op: "add",
        path: "/",
        value: field,
      }));
      const result = await updateBoardCustomFieldsApi(resolvedBoardId, updates);
      return respondText(
        `Created ${fields.length} custom field(s) for board ${resolvedBoardId}`,
        JSON.stringify(result || { boardId: resolvedBoardId, created: fields.length }, null, 2)
      );
    }
  );

  mcp.registerTool(
    "patchBoardCustomField",
    {
      description:
        "Update an existing board custom field by fieldId. Sends a replace operation to /io/board/:boardId/customfield using path /<fieldId>.",
      inputSchema: {
        boardId: z.string().optional(),
        fieldId: z.string(),
        changes: boardCustomFieldPatchSchema,
      },
    },
    async ({ boardId, fieldId, changes }) => {
      const resolvedBoardId = boardId || DEFAULT_BOARD_ID;
      if (!resolvedBoardId) {
        throw new Error('Board ID is required. Provide "boardId".');
      }
      const updates = [
        {
          op: "replace",
          path: `/${fieldId}`,
          value: changes,
        },
      ];
      const result = await updateBoardCustomFieldsApi(resolvedBoardId, updates);
      return respondText(
        `Updated custom field ${fieldId} for board ${resolvedBoardId}`,
        JSON.stringify(result || { boardId: resolvedBoardId, fieldId }, null, 2)
      );
    }
  );

  mcp.registerTool(
    "deleteBoardCustomField",
    {
      description:
        "Delete a board custom field by fieldId. Sends a remove operation to /io/board/:boardId/customfield using path /<fieldId>.",
      inputSchema: {
        boardId: z.string().optional(),
        fieldId: z.string(),
      },
    },
    async ({ boardId, fieldId }) => {
      const resolvedBoardId = boardId || DEFAULT_BOARD_ID;
      if (!resolvedBoardId) {
        throw new Error('Board ID is required. Provide "boardId".');
      }
      const updates = [
        {
          op: "remove",
          path: `/${fieldId}`,
        },
      ];
      const result = await updateBoardCustomFieldsApi(resolvedBoardId, updates);
      return respondText(
        `Deleted custom field ${fieldId} from board ${resolvedBoardId}`,
        JSON.stringify(result || { boardId: resolvedBoardId, fieldId }, null, 2)
      );
    }
  );

  // Board history export (CSV)
  mcp.registerTool(
    "exportBoardHistory",
    {
      description:
        "Export board history as CSV (card movements, events, who/when/what). Columns: When, What, Who, Card, Detail, Card Id, From Lane, From Lane Id, To Lane, To Lane Id, EventDescription. Returns summary (row count), first 50 rows preview, and full CSV.",
      inputSchema: {
        boardId: z.string(),
      },
    },
    async ({ boardId }) => {
      const csv = await exportBoardHistoryApi(boardId);
      const lines = csv.trim().split(/\r?\n/).filter(Boolean);
      const rowCount = Math.max(0, lines.length - 1); // subtract header
      const summary = `Board ${boardId} history: ${rowCount} data row(s) (excluding header).`;
      const previewLines = lines.slice(0, 51); // header + first 50 data rows
      const preview = previewLines.join("\n");
      const parts = [summary];
      if (rowCount > 50) {
        parts.push(`Preview (first 50 data rows):\n${preview}`);
      }
      parts.push(`Full CSV:\n${csv}`);
      return respondText(...parts);
    }
  );
}

