import { describe, expect, it } from "vitest";
import {
  buildInventoryFactRecords,
  buildInventoryFixtureRecords,
} from "./inventory-fact-registry.js";

describe("inventory fact registry INV-F-01", () => {
  it("creates per sku field records", () => {
    const records = buildInventoryFactRecords(
      "obj1",
      "inventory",
      "query_inventory",
      {
        sku: "maggi-001",
        productName: "Maggi 5-pack",
        quantityOnHand: 5,
      },
    );
    expect(records.some((r) => r.field === "quantityOnHand" && r.value === "5")).toBe(
      true,
    );
    expect(records.every((r) => r.identity?.sku === "maggi-001")).toBe(true);
  });

  it("does not catalog refusalMessage", () => {
    const records = buildInventoryFactRecords(
      "obj1",
      "inventory",
      "update_inventory",
      { refusalMessage: "use billing" } as never,
    );
    expect(records).toHaveLength(0);
  });

  it("fixture records use query_inventory tool id", () => {
    const fixtures = buildInventoryFixtureRecords();
    expect(fixtures.every((r) => r.toolName === "query_inventory")).toBe(true);
    expect(fixtures.some((r) => r.field === "quantityOnHand")).toBe(true);
  });
});
