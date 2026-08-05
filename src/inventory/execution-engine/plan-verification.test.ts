import { describe, expect, it } from "vitest";
import { verifyToolPlan } from "./plan-verification.js";

describe("inventory plan verification INV-PLAN-01", () => {
  it("rejects update without query_inventory", () => {
    const result = verifyToolPlan({
      operations: [
        {
          operationId: "u1",
          operationDescription: "update",
          toolName: "update_inventory",
          parameters: { product_name: "Maggi", quantity: 50 },
          dependencies: [],
        },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain(
      "query_inventory is a required dependency of update_inventory",
    );
  });

  it("rejects register without query_inventory", () => {
    const result = verifyToolPlan({
      operations: [
        {
          operationId: "r1",
          operationDescription: "register",
          toolName: "register_inventory",
          parameters: {
            product_name: "Maggi",
            item_type: "packaged",
            unit: "packet",
            quantity: 50,
            cost_price: 10,
            sell_price: 12,
            hsn_code: "19023010",
            gst_rate: 12,
          },
          dependencies: [],
        },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain(
      "query_inventory is a required dependency of register_inventory",
    );
  });

  it("rejects allocate without query_inventory", () => {
    const result = verifyToolPlan({
      operations: [
        {
          operationId: "a1",
          operationDescription: "allocate",
          toolName: "allocate_inventory",
          parameters: {
            quantity: 3,
            operation: "reserve",
            draft_bill_id: "bill-1",
            idempotency_key: "key-1",
          },
          dependencies: [],
        },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain(
      "query_inventory is a required dependency of allocate_inventory",
    );
  });
});

describe("inventory plan verification INV-PLAN-03", () => {
  it("accepts register-only when prior query_inventory agent state exists", () => {
    const result = verifyToolPlan(
      {
        operations: [
          {
            operationId: "r1",
            operationDescription: "register",
            toolName: "register_inventory",
            parameters: {
              product_name: "Maggi 70g",
              item_type: "packaged",
              unit: "packet",
              quantity: 50,
              cost_price: 12,
              sell_price: 14,
              hsn_code: "19023010",
              gst_rate: 12,
            },
            dependencies: [],
          },
        ],
      },
      {
        capabilityId: "inventory",
        priorQueryAgentStates: [
          {
            productName: "Maggi 70g",
            agentState: {
              exactMatchCount: 0,
              exactMatches: [],
              lookupMode: "product_name",
            },
          },
        ],
      },
    );
    expect(result.valid).toBe(true);
  });

  it("accepts update-only when prior query found exactly one match", () => {
    const result = verifyToolPlan(
      {
        operations: [
          {
            operationId: "u1",
            operationDescription: "update",
            toolName: "update_inventory",
            parameters: { product_name: "Maggi 70g", quantity: 50 },
            dependencies: [],
          },
        ],
      },
      {
        capabilityId: "inventory",
        priorQueryAgentStates: [
          {
            productName: "Maggi 70g",
            agentState: {
              exactMatchCount: 1,
              exactMatches: [{ sku: "maggi-70g", productName: "Maggi 70g" }],
              lookupMode: "product_name",
            },
          },
        ],
      },
    );
    expect(result.valid).toBe(true);
  });
});

describe("inventory plan verification INV-PLAN-02", () => {
  it("rejects low_stock combined with product_name", () => {
    const result = verifyToolPlan({
      operations: [
        {
          operationId: "q1",
          operationDescription: "query",
          toolName: "query_inventory",
          parameters: { low_stock: true, product_name: "Maggi" },
          dependencies: [],
        },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("low_stock cannot be combined");
  });
});
