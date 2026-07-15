import { describe, it, expect } from "vitest";
import { normalizeLayoutTree } from "../tools/lanes.mjs";

describe("normalizeLayoutTree", () => {
  it("sets horizontal children to parent column width (equal columns)", () => {
    const lanes = [
      {
        id: "1",
        title: "Row",
        orientation: "horizontal",
        columns: 4,
        children: [
          { id: "a", title: "A" },
          { id: "b", title: "B" },
        ],
      },
    ];
    const out = normalizeLayoutTree(lanes);
    expect(out[0].children[0].columns).toBe(4);
    expect(out[0].children[1].columns).toBe(4);
  });

  it("handles single-child lane under vertical parent", () => {
    const lanes = [
      {
        id: "1",
        orientation: "vertical",
        columns: 3,
        children: [{ id: "only", title: "Only" }],
      },
    ];
    const out = normalizeLayoutTree(lanes);
    expect(out[0].children).toHaveLength(1);
    expect(out[0].children[0].columns).toBeGreaterThanOrEqual(1);
  });

  it("redistributes child columns to sum to parent (proportional)", () => {
    const lanes = [
      {
        id: "1",
        orientation: "vertical",
        columns: 10,
        children: [
          { id: "a", columns: 1 },
          { id: "b", columns: 1 },
          { id: "c", columns: 1 },
        ],
      },
    ];
    const out = normalizeLayoutTree(lanes);
    const sum = out[0].children.reduce((s, c) => s + c.columns, 0);
    expect(sum).toBe(10);
    out[0].children.forEach(c => expect(c.columns).toBeGreaterThanOrEqual(1));
  });

  it("avoids zero-width children after proportional scale", () => {
    const lanes = [
      {
        id: "1",
        orientation: "vertical",
        columns: 3,
        children: [
          { id: "a", columns: 100 },
          { id: "b", columns: 1 },
        ],
      },
    ];
    const out = normalizeLayoutTree(lanes);
    out[0].children.forEach(c => expect(c.columns).toBeGreaterThanOrEqual(1));
    const sum = out[0].children.reduce((s, c) => s + c.columns, 0);
    expect(sum).toBe(3);
  });
});
