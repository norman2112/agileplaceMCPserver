import { z } from "zod";
import { respondText, wrapToolHandler } from "../helpers.mjs";
import { getCurrentUserApi, listUsersApi, getUserByIdApi } from "../api/agileplace.mjs";

export function registerUserTools(mcp) {
  mcp.registerTool(
    "getCurrentUser",
    {
      description: "Get the current AgilePlace user (user/me).",
      inputSchema: {},
    },
    wrapToolHandler("getCurrentUser", async () => {
      const result = await getCurrentUserApi();
      return respondText("Current user", JSON.stringify(result, null, 2));
    })
  );

  mcp.registerTool(
    "listUsers",
    {
      description: "List users in the AgilePlace workspace.",
      inputSchema: {},
    },
    wrapToolHandler("listUsers", async () => {
      const result = await listUsersApi();
      return respondText("Users", JSON.stringify(result, null, 2));
    })
  );

  mcp.registerTool(
    "getUser",
    {
      description: "Get a single user by ID.",
      inputSchema: { userId: z.string() },
    },
    wrapToolHandler("getUser", async ({ userId }) => {
      const result = await getUserByIdApi(userId);
      return respondText(`User ${userId}`, JSON.stringify(result, null, 2));
    })
  );
}
