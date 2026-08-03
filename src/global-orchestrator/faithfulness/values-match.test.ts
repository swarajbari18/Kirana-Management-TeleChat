import { describe, expect, it } from "vitest";
import { valuesMatch } from "./values-match.js";

describe("valuesMatch", () => {
  it("matches boolean Yes to true", () => {
    expect(valuesMatch("Yes", "true", "boolean")).toBe(true);
  });

  it("matches boolean true to true", () => {
    expect(valuesMatch("true", "true", "boolean")).toBe(true);
  });

  it("matches numbers", () => {
    expect(valuesMatch("5", "5", "number")).toBe(true);
  });

  it("matches json arrays", () => {
    expect(valuesMatch('[""]', '[""]', "json")).toBe(true);
  });

  it("rejects mismatched strings", () => {
    expect(valuesMatch("Other", "Bantu Kirana", "string")).toBe(false);
  });
});
