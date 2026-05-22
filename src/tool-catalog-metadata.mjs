/**
 * Optional catalog metadata keyed by tool name. Auto-generated entries from MCP
 * registration are merged with these fields (category, tags, examples).
 */
export const TOOL_CATALOG_METADATA = {
  batchCreateCards: { category: "cards", tags: ["batch"] },
  batchUpdateCards: { category: "cards", tags: ["batch"] },
  bulkUpdateCards: { category: "cards", tags: ["bulk"] },
  bulkMoveCardsToLane: { category: "cards", tags: ["bulk"] },
  setupCardTypes: {
    category: "cardTypes",
    tags: ["composite"],
    example: "Create types additively; set deleteStockTypes + confirmDeleteStockTypes only to remove stock types.",
  },
  createCardDependency: { category: "dependencies" },
  getCardRelationships: { category: "connections" },
  listToolCatalog: { category: "utility" },
};
