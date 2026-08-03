import { describe, expect, it, vi, beforeEach } from "vitest";
import type { CapabilityResult } from "../../my-shop-profile/types.js";
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
  },
} satisfies OrchestrationContext;

function mockRunContext() {
  return {
    appendTrace: vi.fn(async () => "evt-1"),
    storeBcInvocation: vi.fn(),
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
          capabilityId: "my_shop_profile",
          dependencies: [],
        },
        {
          objectiveId: "o2",
          objectiveDescription: "read profile",
          capabilityId: "my_shop_profile",
          dependencies: [],
        },
        {
          objectiveId: "o3",
          objectiveDescription: "blocked by o1",
          capabilityId: "my_shop_profile",
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
          capabilityId: "my_shop_profile",
          dependencies: [],
        },
        {
          objectiveId: "o2",
          objectiveDescription: "depends on o1",
          capabilityId: "my_shop_profile",
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
});
