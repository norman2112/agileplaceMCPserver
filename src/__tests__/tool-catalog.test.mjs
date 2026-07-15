import { describe, it, expect } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { buildToolCatalog, catalogToFlatList } from "../tool-catalog.mjs";
import { registerDependencyTools } from "../tools/dependencies.mjs";
import { registerUtilityTools } from "../tools/utility.mjs";

describe("buildToolCatalog", () => {
  it("lists every registered tool", () => {
    const mcp = new McpServer({ name: "test", version: "0" });
    const originalRegisterTool = mcp.registerTool.bind(mcp);
    mcp.registerTool = (name, config, handler) => {
      const schema = config?.inputSchema && typeof config.inputSchema === "object" ? config.inputSchema : {};
      return originalRegisterTool(name, { ...config, inputSchema: { ...schema, account: z.string().optional() } }, handler);
    };
    registerDependencyTools(mcp);
    registerUtilityTools(mcp, { healthServer: null });

    const registered = Object.keys(mcp._registeredTools).sort();
    const catalog = buildToolCatalog(mcp);
    const catalogNames = catalogToFlatList(catalog).sort();

    expect(catalogNames).toEqual(registered);
    expect(catalogNames.length).toBeGreaterThan(0);
  });
});
