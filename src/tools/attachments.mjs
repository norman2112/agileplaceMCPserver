import { z } from "zod";
import { respondText, wrapToolHandler } from "../helpers.mjs";
import {
  listAttachmentsApi,
  createAttachmentApi,
  deleteAttachmentApi,
} from "../api/agileplace.mjs";

export function registerAttachmentTools(mcp) {
  mcp.registerTool(
    "listAttachments",
    {
      description: "List attachments on a card. Returns id, name, description, createdOn, createdBy for each attachment.",
      inputSchema: {
        cardId: z.string(),
      },
    },
    wrapToolHandler("listAttachments", async ({ cardId }) => {
      const attachments = await listAttachmentsApi(cardId);
      const summary = attachments.map((a) => ({
        id: a.id,
        name: a.name,
        description: a.description,
        createdOn: a.createdOn,
        createdBy: a.createdBy,
      }));
      return respondText(
        `Card ${cardId}: ${attachments.length} attachment(s)`,
        JSON.stringify(summary, null, 2)
      );
    })
  );

  mcp.registerTool(
    "createAttachment",
    {
      description:
        "Upload an attachment to a card. Uses multipart/form-data (FormData/Blob). fileContent is UTF-8 text by default; use contentEncoding base64 for binary (e.g. PNG). fileName must not contain quotes or newlines.",
      inputSchema: {
        cardId: z.string(),
        fileName: z.string(),
        fileContent: z.string(),
        description: z.string().optional(),
        contentType: z
          .string()
          .optional()
          .describe("MIME type for the file blob (default application/octet-stream)"),
        contentEncoding: z
          .enum(["utf8", "base64"])
          .optional()
          .describe("How to interpret fileContent (default utf8; use base64 for binary files)"),
      },
    },
    wrapToolHandler(
      "createAttachment",
      async ({ cardId, fileName, fileContent, description, contentType, contentEncoding }) => {
        const result = await createAttachmentApi(cardId, fileName, fileContent, description, {
          contentType,
          contentEncoding: contentEncoding || "utf8",
        });
        return respondText(
          `Created attachment on card ${cardId}: ${result?.name ?? fileName}`,
          JSON.stringify(
            {
              id: result?.id,
              name: result?.name,
              description: result?.description,
              attachmentSize: result?.attachmentSize,
              createdBy: result?.createdBy,
            },
            null,
            2
          )
        );
      }
    )
  );

  mcp.registerTool(
    "deleteAttachment",
    {
      description: "Delete an attachment from a card.",
      inputSchema: {
        cardId: z.string(),
        attachmentId: z.string(),
      },
    },
    wrapToolHandler("deleteAttachment", async ({ cardId, attachmentId }) => {
      await deleteAttachmentApi(cardId, attachmentId);
      return respondText(`Deleted attachment ${attachmentId} from card ${cardId}.`);
    })
  );
}
