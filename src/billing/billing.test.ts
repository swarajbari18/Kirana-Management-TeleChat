import { describe, expect, it, vi } from "vitest";
import { computeDraftTotals, computeLineTax, isBelowCost } from "./gst.js";
import { projectDraftFromEvents } from "./draft-projection.js";
import { validateOperationAgainstStateMachine } from "./draft-state-machine.js";
import { formatAvailabilityRefusal } from "./availability.js";
import { parameterGroundingCheck } from "./parameter-grounding.js";
import { verifyToolPlan } from "./execution-engine/plan-verification.js";
import { formatFinalizeConfirmationTable } from "./confirmation/format-finalize-confirmation-table.js";
import type { DraftLine } from "./types.js";

describe("BILL-GST-01", () => {
  it("computes per-line paise rounding and CGST/SGST split", () => {
    const tax = computeLineTax(2, 1200, 12);
    expect(tax.taxablePaise).toBe(2400);
    expect(tax.cgstPaise).toBe(144);
    expect(tax.sgstPaise).toBe(144);
    expect(tax.lineTotalPaise).toBe(2688);
  });

  it("sums draft totals from lines", () => {
    const lines: DraftLine[] = [
      {
        lineRef: "l1",
        lineNo: 1,
        sku: "s1",
        productName: "Sugar",
        quantity: 2,
        unit: "kg",
        sellPricePaise: 5000,
        costPricePaise: 4000,
        hsnCode: "1701",
        gstRate: 5,
      },
    ];
    const totals = computeDraftTotals(lines);
    expect(totals.subtotalPaise).toBe(10000);
    expect(totals.cgstTotalPaise).toBe(250);
    expect(totals.sgstTotalPaise).toBe(250);
    expect(totals.grandTotalPaise).toBe(10500);
  });
});

describe("BILL-EVENT-01", () => {
  it("rejects add_item without start_bill via state machine", () => {
    expect(() =>
      validateOperationAgainstStateMachine("add_item", null, false),
    ).toThrow(/Bill not created/);
  });
});

describe("BILL-BELOW-01", () => {
  it("flags below-cost lines in confirmation table", () => {
    const line: DraftLine = {
      lineRef: "l1",
      lineNo: 1,
      sku: "maggi",
      productName: "Maggi",
      quantity: 1,
      unit: "packet",
      sellPricePaise: 1000,
      costPricePaise: 1200,
      hsnCode: "1902",
      gstRate: 12,
    };
    expect(isBelowCost(line)).toBe(true);
    const table = formatFinalizeConfirmationTable({
      customerName: "Ramesh",
      paymentMethod: "cash",
      lines: [line],
      subtotalPaise: 1000,
      cgstTotalPaise: 60,
      sgstTotalPaise: 60,
      grandTotalPaise: 1120,
    });
    expect(table).toContain("SELLING BELOW COST");
  });
});

describe("BILL-GROUND-01", () => {
  it("fails grounding when product_name not in objective or user message", () => {
    const result = parameterGroundingCheck(
      {
        objectiveDescription: "Bill for Ramesh sugar",
        userMessage: "",
      },
      {
      operationId: "op1",
      operationDescription: "add",
      toolName: "manage_draft_bill",
      parameters: {
        operation: "add_item",
        product_name: "Maggi",
        quantity: 2,
      },
      dependencies: [],
    });
    expect(result.valid).toBe(false);
  });

  it("passes when product_name appears in user message but not billing objective", () => {
    const result = parameterGroundingCheck(
      {
        objectiveDescription: "Create a new draft bill with the items and set payment method to UPI",
        userMessage:
          "/new make a bill: 2kg sugar, 1 Aashirvaad atta 5kg, 4 Maggi, 1 Amul butter, UPI",
      },
      {
        operationId: "op1",
        operationDescription: "add",
        toolName: "manage_draft_bill",
        parameters: {
          operation: "add_item",
          product_name: "sugar",
          quantity: 2,
        },
        dependencies: [],
      },
    );
    expect(result.valid).toBe(true);
  });
});

describe("BILL-AVAIL-01", () => {
  it("formats refusal with on_hand, reserved, available, requested", () => {
    const message = formatAvailabilityRefusal([
      {
        sku: "maggi-001",
        productName: "Maggi",
        quantityOnHand: 10,
        reservedQuantity: 8,
        availableQuantity: 2,
        requestedQuantity: 5,
      },
    ]);
    expect(message).toContain("on hand, 8 reserved");
    expect(message).toContain("available 2");
    expect(message).toContain("requested 5");
  });
});

