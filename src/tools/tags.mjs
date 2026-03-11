import { z } from "zod";
import { respondText, wrapToolHandler } from "../helpers.mjs";
import {
  addCardTags as addCardTagsApi,
  removeCardTags as removeCardTagsApi,
  setCardTags as setCardTagsApi,
} from "../api/agileplace.mjs";

export function registerTagTools(mcp) {
  // Add tags to a single card
  mcp.registerTool(
    "addCardTags",
    {
      description: "Add one or more tags to a single card.",
      inputSchema: {
        cardId: z.string(),
        tags: z.array(z.string()),
      },
    },
    wrapToolHandler("addCardTags", async ({ cardId, tags }) => {
      const updated = await addCardTagsApi(cardId, tags);
      return respondText(
        `Added ${tags.length} tag(s) to card ${cardId}`,
        `Tags now: ${JSON.stringify(updated.tags || [])}`
      );
    })
  );

  // Remove tags from a single card
  mcp.registerTool(
    "removeCardTags",
    {
      description: "Remove one or more tags from a single card.",
      inputSchema: {
        cardId: z.string(),
        tags: z.array(z.string()),
      },
    },
    wrapToolHandler("removeCardTags", async ({ cardId, tags }) => {
      const updated = await removeCardTagsApi(cardId, tags);
      return respondText(
        `Removed ${tags.length} tag(s) from card ${cardId}`,
        `Tags now: ${JSON.stringify(updated.tags || [])}`
      );
    })
  );

  // Set (replace) all tags on a card
  mcp.registerTool(
    "setCardTags",
    {
      description:
        "Replace all tags on a card. Use addCardTags to add or removeCardTags to remove individual tags.",
      inputSchema: {
        cardId: z.string(),
        tags: z.array(z.string()),
      },
    },
    wrapToolHandler("setCardTags", async ({ cardId, tags }) => {
      const updated = await setCardTagsApi(cardId, tags);
      return respondText(
        `Set tags on card ${cardId}`,
        `Tags now: ${JSON.stringify(updated.tags || [])}`
      );
    })
  );

  // Batch add tags to multiple cards
  mcp.registerTool(
    "batchAddCardTags",
    {
      description:
        "Add tags to multiple cards in one call. Each item has cardId and tags array. Returns per-card success/failure.",
      inputSchema: {
        updates: z.array(
          z.object({
            cardId: z.string(),
            tags: z.array(z.string()),
          })
        ),
      },
    },
    wrapToolHandler("batchAddCardTags", async ({ updates }) => {
      const results = await Promise.allSettled(
        updates.map(async ({ cardId, tags }) => {
          try {
            await addCardTagsApi(cardId, tags);
            return { cardId, success: true };
          } catch (err) {
            return { cardId, success: false, error: err.message };
          }
        })
      );

      const parsed = results.map((r, i) => {
        if (r.status === "fulfilled") return r.value;
        return {
          cardId: updates[i]?.cardId ?? "?",
          success: false,
          error: r.reason?.message ?? String(r.reason),
        };
      });

      const successCount = parsed.filter(p => p.success).length;
      const failureCount = parsed.filter(p => !p.success).length;

      return respondText(
        `Batch add tags: ${successCount} succeeded, ${failureCount} failed`,
        `Results:\n${JSON.stringify(parsed, null, 2)}`
      );
    })
  );
}

