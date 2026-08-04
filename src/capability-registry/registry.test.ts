import { describe, expect, it } from "vitest";
import {
  getCapabilityContextForDecision,
  getCapabilityDescriptionsForPlanning,
  getRegisteredCapabilityIds,
  invokeCapability,
} from "./index.js";

describe("capability registry REG-01", () => {
  it("exports all 5 capability IDs", () => {
    const ids = getRegisteredCapabilityIds();
    expect(ids).toEqual(
      expect.arrayContaining([
        "user_profile",
        "inventory",
        "billing",
        "khata",
        "analytics",
      ]),
    );
    expect(ids).toHaveLength(5);
  });

  it("includes Variant B descriptions in planning prompt", () => {
    const text = getCapabilityDescriptionsForPlanning();
    expect(text).toContain("user_profile (system)");
    expect(text).toContain("inventory (business)");
    expect(text).not.toContain("my_shop_profile");
  });

  it("includes registry summary for decision context", () => {
    const text = getCapabilityContextForDecision();
    expect(text).toContain("user_profile tools:");
    expect(text).toContain("read_shop_profile");
    expect(text).toContain("inventory tools:");
    expect(text).toContain("query_inventory");
  });
});

describe("capability registry REG-02", () => {
  const stubIds = ["billing", "khata", "analytics"] as const;

  for (const id of stubIds) {
    it(`${id} stub returns unavailable`, async () => {
      const result = await invokeCapability(
        id,
        { objectiveId: "o1", description: "test" },
        {} as never,
        {} as never,
        {} as never,
      );
      expect(result).toEqual({
        status: "unavailable",
        capabilityId: id,
        reason: "not_implemented",
      });
    });
  }

  it("inventory is implemented (not unavailable stub)", async () => {
    const result = await invokeCapability(
      "inventory",
      { objectiveId: "o1", description: "test" },
      {
        geminiApiKey: "fake",
        inbound: { kind: "text", text: "test" },
        ownerProfile: {
          shopName: null,
          ownerName: null,
          gstRegistered: null,
          gstin: null,
          instructions: [],
          confirmationTimeoutMs: 300_000,
          completeAutonomy: false,
        },
        storeId: "s1",
        correlationId: "c1",
        updateId: 1,
        chatId: 1,
        activeSessionId: "sess",
        turns: [],
        storeInitialized: true,
      },
      {} as never,
      {} as never,
    );
    expect(result.status).not.toBe("unavailable");
  });
});
