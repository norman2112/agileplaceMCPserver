import { describe, it, expect } from "vitest";
import { buildRemoveCardTagOperations } from "../api/agileplace.mjs";

describe("buildRemoveCardTagOperations", () => {
  /**
   * RFC 6902 `remove` operations do not include a `value` field.
   * AgilePlace's API uses `value` on `/tags` remove ops to identify which tag string to drop
   * (non-standard extension). Do not remove `value` without verifying against the live API.
   */
  it("includes value to identify the tag (AgilePlace non-standard PATCH)", () => {
    const ops = buildRemoveCardTagOperations(["urgent", "blocked"]);
    expect(ops).toHaveLength(2);
    expect(ops[0]).toMatchObject({ op: "remove", path: "/tags", value: "urgent" });
    expect(ops[1]).toMatchObject({ op: "remove", path: "/tags", value: "blocked" });
  });

  it("rejects empty tag list", () => {
    expect(() => buildRemoveCardTagOperations([])).toThrow(/non-empty/);
  });
});
