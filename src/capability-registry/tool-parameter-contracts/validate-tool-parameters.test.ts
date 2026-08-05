import { describe, expect, it } from "vitest";
import { INVENTORY_TOOL_CONTRACTS } from "./inventory.js";
import { USER_PROFILE_TOOL_CONTRACTS } from "./user-profile.js";
import { validateStepParameters } from "./validate-tool-parameters.js";

describe("validateStepParameters", () => {
  it("rejects unknown parameter keys", () => {
    const result = validateStepParameters(
      "inventory.update_inventory",
      {
        product_name: "Maggi",
        quantity_delta: 50,
        cost_price: 12,
      },
      INVENTORY_TOOL_CONTRACTS.update_inventory!,
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("quantity_delta");
  });

  it("requires at least one update field for update_inventory", () => {
    const result = validateStepParameters(
      "inventory.update_inventory",
      { product_name: "Maggi" },
      INVENTORY_TOOL_CONTRACTS.update_inventory!,
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("at least one of");
  });

  it("accepts valid quantity on update_inventory", () => {
    const result = validateStepParameters(
      "inventory.update_inventory",
      { quantity: 50 },
      INVENTORY_TOOL_CONTRACTS.update_inventory!,
    );
    expect(result.valid).toBe(true);
  });

  it("rejects non-boolean gstRegistered", () => {
    const result = validateStepParameters(
      "user_profile.propose_tax_registration_update",
      { gstRegistered: "yes" },
      USER_PROFILE_TOOL_CONTRACTS.propose_tax_registration_update!,
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("boolean");
  });

  it("rejects any keys on read_shop_profile", () => {
    const result = validateStepParameters(
      "user_profile.read_shop_profile",
      { extra: true },
      USER_PROFILE_TOOL_CONTRACTS.read_shop_profile!,
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("unknown parameter");
  });
});
