import { CONFIG } from "../config.mjs";
import { respondText, wrapToolHandler } from "../helpers.mjs";
import { getOkrRegion } from "../api/okr.mjs";

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

      const healthInfo = {
        ok: true,
        server: "agileplace-mcp",
        version: "1.4.0",
        config: {
          agileplace: {
            apiBase: API_BASE,
            hasToken: !!API_TOKEN,
            defaultBoardId: DEFAULT_BOARD_ID || "not set",
          },
          okr: {
            baseUrl: OKR_BASE || "not set",
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
        warnings.push("Warning: AGILEPLACE_BOARD_ID is not set in Claude Desktop config or process environment variables");
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
}
