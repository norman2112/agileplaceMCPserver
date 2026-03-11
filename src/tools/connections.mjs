import { z } from "zod";
import { respondText, wrapToolHandler } from "../helpers.mjs";
import { connectExistingCards, getCardDependencies, getConnectionParents, getConnectionChildren, getCardById, toParentChildSummary, deleteCardConnectionsApi } from "../api/agileplace.mjs";

export function registerConnectionTools(mcp) {
  // Connect existing cards
  mcp.registerTool(
    "connectExistingCards",
    {
      description: "Connect existing cards by creating parent-child relationships. Provide a parent card ID and an array of child card IDs. Optional boardId for context (not used by API).",
      inputSchema: {
        parentCardId: z.string(),
        childCardIds: z.array(z.string()),
        boardId: z.string().optional(),
      },
    },
    wrapToolHandler("connectExistingCards", async ({ parentCardId, childCardIds, boardId: _boardId }) => {
      const result = await connectExistingCards(parentCardId, childCardIds);

      return respondText(
        `Connected ${childCardIds.length} child card(s) to parent card ${parentCardId}`,
        `Details:\n${JSON.stringify(
          {
            parent: result.card,
            connections: result.connections,
          },
          null,
          2
        )}`
      );
    })
  );

  // Get card relationships (dependencies and parent-child)
  mcp.registerTool(
    "get_card_relationships",
    {
      description: "Get all relationships and dependencies for a specific card. Returns upstream dependencies (what blocks this card), downstream dependencies (what this card blocks), parent cards with full details (id, title, cardType, laneId, tags), and child cards with full details.",
      inputSchema: {
        cardId: z.string(),
        includeFaces: z.boolean().optional(),
        boardId: z.string().optional(),
      },
    },
    wrapToolHandler("get_card_relationships", async ({ cardId, includeFaces = true, boardId: _boardId }) => {
      try {
        // Fetch dependencies, parents, and children in parallel
        const [depResponse, parentCards, childCards] = await Promise.all([
          getCardDependencies(cardId, includeFaces),
          getConnectionParents(cardId),
          getConnectionChildren(cardId),
        ]);
        const { dependencies } = depResponse;

        // Transform dependencies to more useful format
        const upstream = (dependencies || [])
          .filter(d => d.direction === "incoming")
          .map(d => ({
            cardId: d.cardId,
            title: d.face?.title,
            timing: d.timing,
            relationship: "blocks this card",
            createdOn: d.createdOn,
            details: d.face,
          }));

        const downstream = (dependencies || [])
          .filter(d => d.direction === "outgoing")
          .map(d => ({
            cardId: d.cardId,
            title: d.face?.title,
            timing: d.timing,
            relationship: "blocked by this card",
            createdOn: d.createdOn,
            details: d.face,
          }));

        // Map parents and children to full summary format (id, title, cardType, laneId, relationship)
        const parents = parentCards.map(p => toParentChildSummary(p, "parent of this card"));
        const children = childCards.map(c => toParentChildSummary(c, "child of this card"));

        const totalRelationships = upstream.length + downstream.length + parents.length + children.length;

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              cardId,
              dependencies: {
                upstream,
                downstream,
                total: upstream.length + downstream.length,
              },
              parentChild: {
                parents,
                children,
              },
              totalRelationships,
            }, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error fetching relationships: ${error.message}`,
          }],
          isError: true,
        };
      }
    })
  );

  // Get card children (lightweight child lookup)
  mcp.registerTool(
    "getCardChildren",
    {
      description: "Fetch just the children of a given card. Returns parent info and child cards with id, title, cardType, laneId, and optional dates. Useful for cascade workflows and hierarchy traversal.",
      inputSchema: {
        cardId: z.string(),
        includeFaces: z.boolean().optional(),
        boardId: z.string().optional(),
      },
    },
    wrapToolHandler("getCardChildren", async ({ cardId, includeFaces = false, boardId: _boardId }) => {
      const [parentCard, childCards] = await Promise.all([
        getCardById(cardId),
        getConnectionChildren(cardId),
      ]);

      const parentTitle = parentCard?.title ?? "";

      const children = childCards.map(c => {
        const cardType = c.type?.title ?? c.type?.name ?? c.cardType?.name ?? c.cardType?.title ?? "";
        const child = {
          id: String(c.id ?? ""),
          title: c.title ?? "",
          cardType: String(cardType),
        };
        const laneId = c.laneId ?? c.lane?.id;
        if (laneId) child.laneId = String(laneId);
        if (c.plannedStart) child.plannedStartDate = c.plannedStart;
        if (c.plannedFinish) child.plannedFinishDate = c.plannedFinish;
        return child;
      });

      const result = {
        parentCardId: cardId,
        parentTitle,
        children,
        childCount: children.length,
      };

      return {
        content: [{
          type: "text",
          text: JSON.stringify(result, null, 2),
        }],
      };
    })
  );

  // Delete card connections
  mcp.registerTool(
    "deleteCardConnections",
    {
      description: "Delete parent/child connections for one or more cards. Provide cardIds and optional connections object (e.g., { children: [ids], parents: [ids] }).",
      inputSchema: {
        cardIds: z.array(z.string()),
        connections: z
          .object({
            children: z.array(z.string()).optional(),
            parents: z.array(z.string()).optional(),
          })
          .optional(),
      },
    },
    wrapToolHandler("deleteCardConnections", async ({ cardIds, connections }) => {
      const result = await deleteCardConnectionsApi(cardIds, connections);
      return respondText(
        `Deleted connections for ${cardIds.length} card(s)`,
        JSON.stringify(result, null, 2)
      );
    })
  );
}
