import { z } from "zod";
import { respondText } from "../helpers.mjs";
import { CONFIG, configSourceLabel } from "../config.mjs";
import {
  listBoardsApi,
  archiveBoardApi,
  createBoardApi,
  updateBoardApi,
  updateBoardLayoutApi,
  getBoardCustomFieldsApi,
  updateBoardCustomFieldsApi,
  exportBoardHistoryApi,
} from "../api/agileplace.mjs";

const { DEFAULT_BOARD_ID } = CONFIG;

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

  // List boards
  mcp.registerTool(
    "listBoards",
    {
      description: "List boards. Supports optional search (title filter) and boards (filter by IDs). Returns id, title, description for each board.",
      inputSchema: {
        search: z.string().optional(),
        boards: z.union([z.string(), z.array(z.string())]).optional(),
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

  // Batch archive boards
  mcp.registerTool(
    "batchArchiveBoards",
    {
      description: "Archive multiple boards. Calls the archive endpoint for each board. Returns per-board success/failure.",
      inputSchema: {
        boardIds: z.array(z.string()),
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
      description: "Update the lane layout for a board using the native layout endpoint. Pass the full layout object (usually taken from GET /io/board/:boardId).",
      inputSchema: {
        boardId: z.string(),
        layout: z.any(),
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
        throw new Error(`Board ID is required. Provide "boardId" or set AGILEPLACE_BOARD_ID in ${configSourceLabel()}.`);
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
      description: "Update custom fields configuration for a board. Pass a partial customfield object as expected by the AgilePlace API.",
      inputSchema: {
        boardId: z.string().optional(),
        updates: z.any(),
      },
    },
    async ({ boardId, updates }) => {
      const resolvedBoardId = boardId || DEFAULT_BOARD_ID;
      if (!resolvedBoardId) {
        throw new Error(`Board ID is required. Provide "boardId" or set AGILEPLACE_BOARD_ID in ${configSourceLabel()}.`);
      }
      const result = await updateBoardCustomFieldsApi(resolvedBoardId, updates);
      return respondText(
        `Updated custom fields for board ${resolvedBoardId}`,
        JSON.stringify(result || { boardId: resolvedBoardId }, null, 2)
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

