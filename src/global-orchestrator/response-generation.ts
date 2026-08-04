import { GEMINI_MODEL } from "./constants.js";
import { generateTextWithMeta } from "./gemini-client.js";
import type { RunContext } from "../store-durable-object/agent-state/run-context.js";
import type { ExecutionPhaseResult } from "./execution-engine/types.js";
import type { DecisionResult, OrchestrationContext } from "./types.js";

const ASK_USER_SYSTEM_PROMPT = `You are the Response component of the Global Orchestrator.

Your job: ask the shop owner for missing business information in clear natural language — one message.

You receive the Decision artifact explaining why ask_user was chosen, and only objectives with clarification_needed.

Do NOT ask when execution shows not_supported or unavailable — those are not your path.
Do NOT expose internal JSON or error codes. Do NOT invent business values.
Output plain text only.`;

export interface GenerateAskUserResponseResult {
  text: string;
  llmTrace: import("./gemini-client.js").GeminiInvocationResult<string>;
}

export async function generateAskUserResponse(
  ctx: OrchestrationContext,
  runContext: RunContext,
  phaseResult: ExecutionPhaseResult,
  decision: DecisionResult,
): Promise<GenerateAskUserResponseResult> {
  let userPrompt = runContext.askUserContextSlice(phaseResult, decision);

  const focus = decision.askUserFocus ?? decision.clarificationFocus;
  if (focus) {
    userPrompt += `\n\nFocus for question: ${focus}`;
  }

  const llmTrace = await generateTextWithMeta(
    ctx.geminiApiKey,
    ASK_USER_SYSTEM_PROMPT,
    userPrompt,
  );

  return { text: llmTrace.result, llmTrace };
}

/** @deprecated Use generateAskUserResponse */
export async function generateClarifyResponse(
  ctx: OrchestrationContext,
  runContext: RunContext,
  phaseResult: ExecutionPhaseResult,
  clarificationFocus?: string,
): Promise<GenerateAskUserResponseResult> {
  return generateAskUserResponse(ctx, runContext, phaseResult, {
    action: "ask_user",
    rationale: "clarification needed",
    askUserFocus: clarificationFocus,
  });
}

export { GEMINI_MODEL };
