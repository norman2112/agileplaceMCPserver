import { describe, it, expect, vi, afterEach } from "vitest";
import { formatFetchError, fetchResponseError, assertAttachmentWithinLimit } from "../api/agileplace.mjs";
import { MAX_ATTACHMENT_BYTES } from "../limits.mjs";

describe("formatFetchError / fetchResponseError", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("omits upstream body from client-facing message", () => {
    const resp = { status: 400, statusText: "Bad Request" };
    const msg = formatFetchError(resp, "Create user", 'password=secret Bearer tok.en {"detail":"nope"}');
    expect(msg).toBe("Create user failed: 400 Bad Request");
    expect(msg).not.toMatch(/password|Bearer|detail/i);
  });

  it("logs body server-side but still returns sanitized Error.message", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const resp = { status: 403, statusText: "Forbidden" };
    const err = fetchResponseError(resp, "Delete card", "token=abc123 internal detail");
    expect(err.message).toBe("Delete card failed: 403 Forbidden");
    expect(err.statusCode).toBe(403);
    expect(spy).toHaveBeenCalled();
    const logged = spy.mock.calls.map(c => c.join(" ")).join("\n");
    expect(logged).toMatch(/API body/);
    expect(logged).toMatch(/\[REDACTED\]/);
  });
});

describe("assertAttachmentWithinLimit", () => {
  it("allows payloads at or under the limit", () => {
    expect(() => assertAttachmentWithinLimit(Buffer.alloc(1))).not.toThrow();
    expect(() => assertAttachmentWithinLimit(Buffer.alloc(MAX_ATTACHMENT_BYTES))).not.toThrow();
  });

  it("rejects oversized payloads", () => {
    expect(() => assertAttachmentWithinLimit(Buffer.alloc(MAX_ATTACHMENT_BYTES + 1))).toThrow(
      /exceeds maximum size/
    );
  });
});
