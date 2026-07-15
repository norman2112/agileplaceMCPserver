import { z } from "zod";
import { respondText, wrapToolHandler } from "../helpers.mjs";
import { CONFIG } from "../config.mjs";
import {
  addCardTags as addCardTagsApi,
  removeCardTags as removeCardTagsApi,
  setCardTags as setCardTagsApi,
  listCards,
} from "../api/agileplace.mjs";
import { MAX_TAG_VALUES } from "../limits.mjs";

const { DEFAULT_BOARD_ID } = CONFIG;

export function registerTagTools(mcp) {
  mcp.registerTool(
    "listTagsOnBoard",
    {
      description:
        "List distinct tags used on cards on a board (paginates listCards). Use before adding tags to avoid typos.",
      inputSchema: {
        boardId: z.string().optional(),
        maxPages: z.number().int().min(1).max(50).optional(),
      },
    },
    wrapToolHandler("listTagsOnBoard", async ({ boardId, maxPages }) => {
      const resolvedBoardId = boardId || DEFAULT_BOARD_ID;
      if (!resolvedBoardId) throw new Error('Board ID is required. Provide "boardId".');
      const tagSet = new Set();
      const limit = 200;
      const pages = maxPages ?? 25;
      for (let page = 0; page < pages; page++) {
        const offset = page * limit;
        const resp = await listCards(resolvedBoardId, { limit, offset });
        const cards = resp.cards || [];
        for (const c of cards) {
          for (const t of c.tags || []) tagSet.add(String(t));
        }
        const total = resp.pageMeta?.totalRecords ?? offset + cards.length;
        if (offset + limit >= total || cards.length === 0) break;
      }
      const tags = [...tagSet].sort();
      return respondText(
        `Found ${tags.length} distinct tag(s) on board ${resolvedBoardId}`,
        JSON.stringify({ boardId: resolvedBoardId, tags }, null, 2)
      );
    })
  );

  // Add tags to a single card
  mcp.registerTool(
    "addCardTags",
    {
      description:
        "APPENDS tags to a card without removing existing tags. Duplicates are deduped. Uses JSON Patch add on /tags/-.",
      inputSchema: {
        cardId: z.string(),
        tags: z.array(z.string()).max(MAX_TAG_VALUES),
      },
    },
    wrapToolHandler("addCardTags", async ({ cardId, tags }) => {
      const updated = await addCardTagsApi(cardId, tags);
      return respondText(
        `Added tag(s) to card ${cardId}`,
        `Tags now: ${JSON.stringify(updated.tags || [])}`
      );
    })
  );

  // Remove tags from a single card
  mcp.registerTool(
    "removeCardTags",
    {
      description:
        "Removes specified tags from a card. Other tags are preserved. Uses JSON Patch remove for each tag value.",
      inputSchema: {
        cardId: z.string(),
        tags: z.array(z.string()).max(MAX_TAG_VALUES),
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
        "REPLACES all tags on a card with the provided list. Any existing tags not in the new list are removed. For additive changes use addCardTags; to drop specific tags use removeCardTags.",
      inputSchema: {
        cardId: z.string(),
        tags: z.array(z.string()).max(MAX_TAG_VALUES),
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
        "APPENDS tags to multiple cards in one call. Each item has cardId and tags array. Duplicates are deduped per card. Returns per-card success/failure.",
      inputSchema: {
        updates: z.array(
          z.object({
            cardId: z.string(),
            tags: z.array(z.string()).max(MAX_TAG_VALUES),
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

  mcp.registerTool(
    "batchSetCardTags",
    {
      description:
        "REPLACES tags on multiple cards in one call. Destructive — any existing tags not in the new list are removed. Same shape as batchAddCardTags: updates: [{ cardId, tags }, ...]. Returns per-card success/failure.",
      inputSchema: {
        updates: z.array(
          z.object({
            cardId: z.string(),
            tags: z.array(z.string()).max(MAX_TAG_VALUES),
          })
        ),
      },
    },
    wrapToolHandler("batchSetCardTags", async ({ updates }) => {
      const results = await Promise.allSettled(
        updates.map(async ({ cardId, tags }) => {
          try {
            await setCardTagsApi(cardId, tags);
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
      const failureCount = parsed.length - successCount;

      return respondText(
        `Batch set tags: ${successCount} succeeded, ${failureCount} failed`,
        `Results:\n${JSON.stringify(parsed, null, 2)}`
      );
    })
  );

  mcp.registerTool(
    "batchRemoveCardTags",
    {
      description:
        "Removes specified tags from each of several cards in one call; other tags on those cards are preserved. Same shape as batchAddCardTags. Returns per-card success/failure.",
      inputSchema: {
        updates: z.array(
          z.object({
            cardId: z.string(),
            tags: z.array(z.string()).max(MAX_TAG_VALUES),
          })
        ),
      },
    },
    wrapToolHandler("batchRemoveCardTags", async ({ updates }) => {
      const results = await Promise.allSettled(
        updates.map(async ({ cardId, tags }) => {
          try {
            await removeCardTagsApi(cardId, tags);
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
      const failureCount = parsed.length - successCount;

      return respondText(
        `Batch remove tags: ${successCount} succeeded, ${failureCount} failed`,
        `Results:\n${JSON.stringify(parsed, null, 2)}`
      );
    })
  );
}
