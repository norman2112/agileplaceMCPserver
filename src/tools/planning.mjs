import { z } from "zod";
import { respondText, wrapToolHandler } from "../helpers.mjs";
import {
  buildPlanningPatchBody,
  planningIncrementUpdateSchema,
  planningSeriesUpdateSchema,
} from "../planning-schemas.mjs";
import {
  listPlanningSeriesApi,
  createPlanningSeriesApi,
  getPlanningSeriesApi,
  updatePlanningSeriesApi,
  addBoardsToPlanningSeriesApi,
  deletePlanningSeriesApi,
  createIncrementApi,
  listIncrementsApi,
  updateIncrementApi,
  deleteIncrementApi,
  getIncrementStatusApi,
} from "../api/agileplace.mjs";

function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function registerPlanningTools(mcp) {
  mcp.registerTool(
    "listPlanningSeries",
    {
      description: "List planning series (PI Planning) in the workspace.",
      inputSchema: {},
    },
    wrapToolHandler("listPlanningSeries", async () => {
      const result = await listPlanningSeriesApi();
      return respondText("Planning series list", JSON.stringify(result, null, 2));
    })
  );

  mcp.registerTool(
    "createPlanningSeries",
    {
      description:
        "Create a planning series (PI) via POST /io/series. Required: label. Optional: timeZone, allowAllBoards (default false), boardIds.",
      inputSchema: {
        label: z.string(),
        timeZone: z.string().optional(),
        allowAllBoards: z.boolean().optional(),
        boardIds: z.array(z.string()).optional(),
      },
    },
    wrapToolHandler("createPlanningSeries", async args => {
      const { label, timeZone, allowAllBoards, boardIds } = args;
      const result = await createPlanningSeriesApi({ label, timeZone, allowAllBoards, boardIds });
      return respondText("Created planning series", JSON.stringify(result, null, 2));
    })
  );

  mcp.registerTool(
    "getPlanningSeries",
    {
      description: "Get a single planning series by ID.",
      inputSchema: { seriesId: z.string() },
    },
    wrapToolHandler("getPlanningSeries", async ({ seriesId }) => {
      const result = await getPlanningSeriesApi(seriesId);
      return respondText(`Planning series ${seriesId}`, JSON.stringify(result, null, 2));
    })
  );

  mcp.registerTool(
    "updatePlanningSeries",
    {
      description:
        "Update a planning series (PATCH /io/series/:seriesId). Optional fields: label, timeZone, allowAllBoards, boardIds (replaces the full board list). Prefer addBoardsToPlanningSeries to merge boards without replacing the list.",
      inputSchema: {
        seriesId: z.string(),
        updates: planningSeriesUpdateSchema,
      },
    },
    wrapToolHandler("updatePlanningSeries", async ({ seriesId, updates }) => {
      const body = buildPlanningPatchBody(updates);
      const result = await updatePlanningSeriesApi(seriesId, body);
      return respondText(`Updated planning series ${seriesId}`, JSON.stringify(result, null, 2));
    })
  );

  mcp.registerTool(
    "addBoardsToPlanningSeries",
    {
      description:
        "Append board IDs to a planning series (GET current boardIds, merge, PATCH with up to 3 retries on concurrent edits). A narrow race window remains if two callers PATCH the same series simultaneously — prefer serializing updates per seriesId. Safer than updatePlanningSeries with a partial boardIds list.",
      inputSchema: {
        seriesId: z.string(),
        boardIds: z.array(z.string()).min(1),
      },
    },
    wrapToolHandler("addBoardsToPlanningSeries", async ({ seriesId, boardIds }) => {
      const result = await addBoardsToPlanningSeriesApi(seriesId, boardIds);
      return respondText(
        `Added ${result.addedBoardIds?.length ?? 0} board(s) to series ${seriesId}`,
        JSON.stringify(result, null, 2)
      );
    })
  );

  mcp.registerTool(
    "deletePlanningSeries",
    {
      description: "Delete a planning series by ID.",
      inputSchema: { seriesId: z.string() },
    },
    wrapToolHandler("deletePlanningSeries", async ({ seriesId }) => {
      await deletePlanningSeriesApi(seriesId);
      return respondText(`Deleted planning series ${seriesId}`);
    })
  );

  mcp.registerTool(
    "createPlanningIncrement",
    {
      description:
        "Create a planning increment in a series (POST /io/series/:seriesId/increment). Required: seriesId, label, startDate, endDate (YYYY-MM-DD). Optional: parentPlanningIncrementId (string or null) to nest sprints under a PI.",
      inputSchema: {
        seriesId: z.string(),
        label: z.string(),
        startDate: z.string(),
        endDate: z.string(),
        parentPlanningIncrementId: z.string().nullable().optional(),
      },
    },
    wrapToolHandler("createPlanningIncrement", async args => {
      const { seriesId, label, startDate, endDate, parentPlanningIncrementId } = args;
      const result = await createIncrementApi(seriesId, {
        label,
        startDate,
        endDate,
        parentPlanningIncrementId,
      });
      return respondText(`Created increment in series ${seriesId}`, JSON.stringify(result, null, 2));
    })
  );

  mcp.registerTool(
    "listPlanningIncrements",
    {
      description: "List increments for a planning series.",
      inputSchema: { seriesId: z.string() },
    },
    wrapToolHandler("listPlanningIncrements", async ({ seriesId }) => {
      const result = await listIncrementsApi(seriesId);
      return respondText(`Increments for series ${seriesId}`, JSON.stringify(result, null, 2));
    })
  );

  mcp.registerTool(
    "updatePlanningIncrement",
    {
      description:
        "Update a planning increment (PATCH /io/series/:seriesId/increment/:incrementId). Optional: label, startDate, endDate (YYYY-MM-DD).",
      inputSchema: {
        seriesId: z.string(),
        incrementId: z.string(),
        updates: planningIncrementUpdateSchema,
      },
    },
    wrapToolHandler("updatePlanningIncrement", async ({ seriesId, incrementId, updates }) => {
      const body = buildPlanningPatchBody(updates);
      const result = await updateIncrementApi(seriesId, incrementId, body);
      return respondText(`Updated increment ${incrementId} in series ${seriesId}`, JSON.stringify(result, null, 2));
    })
  );

  mcp.registerTool(
    "deletePlanningIncrement",
    {
      description: "Delete an increment from a planning series.",
      inputSchema: { seriesId: z.string(), incrementId: z.string() },
    },
    wrapToolHandler("deletePlanningIncrement", async ({ seriesId, incrementId }) => {
      await deleteIncrementApi(seriesId, incrementId);
      return respondText(`Deleted increment ${incrementId} from series ${seriesId}`);
    })
  );

  mcp.registerTool(
    "bootstrapPlanningIncrement",
    {
      description:
        "Create a PI parent increment plus N child iteration increments with consecutive date ranges (bootstrap PI planning).",
      inputSchema: {
        seriesId: z.string(),
        piLabel: z.string(),
        startDate: z.string().describe("PI start YYYY-MM-DD"),
        iterationCount: z.number().int().min(1).max(20),
        iterationWeeks: z.number().int().min(1).max(12),
        sprintLabelPrefix: z.string().optional().describe('Prefix for child labels, default "Sprint"'),
      },
    },
    wrapToolHandler(
      "bootstrapPlanningIncrement",
      async ({ seriesId, piLabel, startDate, iterationCount, iterationWeeks, sprintLabelPrefix }) => {
        const prefix = sprintLabelPrefix || "Sprint";
        const piWeeks = iterationCount * iterationWeeks;
        const piEnd = addDays(startDate, piWeeks * 7 - 1);
        const pi = await createIncrementApi(seriesId, {
          label: piLabel,
          startDate,
          endDate: piEnd,
        });
        const piId = pi.id ?? pi.incrementId;
        const children = [];
        let cursor = startDate;
        for (let i = 1; i <= iterationCount; i++) {
          const end = addDays(cursor, iterationWeeks * 7 - 1);
          const child = await createIncrementApi(seriesId, {
            label: `${prefix} ${i}`,
            startDate: cursor,
            endDate: end,
            parentPlanningIncrementId: piId,
          });
          children.push(child);
          cursor = addDays(end, 1);
        }
        return respondText(
          `Bootstrapped PI "${piLabel}" with ${children.length} iteration(s) in series ${seriesId}`,
          JSON.stringify({ pi, iterations: children }, null, 2)
        );
      }
    )
  );

  mcp.registerTool(
    "getPlanningIncrementStatus",
    {
      description: "Get status for a planning increment, optionally filtered by category.",
      inputSchema: { seriesId: z.string(), incrementId: z.string(), category: z.string().optional() },
    },
    wrapToolHandler("getPlanningIncrementStatus", async ({ seriesId, incrementId, category }) => {
      const result = await getIncrementStatusApi(seriesId, incrementId, category);
      return respondText(`Status for increment ${incrementId} in series ${seriesId}`, JSON.stringify(result, null, 2));
    })
  );
}
