import type { ExecutionResult } from "../worker-telegram-adapter/contracts/index.js";
import type { RuntimePorts } from "../store-durable-object/runtime-ports/types.js";
import type { StoreDatabase } from "../store-durable-object/persistence/db.js";
import {
  createRunContext,
  type RunContext,
} from "../store-durable-object/agent-state/run-context.js";
import {
  GENERIC_ORCHESTRATION_ERROR,
  GEMINI_MODEL,
  MAX_GO_GEMINI_ROUNDS,
  MAX_GO_PLAN_VERIFY_RETRIES,
} from "./constants.js";
import { decideNextAction } from "./decision-mode.js";
import { executePhase } from "./execution-engine/index.js";
import { verifyCapabilityPlan } from "./execution-engine/plan-verification.js";
import { verifyGroundedResponse } from "./faithfulness/index.js";
import { planCapabilities } from "./planning-mode.js";
import { generateClarifyResponse } from "./response-generation.js";
import type { OrchestrationContext } from "./types.js";

function terminalSafeOutcome(text: string): ExecutionResult {
  return {
    status: "ok",
    messages: [{ type: "text", text }],
    attachments: [],
  };
}

function deliver(text: string): ExecutionResult {
  return {
    status: "ok",
    messages: [{ type: "text", text }],
    attachments: [],
  };
}

export async function orchestrate(
  ctx: OrchestrationContext,
  runtimePorts: RuntimePorts,
  db: StoreDatabase,
  existingRunContext?: RunContext,
): Promise<ExecutionResult> {
  const runContext = existingRunContext ?? createRunContext(db, ctx);

  try {
    await runContext.ensureContextAssembled();

    while (runContext.strategicRound < MAX_GO_GEMINI_ROUNDS) {
      runContext.strategicRound += 1;

      const planningMode =
        runContext.replanHistory.length > 0 ? "strategic_replan" : "initial";

      let planResult = await planCapabilities(
        ctx,
        runContext,
        planningMode,
      );
      let plan = planResult.plan;

      runContext.businessIntent = plan.businessIntent?.trim() ?? null;
      runContext.currentPlan = plan;

      await runContext.traceLlmInvocation(
        "go",
        "global_orchestrator",
        "CAPABILITY_PLAN",
        {
          step: "go_plan",
          model: GEMINI_MODEL,
          invocation: planResult.llmTrace.invocation,
          output: {
            content: planResult.llmTrace.rawContent,
            reasoning: planResult.llmTrace.reasoning,
            parsed: plan,
          },
          usage: planResult.llmTrace.usage,
          durationMs: planResult.llmTrace.durationMs,
        },
      );

      let verification = verifyCapabilityPlan(plan);
      let harnessAttempt = 0;

      while (!verification.valid && harnessAttempt < MAX_GO_PLAN_VERIFY_RETRIES) {
        await runContext.appendTrace(
          "verify",
          "global_orchestrator",
          "PLAN_VERIFICATION_FAILED",
          { diagnostics: verification.diagnostics ?? [verification.reason] },
        );

        harnessAttempt += 1;
        planResult = await planCapabilities(
          ctx,
          runContext,
          "harness_retry",
          verification,
        );
        plan = planResult.plan;
        runContext.businessIntent = plan.businessIntent?.trim() ?? null;
        runContext.currentPlan = plan;

        await runContext.traceLlmInvocation(
          "go",
          "global_orchestrator",
          "CAPABILITY_PLAN",
          {
            step: "go_plan_retry",
            model: GEMINI_MODEL,
            invocation: planResult.llmTrace.invocation,
            output: {
              content: planResult.llmTrace.rawContent,
              reasoning: planResult.llmTrace.reasoning,
              parsed: plan,
            },
            usage: planResult.llmTrace.usage,
            durationMs: planResult.llmTrace.durationMs,
          },
        );

        verification = verifyCapabilityPlan(plan);
      }

      if (!verification.valid) {
        runContext.discard();
        return terminalSafeOutcome(
          "Could you tell me more about what you'd like to update for your shop?",
        );
      }

      await runContext.appendTrace(
        "verify",
        "global_orchestrator",
        "PLAN_VERIFIED",
        { objectiveCount: plan.objectives.length },
      );

      const phaseResult = await executePhase(
        plan,
        ctx,
        runtimePorts,
        db,
        runContext,
      );

      runContext.buildRegistryFromPhaseResult(plan, phaseResult);

      const { decision, llmTrace: decisionTrace } = await decideNextAction(
        ctx,
        runContext,
        phaseResult,
      );

      runContext.priorDecisions.push(decision);

      await runContext.traceLlmInvocation(
        "go",
        "global_orchestrator",
        "DECISION",
        {
          step: "go_decision",
          model: GEMINI_MODEL,
          invocation: decisionTrace.invocation,
          output: {
            content: decisionTrace.rawContent,
            reasoning: decisionTrace.reasoning,
            parsed: decision,
          },
          usage: decisionTrace.usage,
          durationMs: decisionTrace.durationMs,
        },
      );

      if (decision.action === "replan") {
        runContext.recordReplanVersion(plan, phaseResult, decision);
        continue;
      }

      if (decision.action === "clarify") {
        const response = await generateClarifyResponse(
          ctx,
          runContext,
          phaseResult,
          decision.clarificationFocus,
        );

        await runContext.traceLlmInvocation(
          "go",
          "global_orchestrator",
          "RESPONSE_GENERATED",
          {
            step: "go_response_clarify",
            model: GEMINI_MODEL,
            invocation: response.llmTrace.invocation,
            output: {
              content: response.llmTrace.rawContent,
              reasoning: response.llmTrace.reasoning,
            },
            usage: response.llmTrace.usage,
            durationMs: response.llmTrace.durationMs,
          },
        );

        runContext.discard();
        return deliver(response.text);
      }

      const finalText = await verifyGroundedResponse(
        ctx,
        runContext,
        phaseResult,
      );

      runContext.discard();
      return deliver(finalText);
    }

    await runContext.appendTrace(
      "go",
      "global_orchestrator",
      "ORCHESTRATION_ERROR",
      { reason: "strategic_cap_exceeded" },
    );

    runContext.discard();
    return terminalSafeOutcome(GENERIC_ORCHESTRATION_ERROR);
  } catch (error) {
    const message = error instanceof Error ? error.message : "UnknownError";
    const stack = error instanceof Error ? error.stack : undefined;

    try {
      await runContext.appendTrace(
        "go",
        "global_orchestrator",
        "ORCHESTRATION_ERROR",
        { message, stack },
      );
    } catch {
      // Best-effort trace on error path.
    }

    console.log(
      JSON.stringify({
        layer: "runtime",
        action: "orchestration_error",
        correlationId: ctx.correlationId,
        updateId: ctx.updateId,
        storeId: ctx.storeId,
        error: message,
        stack,
      }),
    );

    runContext.discard();
    return {
      status: "error",
      messages: [{ type: "text", text: GENERIC_ORCHESTRATION_ERROR }],
      attachments: [],
    };
  }
}

export type {
  ConversationContext,
  ConversationTurn,
  OrchestrationContext,
} from "./types.js";
