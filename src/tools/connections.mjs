import { z } from "zod";
import { respondText, wrapToolHandler } from "../helpers.mjs";
import { connectExistingCards, getCardDependencies, getConnectionParents, getConnectionChildren, getCardById, toParentChildSummary, deleteCardConnectionsApi } from "../api/agileplace.mjs";

export function registerConnectionTools(mcp) {
  // Connect existing cards
  mcp.registerTool(
    "connectExistingCards",
    {
      description:
        "Connect existing cards as parent → children. Works cross-board without extra steps (children may be on different boards than the parent). Optional boardId is ignored by the API (documentation only).",
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
    "getCardRelationships",
    {
      description:
        "Get all relationships for a card: dependencies (upstream/downstream) and parent-child connections. Parent/child includes boardId/boardTitle when returned by the API (cross-board children are included).",
      inputSchema: {
        cardId: z.string(),
        includeFaces: z.boolean().optional(),
        boardId: z.string().optional(),
      },
    },
    wrapToolHandler("getCardRelationships", async ({ cardId, includeFaces = true, boardId: _boardId }) => {
      const [depResponse, parentCards, childCards] = await Promise.all([
        getCardDependencies(cardId, includeFaces),
        getConnectionParents(cardId),
        getConnectionChildren(cardId),
      ]);
      const { dependencies } = depResponse;

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

      const parents = parentCards.map(p => toParentChildSummary(p, "parent of this card"));
      const children = childCards.map(c => toParentChildSummary(c, "child of this card"));
      const totalRelationships = upstream.length + downstream.length + parents.length + children.length;

      return respondText(
        `Card ${cardId}: ${totalRelationships} relationship(s)`,
        JSON.stringify(
          {
            cardId,
            dependencies: {
              upstream,
              downstream,
              total: upstream.length + downstream.length,
            },
            parentChild: { parents, children },
            totalRelationships,
          },
          null,
          2
        )
      );
    })
  );

  mcp.registerTool(
    "listCardChildren",
    {
      description:
        "List all child cards for a parent with board context (boardId, boardTitle when available). Cross-board children are included. Alias behavior matches getCardChildren.",
      inputSchema: {
        cardId: z.string(),
        includeFaces: z.boolean().optional(),
      },
    },
    wrapToolHandler("listCardChildren", async ({ cardId }) => {
      const childCards = await getConnectionChildren(cardId);
      const children = childCards.map(c => toParentChildSummary(c, "child"));
      return respondText(
        `${children.length} child card(s) for parent ${cardId}`,
        JSON.stringify({ parentCardId: cardId, children, childCount: children.length }, null, 2)
      );
    })
  );

  // Get card children (lightweight child lookup)
  mcp.registerTool(
    "getCardChildren",
    {
      description:
        "Fetch children of a card (id, title, cardType, laneId, boardId). Prefer listCardChildren for full parent-child summaries with board context.",
      inputSchema: {
        cardId: z.string(),
        includeFaces: z.boolean().optional(),
        boardId: z.string().optional(),
      },
    },
    wrapToolHandler("getCardChildren", async ({ cardId, includeFaces: _includeFaces = false, boardId: _boardId }) => {
      const [parentCard, childCards] = await Promise.all([
        getCardById(cardId),
        getConnectionChildren(cardId),
      ]);

      const parentTitle = parentCard?.title ?? "";

      const children = childCards.map(c => {
        const summary = toParentChildSummary(c, "child");
        return {
          id: summary.id,
          title: summary.title,
          cardType: summary.cardType,
          laneId: summary.laneId,
          boardId: summary.boardId,
          boardTitle: summary.boardTitle,
          plannedStartDate: summary.plannedStartDate,
          plannedFinishDate: summary.plannedFinishDate,
        };
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
