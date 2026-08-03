import { GEMINI_MODEL } from "./constants.js";
import { generateTextWithMeta } from "./gemini-client.js";
import type { RunContext } from "../store-durable-object/agent-state/run-context.js";
import type { ExecutionPhaseResult } from "./execution-engine/types.js";
import type { OrchestrationContext } from "./types.js";

const CLARIFY_SYSTEM_PROMPT = `You are the Response component of the Global Orchestrator.

Your only job: ask the shop owner for missing information in clear natural language.

Combine all clarification needs into ONE message. Use tables or bullets when helpful.
Do NOT expose internal JSON or error codes. Do NOT invent business values.
Output plain text only.`;

export interface GenerateClarifyResponseResult {
  text: string;
  llmTrace: import("./gemini-client.js").GeminiInvocationResult<string>;
}

export async function generateClarifyResponse(
  ctx: OrchestrationContext,
  runContext: RunContext,
  phaseResult: ExecutionPhaseResult,
  clarificationFocus?: string,
): Promise<GenerateClarifyResponseResult> {
  let userPrompt = runContext.clarifyContextSlice(phaseResult);

  if (clarificationFocus) {
    userPrompt += `\n\nFocus for clarification: ${clarificationFocus}`;
  }

  const llmTrace = await generateTextWithMeta(
    ctx.geminiApiKey,
    CLARIFY_SYSTEM_PROMPT,
    userPrompt,
  );

  return { text: llmTrace.result, llmTrace };
}

export { GEMINI_MODEL };
