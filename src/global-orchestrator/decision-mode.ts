import type { CapabilityResult } from "../capability-registry/types.js";
import { GEMINI_MODEL } from "./constants.js";
import { generateJsonWithMeta } from "./gemini-client.js";
import type { RunContext } from "../store-durable-object/agent-state/run-context.js";
import type { ExecutionPhaseResult } from "./execution-engine/types.js";
import type { DecisionResult, OrchestrationContext } from "./types.js";
import { buildLlmTracePayload } from "./planning-mode.js";

const SYSTEM_PROMPT = `You are the Decision component of the Global Orchestrator.

Your job: judge whether the owner's business intent has been fulfilled given the evidence from ONE completed execution interaction.

You receive runtime truth: business intent, capability registry summary, execution plan, per-objective CapabilityResult (including not_supported, unavailable, clarification_needed with distinct semantics), and verified facts.

Choose exactly one action:
- replan: evidence shows the plan or capability assignment must change (e.g. not_supported, wrong capability)
- ask_user: a tool needs missing business information from the owner (clarification_needed from a tool)
- respond: terminal — explain outcome to owner (success, denial, unavailable, exhausted replan)

Output JSON:
{
  "action": "replan" | "ask_user" | "respond",
  "rationale": "why this action",
  "askUserFocus": "optional; if ask_user: what to ask the owner"
}

You do NOT execute capabilities. You do NOT invent business facts. Reason only from provided execution evidence.
Output valid JSON only.`;

export interface DecideNextActionResult {
  decision: DecisionResult;
  llmTrace: import("./gemini-client.js").GeminiInvocationResult<DecisionResult>;
}

export function normalizeDecision(
  raw: DecisionResult | (Omit<DecisionResult, "action"> & { action: string }),
): DecisionResult {
  if (raw.action === "clarify") {
    return {
      action: "ask_user",
      rationale: raw.rationale,
      askUserFocus: raw.askUserFocus ?? raw.clarificationFocus,
    };
  }
  if (raw.action === "ask_user" && !raw.askUserFocus && raw.clarificationFocus) {
    return {
      action: "ask_user",
      rationale: raw.rationale,
      askUserFocus: raw.clarificationFocus,
      clarificationFocus: raw.clarificationFocus,
    };
  }
  if (
    raw.action === "replan" ||
    raw.action === "ask_user" ||
    raw.action === "respond"
  ) {
    return raw as DecisionResult;
  }
  return {
    action: "respond",
    rationale: raw.rationale ?? "unknown action",
  };
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

  return { decision: normalizeDecision(llmTrace.result), llmTrace };
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
