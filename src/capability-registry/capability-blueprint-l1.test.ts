import { describe, expect, it, vi, beforeEach } from "vitest";
import { createCapabilityExecutor } from "./capability-blueprint.js";
import type { StructuredToolPlan } from "./types.js";

vi.mock("../global-orchestrator/gemini-client.js", () => ({
  generateJsonWithMeta: vi.fn(),
}));

import { generateJsonWithMeta } from "../global-orchestrator/gemini-client.js";

const mockedGenerate = vi.mocked(generateJsonWithMeta);

describe("capability blueprint BP-01", () => {
  beforeEach(() => {
    mockedGenerate.mockReset();
  });

  it("second tool sees first tool structured output in priorResults", async () => {
    const seenPrior: Array<Record<string, unknown> | undefined> = [];

    mockedGenerate.mockResolvedValue({
      result: {
        operations: [
          {
            operationId: "q1",
            operationDescription: "query",
            toolName: "query_inventory",
            parameters: { product_name: "Maggi" },
            dependencies: [],
          },
          {
            operationId: "u1",
            operationDescription: "update",
            toolName: "update_inventory",
            parameters: { quantity: 10 },
            dependencies: ["q1"],
          },
        ],
      } as StructuredToolPlan,
      rawContent: "{}",
      invocation: { systemInstruction: "", contents: [] },
      durationMs: 1,
    } as never);

    const executor = createCapabilityExecutor({
      id: "inventory",
      kind: "business",
      toolPlannerSystemPrompt: "test",
      verifyToolPlan: () => ({ valid: true }),
      sortByDependencies: (steps) => steps,
      parameterGroundingCheck: () => ({ valid: true }),
      executeTool: async (step, _ctx, _ports, _db, priorResults) => {
        if (step.toolName === "query_inventory") {
          return {
            verifiedFacts: { exactMatchCount: 1 },
            agentState: {
              exactMatchCount: 1,
              exactMatches: [{ sku: "maggi-001", productName: "Maggi" }],
            },
          };
        }
        seenPrior.push(priorResults.byToolName.get("query_inventory"));
        return {
          verifiedFacts: { sku: "maggi-001" },
          agentState: { updated: true },
        };
      },
      mapToolError: (e) => ({
        status: "error",
        diagnostics: String(e),
      }),
    });

    const result = await executor(
      { objectiveId: "o1", description: "add 10 Maggi" },
      {
        geminiApiKey: "fake",
        inbound: { kind: "text", text: "add 10 Maggi" },
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
    expect(seenPrior[0]?.exactMatchCount).toBe(1);
  });
});
