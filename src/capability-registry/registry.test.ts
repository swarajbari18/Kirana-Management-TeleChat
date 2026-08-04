import { describe, expect, it, vi } from "vitest";
import {
  getCapabilityContextForDecision,
  getCapabilityDescriptionsForPlanning,
  getRegisteredCapabilityIds,
  invokeCapability,
} from "./index.js";

vi.mock(
  "../store-durable-object/persistence/repositories/analytics-repository.js",
  () => ({
    countFinalizedBills: vi.fn(async () => 0),
  }),
);

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
    expect(text).toContain("billing tools:");
    expect(text).toContain("manage_draft_bill");
    expect(text).toContain("khata tools:");
    expect(text).toContain("query_khata");
    expect(text).toContain("analytics tools:");
    expect(text).toContain("generate_analytics");
  });
});

describe("capability registry REG-02", () => {
  it("analytics returns completed without blueprint stub", async () => {
    const result = await invokeCapability(
      "analytics",
      { objectiveId: "o1", description: "today sales" },
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
          artifactsEnabled: true,
          defaultPaymentMethod: null,
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
    expect(result.status).toBe("completed");
    expect(result).not.toEqual({
      status: "unavailable",
      capabilityId: "analytics",
      reason: "not_implemented",
    });
  });

  it("khata is implemented (not unavailable stub)", async () => {
    const result = await invokeCapability(
      "khata",
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
          artifactsEnabled: true,
          defaultPaymentMethod: null,
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

  it("billing is implemented (not unavailable stub)", async () => {
    const result = await invokeCapability(
      "billing",
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
          artifactsEnabled: true,
          defaultPaymentMethod: null,
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
          artifactsEnabled: true,
          defaultPaymentMethod: null,
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
