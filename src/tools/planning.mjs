import { z } from "zod";
import { respondText, wrapToolHandler } from "../helpers.mjs";
import {
  listPlanningSeriesApi,
  createPlanningSeriesApi,
  getPlanningSeriesApi,
  updatePlanningSeriesApi,
  deletePlanningSeriesApi,
  createIncrementApi,
  listIncrementsApi,
  updateIncrementApi,
  deleteIncrementApi,
  getIncrementStatusApi,
} from "../api/agileplace.mjs";

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
      description: "Create a planning series (PI). Payload is passed directly to POST /io/series.",
      inputSchema: { payload: z.any() },
    },
    wrapToolHandler("createPlanningSeries", async ({ payload }) => {
      const result = await createPlanningSeriesApi(payload);
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
      description: "Update a planning series by ID. Payload is passed directly to PATCH /io/series/:seriesId.",
      inputSchema: { seriesId: z.string(), updates: z.any() },
    },
    wrapToolHandler("updatePlanningSeries", async ({ seriesId, updates }) => {
      const result = await updatePlanningSeriesApi(seriesId, updates);
      return respondText(`Updated planning series ${seriesId}`, JSON.stringify(result, null, 2));
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
      description: "Create an increment within a planning series.",
      inputSchema: { seriesId: z.string(), payload: z.any() },
    },
    wrapToolHandler("createPlanningIncrement", async ({ seriesId, payload }) => {
      const result = await createIncrementApi(seriesId, payload);
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
      description: "Update an increment within a planning series.",
      inputSchema: { seriesId: z.string(), incrementId: z.string(), updates: z.any() },
    },
    wrapToolHandler("updatePlanningIncrement", async ({ seriesId, incrementId, updates }) => {
      const result = await updateIncrementApi(seriesId, incrementId, updates);
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
