import { describe, it, expect } from "vitest";
import { z } from "zod";

const unarchiveBoardInputSchema = z.object({
  boardId: z.string().min(1),
});

describe("unarchiveBoard input schema", () => {
  it("accepts a non-empty boardId", () => {
    expect(unarchiveBoardInputSchema.parse({ boardId: "12345" })).toEqual({
      boardId: "12345",
    });
  });

  it("rejects missing boardId", () => {
    expect(() => unarchiveBoardInputSchema.parse({})).toThrow();
  });

  it("rejects empty boardId", () => {
    expect(() => unarchiveBoardInputSchema.parse({ boardId: "" })).toThrow();
  });
});
