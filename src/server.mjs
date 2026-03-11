#!/usr/bin/env node

// Load config first (populates process.env from Claude Desktop config)
import { CONFIG } from "./config.mjs";
import { logError } from "./helpers.mjs";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import express from "express";

// Tool registrations
import { registerBoardTools } from "./tools/boards.mjs";
import { registerCardTools } from "./tools/cards.mjs";
import { registerCardTypeTools } from "./tools/card-types.mjs";
import { registerLaneTools } from "./tools/lanes.mjs";
import { registerConnectionTools } from "./tools/connections.mjs";
import { registerDependencyTools } from "./tools/dependencies.mjs";
import { registerTagTools } from "./tools/tags.mjs";
import { registerCommentTools } from "./tools/comments.mjs";
import { registerHierarchyTools } from "./tools/hierarchy.mjs";
import { registerOkrTools } from "./tools/okr.mjs";
import { registerPlanningTools } from "./tools/planning.mjs";
import { registerUserTools } from "./tools/users.mjs";
import { registerReportingTools } from "./tools/reporting.mjs";
import { registerUtilityTools } from "./tools/utility.mjs";
import { registerUiResources } from "./ui.mjs";

const { PORT } = CONFIG;

// Global error handlers
process.on("unhandledRejection", (reason) => {
  logError("unhandledRejection", reason);
});

process.on("uncaughtException", (err) => {
  logError("uncaughtException", err);
  process.exit(1);
});

// Initialize MCP server
const mcp = new McpServer({ name: "agileplace", version: "1.4.0" });

// Register all tools
registerBoardTools(mcp);
registerCardTools(mcp);
registerCardTypeTools(mcp);
registerLaneTools(mcp);
registerConnectionTools(mcp);
registerDependencyTools(mcp);
registerTagTools(mcp);
registerCommentTools(mcp);
registerHierarchyTools(mcp);
registerOkrTools(mcp);
registerPlanningTools(mcp);
registerUserTools(mcp);
registerReportingTools(mcp);
registerUiResources(mcp);

// Health check Express app
const app = express();

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    caps: {
      MAX_CARDS: CONFIG.MAX_CARDS,
      MAX_DESC: CONFIG.MAX_DESC,
      FETCH_TIMEOUT_MS: CONFIG.FETCH_TIMEOUT_MS,
      STORY_LIMIT: CONFIG.STORY_LIMIT,
    },
  });
});

app.use((err, _req, res, _next) => {
  console.error("Health endpoint error:", err);
  res.status(500).json({ error: err.message || "Internal Server Error" });
});

let healthServer;
if (process.env.DISABLE_HEALTH_SERVER !== "1") {
  healthServer = app.listen(PORT, () => {
    console.error(`MCP server health endpoint listening on :${PORT}`);
  });

  healthServer.on("error", err => {
    if (err?.code === "EADDRINUSE") {
      console.error(`Health endpoint disabled: port ${PORT} already in use.`);
    } else {
      console.error("Health endpoint error:", err);
    }
  });
}

// Register utility tools (needs healthServer reference)
registerUtilityTools(mcp, { healthServer });

// Start transport
try {
  await mcp.connect(new StdioServerTransport());
} catch (err) {
  logError("mcp.connect", err);
  if (healthServer) {
    try { healthServer.close(); } catch (closeErr) { logError("healthServer.close", closeErr); }
  }
  process.exit(1);
}

// Graceful shutdown — single consolidated handler
function gracefulShutdown(signal) {
  console.error(`Received ${signal}, shutting down gracefully...`);
  if (healthServer) {
    try {
      healthServer.close(() => {
        console.error("Health server closed");
        process.exit(0);
      });
    } catch (err) {
      console.error("Error closing health server:", err);
      process.exit(1);
    }
  } else {
    process.exit(0);
  }
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
