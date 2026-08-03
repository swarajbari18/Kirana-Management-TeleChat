import { describe, expect, it } from "vitest";
import { proseDetector } from "./prose-detector.js";

describe("proseDetector", () => {
  it("detects GSTIN in line", () => {
    expect(proseDetector("Your GSTIN is 27AAPFU0939F1ZV")).toBe(true);
  });

  it("does not flag greeting", () => {
    expect(proseDetector("Hello!")).toBe(false);
  });
});
