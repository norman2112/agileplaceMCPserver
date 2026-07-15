import { describe, it, expect } from "vitest";
import { validateSetupCardTypesDeleteFlags } from "../tools/card-types.mjs";

describe("setupCardTypes delete guards", () => {
  it("allows omitted deleteStockTypes (additive default)", () => {
    expect(() => validateSetupCardTypesDeleteFlags(undefined, undefined)).not.toThrow();
    expect(() => validateSetupCardTypesDeleteFlags(false, undefined)).not.toThrow();
  });

  it("requires confirmDeleteStockTypes when deleteStockTypes is true", () => {
    expect(() => validateSetupCardTypesDeleteFlags(true, undefined)).toThrow(/confirmDeleteStockTypes/);
    expect(() => validateSetupCardTypesDeleteFlags(true, false)).toThrow(/confirmDeleteStockTypes/);
  });

  it("allows both delete flags true", () => {
    expect(() => validateSetupCardTypesDeleteFlags(true, true)).not.toThrow();
  });
});
