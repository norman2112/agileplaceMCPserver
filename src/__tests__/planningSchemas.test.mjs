import { describe, it, expect } from "vitest";
import {
  buildPlanningPatchBody,
  planningIncrementUpdateSchema,
  planningSeriesUpdateSchema,
} from "../planning-schemas.mjs";

describe("planningSeriesUpdateSchema", () => {
  it("accepts documented PATCH fields", () => {
    const parsed = planningSeriesUpdateSchema.parse({
      label: "PI 2026",
      timeZone: "America/Denver",
      allowAllBoards: false,
      boardIds: ["1", "2"],
    });
    expect(parsed.boardIds).toEqual(["1", "2"]);
  });

  it("rejects unknown keys", () => {
    expect(() =>
      planningSeriesUpdateSchema.parse({ label: "x", hideOutdatedIncrements: true })
    ).toThrow();
  });

  it("rejects empty updates", () => {
    expect(() => planningSeriesUpdateSchema.parse({})).toThrow();
  });
});

describe("planningIncrementUpdateSchema", () => {
  it("accepts label and dates", () => {
    expect(
      planningIncrementUpdateSchema.parse({ label: "Sprint 2", startDate: "2026-01-01" })
    ).toMatchObject({ label: "Sprint 2" });
  });
});

describe("buildPlanningPatchBody", () => {
  it("passes boardIds through for addBoardsToPlanningSeries-style merges", () => {
    expect(buildPlanningPatchBody({ boardIds: ["a", "b"] })).toEqual({
      boardIds: ["a", "b"],
    });
  });
});
