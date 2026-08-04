import { describe, expect, it, vi, beforeEach } from "vitest";
import { queryInventory } from "./tools/query-inventory.js";
import { ClarificationError } from "./errors.js";
import { followingToolKind } from "./agent-state.js";
import type { ToolExecutionPlanContext } from "../capability-registry/capability-blueprint.js";

vi.mock(
  "../store-durable-object/persistence/repositories/inventory-repository.js",
  async (importOriginal) => {
    const actual = await importOriginal<
      typeof import("../store-durable-object/persistence/repositories/inventory-repository.js")
    >();
    return {
      ...actual,
      exactSearchProducts: vi.fn(),
      listActiveProducts: vi.fn(),
      listLowStockProducts: vi.fn(),
      getProductBySku: vi.fn(),
    };
  },
);

import {
  exactSearchProducts,
  listActiveProducts,
} from "../store-durable-object/persistence/repositories/inventory-repository.js";

const mockedExact = vi.mocked(exactSearchProducts);
const mockedList = vi.mocked(listActiveProducts);

const maggi = {
  sku: "maggi-5-pack-001",
  productName: "Maggi 5-pack",
  quantityOnHand: 50,
  costPrice: 10,
  sellPrice: 12,
  reorderLevel: 10,
  itemType: "packaged" as const,
  unit: "packet" as const,
  hsnCode: "19023010",
  gstRate: 12 as const,
  isActive: true,
  createdAt: "now",
  updatedAt: "now",
};

function planContext(
  ordered: Array<{ operationId: string; toolName: string }>,
  currentOperationId: string,
): ToolExecutionPlanContext {
  return {
    orderedOperations: ordered.map((op) => ({
      ...op,
      operationDescription: op.toolName,
      parameters: {},
      dependencies: [],
    })),
    currentOperationId,
  };
}

beforeEach(() => {
  mockedExact.mockReset();
  mockedList.mockReset();
});

describe("followingToolKind", () => {
  it("detects register vs identity_write vs none", () => {
    const ops = [
      { operationId: "q1", toolName: "query_inventory" },
      { operationId: "u1", toolName: "update_inventory" },
    ];
    expect(followingToolKind(ops, "q1")).toBe("identity_write");

    const reg = [
      { operationId: "q1", toolName: "query_inventory" },
      { operationId: "r1", toolName: "register_inventory" },
    ];
    expect(followingToolKind(reg, "q1")).toBe("register");

    expect(
      followingToolKind([{ operationId: "q1", toolName: "query_inventory" }], "q1"),
    ).toBe("none");
  });
});

describe("query_inventory exact-zero behavior", () => {
  const priorEmpty = {
    byOperationId: new Map(),
    byToolName: new Map(),
  };
  const db = {} as never;

  it("throws clarification when update follows (fuzzy only in query)", async () => {
    mockedExact.mockResolvedValue([]);
    mockedList.mockResolvedValue([maggi]);

    await expect(
      queryInventory(
        db,
        { product_name: "Magi 5-pak" },
        priorEmpty,
        planContext(
          [
            { operationId: "q1", toolName: "query_inventory" },
            { operationId: "u1", toolName: "update_inventory" },
          ],
          "q1",
        ),
      ),
    ).rejects.toBeInstanceOf(ClarificationError);
  });

  it("throws clarification when allocate follows", async () => {
    mockedExact.mockResolvedValue([]);
    mockedList.mockResolvedValue([maggi]);

    await expect(
      queryInventory(
        db,
        { product_name: "Magi 5-pak" },
        priorEmpty,
        planContext(
          [
            { operationId: "q1", toolName: "query_inventory" },
            { operationId: "a1", toolName: "allocate_inventory" },
          ],
          "q1",
        ),
      ),
    ).rejects.toBeInstanceOf(ClarificationError);
  });

  it("continues for register path with similarCandidates in agentState only", async () => {
    mockedExact.mockResolvedValue([]);
    mockedList.mockResolvedValue([maggi]);

    const result = await queryInventory(
      db,
      { product_name: "Brand New Product" },
      priorEmpty,
      planContext(
        [
          { operationId: "q1", toolName: "query_inventory" },
          { operationId: "r1", toolName: "register_inventory" },
        ],
        "q1",
      ),
    );

    expect(result.agentState.exactMatchCount).toBe(0);
    expect(result.agentState.similarCandidates).toBeDefined();
    expect(result.verifiedFacts).not.toHaveProperty("similarCandidates");
    expect(result.verifiedFacts.found).toBe(false);
  });

  it("standalone not-found keeps similarCandidates out of verifiedFacts", async () => {
    mockedExact.mockResolvedValue([]);
    mockedList.mockResolvedValue([maggi]);

    const result = await queryInventory(
      db,
      { product_name: "Magi 5-pak" },
      priorEmpty,
      planContext([{ operationId: "q1", toolName: "query_inventory" }], "q1"),
    );

    expect(result.verifiedFacts).toEqual({
      exactMatchCount: 0,
      productName: "Magi 5-pak",
      found: false,
    });
    expect(result.verifiedFacts).not.toHaveProperty("similarCandidates");
    expect(result.agentState.similarCandidates?.length).toBeGreaterThan(0);
  });
});
