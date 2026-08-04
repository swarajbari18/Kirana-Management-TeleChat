import { describe, expect, it, vi, beforeEach } from "vitest";
import type { CapabilityResult } from "../../capability-registry/types.js";
import type { StructuredCapabilityPlan } from "../types.js";
import type { OrchestrationContext } from "../types.js";

vi.mock("../../capability-registry/index.js", () => ({
  invokeCapability: vi.fn(),
}));

import { invokeCapability } from "../../capability-registry/index.js";
import { executePhase } from "./dependency-scheduler.js";

const baseCtx = {
  storeId: "store-1",
  correlationId: "corr-1",
  updateId: 1,
  chatId: 1,
  inbound: { kind: "text" as const, text: "test" },
  geminiApiKey: "key",
  activeSessionId: "s1",
  turns: [],
  storeInitialized: true,
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
} satisfies OrchestrationContext;

function mockRunContext() {
  return {
    appendTrace: vi.fn(async () => "evt-1"),
    storeBcInvocation: vi.fn(),
    getPreservedObjectiveResult: vi.fn(() => undefined),
  };
}

const mockedInvoke = vi.mocked(invokeCapability);

describe("executePhase dependency scheduler", () => {
  beforeEach(() => {
    mockedInvoke.mockReset();
  });

  it("runs independents when sibling returns clarification_needed", async () => {
    mockedInvoke.mockImplementation(async (_id, objective) => {
      if (objective.objectiveId === "o1") {
        return {
          status: "clarification_needed",
          reason: "gstin_required",
          requiredInfo: "Please provide GSTIN",
        } satisfies CapabilityResult;
      }
      return {
        status: "completed",
        verifiedFacts: { shopName: "Test Shop" },
      } satisfies CapabilityResult;
    });

    const plan: StructuredCapabilityPlan = {
      businessIntent: "Fetch profile and read shop",
      objectives: [
        {
          objectiveId: "o1",
          objectiveDescription: "needs info",
          capabilityId: "user_profile",
          dependencies: [],
        },
        {
          objectiveId: "o2",
          objectiveDescription: "read profile",
          capabilityId: "user_profile",
          dependencies: [],
        },
        {
          objectiveId: "o3",
          objectiveDescription: "blocked by o1",
          capabilityId: "user_profile",
          dependencies: ["o1"],
        },
      ],
    };

    const result = await executePhase(
      plan,
      baseCtx,
      {} as never,
      {} as never,
      mockRunContext() as never,
    );

    expect(result.objectives.o1?.status).toBe("clarification_needed");
    expect(result.objectives.o2?.status).toBe("completed");
    expect(result.objectives.o3?.status).toBe("skipped_blocked");
    expect(mockedInvoke).toHaveBeenCalledTimes(2);
  });

  it("skips dependent when dependency denied", async () => {
    mockedInvoke.mockImplementation(async (_id, objective) => {
      if (objective.objectiveId === "o1") {
        return { status: "denied", reason: "user_rejected" } satisfies CapabilityResult;
      }
      return {
        status: "completed",
        verifiedFacts: {},
      } satisfies CapabilityResult;
    });

    const plan: StructuredCapabilityPlan = {
      businessIntent: "Fetch profile and read shop",
      objectives: [
        {
          objectiveId: "o1",
          objectiveDescription: "update",
          capabilityId: "user_profile",
          dependencies: [],
        },
        {
          objectiveId: "o2",
          objectiveDescription: "depends on o1",
          capabilityId: "user_profile",
          dependencies: ["o1"],
        },
      ],
    };

    const result = await executePhase(
      plan,
      baseCtx,
      {} as never,
      {} as never,
      mockRunContext() as never,
    );

    expect(result.objectives.o1?.status).toBe("denied");
    expect(result.objectives.o2?.status).toBe("skipped_blocked");
    expect(mockedInvoke).toHaveBeenCalledTimes(1);
  });

  it("STAT-02: blocks dependent when dependency is not_supported", async () => {
    mockedInvoke.mockImplementation(async (_id, objective) => {
      if (objective.objectiveId === "o1") {
        return {
          status: "not_supported",
          reason: "wrong capability",
        } satisfies CapabilityResult;
      }
      return {
        status: "completed",
        verifiedFacts: {},
      } satisfies CapabilityResult;
    });

    const plan: StructuredCapabilityPlan = {
      businessIntent: "Update inventory",
      objectives: [
        {
          objectiveId: "o1",
          objectiveDescription: "wrong domain",
          capabilityId: "user_profile",
          dependencies: [],
        },
        {
          objectiveId: "o2",
          objectiveDescription: "depends on o1",
          capabilityId: "user_profile",
          dependencies: ["o1"],
        },
      ],
    };

    const result = await executePhase(
      plan,
      baseCtx,
      {} as never,
      {} as never,
      mockRunContext() as never,
    );

    expect(result.objectives.o1?.status).toBe("not_supported");
    expect(result.objectives.o2?.status).toBe("skipped_blocked");
  });

  it("STAT-02: blocks dependent when dependency is unavailable", async () => {
    mockedInvoke.mockImplementation(async () => ({
      status: "unavailable",
      capabilityId: "inventory",
      reason: "not_implemented",
    } satisfies CapabilityResult));

    const plan: StructuredCapabilityPlan = {
      businessIntent: "Check stock",
      objectives: [
        {
          objectiveId: "o1",
          objectiveDescription: "check sugar",
          capabilityId: "inventory",
          dependencies: [],
        },
        {
          objectiveId: "o2",
          objectiveDescription: "depends on o1",
          capabilityId: "user_profile",
          dependencies: ["o1"],
        },
      ],
    };

    const result = await executePhase(
      plan,
      baseCtx,
      {} as never,
      {} as never,
      mockRunContext() as never,
    );

    expect(result.objectives.o1?.status).toBe("unavailable");
    expect(result.objectives.o2?.status).toBe("skipped_blocked");
    expect(mockedInvoke).toHaveBeenCalledTimes(1);
  });

  it("BP-CROSS-01 passes priorObjectiveResults from completed dependencies", async () => {
    mockedInvoke.mockImplementation(async (_id, objective) => {
      if (objective.objectiveId === "bill") {
        return {
          status: "completed",
          verifiedFacts: {
            finalized: true,
            bill_id: "bill-abc",
            payment_method: "cash",
          },
        } satisfies CapabilityResult;
      }
      return {
        status: "completed",
        verifiedFacts: { sale_committed: true },
      } satisfies CapabilityResult;
    });

    const plan: StructuredCapabilityPlan = {
      businessIntent: "sale",
      objectives: [
        {
          objectiveId: "bill",
          objectiveDescription: "finalize",
          capabilityId: "billing",
          dependencies: [],
        },
        {
          objectiveId: "inv",
          objectiveDescription: "commit",
          capabilityId: "inventory",
          dependencies: ["bill"],
        },
      ],
    };

    await executePhase(
      plan,
      baseCtx,
      {} as never,
      {} as never,
      mockRunContext() as never,
    );

    const invCall = mockedInvoke.mock.calls.find(
      ([, obj]) => obj.objectiveId === "inv",
    );
    expect(invCall?.[1].priorObjectiveResults?.bill).toEqual({
      finalized: true,
      bill_id: "bill-abc",
      payment_method: "cash",
    });
  });
});
