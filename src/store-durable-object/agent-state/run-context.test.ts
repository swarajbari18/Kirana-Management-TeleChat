import { describe, expect, it } from "vitest";
import { createRunContext } from "./run-context.js";
import type { ExecutionPhaseResult } from "../../global-orchestrator/execution-engine/types.js";

const baseCtx = {
  storeId: "store-1",
  correlationId: "corr-1",
  updateId: 1,
  chatId: 1,
  inbound: { kind: "text" as const, text: "How much sugar is left?" },
  geminiApiKey: "key",
  activeSessionId: "s1",
  turns: [],
  storeInitialized: true,
  ownerProfile: {
    shopName: "Test Shop",
    ownerName: null,
    gstRegistered: null,
    gstin: null,
    instructions: [],
    confirmationTimeoutMs: 300_000,
    completeAutonomy: false,
  },
};

describe("run-context CTX-01", () => {
  it("decisionContextSlice includes registry and tool surface", () => {
    const runContext = createRunContext({} as never, baseCtx);
    runContext.currentPlan = {
      businessIntent: "check stock",
      objectives: [
        {
          objectiveId: "o1",
          objectiveDescription: "check sugar",
          capabilityId: "inventory",
          dependencies: [],
        },
      ],
    };

    const phaseResult: ExecutionPhaseResult = {
      objectives: {
        o1: {
          status: "unavailable",
          result: {
            status: "unavailable",
            capabilityId: "inventory",
            reason: "not_implemented",
          },
        },
      },
    };

    const slice = runContext.decisionContextSlice(phaseResult);
    expect(slice).toContain("Capability registry:");
    expect(slice).toContain("user_profile tools:");
    expect(slice).toContain("read_shop_profile");
    expect(slice).toContain("not_implemented");
  });
});

describe("run-context CTX-02", () => {
  it("respondContextSlice includes Decision JSON when provided", () => {
    const runContext = createRunContext({} as never, baseCtx);
    runContext.currentPlan = {
      businessIntent: "check stock",
      objectives: [
        {
          objectiveId: "o1",
          objectiveDescription: "check sugar",
          capabilityId: "inventory",
          dependencies: [],
        },
      ],
    };

    const phaseResult: ExecutionPhaseResult = {
      objectives: {
        o1: {
          status: "unavailable",
          result: {
            status: "unavailable",
            capabilityId: "inventory",
            reason: "not_implemented",
          },
        },
      },
    };

    const decision = {
      action: "respond" as const,
      rationale: "inventory not available",
    };

    const slice = runContext.respondContextSlice(phaseResult, decision);
    expect(slice).toContain('"action": "respond"');
    expect(slice).toContain("Execution summary:");
    expect(slice).toContain("inventory");
  });
});
