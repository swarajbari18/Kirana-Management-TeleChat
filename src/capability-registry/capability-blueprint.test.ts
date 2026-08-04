import { describe, expect, it, vi, beforeEach } from "vitest";
import type { StructuredToolPlan } from "./types.js";
import { createRunContext } from "../store-durable-object/agent-state/run-context.js";

vi.mock("../global-orchestrator/gemini-client.js", () => ({
  generateJsonWithMeta: vi.fn(),
}));

import { generateJsonWithMeta } from "../global-orchestrator/gemini-client.js";
import { createCapabilityExecutor } from "./capability-blueprint.js";

const mockedGenerate = vi.mocked(generateJsonWithMeta);

const baseOrchestrationCtx = {
  geminiApiKey: "fake",
  inbound: { kind: "text" as const, text: "commit sale" },
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
};

function makeExecutor() {
  return createCapabilityExecutor({
    id: "inventory",
    kind: "business",
    toolPlannerSystemPrompt: "test",
    verifyToolPlan: (plan: StructuredToolPlan) => ({
      valid: plan.operations.length > 0,
      reason: plan.operations.length === 0 ? "empty" : undefined,
    }),
    sortByDependencies: (steps) => steps,
    parameterGroundingCheck: () => ({ valid: true }),
    executeTool: async () => ({
      verifiedFacts: { committed: true },
      agentState: {},
    }),
    mapToolError: (e) => ({
      status: "error",
      diagnostics: String(e),
    }),
  });
}

describe("capability blueprint STAT-01", () => {
  beforeEach(() => {
    mockedGenerate.mockReset();
    mockedGenerate.mockResolvedValue({
      result: { operations: [] } as StructuredToolPlan,
      rawContent: "{}",
      invocation: { systemInstruction: "", contents: [] },
      durationMs: 1,
    } as never);
  });

  it("empty tool plan after retries returns not_supported", async () => {
    const executor = makeExecutor();
    mockedGenerate.mockResolvedValue({
      result: { operations: [] } as StructuredToolPlan,
      rawContent: "{}",
      invocation: { systemInstruction: "", contents: [] },
      durationMs: 1,
    } as never);

    const result = await executor(
      { objectiveId: "o1", description: "update inventory" },
      baseOrchestrationCtx,
      {} as never,
      {} as never,
    );

    expect(result.status).toBe("not_supported");
    if (result.status === "not_supported") {
      expect(result.reason).toContain("empty");
    }
  });
});

describe("capability blueprint BC re-invoke prompt", () => {
  beforeEach(() => {
    mockedGenerate.mockReset();
    mockedGenerate.mockResolvedValue({
      result: {
        operations: [
          {
            operationId: "op1",
            operationDescription: "commit",
            toolName: "commit_bill_sale",
            parameters: { bill_id: "b1" },
            dependencies: [],
          },
        ],
      } as StructuredToolPlan,
      rawContent: "{}",
      invocation: { systemInstruction: "", contents: [{ role: "user", parts: [{ text: "" }] }] },
      durationMs: 1,
    } as never);
  });

  it("includes strategic replan prior context in BC planner prompt (Fix 3)", async () => {
    const runContext = createRunContext({} as never, baseOrchestrationCtx);
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

    const executor = makeExecutor();
    await executor(
      { objectiveId: "o2", description: "commit bill sale for bill b1" },
      baseOrchestrationCtx,
      {} as never,
      {} as never,
      runContext,
    );

    const promptText =
      mockedGenerate.mock.calls[0]?.[2] ?? "";
    expect(promptText.indexOf("Prior invocation (same capability, strategic replan)")).toBeLessThan(
      promptText.indexOf("Objective: commit bill sale for bill b1"),
    );
    expect(promptText).toContain("Prior objective: find Maggi SKU");
    expect(promptText).toContain("query_inventory");
  });
});
