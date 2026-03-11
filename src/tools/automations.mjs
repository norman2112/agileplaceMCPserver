import { z } from "zod";
import { respondText, wrapToolHandler } from "../helpers.mjs";
import {
  listAutomationsApi,
  getAutomationApi,
  triggerBoardCustomEventApi,
  triggerCardCustomEventApi,
  getAutomationAuditApi,
} from "../api/agileplace.mjs";

export function registerAutomationTools(mcp) {
  mcp.registerTool(
    "listAutomations",
    {
      description:
        "List automations for a board. Returns id, description, enabled, events, filter, action for each automation.",
      inputSchema: {
        boardId: z.string(),
      },
    },
    wrapToolHandler("listAutomations", async ({ boardId }) => {
      const cardAutomations = await listAutomationsApi(boardId);
      const summary = cardAutomations.map((a) => ({
        id: a.id,
        description: a.description,
        enabled: a.enabled,
        events: a.events,
        filter: a.filter,
        action: a.action,
      }));
      return respondText(
        `Board ${boardId}: ${cardAutomations.length} automation(s)`,
        JSON.stringify(summary, null, 2)
      );
    })
  );

  mcp.registerTool(
    "getAutomation",
    {
      description:
        "Get full automation details including schedule, filter, and action config.",
      inputSchema: {
        boardId: z.string(),
        automationId: z.string(),
      },
    },
    wrapToolHandler("getAutomation", async ({ boardId, automationId }) => {
      const automation = await getAutomationApi(boardId, automationId);
      return respondText(
        `Automation ${automationId} on board ${boardId}`,
        JSON.stringify(automation, null, 2)
      );
    })
  );

  mcp.registerTool(
    "triggerBoardCustomEvent",
    {
      description:
        "Trigger all automations on the board that listen for the given custom event name. Rate limited to 5 per event in 5 minutes. Returns 202 Accepted.",
      inputSchema: {
        boardId: z.string(),
        eventName: z.string(),
      },
    },
    wrapToolHandler("triggerBoardCustomEvent", async ({ boardId, eventName }) => {
      await triggerBoardCustomEventApi(boardId, eventName);
      return respondText(
        `Triggered board custom event "${eventName}" on board ${boardId} (202 Accepted).`
      );
    })
  );

  mcp.registerTool(
    "triggerCardCustomEvent",
    {
      description:
        "Trigger automations that listen for the given custom event name for the specific card. Returns 202 Accepted.",
      inputSchema: {
        cardId: z.string(),
        eventName: z.string(),
      },
    },
    wrapToolHandler("triggerCardCustomEvent", async ({ cardId, eventName }) => {
      await triggerCardCustomEventApi(cardId, eventName);
      return respondText(
        `Triggered card custom event "${eventName}" on card ${cardId} (202 Accepted).`
      );
    })
  );

  mcp.registerTool(
    "getAutomationAudit",
    {
      description: "Get the last 20 audit records for an automation.",
      inputSchema: {
        boardId: z.string(),
        automationId: z.string(),
      },
    },
    wrapToolHandler("getAutomationAudit", async ({ boardId, automationId }) => {
      const audit = await getAutomationAuditApi(boardId, automationId);
      const records = Array.isArray(audit) ? audit : audit?.records ?? audit?.audit ?? [];
      return respondText(
        `Automation ${automationId} audit: ${records.length} record(s)`,
        JSON.stringify(records, null, 2)
      );
    })
  );
}
