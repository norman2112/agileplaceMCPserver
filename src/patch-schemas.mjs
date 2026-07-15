import { z } from "zod";
import { MAX_TAG_VALUES } from "./limits.mjs";

/** RFC 6902 `value` payloads allowed on AgilePlace card/board PATCH operations. */
export const jsonPatchValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.string()).max(MAX_TAG_VALUES),
  z.record(z.string(), z.unknown()),
]);

export const jsonPatchOperationSchema = z.object({
  op: z.enum(["add", "replace", "remove", "test", "move", "copy"]),
  path: z.string().min(1),
  value: jsonPatchValueSchema.optional(),
  from: z.string().optional(),
});

/** Lane layout nodes returned by GET /io/board/:id (heterogeneous tree). */
export const laneLayoutNodeSchema = z.record(z.string(), z.unknown());
