import { z } from "zod";
import { respondText, wrapToolHandler } from "../helpers.mjs";
import { CONFIG } from "../config.mjs";
import {
  fetchOkrJson,
  mutateOkrJson,
  buildOkrPatchBody,
  OKR_DEFAULT_LIMIT,
} from "../api/okr.mjs";
import { linkExternalToCardApi } from "../api/agileplace.mjs";

const { OKR_BASE } = CONFIG;

const okrObjectiveUpdateSchema = z
  .object({
    name: z.string().optional(),
    description: z.string().optional(),
    scope_type: z.string().optional(),
    scope_id: z.string().optional(),
  })
  .strict()
  .refine(v => Object.keys(v).length > 0, { message: "At least one field to update is required" });

const okrKeyResultUpdateSchema = z
  .object({
    name: z.string().optional(),
    description: z.string().optional(),
  })
  .strict()
  .refine(v => Object.keys(v).length > 0, { message: "At least one field to update is required" });

export function registerOkrTools(mcp) {
  mcp.registerTool(
    "okrListObjectives",
    {
      description:
        "List objectives with paging. Returns objectives array and page metadata. Defaults to only objectives where scope_type='Board' (override with scopeType: 'All' or a specific value).",
      inputSchema: {
        limit: z.number().optional(),
        offset: z.number().optional(),
        scopeType: z.string().optional(),
      },
    },
    wrapToolHandler("okrListObjectives", async ({ limit, offset, scopeType }) => {
      const queryParams = {};
      if (limit !== undefined) {
        queryParams.limit = Math.min(limit, 500);
      } else {
        queryParams.limit = OKR_DEFAULT_LIMIT;
      }
      if (offset !== undefined) {
        queryParams.offset = offset;
      }

      const response = await fetchOkrJson("/objectives", queryParams);
      const fetchObjectives = response.fetch_objectives || {};
      const objectives = fetchObjectives.objectives || [];
      const totalRecords = fetchObjectives.total_records || objectives.length;

      const desiredScope = (scopeType ?? "Board").trim();
      const filteredObjectives =
        desiredScope.toLowerCase() === "all"
          ? objectives
          : objectives.filter(obj => (obj?.scope_type || "") === desiredScope);

      const summary = `Found ${filteredObjectives.length} objective(s)${desiredScope && desiredScope.toLowerCase() !== "all" ? ` where scope_type="${desiredScope}"` : ""}${totalRecords ? ` (total: ${totalRecords})` : ""}`;
      const objectivesList =
        filteredObjectives.length > 0
          ? filteredObjectives.map(obj => `ID: ${obj.id} | Name: ${obj.name || "N/A"}`).join("\n")
          : "No objectives found";

      return respondText(
        summary,
        objectivesList,
        `JSON:\n${JSON.stringify(
          {
            total_records: totalRecords,
            filtered_records: filteredObjectives.length,
            filter: { scope_type: desiredScope },
            objectives: filteredObjectives,
          },
          null,
          2
        )}`
      );
    })
  );

  mcp.registerTool(
    "okrGetKeyResults",
    {
      description: "List key results for a specific objective ID.",
      inputSchema: {
        objectiveId: z.string(),
      },
    },
    wrapToolHandler("okrGetKeyResults", async ({ objectiveId }) => {
      if (!objectiveId || typeof objectiveId !== "string" || objectiveId.trim() === "") {
        throw new Error("objectiveId is required and must be a non-empty string");
      }

      const response = await fetchOkrJson(`/objectives/${objectiveId}/key-results`);
      const keyResults = response.key_results || [];

      const summary = `Found ${keyResults.length} key result(s) for objective ${objectiveId}`;
      const keyResultsList =
        keyResults.length > 0
          ? keyResults.map(kr => `ID: ${kr.id} | Name: ${kr.name || "N/A"}`).join("\n")
          : "No key results found";

      return respondText(
        summary,
        keyResultsList,
        `JSON:\n${JSON.stringify({ objectiveId, key_results: keyResults }, null, 2)}`
      );
    })
  );

  mcp.registerTool(
    "okrCreateObjective",
    {
      description:
        "Create an OKR objective (POST /objectives). Requires OKR_BASE_URL and credentials. Common fields: name, description, scope_type, scope_id.",
      inputSchema: {
        name: z.string(),
        description: z.string().optional(),
        scope_type: z.string().optional(),
        scope_id: z.string().optional(),
      },
    },
    wrapToolHandler("okrCreateObjective", async ({ name, description, scope_type, scope_id }) => {
      const body = {
        name,
        ...(description ? { description } : {}),
        ...(scope_type ? { scope_type } : {}),
        ...(scope_id ? { scope_id } : {}),
      };
      const result = await mutateOkrJson("/objectives", { method: "POST", body });
      return respondText("Created OKR objective", JSON.stringify(result, null, 2));
    })
  );

  mcp.registerTool(
    "okrUpdateObjective",
    {
      description:
        "Update an OKR objective (PATCH /objectives/:objectiveId). Typed fields only: name, description, scope_type, scope_id.",
      inputSchema: {
        objectiveId: z.string(),
        updates: okrObjectiveUpdateSchema,
      },
    },
    wrapToolHandler("okrUpdateObjective", async ({ objectiveId, updates }) => {
      const body = buildOkrPatchBody(updates);
      const result = await mutateOkrJson(`/objectives/${objectiveId}`, { method: "PATCH", body });
      return respondText(`Updated OKR objective ${objectiveId}`, JSON.stringify(result, null, 2));
    })
  );

  mcp.registerTool(
    "okrDeleteObjective",
    {
      description:
        "Delete an OKR objective (DELETE /objectives/:objectiveId). DESTRUCTIVE — requires confirm: true.",
      inputSchema: {
        objectiveId: z.string(),
        confirm: z
          .literal(true)
          .describe("Must be true to confirm irreversible deletion of the objective"),
      },
    },
    wrapToolHandler("okrDeleteObjective", async ({ objectiveId, confirm }) => {
      if (confirm !== true) {
        throw new Error("Deleting an objective is destructive. Set confirm: true to proceed.");
      }
      await mutateOkrJson(`/objectives/${objectiveId}`, { method: "DELETE" });
      return respondText(`Deleted OKR objective ${objectiveId}`);
    })
  );

  mcp.registerTool(
    "okrCreateKeyResult",
    {
      description: "Create a key result under an objective (POST /objectives/:objectiveId/key-results).",
      inputSchema: {
        objectiveId: z.string(),
        name: z.string(),
        description: z.string().optional(),
      },
    },
    wrapToolHandler("okrCreateKeyResult", async ({ objectiveId, name, description }) => {
      const body = { name, ...(description ? { description } : {}) };
      const result = await mutateOkrJson(`/objectives/${objectiveId}/key-results`, {
        method: "POST",
        body,
      });
      return respondText(`Created key result on objective ${objectiveId}`, JSON.stringify(result, null, 2));
    })
  );

  mcp.registerTool(
    "okrUpdateKeyResult",
    {
      description:
        "Update a key result (PATCH /objectives/:objectiveId/key-results/:keyResultId). Fields: name, description.",
      inputSchema: {
        objectiveId: z.string(),
        keyResultId: z.string(),
        updates: okrKeyResultUpdateSchema,
      },
    },
    wrapToolHandler("okrUpdateKeyResult", async ({ objectiveId, keyResultId, updates }) => {
      const body = buildOkrPatchBody(updates);
      const result = await mutateOkrJson(
        `/objectives/${objectiveId}/key-results/${keyResultId}`,
        { method: "PATCH", body }
      );
      return respondText(
        `Updated key result ${keyResultId} on objective ${objectiveId}`,
        JSON.stringify(result, null, 2)
      );
    })
  );

  mcp.registerTool(
    "okrDeleteKeyResult",
    {
      description:
        "Delete a key result (DELETE /objectives/:objectiveId/key-results/:keyResultId). DESTRUCTIVE — requires confirm: true.",
      inputSchema: {
        objectiveId: z.string(),
        keyResultId: z.string(),
        confirm: z
          .literal(true)
          .describe("Must be true to confirm irreversible deletion of the key result"),
      },
    },
    wrapToolHandler("okrDeleteKeyResult", async ({ objectiveId, keyResultId, confirm }) => {
      if (confirm !== true) {
        throw new Error("Deleting a key result is destructive. Set confirm: true to proceed.");
      }
      await mutateOkrJson(`/objectives/${objectiveId}/key-results/${keyResultId}`, {
        method: "DELETE",
      });
      return respondText(`Deleted key result ${keyResultId} from objective ${objectiveId}`);
    })
  );

  mcp.registerTool(
    "linkObjectiveToCard",
    {
      description:
        "Link an OKR objective to an AgilePlace card via external link (visible on the card). Uses OKR_BASE_URL/objectives/:id when configured.",
      inputSchema: {
        cardId: z.string(),
        objectiveId: z.string(),
        label: z.string().optional(),
      },
    },
    wrapToolHandler("linkObjectiveToCard", async ({ cardId, objectiveId, label }) => {
      if (!OKR_BASE) throw new Error("OKR_BASE_URL is required to build objective link URL.");
      const url = `${OKR_BASE.replace(/\/$/, "")}/objectives/${objectiveId}`;
      const linkLabel = label || `OKR: ${objectiveId}`;
      await linkExternalToCardApi(cardId, { label: linkLabel, url });
      return respondText(
        `Linked objective ${objectiveId} to card ${cardId}`,
        JSON.stringify({ cardId, objectiveId, url }, null, 2)
      );
    })
  );
}
