import {
  FAITHFULNESS_SAFE_FALLBACK,
  GEMINI_MODEL,
  MAX_CLAIM_EXTRACTION_RETRIES,
  MAX_FAITHFULNESS_REGEN,
} from "../constants.js";
import {
  generateJsonWithContents,
  type GeminiContent,
} from "../gemini-client.js";
import type { RunContext } from "../../store-durable-object/agent-state/run-context.js";
import type { OrchestrationContext } from "../types.js";
import type { ExecutionPhaseResult } from "../execution-engine/types.js";
import {
  regenerateResponseWithDiagnostics,
  type GenerateResponseResult,
} from "../response-generation.js";
import { validateClaimsPayload, type ClaimsPayload } from "./claim-schema.js";
import { findUnsupportedClaims } from "./fact-matcher.js";
import { buildLlmTracePayload } from "../planning-mode.js";

const EXTRACT_SYSTEM_PROMPT = `You are the Faithfulness Extractor.

Extract factual claims from the assistant response as JSON:
{
  "claims": [
    { "text": "...", "entity": "shop|...", "attribute": "gstin|...", "value": "..." }
  ]
}
If no factual claims, return { "claims": [] }.
Use only these schema keys. Output valid JSON only.`;

async function extractClaims(
  ctx: OrchestrationContext,
  responseText: string,
  runContext: RunContext,
): Promise<ClaimsPayload> {
  const contents: GeminiContent[] = [
    { role: "user", parts: [{ text: responseText }] },
  ];

  let lastErrors: string[] = [];

  for (let attempt = 0; attempt < MAX_CLAIM_EXTRACTION_RETRIES; attempt++) {
    const userContent =
      attempt === 0
        ? responseText
        : `Previous extraction was invalid: ${lastErrors.join("; ")}. Extract claims from:\n${responseText}`;

    const llmTrace = await generateJsonWithContents<ClaimsPayload>(
      ctx.geminiApiKey,
      EXTRACT_SYSTEM_PROMPT,
      [{ role: "user", parts: [{ text: userContent }] }],
    );

    await runContext.traceLlmInvocation(
      "faithfulness",
      "global_orchestrator",
      "FAITHFULNESS_EXTRACT",
      {
        step: "go_faithfulness_extract",
        model: GEMINI_MODEL,
        invocation: llmTrace.invocation,
        output: {
          content: llmTrace.rawContent,
          reasoning: llmTrace.reasoning,
          parsed: llmTrace.result,
        },
        usage: llmTrace.usage,
        durationMs: llmTrace.durationMs,
      },
    );

    const validation = validateClaimsPayload(llmTrace.result);
    if (validation.valid) {
      return validation.data;
    }
    lastErrors = validation.errors;
  }

  return { claims: [] };
}

export async function faithfulnessGate(
  responseText: string,
  ctx: OrchestrationContext,
  runContext: RunContext,
  phaseResult: ExecutionPhaseResult,
  initialResponseTrace?: GenerateResponseResult,
): Promise<string> {
  let currentText = responseText;
  let currentTrace = initialResponseTrace;

  for (let regen = 0; regen <= MAX_FAITHFULNESS_REGEN; regen++) {
    const claimsPayload = await extractClaims(ctx, currentText, runContext);
    const unsupported = findUnsupportedClaims(
      claimsPayload.claims,
      runContext.verifiedFactsFlat(),
    );

    if (unsupported.length === 0) {
      await runContext.appendTrace(
        "faithfulness",
        "global_orchestrator",
        "FAITHFULNESS_VERIFIED",
        { claimCount: claimsPayload.claims.length },
      );
      return currentText;
    }

    await runContext.appendTrace(
      "faithfulness",
      "global_orchestrator",
      "FAITHFULNESS_FAILED",
      {
        unsupported: unsupported.map((c) => c.text),
        attempt: regen + 1,
      },
    );

    if (regen >= MAX_FAITHFULNESS_REGEN) {
      break;
    }

    const regenResult = await regenerateResponseWithDiagnostics(
      ctx,
      runContext,
      phaseResult,
      unsupported.map((c) => c.text),
    );

    await runContext.traceLlmInvocation(
      "go",
      "global_orchestrator",
      "RESPONSE_GENERATED",
      {
        step: "go_response_faithfulness_regen",
        model: GEMINI_MODEL,
        invocation: regenResult.llmTrace.invocation,
        output: {
          content: regenResult.llmTrace.rawContent,
          reasoning: regenResult.llmTrace.reasoning,
        },
        usage: regenResult.llmTrace.usage,
        durationMs: regenResult.llmTrace.durationMs,
      },
    );

    currentText = regenResult.text;
    currentTrace = regenResult;
  }

  if (currentTrace) {
    void buildLlmTracePayload("go_response", currentTrace.llmTrace);
  }

  return FAITHFULNESS_SAFE_FALLBACK;
}
