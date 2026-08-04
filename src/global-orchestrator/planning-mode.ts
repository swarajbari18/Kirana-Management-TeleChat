import { getCapabilityDescriptionsForPlanning } from "../capability-registry/index.js";
import { GEMINI_MODEL } from "./constants.js";
import {
  generateJsonWithMeta,
  type GeminiInvocationResult,
} from "./gemini-client.js";
import type { RunContext } from "../store-durable-object/agent-state/run-context.js";
import type {
  OrchestrationContext,
  StructuredCapabilityPlan,
} from "./types.js";

const SYSTEM_PROMPT = `You are the Planning component of the Global Orchestrator for a Kirana shop assistant.

Your job: produce a JSON execution plan that assigns business objectives to registered capabilities by domain.

You do NOT call tools. You do NOT execute operations. You ONLY output the plan JSON.

Registered capabilities (reference — code enforces validity):
${getCapabilityDescriptionsForPlanning()}

Output JSON shape:
{
  "businessIntent": "string — owner outcome in plain language",
  "objectives": [
    {
      "objectiveId": "string",
      "objectiveDescription": "string",
      "capabilityId": "registered capability id",
      "dependencies": ["other_objective_id_if_needed"]
    }
  ]
}

businessIntent must reflect the user's message, NOT repeat a single objectiveDescription verbatim when multiple objectives exist.

On replan or retry, use the evidence in the conversation context (prior plan, results, decisions, or verifier feedback) to revise intent, objectives, or assignments. Do not invent business facts.

Output valid JSON only.`;

export interface PlanCapabilitiesResult {
  plan: StructuredCapabilityPlan;
  llmTrace: GeminiInvocationResult<StructuredCapabilityPlan>;
}

export async function planCapabilities(
  ctx: OrchestrationContext,
  runContext: RunContext,
  mode: "initial" | "strategic_replan" | "harness_retry" = "initial",
  harnessRetry?: import("./execution-engine/plan-verification.js").PlanVerificationResult,
): Promise<PlanCapabilitiesResult> {
  const userPrompt = runContext.planningContextSlice(mode, harnessRetry);

  const llmTrace = await generateJsonWithMeta<StructuredCapabilityPlan>(
    ctx.geminiApiKey,
    SYSTEM_PROMPT,
    userPrompt,
  );

  return {
    plan: llmTrace.result,
    llmTrace,
  };
}

export function buildLlmTracePayload(
  step: string,
  llmTrace: GeminiInvocationResult<unknown>,
): object {
  return {
    step,
    model: GEMINI_MODEL,
    invocation: llmTrace.invocation,
    output: {
      content: llmTrace.rawContent,
      reasoning: llmTrace.reasoning,
      parsed: llmTrace.result,
    },
    usage: llmTrace.usage,
    durationMs: llmTrace.durationMs,
  };
}
