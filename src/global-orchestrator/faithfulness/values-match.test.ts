import { describe, expect, it } from "vitest";
import { valuesMatch } from "./values-match.js";

describe("valuesMatch money display", () => {
  it("accepts ₹ display when fact is paise integer", () => {
    expect(valuesMatch("₹504.00", "50400", "number")).toBe(true);
    expect(valuesMatch("50400", "50400", "number")).toBe(true);
  });
});
