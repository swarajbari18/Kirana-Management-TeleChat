import { describe, expect, it } from "vitest";
import { parameterGroundingCheck } from "./parameter-grounding.js";

describe("parameterGroundingCheck", () => {
  it("requires gstin when gstRegistered true", () => {
    const result = parameterGroundingCheck(
      { objectiveDescription: "Register for GST", userMessage: "" },
      {
      operationId: "op1",
      operationDescription: "tax",
      toolName: "propose_tax_registration_update",
      parameters: { gstRegistered: true },
      dependencies: [],
    });
    expect(result.valid).toBe(false);
    expect(result.diagnostic).toContain("gstin");
  });

  it("requires at least one identity field", () => {
    const result = parameterGroundingCheck(
      { objectiveDescription: "Update shop name", userMessage: "" },
      {
      operationId: "op1",
      operationDescription: "identity",
      toolName: "propose_shop_identity_update",
      parameters: {},
      dependencies: [],
    });
    expect(result.valid).toBe(false);
  });

  it("requires non-empty instruction", () => {
    const result = parameterGroundingCheck(
      { objectiveDescription: 'Remember "always greet"', userMessage: "" },
      {
      operationId: "op1",
      operationDescription: "instruction",
      toolName: "update_instruction_preference",
      parameters: { instruction: "" },
      dependencies: [],
    });
    expect(result.valid).toBe(false);
  });

  it("passes valid tax update", () => {
    const result = parameterGroundingCheck(
      { objectiveDescription: "Set GSTIN", userMessage: "" },
      {
      operationId: "op1",
      operationDescription: "tax",
      toolName: "propose_tax_registration_update",
      parameters: { gstRegistered: true, gstin: "22AAAAA0000A1Z5" },
      dependencies: [],
    });
    expect(result.valid).toBe(true);
  });
});
