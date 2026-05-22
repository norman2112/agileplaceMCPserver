import { CONFIG } from "../config.mjs";
import { respondText, wrapToolHandler } from "../helpers.mjs";
import { getOkrRegion } from "../api/okr.mjs";
import { listAccountNames, getDefaultAccountName } from "../accounts.mjs";
import { buildToolCatalog, formatToolCatalogText } from "../tool-catalog.mjs";
import { PACKAGE_VERSION } from "../version.mjs";

export function registerUtilityTools(mcp, { healthServer } = {}) {
  mcp.registerTool(
    "checkHealth",
    {
      description: "Check the health status of the MCP server. Returns server configuration and status. Use this to verify the server is running correctly.",
      inputSchema: {},
    },
    wrapToolHandler("checkHealth", async () => {
      const {
        API_BASE, API_TOKEN, DEFAULT_BOARD_ID,
        OKR_BASE, OKR_CLIENT_ID, OKR_CLIENT_SECRET, OKR_TOKEN,
        MAX_CARDS, MAX_DESC, STORY_LIMIT, OKR_DEFAULT_LIMIT,
        FETCH_TIMEOUT_MS, OKR_FETCH_TIMEOUT_MS, PORT,
      } = CONFIG;

      const warnings = [];

      function safeHost(url) {
        if (!url) return null;
        try {
          return new URL(url).hostname;
        } catch {
          return null;
        }
      }

      const healthInfo = {
        ok: true,
        server: "agileplace-mcp",
        version: PACKAGE_VERSION,
        config: {
          agileplace: {
            apiHost: safeHost(API_BASE),
            hasApiBase: !!API_BASE,
            hasToken: !!API_TOKEN,
            defaultBoardId: DEFAULT_BOARD_ID || "not set",
          },
          okr: {
            apiHost: safeHost(OKR_BASE),
            hasApiBase: !!OKR_BASE,
            hasClientId: !!OKR_CLIENT_ID,
            hasClientSecret: !!OKR_CLIENT_SECRET,
            hasDirectToken: !!OKR_TOKEN,
            configured: !!(OKR_BASE && (OKR_TOKEN || (OKR_CLIENT_ID && OKR_CLIENT_SECRET))),
            region: OKR_BASE ? getOkrRegion() : "not set",
          },
          limits: {
            maxCards: MAX_CARDS,
            maxDesc: MAX_DESC,
            storyLimit: STORY_LIMIT,
            okrDefaultLimit: OKR_DEFAULT_LIMIT,
          },
          timeouts: {
            fetchTimeoutMs: FETCH_TIMEOUT_MS,
            okrFetchTimeoutMs: OKR_FETCH_TIMEOUT_MS,
          },
          server: {
            healthPort: PORT,
            healthServerEnabled: !!healthServer && healthServer.listening,
          },
        },
      };

      if (healthInfo.config.agileplace.defaultBoardId === "not set") {
        warnings.push("Warning: No default board is configured; provide boardId explicitly when required.");
      }
      if (!healthInfo.config.okr.configured) {
        warnings.push("Warning: OKR integration not configured. Set OKR_BASE_URL and (OKR_CLIENT_ID/OKR_CLIENT_SECRET) or OKR_TOKEN in Claude Desktop config or process environment variables");
      }

      return respondText(
        `MCP Server Health Check`,
        `Status: ${healthInfo.ok ? "Healthy" : "Unhealthy"}`,
        `Configuration:\n${JSON.stringify(healthInfo.config, null, 2)}`,
        warnings.length > 0 ? warnings.join("\n") : ""
      );
    })
  );

  mcp.registerTool(
    "listAccounts",
    {
      description:
        "List configured AgilePlace account aliases and which alias is default. Tool calls should reference these alias names (for example, \"default\"), not the underlying tenant URL.",
      inputSchema: {},
    },
    wrapToolHandler("listAccounts", async () => {
      const result = {
        accounts: listAccountNames(),
        default: getDefaultAccountName(),
      };
      return {
        structuredContent: result,
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    })
  );

  mcp.registerTool(
    "listToolCatalog",
    {
      description:
        "List AgilePlace MCP tools by category (Cards, Lanes, Planning, OKR, etc.). batch* tools run per-card or parallel; bulk* tools apply one operation to many cards via a single API call where supported.",
      inputSchema: {},
    },
    wrapToolHandler("listToolCatalog", async () => {
      const catalog = buildToolCatalog(mcp);
      const text = formatToolCatalogText(catalog);
      const tools = Object.values(catalog).flat();
      return respondText(
        "AgilePlace MCP tool catalog",
        text,
        `\nStructured index (${tools.length} tools):\n${JSON.stringify(tools.map(t => ({
          name: t.name,
          description: t.description,
          category: t.category,
          tags: t.tags,
        })), null, 2)}`
      );
    })
  );
}