describe("BILL-RESOLVE-03", () => {
  it("plan verification accepts draft_target enum", () => {
    const result = verifyToolPlan({
      operations: [
        {
          operationId: "f1",
          operationDescription: "finalize",
          toolName: "finalize_bill",
          parameters: { draft_target: "ambiguous" },
          dependencies: [],
        },
      ],
    });
    expect(result.valid).toBe(true);
  });
});

describe("draft projection replay", () => {
  it("replays start, add, qty change events", () => {
    const projection = projectDraftFromEvents([
      {
        id: "e1",
        billId: "bill-1",
        eventType: "bill_started",
        payload: { customer_name: "Ramesh" },
        updateId: 1,
        correlationId: "c1",
        createdAt: "t1",
      },
      {
        id: "e2",
        billId: "bill-1",
        eventType: "item_added",
        payload: {
          line_ref: "lr1",
          sku: "sugar",
          product_name: "Sugar",
          quantity: 2,
          unit: "kg",
          sell_price_paise: 5000,
          cost_price_paise: 4000,
          hsn_code: "1701",
          gst_rate: 5,
        },
        updateId: 1,
        correlationId: "c1",
        createdAt: "t2",
      },
      {
        id: "e3",
        billId: "bill-1",
        eventType: "item_qty_changed",
        payload: { line_ref: "lr1", quantity: 3 },
        updateId: 1,
        correlationId: "c1",
        createdAt: "t3",
      },
    ]);
    expect(projection?.customerName).toBe("Ramesh");
    expect(projection?.lines).toHaveLength(1);
    expect(projection?.lines[0]?.quantity).toBe(3);
  });
});

vi.mock(
  "../store-durable-object/persistence/repositories/billing-repository.js",
  () => ({
    getLatestOpenDraft: vi.fn(),
    findOpenDraftsByCustomer: vi.fn(),
    buildOpenDraftSummaries: vi.fn(),
  }),
);

import { resolveDraftFocus } from "./draft-focus-resolver.js";
import {
  getLatestOpenDraft,
  findOpenDraftsByCustomer,
} from "../store-durable-object/persistence/repositories/billing-repository.js";

const mockedLatest = vi.mocked(getLatestOpenDraft);
const mockedByCustomer = vi.mocked(findOpenDraftsByCustomer);

describe("BILL-RESOLVE-01", () => {
  it("implicit_latest uses latest open draft from repository", async () => {
    mockedLatest.mockResolvedValue({
      billId: "bill-latest",
      status: "open",
      customerName: "Ramesh",
      lastEventAt: "t2",
      createdAt: "t1",
      finalizedAt: null,
    });
    const result = await resolveDraftFocus(
      {} as never,
      {},
      { objectiveId: "o1", description: "add item" },
      "add_item",
    );
    expect(result.billId).toBe("bill-latest");
  });
});

describe("BILL-RESOLVE-02", () => {
  it("by_customer with unique match resolves; ambiguous throws clarify", async () => {
    mockedByCustomer.mockResolvedValueOnce([
      {
        billId: "bill-priya",
        customerName: "Priya",
        lineCount: 2,
        lastEventAt: "t1",
      },
    ]);
    const unique = await resolveDraftFocus(
      {} as never,
      { customer_name: "Priya", draft_target: "by_customer" },
      { objectiveId: "o1", description: "Priya bill" },
      "add_item",
    );
    expect(unique.billId).toBe("bill-priya");

    mockedByCustomer.mockResolvedValueOnce([
      {
        billId: "b1",
        customerName: "Priya",
        lineCount: 1,
        lastEventAt: "t1",
      },
      {
        billId: "b2",
        customerName: "Priya",
        lineCount: 3,
        lastEventAt: "t2",
      },
    ]);
    await expect(
      resolveDraftFocus(
        {} as never,
        { customer_name: "Priya", draft_target: "by_customer" },
        { objectiveId: "o1", description: "Priya bill" },
        "add_item",
      ),
    ).rejects.toThrow(/Multiple open drafts/);
  });
});

describe("plan verification mutex", () => {
  it("rejects finalize mixed with mutating draft ops", () => {
    const result = verifyToolPlan({
      operations: [
        {
          operationId: "d1",
          operationDescription: "add",
          toolName: "manage_draft_bill",
          parameters: { operation: "add_item" },
          dependencies: [],
        },
        {
          operationId: "f1",
          operationDescription: "finalize",
          toolName: "finalize_bill",
          parameters: {},
          dependencies: [],
        },
      ],
    });
    expect(result.valid).toBe(false);
  });
});
