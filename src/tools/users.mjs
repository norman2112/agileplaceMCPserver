import { z } from "zod";
import { respondText, wrapToolHandler } from "../helpers.mjs";
import {
  getCurrentUserApi,
  listUsersApi,
  getUserByIdApi,
  createUserApi,
  updateUserApi,
  deleteUserApi,
  changeUserPasswordApi,
  updateCurrentUserApi,
  getCurrentUserCardsApi,
  getCurrentUserRecentBoardsApi,
  getUsersInfoApi,
  listBoardUsersApi,
  updateBoardUserRolesApi,
  addTeamUsersApi,
  listTeamUsersApi,
  removeTeamUsersApi,
  listInvitationsApi,
  revokeInvitationApi,
} from "../api/agileplace.mjs";
import {
  dateFormatSchema,
  licenseTypeSchema,
  userUpdateSchema,
  currentUserUpdateSchema,
  buildUserPatchBody,
  boardRoleOpSchema,
} from "../user-schemas.mjs";

export function registerUserTools(mcp) {
  mcp.registerTool(
    "getCurrentUser",
    {
      description: "Get the current AgilePlace user (GET /io/user/me). Any authenticated user.",
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
      description:
        "List users in the AgilePlace workspace (GET /io/user). Requires account administrator access.",
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
      description:
        "Get a single user by ID (GET /io/user/:userId). Requires account administrator access.",
      inputSchema: { userId: z.string() },
    },
    wrapToolHandler("getUser", async ({ userId }) => {
      const result = await getUserByIdApi(userId);
      return respondText(`User ${userId}`, JSON.stringify(result, null, 2));
    })
  );

  mcp.registerTool(
    "createUser",
    {
      description:
        "Create a new user in the AgilePlace workspace (POST /io/user). Requires account administrator access.",
      inputSchema: {
        emailAddress: z.string(),
        firstName: z.string(),
        lastName: z.string(),
        password: z.string(),
        timeZone: z.string().optional(),
        enabled: z.boolean().optional(),
        administrator: z.boolean().optional(),
        boardCreator: z.boolean().optional(),
        dateFormat: dateFormatSchema.optional(),
        licenseType: licenseTypeSchema.optional(),
        externalUserName: z.string().optional(),
      },
    },
    wrapToolHandler(
      "createUser",
      async ({
        emailAddress,
        firstName,
        lastName,
        password,
        timeZone,
        enabled,
        administrator,
        boardCreator,
        dateFormat,
        licenseType,
        externalUserName,
      }) => {
        const payload = { emailAddress, firstName, lastName, password };
        if (timeZone !== undefined) payload.timeZone = timeZone;
        if (enabled !== undefined) payload.enabled = enabled;
        if (administrator !== undefined) payload.administrator = administrator;
        if (boardCreator !== undefined) payload.boardCreator = boardCreator;
        if (dateFormat !== undefined) payload.dateFormat = dateFormat;
        if (licenseType !== undefined) payload.licenseType = licenseType;
        if (externalUserName !== undefined) payload.externalUserName = externalUserName;
        const result = await createUserApi(payload);
        return respondText(
          `Created user ${result.id || emailAddress}`,
          JSON.stringify(result, null, 2)
        );
      }
    )
  );

  mcp.registerTool(
    "updateUser",
    {
      description:
        "Update an existing user's profile and permissions (PATCH /io/user/:userId). Requires account administrator access. Only send properties you wish to change; omitted fields remain unchanged.",
      inputSchema: {
        userId: z.string(),
        updates: userUpdateSchema,
      },
    },
    wrapToolHandler("updateUser", async ({ userId, updates }) => {
      const body = buildUserPatchBody(updates);
      const result = await updateUserApi(userId, body);
      return respondText(`Updated user ${userId}`, JSON.stringify(result, null, 2));
    })
  );

  mcp.registerTool(
    "deleteUser",
    {
      description:
        "Delete a user from the AgilePlace workspace (DELETE /io/user/:userId). Permanent. Requires account administrator access.",
      inputSchema: { userId: z.string() },
    },
    wrapToolHandler("deleteUser", async ({ userId }) => {
      await deleteUserApi(userId);
      return respondText(`User ${userId} deleted successfully`);
    })
  );

  mcp.registerTool(
    "changeUserPassword",
    {
      description:
        "Change a user's password (PATCH /io/user/:userId/password). Requires account administrator access.",
      inputSchema: {
        userId: z.string(),
        password: z.string(),
      },
    },
    wrapToolHandler("changeUserPassword", async ({ userId, password }) => {
      const result = await changeUserPasswordApi(userId, password);
      return respondText(`Changed password for user ${userId}`, JSON.stringify(result, null, 2));
    })
  );

  mcp.registerTool(
    "updateCurrentUser",
    {
      description:
        "Update the requesting user's own profile (PATCH /io/user/me). Any authenticated user. Only send properties you wish to change; omitted fields remain unchanged.",
      inputSchema: {
        updates: currentUserUpdateSchema,
      },
    },
    wrapToolHandler("updateCurrentUser", async ({ updates }) => {
      const body = buildUserPatchBody(updates);
      const result = await updateCurrentUserApi(body);
      return respondText("Updated current user", JSON.stringify(result, null, 2));
    })
  );

  mcp.registerTool(
    "getCurrentUserCards",
    {
      description:
        "Get cards assigned to or subscribed by the requesting user (GET /io/user/me/card). Any authenticated user.",
      inputSchema: {
        offset: z.number().int().optional(),
        limit: z.number().int().optional(),
        cardStatus: z.string().optional().describe("CSV: started, notStarted, finished"),
        type: z.enum(["assigned", "subscribed"]).optional(),
        sort: z.enum(["title", "priority", "plannedStart", "plannedFinish"]).optional(),
        showBlockedFirst: z.boolean().optional(),
        filter: z.string().optional().describe("CSV: card, task"),
      },
    },
    wrapToolHandler(
      "getCurrentUserCards",
      async ({ offset, limit, cardStatus, type, sort, showBlockedFirst, filter }) => {
        const result = await getCurrentUserCardsApi({
          offset,
          limit,
          cardStatus,
          type,
          sort,
          showBlockedFirst,
          filter,
        });
        return respondText("Current user cards", JSON.stringify(result, null, 2));
      }
    )
  );

  mcp.registerTool(
    "getCurrentUserRecentBoards",
    {
      description:
        "Get the requesting user's favorite and most recently accessed boards, max 10 results (GET /io/user/me/board/recent). Favorites listed first (alpha-sorted), then recently accessed by access date. Any authenticated user.",
      inputSchema: {},
    },
    wrapToolHandler("getCurrentUserRecentBoards", async () => {
      const result = await getCurrentUserRecentBoardsApi();
      return respondText("Current user recent boards", JSON.stringify(result, null, 2));
    })
  );

  mcp.registerTool(
    "getUsersInfo",
    {
      description:
        "Get basic info (id, firstName, lastName, emailAddress, avatar) for a batch of user IDs (POST /io/user/info). Max 100 IDs per request. Any authenticated user.",
      inputSchema: {
        userIds: z.array(z.string()).min(1).max(100),
      },
    },
    wrapToolHandler("getUsersInfo", async ({ userIds }) => {
      const result = await getUsersInfoApi(userIds);
      return respondText(`Info for ${userIds.length} user(s)`, JSON.stringify(result, null, 2));
    })
  );

  mcp.registerTool(
    "listBoardUsers",
    {
      description:
        "List users and their roles on a specific board (GET /io/board/:boardId/user). Requires board member access. roleFilterList: 0=No Access, 1=boardReader, 2=boardUser, 3=boardManager, 4=boardAdministrator. licenseFilterList: 0=full, 1=focused, 2=reader. sortDir required when using sortBy.",
      inputSchema: {
        boardId: z.string(),
        offset: z.number().int().optional(),
        limit: z.number().int().max(100).optional(),
        search: z.string().optional(),
        sortBy: z.enum(["name", "role", "WIP", "license"]).optional(),
        sortDir: z.enum(["asc", "desc"]).optional(),
        roleFilterList: z.array(z.number().int().min(0).max(4)).optional(),
        licenseFilterList: z.array(z.number().int().min(0).max(2)).optional(),
      },
    },
    wrapToolHandler(
      "listBoardUsers",
      async ({
        boardId,
        offset,
        limit,
        search,
        sortBy,
        sortDir,
        roleFilterList,
        licenseFilterList,
      }) => {
        if (sortBy && !sortDir) {
          throw new Error("sortDir is required when using sortBy.");
        }
        const result = await listBoardUsersApi(boardId, {
          offset,
          limit,
          search,
          sortBy,
          sortDir,
          roleFilterList,
          licenseFilterList,
        });
        return respondText(`Board ${boardId} users`, JSON.stringify(result, null, 2));
      }
    )
  );

  mcp.registerTool(
    "updateBoardUserRoles",
    {
      description:
        "Create or update board roles for multiple users in one call (PATCH /io/board/:boardId/roles). Requires board administrator access. roleTypeId: 1=boardReader, 2=boardUser, 3=boardManager, 4=boardAdministrator. For update ops, include id (boardRoleId).",
      inputSchema: {
        boardId: z.string(),
        operations: z.array(boardRoleOpSchema).min(1),
      },
    },
    wrapToolHandler("updateBoardUserRoles", async ({ boardId, operations }) => {
      const result = await updateBoardUserRolesApi(boardId, operations);
      return respondText(
        `Updated board roles on board ${boardId}`,
        JSON.stringify(result, null, 2)
      );
    })
  );

  mcp.registerTool(
    "addTeamUsers",
    {
      description:
        "Add users to a team (POST /io/team/:teamId/user). Requires account administrator or the team manager who created the team. Cannot be used with built-in teams (Everyone, External Users). Team must be enabled. Max 100 user IDs.",
      inputSchema: {
        teamId: z.string(),
        userIds: z.array(z.string()).min(1).max(100),
      },
    },
    wrapToolHandler("addTeamUsers", async ({ teamId, userIds }) => {
      await addTeamUsersApi(teamId, userIds);
      return respondText(`Added ${userIds.length} user(s) to team ${teamId}`);
    })
  );

  mcp.registerTool(
    "listTeamUsers",
    {
      description:
        "Get users assigned directly to a team (GET /io/team/:teamId/user). Does not include users from subteams. Any authenticated user. licenseType in response is an integer: 0=full, 2=reader.",
      inputSchema: {
        teamId: z.string(),
        offset: z.number().int().optional(),
        limit: z.number().int().optional(),
      },
    },
    wrapToolHandler("listTeamUsers", async ({ teamId, offset, limit }) => {
      const result = await listTeamUsersApi(teamId, { offset, limit });
      return respondText(`Team ${teamId} users`, JSON.stringify(result, null, 2));
    })
  );

  mcp.registerTool(
    "removeTeamUsers",
    {
      description:
        "Remove users from a team (DELETE /io/team/:teamId/user). Only direct assignments (not subteam membership). Requires account administrator or the team manager who created the team. Cannot be used with built-in teams (Everyone, External Users). Team must be enabled. Max 10 user IDs.",
      inputSchema: {
        teamId: z.string(),
        userIds: z.array(z.string()).min(1).max(10),
      },
    },
    wrapToolHandler("removeTeamUsers", async ({ teamId, userIds }) => {
      await removeTeamUsersApi(teamId, userIds);
      return respondText(`Removed ${userIds.length} user(s) from team ${teamId}`);
    })
  );

  mcp.registerTool(
    "listInvitations",
    {
      description:
        "List open invitations to new users (GET /io/invitation). Requires account administrator access.",
      inputSchema: {
        offset: z.number().int().optional(),
        limit: z.number().int().optional(),
        status: z.enum(["pending", "accepted"]).optional(),
      },
    },
    wrapToolHandler("listInvitations", async ({ offset, limit, status }) => {
      const result = await listInvitationsApi({ offset, limit, status });
      return respondText("Invitations", JSON.stringify(result, null, 2));
    })
  );

  mcp.registerTool(
    "revokeInvitation",
    {
      description:
        "Revoke (or un-revoke) an open user invitation (PATCH /io/invitation/:invitationId). Requires account administrator access. Set isRevoked to true to revoke, false to un-revoke.",
      inputSchema: {
        invitationId: z.string(),
        isRevoked: z.boolean(),
      },
    },
    wrapToolHandler("revokeInvitation", async ({ invitationId, isRevoked }) => {
      await revokeInvitationApi(invitationId, isRevoked);
      return respondText(
        isRevoked
          ? `Invitation ${invitationId} revoked successfully`
          : `Invitation ${invitationId} un-revoked successfully`
      );
    })
  );
}
