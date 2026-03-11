import { z } from "zod";
import { respondText, wrapToolHandler } from "../helpers.mjs";
import { fetchOkrJson, OKR_DEFAULT_LIMIT } from "../api/okr.mjs";

export function registerOkrTools(mcp) {
  // OKR: list objectives
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
          { total_records: totalRecords, filtered_records: filteredObjectives.length, filter: { scope_type: desiredScope }, objectives: filteredObjectives },
          null,
          2
        )}`
      );
    })
  );

  // OKR: get key results
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
}
