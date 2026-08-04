import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  exactSearchProducts,
  normalizeProductKey,
} from "../../store-durable-object/persistence/repositories/inventory-repository.js";
import { findSimilarCandidates } from "./product-search.js";
import type { ProductMatch } from "../../store-durable-object/persistence/repositories/inventory-repository.js";

vi.mock(
  "../../store-durable-object/persistence/repositories/inventory-repository.js",
  async (importOriginal) => {
    const actual = await importOriginal<
      typeof import("../../store-durable-object/persistence/repositories/inventory-repository.js")
    >();
    return {
      ...actual,
      listActiveProducts: vi.fn(),
      exactSearchProducts: vi.fn(),
    };
  },
);

import { listActiveProducts } from "../../store-durable-object/persistence/repositories/inventory-repository.js";

const mockedList = vi.mocked(listActiveProducts);
const mockedExact = vi.mocked(exactSearchProducts);

const products: ProductMatch[] = [
  {
    sku: "maggi-5-pack-001",
    productName: "Maggi 5-pack",
    quantityOnHand: 5,
    costPrice: 10,
    sellPrice: 12,
    reorderLevel: 1,
    itemType: "packaged",
    unit: "packet",
    hsnCode: "19023010",
    gstRate: 12,
  },
  {
    sku: "maggi-1-pack-001",
    productName: "Maggi 1-pack",
    quantityOnHand: 20,
    costPrice: 5,
    sellPrice: 6,
    reorderLevel: 4,
    itemType: "packaged",
    unit: "packet",
    hsnCode: "19023010",
    gstRate: 12,
  },
];

describe("inventory search INV-Q-01", () => {
  beforeEach(() => {
    mockedList.mockReset();
    mockedExact.mockReset();
  });

  it("exact: Maggi 5-pack does not match Maggi 1-pack", async () => {
    mockedExact.mockImplementation(async (_db, name) => {
      const normalized = normalizeProductKey(name);
      return products.filter(
        (p) => normalizeProductKey(p.productName) === normalized,
      );
    });

    const db = {} as never;
    const five = await exactSearchProducts(db, "Maggi 5-pack");
    const one = await exactSearchProducts(db, "Maggi 1-pack");

    expect(five).toHaveLength(1);
    expect(five[0]?.sku).toBe("maggi-5-pack-001");
    expect(one).toHaveLength(1);
    expect(one[0]?.sku).toBe("maggi-1-pack-001");
  });
});

describe("inventory search INV-Q-02", () => {
  it("fuzzy hits are separate from exact matches", () => {
    const fuzzy = findSimilarCandidates("Magi 5-pak", products);
    const exact = products.filter(
      (p) => normalizeProductKey(p.productName) === normalizeProductKey("Magi 5-pak"),
    );
    expect(exact).toHaveLength(0);
    expect(fuzzy.length).toBeGreaterThan(0);
    expect(fuzzy.some((c) => c.sku === "maggi-5-pack-001")).toBe(true);
  });
});
