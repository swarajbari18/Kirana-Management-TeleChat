import { describe, expect, it, vi, beforeEach } from "vitest";
import type { StructuredToolPlan } from "./types.js";

vi.mock("../global-orchestrator/gemini-client.js", () => ({
  generateJsonWithMeta: vi.fn(),
}));

import { generateJsonWithMeta } from "../global-orchestrator/gemini-client.js";
import { createCapabilityExecutor } from "./capability-blueprint.js";

const mockedGenerate = vi.mocked(generateJsonWithMeta);

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
    const executor = createCapabilityExecutor({
      id: "user_profile",
      kind: "system",
      toolPlannerSystemPrompt: "test",
      verifyToolPlan: (plan: StructuredToolPlan) => ({
        valid: false,
        reason: "Plan has no operations",
        diagnostics: ["Plan has no operations"],
      }),
      sortByDependencies: (steps) => steps,
      parameterGroundingCheck: () => ({ valid: true }),
      executeTool: async () => ({
        verifiedFacts: {},
        agentState: {},
      }),
      mapToolError: (e) => ({
        status: "error",
        diagnostics: String(e),
      }),
    });

    const result = await executor(
      { objectiveId: "o1", description: "update inventory" },
      {
        geminiApiKey: "fake",
        inbound: { kind: "text", text: "update inventory" },
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

    expect(result.status).toBe("not_supported");
    if (result.status === "not_supported") {
      expect(result.reason).toContain("no operations");
    }
  });
});
