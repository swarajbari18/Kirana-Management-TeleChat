import { describe, expect, it } from "vitest";
import { parameterGroundingCheck } from "./parameter-grounding.js";

describe("inventory parameter grounding INV-PLAN-03", () => {
  const objective =
    "Register Maggi 5-pack 50 packets cost 10 sell 12 HSN 19023010 GST 12%";

  it("passes when grounded fields appear in objective", () => {
    const result = parameterGroundingCheck(objective, {
      operationId: "r1",
      operationDescription: "register",
      toolName: "register_inventory",
      parameters: {
        product_name: "Maggi 5-pack",
        quantity: 50,
        cost_price: 10,
        sell_price: 12,
        hsn_code: "19023010",
        gst_rate: 12,
      },
      dependencies: ["q1"],
    });
    expect(result.valid).toBe(true);
  });

  it("fails when quantity not in objective", () => {
    const result = parameterGroundingCheck("Register Maggi 5-pack", {
      operationId: "r1",
      operationDescription: "register",
      toolName: "register_inventory",
      parameters: {
        product_name: "Maggi 5-pack",
        quantity: 50,
      },
      dependencies: ["q1"],
    });
    expect(result.valid).toBe(false);
    expect(result.diagnostic).toContain("quantity");
  });
});
