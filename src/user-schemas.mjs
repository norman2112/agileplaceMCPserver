import { z } from "zod";

export const dateFormatSchema = z.enum(["MM/dd/yyyy", "dd/MM/yyyy", "yyyy/MM/dd"]);
export const licenseTypeSchema = z.enum(["full", "reader"]);
export const localeSchema = z.enum(["en-US", "en-GB", "en-CA", "fr-FR", "fr-CA"]);

/** PATCH /io/user/:userId — only send fields to change. */
export const userUpdateSchema = z
  .object({
    emailAddress: z.string().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    timeZone: z.string().optional(),
    enabled: z.boolean().optional(),
    administrator: z.boolean().optional(),
    boardCreator: z.boolean().optional(),
    dateFormat: dateFormatSchema.optional(),
    licenseType: licenseTypeSchema.optional(),
    externalUserName: z.string().optional(),
  })
  .strict()
  .refine(v => Object.keys(v).length > 0, {
    message: "At least one field to update is required",
  });

/** PATCH /io/user/me — only send fields to change. */
export const currentUserUpdateSchema = z
  .object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    timeZone: z.string().optional(),
    dateFormat: dateFormatSchema.optional(),
    locale: localeSchema.optional(),
    useMondayForStartOfWeek: z.boolean().optional(),
  })
  .strict()
  .refine(v => Object.keys(v).length > 0, {
    message: "At least one field to update is required",
  });

export function buildUserPatchBody(fields) {
  const body = {};
  for (const [key, value] of Object.entries(fields || {})) {
    if (value !== undefined) body[key] = value;
  }
  if (Object.keys(body).length === 0) {
    throw new Error("At least one field to update is required.");
  }
  return body;
}

/** Board role create/update ops for PATCH /io/board/:boardId/roles */
export const boardRoleOpSchema = z
  .object({
    op: z.enum(["create", "update"]),
    id: z.string().optional(),
    userId: z.string(),
    WIP: z.number().int().optional(),
    roleTypeId: z.number().int().min(1).max(4),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.op === "update" && !v.id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "id (boardRoleId) is required when op is \"update\"",
        path: ["id"],
      });
    }
  });
