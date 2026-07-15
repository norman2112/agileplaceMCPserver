import { describe, it, expect } from "vitest";
import { buildCardCustomFieldPatchOperations } from "../tools/cards.mjs";

describe("buildCardCustomFieldPatchOperations", () => {
  it("appends new fields at /customFields/-", () => {
    const ops = buildCardCustomFieldPatchOperations(
      [{ fieldId: "f1", value: "a" }, { fieldId: "f2", value: "b" }],
      { customFields: [] }
    );
    expect(ops).toHaveLength(2);
    expect(ops[0]).toEqual({
      op: "add",
      path: "/customFields/-",
      value: { fieldId: "f1", value: "a" },
    });
    expect(ops[1]).toEqual({
      op: "add",
      path: "/customFields/-",
      value: { fieldId: "f2", value: "b" },
    });
  });

  it("replaces existing field by array index", () => {
    const ops = buildCardCustomFieldPatchOperations(
      [{ fieldId: "5355213", value: 99 }],
      {
        customFields: [
          { id: "5355212", value: "abc" },
          { id: "5355213", value: "123" },
        ],
      }
    );
    expect(ops).toEqual([
      {
        op: "replace",
        path: "/customFields/1",
        value: { fieldId: "5355213", value: 99 },
      },
    ]);
  });

  it("does not duplicate path /customFields/0 for multiple adds", () => {
    const paths = buildCardCustomFieldPatchOperations(
      [
        { fieldId: "a", value: "1" },
        { fieldId: "b", value: "2" },
      ],
      { customFields: [] }
    ).map(o => o.path);
    expect(paths.every(p => p === "/customFields/-")).toBe(true);
    expect(new Set(paths).size).toBe(1);
  });
});
