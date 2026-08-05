import { describe, expect, it } from "vitest";
import { inventoryRupeesToPaise } from "./inventory-prices.js";

describe("inventoryRupeesToPaise", () => {
  it("converts whole rupees from inventory to billing paise", () => {
    expect(inventoryRupeesToPaise(45)).toBe(4500);
    expect(inventoryRupeesToPaise(280)).toBe(28000);
    expect(inventoryRupeesToPaise(14)).toBe(1400);
  });
});
