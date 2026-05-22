#!/usr/bin/env node
/**
 * Local checks for audit fixes (no live AgilePlace API required).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { withAccountContext } from "../src/account-context.mjs";
import { registerBoardTools } from "../src/tools/boards.mjs";
import { registerCardTools } from "../src/tools/cards.mjs";
import { registerCardTypeTools } from "../src/tools/card-types.mjs";
import { registerLaneTools } from "../src/tools/lanes.mjs";
import { registerConnectionTools } from "../src/tools/connections.mjs";
import { registerDependencyTools } from "../src/tools/dependencies.mjs";
import { registerTagTools } from "../src/tools/tags.mjs";
import { registerCommentTools } from "../src/tools/comments.mjs";
import { registerAttachmentTools } from "../src/tools/attachments.mjs";
import { registerAutomationTools } from "../src/tools/automations.mjs";
import { registerScoringTools } from "../src/tools/scoring.mjs";
import { registerHierarchyTools } from "../src/tools/hierarchy.mjs";
import { registerOkrTools } from "../src/tools/okr.mjs";
import { registerPlanningTools } from "../src/tools/planning.mjs";
import { registerUserTools } from "../src/tools/users.mjs";
import { registerReportingTools } from "../src/tools/reporting.mjs";
import { registerUtilityTools } from "../src/tools/utility.mjs";
import { buildToolCatalog, catalogToFlatList } from "../src/tool-catalog.mjs";
import { assertValidAttachmentFileName } from "../src/api/agileplace.mjs";

function patchRegisterTool(mcp) {
  const originalRegisterTool = mcp.registerTool.bind(mcp);
  mcp.registerTool = (name, config, handler) => {
    const originalSchema =
      config?.inputSchema && typeof config.inputSchema === "object"
        ? config.inputSchema
        : {};
    const hasAccountField = Object.prototype.hasOwnProperty.call(originalSchema, "account");
    const inputSchema = hasAccountField
      ? originalSchema
      : { ...originalSchema, account: z.string().optional() };
    return originalRegisterTool(
      name,
      { ...config, inputSchema },
      async (input = {}, ...rest) =>
        withAccountContext(input?.account || "default", () => handler(input, ...rest))
    );
  };
}

const mcp = new McpServer({ name: "agileplace", version: "1.5.1" });
patchRegisterTool(mcp);
registerBoardTools(mcp);
registerCardTools(mcp);
registerCardTypeTools(mcp);
registerLaneTools(mcp);
registerConnectionTools(mcp);
registerDependencyTools(mcp);
registerTagTools(mcp);
registerCommentTools(mcp);
registerAttachmentTools(mcp);
registerAutomationTools(mcp);
registerScoringTools(mcp);
registerHierarchyTools(mcp);
registerOkrTools(mcp);
registerPlanningTools(mcp);
registerUserTools(mcp);
registerReportingTools(mcp);
registerUtilityTools(mcp, { healthServer: null });

const registered = Object.keys(mcp._registeredTools).sort();
const catalog = buildToolCatalog(mcp);
const catalogNames = catalogToFlatList(catalog).sort();

console.log("Registered tools:", registered.length);
console.log("Catalog tools:", catalogNames.length);

const missingInCatalog = registered.filter(n => !catalogNames.includes(n));
const extraInCatalog = catalogNames.filter(n => !registered.includes(n));
if (missingInCatalog.length) {
  console.error("Missing from catalog:", missingInCatalog);
  process.exit(1);
}
if (extraInCatalog.length) {
  console.error("Extra in catalog:", extraInCatalog);
  process.exit(1);
}

for (const name of ["createCardDependency", "getCardRelationships", "listToolCatalog", "setupCardTypes"]) {
  if (!registered.includes(name)) {
    console.error(`Expected tool not registered: ${name}`);
    process.exit(1);
  }
}
for (const bad of ["create_card_dependency", "get_card_relationships", "get_board_dependency_graph"]) {
  if (registered.includes(bad)) {
    console.error(`Snake_case tool still registered: ${bad}`);
    process.exit(1);
  }
}

// Filename validation
let threw = false;
try {
  assertValidAttachmentFileName('bad"name.txt');
} catch (e) {
  threw = true;
  if (!/forbidden/i.test(e.message)) {
    console.error("Unexpected filename error:", e.message);
    process.exit(1);
  }
}
if (!threw) {
  console.error("Expected filename validation to throw");
  process.exit(1);
}

// Multipart: FormData + Blob round-trip (no live API)
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const form = new FormData();
form.append("description", "desc");
form.append("file", new Blob([png], { type: "image/png" }), "test.png");
if (!(form instanceof FormData)) {
  console.error("FormData construction failed");
  process.exit(1);
}
const textBody = Buffer.from("hello", "utf8");
const textForm = new FormData();
textForm.append("file", new Blob([textBody], { type: "text/plain" }), "hello.txt");
if (String(new Blob([textBody]).size) !== String(textBody.length)) {
  console.error("Blob size mismatch for text content");
  process.exit(1);
}

console.log("All local audit-fix checks passed.");
