import { describe, expect, it, vi, beforeEach } from "vitest";
import { registerInventory } from "./tools/register-inventory.js";
import { updateInventory } from "./tools/update-inventory.js";
import { allocateInventory } from "./tools/allocate-inventory.js";
import type { AgentStatePriorResults } from "../capability-registry/capability-blueprint.js";
import { ClarificationError } from "./errors.js";

vi.mock(
  "../store-durable-object/persistence/repositories/shop-profile-repository.js",
  () => ({
    getShopProfile: vi.fn(async () => ({
      completeAutonomy: true,
      confirmationTimeoutMs: 300_000,
    })),
  }),
);

vi.mock(
  "../store-durable-object/persistence/repositories/inventory-repository.js",
  () => ({
    listActiveProducts: vi.fn(async () => []),
    listAllSkus: vi.fn(async () => []),
    generateSku: vi.fn(() => "maggi-5-pack-001"),
    defaultReorderLevel: vi.fn(() => 10),
    createProductWithMovement: vi.fn(async () => ({
      sku: "maggi-5-pack-001",
      productName: "Maggi 5-pack",
      quantityOnHand: 50,
      costPrice: 10,
      sellPrice: 12,
      hsnCode: "19023010",
      gstRate: 12,
      reorderLevel: 10,
      itemType: "packaged",
      unit: "packet",
      isActive: true,
      createdAt: "now",
      updatedAt: "now",
    })),
    getProductBySku: vi.fn(async () => ({
      sku: "maggi-5-pack-001",
      productName: "Maggi 5-pack",
      quantityOnHand: 50,
      costPrice: 10,
      sellPrice: 12,
      hsnCode: "19023010",
      gstRate: 12,
      reorderLevel: 10,
      itemType: "packaged",
      unit: "packet",
      isActive: true,
      createdAt: "now",
      updatedAt: "now",
    })),
    updateProductWithMovement: vi.fn(async () => ({
      sku: "maggi-5-pack-001",
      productName: "Maggi 5-pack",
      quantityOnHand: 100,
      costPrice: 10,
      sellPrice: 12,
      hsnCode: "19023010",
      gstRate: 12,
      reorderLevel: 10,
      itemType: "packaged",
      unit: "packet",
      isActive: true,
      createdAt: "now",
      updatedAt: "now",
    })),
    getActiveReservedQuantity: vi.fn(async () => 0),
    reserveInventory: vi.fn(async () => ({
      reservationId: "res-1",
      availableAfter: 2,
    })),
    findReservationByIdempotencyKey: vi.fn(async () => undefined),
    resolveReservation: vi.fn(async () => ({
      reservationId: "res-1",
      status: "committed" as const,
    })),
    exactSearchProducts: vi.fn(),
    listLowStockProducts: vi.fn(),
    normalizeProductKey: (s: string) => s.trim().toLowerCase(),
  }),
);

import {
  createProductWithMovement,
  updateProductWithMovement,
  reserveInventory,
  findReservationByIdempotencyKey,
} from "../store-durable-object/persistence/repositories/inventory-repository.js";

const mockedCreate = vi.mocked(createProductWithMovement);
const mockedUpdate = vi.mocked(updateProductWithMovement);
const mockedReserve = vi.mocked(reserveInventory);
const mockedFindReservation = vi.mocked(findReservationByIdempotencyKey);

const priorEmpty: AgentStatePriorResults = {
  byOperationId: new Map(),
  byToolName: new Map([
    [
      "query_inventory",
      {
        exactMatchCount: 0,
        exactMatches: [],
        lookupMode: "product_name",
        similarCandidates: [
          {
            sku: "maggi-5-pack-001",
            productName: "Maggi 5-pack",
            quantityOnHand: 50,
            score: 0.8,
          },
        ],
      },
    ],
  ]),
};

const priorOne: AgentStatePriorResults = {
  byOperationId: new Map(),
  byToolName: new Map([
    [
      "query_inventory",
      {
        exactMatchCount: 1,
        exactMatches: [
          {
            sku: "maggi-5-pack-001",
            productName: "Maggi 5-pack",
            quantityOnHand: 50,
            costPrice: 10,
            sellPrice: 12,
            reorderLevel: 10,
            itemType: "packaged",
            unit: "packet",
            hsnCode: "19023010",
            gstRate: 12,
          },
        ],
        lookupMode: "product_name",
      },
    ],
  ]),
};

const priorMany: AgentStatePriorResults = {
  byOperationId: new Map(),
  byToolName: new Map([
    [
      "query_inventory",
      {
        exactMatchCount: 2,
        exactMatches: [
          {
            sku: "atta-1kg-001",
            productName: "Atta 1kg",
            quantityOnHand: 10,
            costPrice: 40,
            sellPrice: 45,
            reorderLevel: 2,
            itemType: "packaged",
            unit: "kg",
            hsnCode: "11010000",
            gstRate: 0,
          },
          {
            sku: "atta-5kg-001",
            productName: "Atta 5kg",
            quantityOnHand: 5,
            costPrice: 180,
            sellPrice: 200,
            reorderLevel: 1,
            itemType: "packaged",
            unit: "kg",
            hsnCode: "11010000",
            gstRate: 0,
          },
        ],
        lookupMode: "product_name",
      },
    ],
  ]),
};

