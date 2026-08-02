import { describe, expect, it } from "vitest";
import { isValidGstin, normalizeGstin } from "./gstin.js";

describe("gstin validation", () => {
  it("accepts a known valid GSTIN", () => {
    expect(isValidGstin("27AAPFU0939F1ZV")).toBe(true);
  });

  it("rejects too-short GSTIN", () => {
    expect(isValidGstin("27AAPFU0939F")).toBe(false);
  });

  it("rejects invalid checksum", () => {
    expect(isValidGstin("27AAPFU0939F1ZZ")).toBe(false);
  });

  it("normalizes to uppercase", () => {
    expect(normalizeGstin("27aapfu0939f1zv")).toBe("27AAPFU0939F1ZV");
  });
});
