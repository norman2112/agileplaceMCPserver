import { z } from "zod";
import { CONFIG, configSourceLabel } from "../config.mjs";
import { respondText, wrapToolHandler } from "../helpers.mjs";
import {
  getBoardThroughputReportApi,
  getBoardWipReportApi,
  getLaneBottleneckReportApi,
  getCardStatisticsApi,
  getCardActivityApi,
} from "../api/agileplace.mjs";

const { DEFAULT_BOARD_ID } = CONFIG;

export function registerReportingTools(mcp) {
  mcp.registerTool(
    "getBoardThroughputReport",
    {
      description: "Get throughput report for a board.",
      inputSchema: { boardId: z.string().optional() },
    },
    wrapToolHandler("getBoardThroughputReport", async ({ boardId }) => {
      const resolvedBoardId = boardId || DEFAULT_BOARD_ID;
      if (!resolvedBoardId) {
        throw new Error(`Board ID is required. Provide "boardId" or set AGILEPLACE_BOARD_ID in ${configSourceLabel()}.`);
      }
      const result = await getBoardThroughputReportApi(resolvedBoardId);
      return respondText(`Throughput report for board ${resolvedBoardId}`, JSON.stringify(result, null, 2));
    })
  );

  mcp.registerTool(
    "getBoardWipReport",
    {
      description: "Get WIP report for a board.",
      inputSchema: { boardId: z.string().optional() },
    },
    wrapToolHandler("getBoardWipReport", async ({ boardId }) => {
      const resolvedBoardId = boardId || DEFAULT_BOARD_ID;
      if (!resolvedBoardId) {
        throw new Error(`Board ID is required. Provide "boardId" or set AGILEPLACE_BOARD_ID in ${configSourceLabel()}.`);
      }
      const result = await getBoardWipReportApi(resolvedBoardId);
      return respondText(`WIP report for board ${resolvedBoardId}`, JSON.stringify(result, null, 2));
    })
  );

  mcp.registerTool(
    "getLaneBottleneckReport",
    {
      description: "Get lane bottleneck report for a board.",
      inputSchema: { boardId: z.string().optional() },
    },
    wrapToolHandler("getLaneBottleneckReport", async ({ boardId }) => {
      const resolvedBoardId = boardId || DEFAULT_BOARD_ID;
      if (!resolvedBoardId) {
        throw new Error(`Board ID is required. Provide "boardId" or set AGILEPLACE_BOARD_ID in ${configSourceLabel()}.`);
      }
      const result = await getLaneBottleneckReportApi(resolvedBoardId);
      return respondText(`Lane bottleneck report for board ${resolvedBoardId}`, JSON.stringify(result, null, 2));
    })
  );

  mcp.registerTool(
    "getCardStatistics",
    {
      description: "Get statistics for a card (cycle time, lead time, etc., depending on AgilePlace configuration).",
      inputSchema: { cardId: z.string() },
    },
    wrapToolHandler("getCardStatistics", async ({ cardId }) => {
      const result = await getCardStatisticsApi(cardId);
      return respondText(`Statistics for card ${cardId}`, JSON.stringify(result, null, 2));
    })
  );

  mcp.registerTool(
    "getCardActivity",
    {
      description: "Get activity history for a card.",
      inputSchema: { cardId: z.string() },
    },
    wrapToolHandler("getCardActivity", async ({ cardId }) => {
      const result = await getCardActivityApi(cardId);
      return respondText(`Activity for card ${cardId}`, JSON.stringify(result, null, 2));
    })
  );
}
