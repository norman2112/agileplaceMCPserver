import { z } from "zod";
import { CONFIG } from "../config.mjs";
import { respondText, wrapToolHandler, fetchWithTimeout } from "../helpers.mjs";
import { getIoPath, formatFetchError, updateCardDependencyApi, deleteCardDependencyApi } from "../api/agileplace.mjs";

const { API_BASE, HEADERS } = CONFIG;

export function registerDependencyTools(mcp) {
  // Create card dependency
  mcp.registerTool(
    "create_card_dependency",
    {
      description: "Create a dependency relationship between cards. Use when one card blocks or depends on another.",
      inputSchema: {
        cardId: z.string(),
        dependsOnCardId: z.string(),
        timing: z.enum(["finishToStart", "startToStart", "startToFinish", "finishToFinish"]).optional(),
      },
    },
    wrapToolHandler("create_card_dependency", async ({ cardId, dependsOnCardId, timing = "finishToStart" }) => {
      try {
        const ioPath = getIoPath();
        const resp = await fetchWithTimeout(`${API_BASE}${ioPath}/card/dependency`, {
          method: "POST",
          headers: HEADERS,
          body: JSON.stringify({
            cardIds: [String(cardId)],
            dependsOnCardIds: [String(dependsOnCardId)],
            timing,
          }),
        });

        if (!resp.ok) {
          const text = await resp.text();
          throw new Error(formatFetchError(resp, "Create card dependency", text));
        }

        return respondText(
          `Dependency created: Card ${cardId} now depends on Card ${dependsOnCardId} (${timing})`
        );
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error creating dependency: ${error.message}`,
          }],
          isError: true,
        };
      }
    })
  );

  // Update card dependency
  mcp.registerTool(
    "updateCardDependency",
    {
      description: "Update an existing dependency relationship between cards. Pass the payload expected by PATCH /io/card/dependency.",
      inputSchema: {
        payload: z.any(),
      },
    },
    wrapToolHandler("updateCardDependency", async ({ payload }) => {
      const result = await updateCardDependencyApi(payload);
      return respondText(
        "Updated card dependency",
        JSON.stringify(result, null, 2)
      );
    })
  );

  // Delete card dependency
  mcp.registerTool(
    "deleteCardDependency",
    {
      description: "Delete a dependency relationship between cards. Pass the payload expected by DELETE /io/card/dependency.",
      inputSchema: {
        payload: z.any(),
      },
    },
    wrapToolHandler("deleteCardDependency", async ({ payload }) => {
      const result = await deleteCardDependencyApi(payload);
      return respondText(
        "Deleted card dependency",
        JSON.stringify(result, null, 2)
      );
    })
  );
}
