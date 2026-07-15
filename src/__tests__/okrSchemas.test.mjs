import { describe, it, expect } from "vitest";
import { buildOkrPatchBody } from "../api/okr.mjs";

describe("buildOkrPatchBody", () => {
  it("includes only defined fields", () => {
    expect(buildOkrPatchBody({ name: "Q1", description: undefined })).toEqual({
      name: "Q1",
    });
  });

  it("rejects empty updates", () => {
    expect(() => buildOkrPatchBody({})).toThrow(/At least one field/);
  });
});
