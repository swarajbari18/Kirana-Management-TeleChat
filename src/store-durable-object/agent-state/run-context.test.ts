import { describe, expect, it } from "vitest";
import { createRunContext } from "./run-context.js";
import type { ExecutionPhaseResult } from "../../global-orchestrator/execution-engine/types.js";
import type { CapabilityResult } from "../../capability-registry/types.js";

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
    artifactsEnabled: true,
    defaultPaymentMethod: null,
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

describe("run-context BC re-invoke context", () => {
  it("preserves tool plan in bcInvocationState (Fix 1)", () => {
    const runContext = createRunContext({} as never, baseCtx);
    const toolPlan = { operations: [{ operationId: "op1", toolName: "query_inventory" }] };
    const result: CapabilityResult = {
      status: "completed",
      verifiedFacts: { sku: "maggi-001" },
    };

    runContext.storeBcInvocation("o1", toolPlan, result, {
      capabilityId: "inventory",
      objectiveDescription: "find Maggi SKU",
    });

    expect(runContext.getBcPriorPlan("o1")).toEqual(toolPlan);
    expect(runContext.getBcPriorResults("o1")).toEqual(result);
    expect(runContext.bcInvocationLog).toHaveLength(1);
  });

  it("buildBcStrategicReinvokeContext returns prior round for same capability", () => {
    const runContext = createRunContext({} as never, baseCtx);
    const priorPlan = { operations: [{ operationId: "op1", toolName: "query_inventory" }] };
    const priorResult: CapabilityResult = {
      status: "clarification_needed",
      reason: "ambiguous",
      requiredInfo: "Which atta?",
    };

    runContext.storeBcInvocation("o1", priorPlan, priorResult, {
      capabilityId: "inventory",
      objectiveDescription: "query atta stock",
    });

    runContext.recordReplanVersion(
      {
        businessIntent: "sell atta",
        objectives: [
          {
            objectiveId: "o1",
            objectiveDescription: "query atta stock",
            capabilityId: "inventory",
            dependencies: [],
          },
        ],
      },
      { objectives: { o1: { status: "clarification_needed", result: priorResult } } },
    );

    const strategic = runContext.buildBcStrategicReinvokeContext("inventory");
    expect(strategic).toBeDefined();
    expect(strategic?.priorObjectiveDescription).toBe("query atta stock");
    expect(strategic?.priorToolPlan).toEqual(priorPlan);
    expect(strategic?.priorResults).toEqual(priorResult);
    expect(strategic?.priorPlanVersion).toBe(1);
  });

  it("buildBcStrategicReinvokeContext is undefined on first plan version", () => {
    const runContext = createRunContext({} as never, baseCtx);
    runContext.storeBcInvocation(
      "o1",
      { operations: [] },
      { status: "completed", verifiedFacts: {} },
      {
        capabilityId: "inventory",
        objectiveDescription: "query sugar",
      },
    );

    expect(runContext.buildBcStrategicReinvokeContext("inventory")).toBeUndefined();
  });

  it("does not inject same-plan prior inventory into second inventory objective", () => {
    const runContext = createRunContext({} as never, baseCtx);
    runContext.storeBcInvocation(
      "query",
      { operations: [{ operationId: "q1", toolName: "query_inventory" }] },
      { status: "completed", verifiedFacts: { sku: "maggi-001" } },
      {
        capabilityId: "inventory",
        objectiveDescription: "find Maggi",
      },
    );

    const slices = runContext.buildBcPlanningPriorSlices("inventory", "commit");
    expect(slices).toEqual([]);
  });

  it("buildBcPlanningPriorSlices serializes strategic replan block before new objective", () => {
    const runContext = createRunContext({} as never, baseCtx);
    runContext.storeBcInvocation(
      "o1",
      { operations: [{ operationId: "q1", toolName: "query_inventory" }] },
      { status: "completed", verifiedFacts: { sku: "maggi-001" } },
      {
        capabilityId: "inventory",
        objectiveDescription: "find Maggi SKU",
      },
    );
    runContext.recordReplanVersion(
      {
        businessIntent: "sell",
        objectives: [
          {
            objectiveId: "o1",
            objectiveDescription: "find Maggi SKU",
            capabilityId: "inventory",
            dependencies: [],
          },
        ],
      },
      {
        objectives: {
          o1: {
            status: "completed",
            result: { status: "completed", verifiedFacts: { sku: "maggi-001" } },
          },
        },
      },
    );

    const slices = runContext.buildBcPlanningPriorSlices("inventory", "o2");
    expect(slices).toHaveLength(1);
    expect(slices[0]).toContain("Prior work in this capability during this run");
    expect(slices[0]).toContain("Prior objective: find Maggi SKU");
    expect(slices[0]).toContain("query_inventory");
  });

  it("planningContextSlice strategic_replan includes prior plan JSON from replanHistory (Fix 4)", () => {
    const runContext = createRunContext({} as never, baseCtx);
    const priorPlan = {
      businessIntent: "sell Maggi",
      objectives: [
        {
          objectiveId: "bill",
          objectiveDescription: "finalize bill",
          capabilityId: "billing",
          dependencies: [],
        },
      ],
    };

    runContext.recordReplanVersion(
      priorPlan,
      { objectives: { bill: { status: "completed", result: { status: "completed", verifiedFacts: { bill_id: "b1" } } } } },
      { action: "replan", rationale: "missing inventory commit" },
    );

    const slice = runContext.planningContextSlice("strategic_replan");
    expect(slice).toContain("Replan v1 plan:");
    expect(slice).toContain('"objectiveId": "bill"');
    expect(slice).toContain("Replan v1 results:");
    expect(slice).toContain("Replan v1 decision:");
    expect(slice).toContain("missing inventory commit");
  });

  it("decisionContextSlice includes every BC tool execution", () => {
    const runContext = createRunContext({} as never, baseCtx);
    runContext.storeBcInvocation(
      "obj_inventory_lookup",
      {
        operations: [
          { operationId: "op1", toolName: "query_inventory", parameters: { product_name: "sugar" } },
          { operationId: "op2", toolName: "query_inventory", parameters: { product_name: "Maggi" } },
        ],
      },
      {
        status: "completed",
        verifiedFacts: {
          productLookups: [
            { operationId: "op1", productName: "sugar", found: false },
            { operationId: "op2", productName: "Maggi", found: false },
          ],
        },
      },
      {
        capabilityId: "inventory",
        objectiveDescription: "lookup products",
        toolExecutions: [
          {
            operationId: "op1",
            toolName: "query_inventory",
            parameters: { product_name: "sugar" },
            agentState: { exactMatchCount: 0 },
            verifiedFacts: { productName: "sugar", found: false },
          },
          {
            operationId: "op2",
            toolName: "query_inventory",
            parameters: { product_name: "Maggi" },
            agentState: { exactMatchCount: 0 },
            verifiedFacts: { productName: "Maggi", found: false },
          },
        ],
      },
    );

    const slice = runContext.decisionContextSlice({ objectives: {} });
    expect(slice).toContain("BC tool execution evidence");
    expect(slice).toContain('"product_name": "sugar"');
    expect(slice).toContain('"product_name": "Maggi"');
  });
});
