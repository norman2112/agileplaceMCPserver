import { describe, it, expect } from "vitest";
import { buildUpdateOperations, CARD_PRIORITY_VALUES } from "../api/agileplace.mjs";

describe("buildUpdateOperations", () => {
  it("accepts valid priority values", () => {
    for (const priority of CARD_PRIORITY_VALUES) {
      const ops = buildUpdateOperations({ priority });
      expect(ops).toEqual([{ op: "replace", path: "/priority", value: priority }]);
    }
  });

  it("rejects invalid priority", () => {
    expect(() => buildUpdateOperations({ priority: "medium" })).toThrow(/Invalid priority/);
    expect(() => buildUpdateOperations({ priority: "none" })).toThrow(/Invalid priority/);
  });

  it("omits priority when undefined", () => {
    const ops = buildUpdateOperations({ title: "x" });
    expect(ops.find(o => o.path === "/priority")).toBeUndefined();
  });
});
