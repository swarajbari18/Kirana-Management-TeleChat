import {
  FAITHFULNESS_SAFE_FALLBACK,
  GEMINI_MODEL,
  MAX_FAITHFULNESS_REGEN,
  MAX_GROUNDED_RESPONSE_SCHEMA_RETRIES,
} from "../constants.js";
import type { RunContext } from "../../store-durable-object/agent-state/run-context.js";
import type { OrchestrationContext, DecisionResult } from "../types.js";
import type { ExecutionPhaseResult } from "../execution-engine/types.js";
import {
  generateGroundedResponseWithSchemaRetry,
  regenerateGroundedResponse,
} from "../grounded-response/generate.js";
import { validateGroundedResponse } from "../grounded-response/schema.js";
import { groundedResponseToDisplayText } from "../grounded-response/types.js";
import {
  countBindings,
  verifyBindings,
  type BindingFailure,
} from "./binding-verifier.js";

function formatBindingDiagnostics(failures: BindingFailure[]): string {
  return failures
    .map(
      (f) =>
        `line ${f.lineIndex}: ${f.reason}` +
        (f.factId ? ` factId=${f.factId}` : "") +
        (f.field ? ` field=${f.field}` : "") +
        (f.expected ? ` expected=${f.expected}` : "") +
        (f.asShown ? ` asShown=${f.asShown}` : ""),
    )
    .join("\n");
}

export async function verifyGroundedResponse(
  ctx: OrchestrationContext,
  runContext: RunContext,
  phaseResult: ExecutionPhaseResult,
  decision?: DecisionResult,
): Promise<string> {
  let bindingDiagnostics: string | undefined;

  for (let regen = 0; regen <= MAX_FAITHFULNESS_REGEN; regen++) {
    const { response, llmTrace } =
      regen === 0
        ? await generateGroundedResponseWithSchemaRetry(
            ctx,
            runContext,
            phaseResult,
            MAX_GROUNDED_RESPONSE_SCHEMA_RETRIES,
            bindingDiagnostics,
            decision,
          )
        : await regenerateGroundedResponse(
            ctx,
            runContext,
            phaseResult,
            bindingDiagnostics!,
            decision,
          );

    const schemaCheck = validateGroundedResponse(response);
    if (!schemaCheck.valid) {
      await runContext.appendTrace(
        "faithfulness",
        "global_orchestrator",
        "FAITHFULNESS_FAILED",
        {
          reason: "invalid_schema",
          errors: schemaCheck.errors,
          attempt: regen + 1,
        },
      );
      if (regen >= MAX_FAITHFULNESS_REGEN) {
        break;
      }
      bindingDiagnostics = schemaCheck.errors.join("; ");
      continue;
    }

    await runContext.traceLlmInvocation(
      "go",
      "global_orchestrator",
      "RESPONSE_GENERATED",
      {
        step:
          regen === 0 ? "go_grounded_response" : "go_grounded_response_regen",
        model: GEMINI_MODEL,
        invocation: llmTrace.invocation,
        output: {
          content: llmTrace.rawContent,
          reasoning: llmTrace.reasoning,
          parsed: schemaCheck.data,
        },
        usage: llmTrace.usage,
        durationMs: llmTrace.durationMs,
      },
    );

    const failures = verifyBindings(
      schemaCheck.data,
      runContext.verifiedFactRegistry,
      runContext.outcomeRegistry,
    );

    if (failures.length === 0) {
      await runContext.appendTrace(
        "faithfulness",
        "global_orchestrator",
        "FAITHFULNESS_VERIFIED",
        {
          lineCount: schemaCheck.data.lines.length,
          bindingCount: countBindings(schemaCheck.data),
        },
      );
      return groundedResponseToDisplayText(schemaCheck.data);
    }

    await runContext.appendTrace(
      "faithfulness",
      "global_orchestrator",
      "FAITHFULNESS_FAILED",
      { failures, attempt: regen + 1 },
    );

    if (regen >= MAX_FAITHFULNESS_REGEN) {
      break;
    }

    bindingDiagnostics = formatBindingDiagnostics(failures);
  }

  return FAITHFULNESS_SAFE_FALLBACK;
}
