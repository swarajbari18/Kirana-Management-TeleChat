import { getCapabilityDescriptions } from "../capability-registry/index.js";
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

Your job: from the shop owner's conversation and business context, produce a JSON execution plan.

Thought process (one reasoning flow — may be a single response):
1. Understand the owner's business intent — what outcome do they want?
2. Express that intent as one or more business objectives (outcomes, not tools or implementation).
3. Assign each objective to exactly one registered capability. Stop at the capability boundary.

You do NOT call tools. You do NOT execute operations. You ONLY output the plan JSON.

Registered capabilities (reference — code enforces validity):
${getCapabilityDescriptions()}

Output JSON shape:
{
  "objectives": [
    {
      "objectiveId": "string",
      "objectiveDescription": "string",
      "capabilityId": "my_shop_profile",
      "dependencies": ["other_objective_id_if_needed"]
    }
  ]
}

On replan or retry, use the evidence in the conversation context (prior plan, results, decisions, or verifier feedback) to revise intent, objectives, or assignments. Do not invent business facts.

Output valid JSON only.`;

export interface PlanCapabilitiesResult {
  plan: StructuredCapabilityPlan;
  businessIntent?: string;
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

  const businessIntent =
    llmTrace.result.objectives?.[0]?.objectiveDescription ??
    ctx.inbound.text;

  return {
    plan: llmTrace.result,
    businessIntent,
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
