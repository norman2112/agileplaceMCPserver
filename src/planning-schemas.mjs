import { z } from "zod";

/** PATCH /io/series/:seriesId — per markdown/apiDocs.md (Update an existing planning series). */
export const planningSeriesUpdateSchema = z
  .object({
    label: z.string().optional(),
    timeZone: z.string().optional(),
    allowAllBoards: z.boolean().optional(),
    boardIds: z.array(z.string()).optional(),
  })
  .strict()
  .refine(v => Object.keys(v).length > 0, {
    message: "At least one field to update is required",
  });

/** PATCH /io/series/:seriesId/increment/:incrementId — per apiDocs (label, startDate, endDate). */
export const planningIncrementUpdateSchema = z
  .object({
    label: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  })
  .strict()
  .refine(v => Object.keys(v).length > 0, {
    message: "At least one field to update is required",
  });

export function buildPlanningPatchBody(fields) {
  const body = {};
  for (const [key, value] of Object.entries(fields || {})) {
    if (value !== undefined) body[key] = value;
  }
  if (Object.keys(body).length === 0) {
    throw new Error("At least one field to update is required.");
  }
  return body;
}
