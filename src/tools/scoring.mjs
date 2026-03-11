import { z } from "zod";
import { respondText, wrapToolHandler } from "../helpers.mjs";
import {
  listScoringTemplatesApi,
  getBoardScoringApi,
  setScoringSessionApi,
  updateCardScoreApi,
  applyScoringToCardsApi,
  deleteCardScoresApi,
} from "../api/agileplace.mjs";

export function registerScoringTools(mcp) {
  mcp.registerTool(
    "listScoringTemplates",
    {
      description:
        "List scoring templates for a board (WSJF, org, and board-level). Returns id, title, description, metrics (label, weight, abbreviation, isInverted).",
      inputSchema: {
        boardId: z.string(),
      },
    },
    wrapToolHandler("listScoringTemplates", async ({ boardId }) => {
      const templates = await listScoringTemplatesApi(boardId);
      const list = Array.isArray(templates) ? templates : [];
      return respondText(
        `Board ${boardId}: ${list.length} scoring template(s)`,
        JSON.stringify(list, null, 2)
      );
    })
  );

  mcp.registerTool(
    "getBoardScoring",
    {
      description:
        "Get current scoring session for a board: active template and card scores (scoreTotal, scoreOverride, confidenceTotal, per-metric scores).",
      inputSchema: {
        boardId: z.string(),
      },
    },
    wrapToolHandler("getBoardScoring", async ({ boardId }) => {
      const session = await getBoardScoringApi(boardId);
      return respondText(
        `Scoring session for board ${boardId}`,
        JSON.stringify(session, null, 2)
      );
    })
  );

  mcp.registerTool(
    "setScoringSession",
    {
      description:
        "Set the scoring session: which template and which cards are included. cardIds is exclusive — cards not in the list are removed from scoring.",
      inputSchema: {
        boardId: z.string(),
        templateId: z.string(),
        templateVersion: z.string(),
        cardIds: z.array(z.string()),
      },
    },
    wrapToolHandler(
      "setScoringSession",
      async ({ boardId, templateId, templateVersion, cardIds }) => {
        await setScoringSessionApi(boardId, templateId, templateVersion, cardIds);
        return respondText(
          `Scoring session set for board ${boardId}: template ${templateId} v${templateVersion}, ${cardIds.length} card(s).`
        );
      }
    )
  );

  mcp.registerTool(
    "updateCardScore",
    {
      description:
        "Update the STAGED score for a card. Include scoreTotal and scores (array of { metricId, score, confidence? }). Call applyScoringToCards to persist.",
      inputSchema: {
        boardId: z.string(),
        cardId: z.string(),
        scoreTotal: z.number(),
        scoreOverride: z.number().nullable().optional(),
        confidenceTotal: z.number().optional(),
        scores: z.array(
          z.object({
            metricId: z.string(),
            score: z.number(),
            confidence: z.number().optional(),
          })
        ),
      },
    },
    wrapToolHandler(
      "updateCardScore",
      async ({ boardId, cardId, scoreTotal, scoreOverride, confidenceTotal, scores }) => {
        const payload = {
          scoreTotal,
          scores,
        };
        if (scoreOverride !== undefined) payload.scoreOverride = scoreOverride;
        if (confidenceTotal !== undefined) payload.confidenceTotal = confidenceTotal;
        await updateCardScoreApi(boardId, cardId, payload);
        return respondText(
          `Staged score updated for card ${cardId} (total: ${scoreTotal}). Call applyScoringToCards to persist.`
        );
      }
    )
  );

  mcp.registerTool(
    "applyScoringToCards",
    {
      description: "Apply staged scores to the actual cards so they appear on the board.",
      inputSchema: {
        boardId: z.string(),
        cardIds: z.array(z.string()),
      },
    },
    wrapToolHandler("applyScoringToCards", async ({ boardId, cardIds }) => {
      await applyScoringToCardsApi(boardId, cardIds);
      return respondText(
        `Applied scoring to ${cardIds.length} card(s) on board ${boardId}.`
      );
    })
  );

  mcp.registerTool(
    "deleteCardScores",
    {
      description: "Remove applied scores from the specified cards (DELETE with body).",
      inputSchema: {
        boardId: z.string(),
        cardIds: z.array(z.string()),
      },
    },
    wrapToolHandler("deleteCardScores", async ({ boardId, cardIds }) => {
      await deleteCardScoresApi(boardId, cardIds);
      return respondText(
        `Deleted scores for ${cardIds.length} card(s) on board ${boardId}.`
      );
    })
  );
}