const ctx = { chatId: 1, updateId: 1, correlationId: "c1" };
const runtimePorts = {} as never;
const db = {} as never;

beforeEach(() => {
  mockedCreate.mockClear();
  mockedUpdate.mockClear();
  mockedReserve.mockClear();
  mockedFindReservation.mockClear();
});

describe("register_inventory INV-R-01", () => {
  beforeEach(() => {
    mockedCreate.mockClear();
  });

  it("raises clarification when exact>=1", async () => {
    const prior = {
      ...priorOne,
      byToolName: new Map([
        [
          "query_inventory",
          {
            exactMatchCount: 1,
            exactMatches: priorOne.byToolName.get("query_inventory")!.exactMatches,
          },
        ],
      ]),
    };

    await expect(
      registerInventory(
        db,
        runtimePorts,
        {
          product_name: "Maggi 5-pack",
          item_type: "packaged",
          unit: "packet",
          quantity: 50,
          cost_price: 10,
          sell_price: 12,
          hsn_code: "19023010",
          gst_rate: 12,
        },
        prior as AgentStatePriorResults,
        ctx,
      ),
    ).rejects.toBeInstanceOf(ClarificationError);
    expect(mockedCreate).not.toHaveBeenCalled();
  });
});

describe("register_inventory INV-R-02", () => {
  it("creates product when exact 0", async () => {
    const result = await registerInventory(
      db,
      runtimePorts,
      {
        product_name: "Maggi 5-pack",
        item_type: "packaged",
        unit: "packet",
        quantity: 50,
        cost_price: 10,
        sell_price: 12,
        hsn_code: "19023010",
        gst_rate: 12,
      },
      priorEmpty,
      ctx,
    );
    expect(mockedCreate).toHaveBeenCalled();
    expect(result.verifiedFacts.sku).toBe("maggi-5-pack-001");
  });
});

describe("update_inventory INV-U-01", () => {
  it("uses sku from agent state", async () => {
    const result = await updateInventory(
      db,
      runtimePorts,
      { quantity: 50 },
      priorOne,
      ctx,
    );
    expect(mockedUpdate).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ sku: "maggi-5-pack-001", quantityDelta: 50 }),
    );
    expect(result.verifiedFacts.quantityOnHand).toBe(100);
  });
});

describe("update_inventory INV-U-02", () => {
  it("clarifies on exact 0 using prior similarCandidates without fuzzy or DB write", async () => {
    await expect(
      updateInventory(db, runtimePorts, { product_name: "Unknown" }, priorEmpty, ctx),
    ).rejects.toSatisfy((err: unknown) => {
      return (
        err instanceof ClarificationError &&
        (err.similarCandidates?.length ?? 0) > 0 &&
        err.message.includes("Maggi 5-pack")
      );
    });
    expect(mockedUpdate).not.toHaveBeenCalled();
  });
});

describe("update_inventory INV-U-03", () => {
  it("returns refusal for negative quantity", async () => {
    const result = await updateInventory(
      db,
      runtimePorts,
      { quantity: -5 },
      priorOne,
      ctx,
    );
    expect(result.refusalMessage).toContain("commit_bill_sale");
    expect(mockedUpdate).not.toHaveBeenCalled();
  });
});

describe("allocate_inventory INV-A-01", () => {
  it("reserve reduces available not on_hand", async () => {
    const result = await allocateInventory(
      db,
      runtimePorts,
      {
        quantity: 3,
        operation: "reserve",
        draft_bill_id: "bill-1",
        idempotency_key: "key-1",
      },
      priorOne,
      ctx,
    );
    expect(mockedReserve).toHaveBeenCalled();
    expect(result.verifiedFacts.quantityOnHand).toBe(50);
    expect(result.verifiedFacts.availableAfter).toBe(2);
  });
});

describe("allocate_inventory INV-A-02", () => {
  it("clarifies on exact 0", async () => {
    await expect(
      allocateInventory(
        db,
        runtimePorts,
        {
          quantity: 3,
          operation: "reserve",
          draft_bill_id: "bill-1",
          idempotency_key: "key-1",
        },
        priorEmpty,
        ctx,
      ),
    ).rejects.toBeInstanceOf(ClarificationError);
    expect(mockedReserve).not.toHaveBeenCalled();
  });
});

describe("allocate_inventory INV-A-03", () => {
  it("idempotent allocate key returns existing reservation", async () => {
    mockedReserve.mockResolvedValueOnce({
      reservationId: "res-existing",
      availableAfter: 2,
    });

    const result = await allocateInventory(
      db,
      runtimePorts,
      {
        quantity: 3,
        operation: "reserve",
        draft_bill_id: "bill-1",
        idempotency_key: "key-existing",
      },
      priorOne,
      ctx,
    );
    expect(result.verifiedFacts.reservationId).toBe("res-existing");
  });
});
