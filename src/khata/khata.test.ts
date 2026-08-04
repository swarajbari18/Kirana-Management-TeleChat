import { describe, expect, it } from "vitest";
import { verifyToolPlan } from "./execution-engine/plan-verification.js";
import { parameterGroundingCheck } from "./parameter-grounding.js";
import { buildKhataFactRecords } from "../global-orchestrator/verified-facts/khata-fact-registry.js";
import { formatPaymentWithCreateCustomerConfirmation } from "./confirmation/format-khata-confirmation-table.js";

describe("KHATA-PLAN-01", () => {
  it("rejects manage without query_khata for name-driven ops", () => {
    const result = verifyToolPlan({
      operations: [
        {
          operationId: "m1",
          operationDescription: "credit",
          toolName: "manage_khata_transaction",
          parameters: {
            operation: "record_manual_credit",
            customer_name: "Ramesh",
            amount: 500,
          },
          dependencies: [],
        },
      ],
    });
    expect(result.valid).toBe(false);
  });
});

describe("KHATA-F-01", () => {
  it("builds balance fact and excludes refusal from catalog path", () => {
    const records = buildKhataFactRecords(
      "khata-obj",
      "khata",
      "query_khata",
      {
        customer_id: "c1",
        customer_name: "Ramesh",
        balance_after_paise: 20000,
      },
    );
    expect(records.some((r) => r.field === "balance_after_paise")).toBe(true);
    expect(records.some((r) => r.catalogLabel.includes("Ramesh"))).toBe(true);
  });
});

describe("KHATA-GROUND-01", () => {
  it("grounds customer_name in objective", () => {
    const ok = parameterGroundingCheck("Ramesh balance", {
      operationId: "q1",
      operationDescription: "query",
      toolName: "query_khata",
      parameters: { customer_name: "Ramesh" },
      dependencies: [],
    });
    expect(ok.valid).toBe(true);

    const fail = parameterGroundingCheck("Priya balance", {
      operationId: "q1",
      operationDescription: "query",
      toolName: "query_khata",
      parameters: { customer_name: "Ramesh" },
      dependencies: [],
    });
    expect(fail.valid).toBe(false);
  });
});

describe("KHATA-PAY-CONF-01", () => {
  it("unknown customer payment uses create-and-pay confirmation copy", () => {
    const text = formatPaymentWithCreateCustomerConfirmation({
      customerName: "Vijay",
      amountPaise: 10_000,
    });
    expect(text).toContain("Customer not in khata");
    expect(text).toContain("create and record payment");
    expect(text).toContain("Vijay");
    expect(text).toContain("₹100.00");
    expect(text).toContain("Resulting balance: ₹-100.00");
    expect(text).toContain("A new khata customer will be created");
    expect(text).toContain("Confirm?");
  });
});
