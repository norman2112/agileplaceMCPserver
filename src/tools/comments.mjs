import { z } from "zod";
import { respondText, wrapToolHandler } from "../helpers.mjs";
import {
  createCardCommentApi,
  getCardCommentsApi,
  updateCardCommentApi,
  deleteCardCommentApi,
} from "../api/agileplace.mjs";

export function registerCommentTools(mcp) {
  // Create a comment on a card
  mcp.registerTool(
    "createCardComment",
    {
      description: "Create a new comment on a card.",
      inputSchema: {
        cardId: z.string(),
        text: z.string(),
      },
    },
    wrapToolHandler("createCardComment", async ({ cardId, text }) => {
      const result = await createCardCommentApi(cardId, text);
      return respondText(
        `Created comment on card ${cardId}`,
        JSON.stringify(result, null, 2)
      );
    })
  );

  // List comments on a card
  mcp.registerTool(
    "listCardComments",
    {
      description: "List comments on a card.",
      inputSchema: {
        cardId: z.string(),
      },
    },
    wrapToolHandler("listCardComments", async ({ cardId }) => {
      const result = await getCardCommentsApi(cardId);
      return respondText(
        `Comments for card ${cardId}`,
        JSON.stringify(result, null, 2)
      );
    })
  );

  // Update a comment
  mcp.registerTool(
    "updateCardComment",
    {
      description: "Update an existing comment on a card.",
      inputSchema: {
        cardId: z.string(),
        commentId: z.string(),
        text: z.string(),
      },
    },
    wrapToolHandler(
      "updateCardComment",
      async ({ cardId, commentId, text }) => {
        const result = await updateCardCommentApi(cardId, commentId, text);
        return respondText(
          `Updated comment ${commentId} on card ${cardId}`,
          JSON.stringify(result, null, 2)
        );
      }
    )
  );

  // Delete a comment
  mcp.registerTool(
    "deleteCardComment",
    {
      description: "Delete a comment from a card.",
      inputSchema: {
        cardId: z.string(),
        commentId: z.string(),
      },
    },
    wrapToolHandler(
      "deleteCardComment",
      async ({ cardId, commentId }) => {
        await deleteCardCommentApi(cardId, commentId);
        return respondText(
          `Deleted comment ${commentId} from card ${cardId}`
        );
      }
    )
  );

  // Batch create comments on multiple cards (with simple concurrency limiting)
  mcp.registerTool(
    "batchCreateComments",
    {
      description:
        "Create comments on multiple cards in parallel. Each item needs a cardId and text. Returns per-comment success/failure.",
      inputSchema: {
        comments: z.array(
          z.object({
            cardId: z.string(),
            text: z.string(),
          })
        ),
      },
    },
    wrapToolHandler("batchCreateComments", async ({ comments }) => {
      const items = Array.isArray(comments) ? comments : [];
      const CONCURRENCY = 5;
      const results = [];

      for (let i = 0; i < items.length; i += CONCURRENCY) {
        const chunk = items.slice(i, i + CONCURRENCY);
        const settled = await Promise.allSettled(
          chunk.map(async ({ cardId, text }) => {
            const created = await createCardCommentApi(cardId, text);
            return {
              cardId: String(cardId),
              success: true,
              commentId: created?.id != null ? String(created.id) : undefined,
            };
          })
        );

        settled.forEach((r, idx) => {
          const src = chunk[idx];
          if (r.status === "fulfilled") {
            results.push(r.value);
          } else {
            results.push({
              cardId: src?.cardId != null ? String(src.cardId) : "?",
              success: false,
              error: r.reason?.message ?? String(r.reason),
            });
          }
        });
      }

      const successCount = results.filter(r => r.success).length;
      const failureCount = results.length - successCount;

      return respondText(
        `Batch comments: ${successCount} succeeded, ${failureCount} failed`,
        `Results:\n${JSON.stringify(results, null, 2)}`
      );
    })
  );
}

