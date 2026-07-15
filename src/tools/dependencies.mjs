import { z } from "zod";
import { respondText, wrapToolHandler } from "../helpers.mjs";
import {
  createCardDependencyApi,
  updateCardDependencyApi,
  deleteCardDependencyApi,
  DEPENDENCY_TIMING_VALUES,
} from "../api/agileplace.mjs";
import { MAX_BULK_IDS } from "../limits.mjs";

const dependencyTimingSchema = z.enum(DEPENDENCY_TIMING_VALUES);

const dependencyUpdateSchema = z.object({
  cardId: z.string().describe("Card that has the dependency"),
  dependsOnCardId: z.string().describe("Card that must complete/start before cardId can proceed"),
  timing: dependencyTimingSchema.optional().describe("Dependency timing (default finishToStart)"),
});

export function registerDependencyTools(mcp) {
  mcp.registerTool(
    "createCardDependency",
    {
      description: "Create a dependency relationship between cards. Use when one card blocks or depends on another.",
      inputSchema: {
        cardId: z.string(),
        dependsOnCardId: z.string(),
        timing: dependencyTimingSchema.optional(),
      },
    },
    wrapToolHandler("createCardDependency", async ({ cardId, dependsOnCardId, timing = "finishToStart" }) => {
      await createCardDependencyApi(cardId, dependsOnCardId, timing);
      return respondText(
        `Dependency created: Card ${cardId} now depends on Card ${dependsOnCardId} (${timing})`
      );
    })
  );

  mcp.registerTool(
    "updateCardDependency",
    {
      description:
        "Update timing on one or more card dependencies (PATCH /io/card/dependency). Each update needs cardId, dependsOnCardId, and timing.",
      inputSchema: {
        updates: z.array(dependencyUpdateSchema).min(1).max(MAX_BULK_IDS),
      },
    },
    wrapToolHandler("updateCardDependency", async ({ updates }) => {
      const result = await updateCardDependencyApi(updates);
      return respondText(
        `Updated ${updates.length} dependency relationship(s)`,
        JSON.stringify(result, null, 2)
      );
    })
  );

  mcp.registerTool(
    "deleteCardDependency",
    {
      description:
        "Remove dependency links between cards (DELETE /io/card/dependency). Unlinks each cardId from each dependsOnCardId in the cross product.",
      inputSchema: {
        cardIds: z.array(z.string()).min(1).max(MAX_BULK_IDS).describe("Cards to unlink from dependencies"),
        dependsOnCardIds: z
          .array(z.string())
          .min(1)
          .max(MAX_BULK_IDS)
          .describe("Dependency target cards to unlink from cardIds"),
      },
    },
    wrapToolHandler("deleteCardDependency", async ({ cardIds, dependsOnCardIds }) => {
      const result = await deleteCardDependencyApi({ cardIds, dependsOnCardIds });
      return respondText(
        `Deleted dependencies for ${cardIds.length} card(s)`,
        JSON.stringify(result, null, 2)
      );
    })
  );
}
