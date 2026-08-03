import { GEMINI_MODEL } from "./constants.js";
import { generateTextWithMeta } from "./gemini-client.js";
import type { RunContext } from "../store-durable-object/agent-state/run-context.js";
import type { ExecutionPhaseResult } from "./execution-engine/types.js";
import type { OrchestrationContext } from "./types.js";
import { buildLlmTracePayload } from "./planning-mode.js";

const RESPOND_SYSTEM_PROMPT = `You are the Response component of the Global Orchestrator.

Your only job: write a natural-language message to the shop owner grounded in the verified facts and status outcomes provided.

Do NOT invent shop name, GSTIN, or business data. Follow owner instruction preferences. Be concise.
Output plain text only.`;

const CLARIFY_SYSTEM_PROMPT = `You are the Response component of the Global Orchestrator.

Your only job: ask the shop owner for missing information in clear natural language.

Combine all clarification needs into ONE message. Use tables or bullets when helpful.
Do NOT expose internal JSON or error codes. Do NOT invent business values.
Output plain text only.`;

export interface GenerateResponseResult {
  text: string;
  llmTrace: import("./gemini-client.js").GeminiInvocationResult<string>;
  mode: "respond" | "clarify";
}

export async function generateResponse(
  ctx: OrchestrationContext,
  runContext: RunContext,
  phaseResult: ExecutionPhaseResult,
  mode: "respond" | "clarify",
  clarificationFocus?: string,
): Promise<GenerateResponseResult> {
  const systemPrompt =
    mode === "clarify" ? CLARIFY_SYSTEM_PROMPT : RESPOND_SYSTEM_PROMPT;

  let userPrompt =
    mode === "clarify"
      ? runContext.clarifyContextSlice(phaseResult)
      : runContext.respondContextSlice(phaseResult);

  if (clarificationFocus) {
    userPrompt += `\n\nFocus for clarification: ${clarificationFocus}`;
  }

  const llmTrace = await generateTextWithMeta(
    ctx.geminiApiKey,
    systemPrompt,
    userPrompt,
  );

  return { text: llmTrace.result, llmTrace, mode };
}

export function buildResponseTracePayload(
  mode: "respond" | "clarify",
  llmTrace: import("./gemini-client.js").GeminiInvocationResult<string>,
): object {
  return buildLlmTracePayload(
    mode === "clarify" ? "go_response_clarify" : "go_response",
    llmTrace,
  );
}

export async function regenerateResponseWithDiagnostics(
  ctx: OrchestrationContext,
  runContext: RunContext,
  phaseResult: ExecutionPhaseResult,
  unsupportedClaims: string[],
): Promise<GenerateResponseResult> {
  const userPrompt = `${runContext.respondContextSlice(phaseResult)}

The following claims in your previous response were not supported by verified facts:
${unsupportedClaims.map((c) => `- ${c}`).join("\n")}

Rewrite the response removing or correcting unsupported claims. Output plain text only.`;

  const llmTrace = await generateTextWithMeta(
    ctx.geminiApiKey,
    RESPOND_SYSTEM_PROMPT,
    userPrompt,
  );

  return { text: llmTrace.result, llmTrace, mode: "respond" };
}
