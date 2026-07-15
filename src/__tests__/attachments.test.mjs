import { describe, it, expect } from "vitest";
import { assertValidAttachmentFileName } from "../api/agileplace.mjs";

describe("assertValidAttachmentFileName", () => {
  it("accepts normal filenames", () => {
    expect(() => assertValidAttachmentFileName("report.txt")).not.toThrow();
    expect(() => assertValidAttachmentFileName("photo.png")).not.toThrow();
  });

  it("rejects quotes, newlines, and control characters", () => {
    for (const bad of ['bad"name.txt', "bad\rname.txt", "bad\nname.txt", "bad\x01name.txt"]) {
      expect(() => assertValidAttachmentFileName(bad)).toThrow(/forbidden/i);
    }
  });
});

describe("FormData attachment encoding", () => {
  it("round-trips UTF-8 text in Blob", () => {
    const text = "hello 世界";
    const bytes = Buffer.from(text, "utf8");
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: "text/plain" }), "hello.txt");
    expect(form instanceof FormData).toBe(true);
    expect(bytes.toString("utf8")).toBe(text);
  });

  it("round-trips base64 PNG bytes in Blob", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const b64 = png.toString("base64");
    const decoded = Buffer.from(b64, "base64");
    const form = new FormData();
    form.append("file", new Blob([decoded], { type: "image/png" }), "x.png");
    expect(decoded.equals(png)).toBe(true);
    expect(form instanceof FormData).toBe(true);
  });
});
