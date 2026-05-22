import { toJsonSchemaCompat } from "@modelcontextprotocol/sdk/server/zod-json-schema-compat.js";
import { normalizeObjectSchema } from "@modelcontextprotocol/sdk/server/zod-compat.js";
import { TOOL_CATALOG_METADATA } from "./tool-catalog-metadata.mjs";

const CATEGORY_ORDER = [
  "cards",
  "lanes",
  "boards",
  "cardTypes",
  "connections",
  "dependencies",
  "hierarchy",
  "planning",
  "tags",
  "comments",
  "attachments",
  "automations",
  "scoring",
  "okr",
  "reporting",
  "users",
  "utility",
  "other",
];

function inferCategory(name) {
  if (/^okr/i.test(name) || name === "linkObjectiveToCard") return "okr";
  if (/CardType/i.test(name) || name === "setupCardTypes") return "cardTypes";
  if (/Lane|BoardLayout|cloneBoardLayout/i.test(name)) return "lanes";
  if (
    /Board/i.test(name) &&
    !/Planning|Increment|Series/i.test(name)
  ) {
    return "boards";
  }
  if (/Planning|Increment|Series/i.test(name)) return "planning";
  if (/Tag/i.test(name)) return "tags";
  if (/Comment/i.test(name)) return "comments";
  if (/Attachment/i.test(name)) return "attachments";
  if (/Automation/i.test(name)) return "automations";
  if (/Scor/i.test(name)) return "scoring";
  if (/User/i.test(name) || name === "getCurrentUser") return "users";
  if (
    /^(connect|getCardChildren|listCardChildren|deleteCardConnections|getCardRelationships)/.test(
      name
    )
  ) {
    return "connections";
  }
  if (/Dependency/i.test(name)) return "dependencies";
  if (/Hierarchy|Epic|linkHierarchy/i.test(name)) return "hierarchy";
  if (/Report|Statistics|Activity|Throughput|Bottleneck|Wip/i.test(name)) {
    return "reporting";
  }
  if (name === "checkHealth" || name === "listAccounts" || name === "listToolCatalog") {
    return "utility";
  }
  if (
    /Card/i.test(name) ||
    name === "assignUsersToCards" ||
    name === "assignLaneCardsToIncrement" ||
    name === "distributeCardsAcrossLanes"
  ) {
    return "cards";
  }
  return "other";
}

function schemaToJson(tool) {
  const obj = normalizeObjectSchema(tool?.inputSchema);
  if (!obj) return undefined;
  try {
    return toJsonSchemaCompat(obj, { strictUnions: true, pipeStrategy: "input" });
  } catch {
    return undefined;
  }
}

/**
 * Build catalog from MCP server's registered tools (after all registerTool calls).
 * @returns {Record<string, Array<{ name: string, description: string, inputSchema?: object, tags?: string[], example?: string }>>}
 */
export function buildToolCatalog(mcp) {
  const registered = mcp?._registeredTools ?? {};
  const entries = [];

  for (const [name, tool] of Object.entries(registered)) {
    if (tool?.enabled === false) continue;
    const meta = TOOL_CATALOG_METADATA[name] ?? {};
    entries.push({
      name,
      description: tool.description ?? "",
      inputSchema: schemaToJson(tool),
      category: meta.category ?? inferCategory(name),
      tags: meta.tags,
      example: meta.example,
    });
  }

  entries.sort((a, b) => a.name.localeCompare(b.name));

  const grouped = {};
  for (const entry of entries) {
    const cat = entry.category || "other";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(entry);
  }

  return grouped;
}

/** @deprecated Use buildToolCatalog(mcp) at runtime. Kept for tests that import TOOL_CATALOG shape. */
export function catalogToFlatList(catalog) {
  return Object.values(catalog).flat().map(e => e.name);
}

export function formatToolCatalogText(catalog) {
  const lines = [
    "AgilePlace MCP tool index (auto-generated from registered tools; batch* = per-card/parallel; bulk* = shared op on many cards):",
  ];

  const categories = [
    ...CATEGORY_ORDER.filter(c => catalog[c]?.length),
    ...Object.keys(catalog).filter(c => !CATEGORY_ORDER.includes(c)).sort(),
  ];

  let total = 0;
  for (const category of categories) {
    const tools = catalog[category] || [];
    total += tools.length;
    const names = tools.map(t => t.name).join(", ");
    lines.push(`\n${category} (${tools.length}): ${names}`);
  }

  lines.push(`\nTotal registered: ${total}`);
  return lines.join("\n");
}
