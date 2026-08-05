import { GEMINI_MODEL } from "../constants.js";
import {
  generateJsonWithContents,
  generateJsonWithMeta,
  type GeminiContent,
  type GeminiInvocationResult,
} from "../gemini-client.js";
import type { RunContext } from "../../store-durable-object/agent-state/run-context.js";
import type { OrchestrationContext } from "../types.js";
import type { ExecutionPhaseResult } from "../execution-engine/types.js";
import type { DecisionResult } from "../types.js";
import type { GroundedResponse } from "./types.js";

const GROUNDED_RESPONSE_SYSTEM_PROMPT = `You are the Response component of the Global Orchestrator.

Your job: produce natural language for the shop owner grounded in execution evidence and the Decision rationale.

Output valid JSON only:
{
  "lines": [
    {
      "display": "natural language line for the owner",
      "bindings": [
        { "factId": "from Fact Catalog only", "field": "field name", "asShown": "value as shown in display" }
      ],
      "outcomeBindings": [{ "outcomeId": "from Outcome Catalog", "kind": "denied" }]
    }
  ]
}

Rules:
1. Add lines one at a time in order — each line is one thought.
2. Every factual statement needs bindings citing factId from the Fact Catalog.
3. factId identifies product/entity identity — for inventory, cite the SKU's quantity factId even if display says "Maggi".
4. field must match the catalog entry's field.
5. asShown must match how that value appears in display (e.g. "Yes" for booleans).
6. Do not invent factIds. Do not cite product A's factId while stating product B's quantity.
7. Do not state outcomes beyond execution evidence and Decision rationale. Do not invent system capabilities.
8. Prose-only lines (greetings) may have empty bindings only when they state no facts.
9. For denied writes, use outcomeBindings instead of fact bindings.
10. Fields ending in _paise are integer paise in the catalog value; show rupees in display (e.g. ₹504.00). asShown must match the catalog value (paise integer) or the same rupee amount with ₹ prefix.

Fact Catalog:
{fact_catalog_json}

Outcome Catalog:
{outcome_catalog_json}

Verified context also includes owner instructions and user message.`;

function buildSystemPrompt(runContext: RunContext): string {
  const factCatalog = JSON.stringify(runContext.factCatalogForResponse(), null, 2);
  const outcomeCatalog = JSON.stringify(
    runContext.outcomeCatalogForResponse(),
    null,
    2,
  );
  return GROUNDED_RESPONSE_SYSTEM_PROMPT.replace(
    "{fact_catalog_json}",
    factCatalog,
  ).replace("{outcome_catalog_json}", outcomeCatalog);
}

function buildUserPrompt(
  ctx: OrchestrationContext,
  runContext: RunContext,
  phaseResult: ExecutionPhaseResult,
  decision?: DecisionResult,
  bindingDiagnostics?: string,
): string {
  const parts = [runContext.respondContextSlice(phaseResult, decision)];
  if (bindingDiagnostics) {
    parts.push(`Previous response had binding errors:\n${bindingDiagnostics}`);
  }
  return parts.join("\n\n");
}

export interface GenerateGroundedResponseResult {
  response: GroundedResponse;
  llmTrace: GeminiInvocationResult<GroundedResponse>;
}

export async function generateGroundedResponse(
  ctx: OrchestrationContext,
  runContext: RunContext,
  phaseResult: ExecutionPhaseResult,
  decision?: DecisionResult,
  bindingDiagnostics?: string,
): Promise<GenerateGroundedResponseResult> {
  const systemPrompt = buildSystemPrompt(runContext);
  const userPrompt = buildUserPrompt(
    ctx,
    runContext,
    phaseResult,
    decision,
    bindingDiagnostics,
  );

  const llmTrace = await generateJsonWithMeta<GroundedResponse>(
    ctx.geminiApiKey,
    systemPrompt,
    userPrompt,
  );

  return { response: llmTrace.result, llmTrace };
}

export async function regenerateGroundedResponse(
  ctx: OrchestrationContext,
  runContext: RunContext,
  phaseResult: ExecutionPhaseResult,
  bindingDiagnostics: string,
  decision?: DecisionResult,
): Promise<GenerateGroundedResponseResult> {
  return generateGroundedResponse(
    ctx,
    runContext,
    phaseResult,
    decision,
    bindingDiagnostics,
  );
}

export async function generateGroundedResponseWithSchemaRetry(
  ctx: OrchestrationContext,
  runContext: RunContext,
  phaseResult: ExecutionPhaseResult,
  maxRetries: number,
  bindingDiagnostics?: string,
  decision?: DecisionResult,
): Promise<GenerateGroundedResponseResult> {
  const systemPrompt = buildSystemPrompt(runContext);
  let contents: GeminiContent[] = [
    {
      role: "user",
      parts: [
        {
          text: buildUserPrompt(
            ctx,
            runContext,
            phaseResult,
            decision,
            bindingDiagnostics,
          ),
        },
      ],
    },
  ];

  let lastErrors: string[] = [];
  let lastTrace: GeminiInvocationResult<GroundedResponse> | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const llmTrace = await generateJsonWithContents<GroundedResponse>(
      ctx.geminiApiKey,
      systemPrompt,
      contents,
    );
    lastTrace = llmTrace;

    const validation = (
      await import("./schema.js")
    ).validateGroundedResponse(llmTrace.result);
    if (validation.valid) {
      return { response: validation.data, llmTrace };
    }

    lastErrors = validation.errors;
    if (attempt >= maxRetries) {
      break;
    }

    contents = [
      ...contents,
      { role: "model", parts: [{ text: llmTrace.rawContent }] },
      {
        role: "user",
        parts: [
          {
            text: `Invalid JSON shape: ${lastErrors.join("; ")}. Fix and output valid GroundedResponse JSON only.`,
          },
        ],
      },
    ];
  }

  if (!lastTrace) {
    throw new Error("generateGroundedResponseWithSchemaRetry: no LLM response");
  }

  return { response: lastTrace.result, llmTrace: lastTrace };
}

export { GROUNDED_RESPONSE_SYSTEM_PROMPT, GEMINI_MODEL };
