import type { CapabilityResult } from "../my-shop-profile/types.js";
import { GEMINI_MODEL } from "./constants.js";
import { generateJsonWithMeta } from "./gemini-client.js";
import type { RunContext } from "../store-durable-object/agent-state/run-context.js";
import type { ExecutionPhaseResult } from "./execution-engine/types.js";
import type { DecisionResult, OrchestrationContext } from "./types.js";
import { buildLlmTracePayload } from "./planning-mode.js";

const SYSTEM_PROMPT = `You are the Decision component of the Global Orchestrator.

Your job: judge whether the owner's business intent has been fulfilled given the evidence from ONE completed execution interaction.

You receive:
- The business intent (what the owner wants)
- The execution plan artifact (objectives already assigned to capabilities — do NOT re-plan objectives here)
- The outcome of every objective after the full execution phase (completed, clarification needed, denied, skipped)
- Verified business facts from completed objectives

Ask: Does this evidence satisfy the business intent?

Choose exactly one action:
- replan: intent not met; strategy or objectives must change (explain rationale — Planning will use it)
- clarify: required information missing; owner must answer in chat (explain what is missing)
- respond: intent met, or only acknowledgment needed (e.g. user denied a write)

Output JSON:
{
  "action": "replan" | "clarify" | "respond",
  "rationale": "why this action — especially for replan: what gap remains vs business intent",
  "clarificationFocus": "optional; if clarify: what to ask the owner"
}

You do NOT execute capabilities. You do NOT invent business facts. There is no "continue" — execution already completed for this plan.
Output valid JSON only.`;

export interface DecideNextActionResult {
  decision: DecisionResult;
  llmTrace: import("./gemini-client.js").GeminiInvocationResult<DecisionResult>;
}

export async function decideNextAction(
  ctx: OrchestrationContext,
  runContext: RunContext,
  phaseResult: ExecutionPhaseResult,
): Promise<DecideNextActionResult> {
  const userPrompt = runContext.decisionContextSlice(phaseResult);

  const llmTrace = await generateJsonWithMeta<DecisionResult>(
    ctx.geminiApiKey,
    SYSTEM_PROMPT,
    userPrompt,
  );

  return { decision: llmTrace.result, llmTrace };
}

export function buildDecisionTracePayload(
  llmTrace: import("./gemini-client.js").GeminiInvocationResult<DecisionResult>,
): object {
  return buildLlmTracePayload("go_decision", llmTrace);
}

/** Collect capability results from phase result for backward compatibility */
export function phaseResultToCapabilityResults(
  phaseResult: ExecutionPhaseResult,
): CapabilityResult[] {
  return Object.values(phaseResult.objectives)
    .map((e) => e.result)
    .filter((r): r is CapabilityResult => r !== undefined);
}
