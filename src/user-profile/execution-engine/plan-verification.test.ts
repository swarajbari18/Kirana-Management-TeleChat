import { describe, expect, it } from "vitest";
import { verifyToolPlan } from "./plan-verification.js";

describe("verifyToolPlan", () => {
  it("rejects unknown tool", () => {
    const result = verifyToolPlan({
      operations: [
        {
          operationId: "op1",
          operationDescription: "test",
          toolName: "unknown_tool",
          parameters: {},
          dependencies: [],
        },
      ],
    });
    expect(result.valid).toBe(false);
  });

  it("rejects incomplete GST facet", () => {
    const result = verifyToolPlan({
      operations: [
        {
          operationId: "op1",
          operationDescription: "tax",
          toolName: "propose_tax_registration_update",
          parameters: { gstRegistered: true },
          dependencies: [],
        },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("gstin");
  });
});
