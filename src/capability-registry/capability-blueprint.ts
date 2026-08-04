import type { BusinessObjective } from "./index.js";
import type { OrchestrationContext } from "../global-orchestrator/types.js";
import {
  GEMINI_MODEL,
  MAX_BC_TOOL_PLAN_VERIFY_RETRIES,
} from "../global-orchestrator/constants.js";
import { generateJsonWithMeta } from "../global-orchestrator/gemini-client.js";
import type { RunContext } from "../store-durable-object/agent-state/run-context.js";
import type { RuntimePorts } from "../store-durable-object/runtime-ports/types.js";
import type { StoreDatabase } from "../store-durable-object/persistence/db.js";
import type { CapabilityResult, StructuredToolPlan } from "./types.js";

export interface ToolPlanVerificationResult {
  valid: boolean;
  reason?: string;
  diagnostics?: string[];
}

export interface ParameterGroundingResult {
  valid: boolean;
  diagnostic?: string;
  userMessage?: string;
}

export type ToolExecutor = (
  step: StructuredToolPlan["operations"][number],
  ctx: OrchestrationContext,
  runtimePorts: RuntimePorts,
  db: StoreDatabase,
) => Promise<Record<string, unknown>>;

export interface CapabilityBlueprintConfig {
  id: string;
  kind: "system" | "business";
  toolPlannerSystemPrompt: string;
  verifyToolPlan: (plan: StructuredToolPlan) => ToolPlanVerificationResult;
  sortByDependencies: (
    steps: StructuredToolPlan["operations"],
  ) => StructuredToolPlan["operations"];
  parameterGroundingCheck: (
    objectiveDescription: string,
    step: StructuredToolPlan["operations"][number],
  ) => ParameterGroundingResult;
  executeTool: ToolExecutor;
  mapToolError: (error: unknown) => CapabilityResult;
}

async function planTools(
  config: CapabilityBlueprintConfig,
  ctx: OrchestrationContext,
  objective: BusinessObjective,
  priorPlan?: unknown,
  priorResults?: CapabilityResult,
  harnessDiagnostic?: string,
): Promise<
  import("../global-orchestrator/gemini-client.js").GeminiInvocationResult<
    StructuredToolPlan
  >
> {
  const parts: string[] = [
    `Objective: ${objective.description}`,
    `User message: ${ctx.inbound.text}`,
    `Profile: ${JSON.stringify(ctx.ownerProfile)}`,
  ];

  if (priorPlan) {
    parts.push(`Prior tool plan:\n${JSON.stringify(priorPlan, null, 2)}`);
  }
  if (priorResults) {
    parts.push(
      `Prior execution results:\n${JSON.stringify(priorResults, null, 2)}`,
    );
  }
  if (harnessDiagnostic) {
    parts.push(`Plan verification or grounding feedback: ${harnessDiagnostic}`);
  }

  return generateJsonWithMeta<StructuredToolPlan>(
    ctx.geminiApiKey,
    config.toolPlannerSystemPrompt,
    parts.join("\n\n"),
  );
}

export function createCapabilityExecutor(
  config: CapabilityBlueprintConfig,
): (
  objective: BusinessObjective,
  ctx: OrchestrationContext,
  runtimePorts: RuntimePorts,
  db: StoreDatabase,
  runContext?: RunContext,
  parentEventId?: string,
) => Promise<CapabilityResult> {
  return async function executeCapability(
    objective: BusinessObjective,
    ctx: OrchestrationContext,
    runtimePorts: RuntimePorts,
    db: StoreDatabase,
    runContext?: RunContext,
    parentEventId?: string,
  ): Promise<CapabilityResult> {
    try {
      const priorPlan = runContext?.getBcPriorPlan(objective.objectiveId);
      const priorResults = runContext?.getBcPriorResults(objective.objectiveId);

      let plan: StructuredToolPlan | null = null;
      let verification: ToolPlanVerificationResult = { valid: false };
      let harnessAttempt = 0;
      let lastDiagnostic: string | undefined;

      while (harnessAttempt < MAX_BC_TOOL_PLAN_VERIFY_RETRIES) {
        const llmTrace = await planTools(
          config,
          ctx,
          objective,
          priorPlan,
          priorResults,
          lastDiagnostic,
        );

        if (runContext) {
          await runContext.traceLlmInvocation(
            "capability",
            config.id,
            "TOOL_PLAN",
            {
              step: "bc_plan",
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
            parentEventId,
          );
        }

        plan = llmTrace.result;
        verification = config.verifyToolPlan(plan);

        if (verification.valid) {
          if (runContext) {
            await runContext.appendTrace(
              "verify",
              config.id,
              "TOOL_PLAN_VERIFIED",
              { operationCount: plan.operations.length },
              parentEventId,
            );
          }
          break;
        }

        if (runContext) {
          await runContext.appendTrace(
            "verify",
            config.id,
            "TOOL_PLAN_VERIFICATION_FAILED",
            {
              diagnostics: verification.diagnostics ?? [verification.reason],
            },
            parentEventId,
          );
        }

        lastDiagnostic = (verification.diagnostics ?? [verification.reason]).join(
          "; ",
        );
        harnessAttempt += 1;
      }

      if (!plan || !verification.valid) {
        const emptyPlan =
          !plan?.operations || plan.operations.length === 0;
        if (emptyPlan) {
          return {
            status: "not_supported",
            reason:
              verification.reason ?? "No applicable tools for this objective",
          };
        }
        return {
          status: "clarification_needed",
          reason: verification.reason ?? "Invalid tool plan",
          requiredInfo:
            verification.reason ??
            "Please provide more details about your request.",
        };
      }

      const ordered = config.sortByDependencies(plan.operations);
      const facts: Record<string, unknown> = {};

      for (const step of ordered) {
        let groundingAttempt = 0;
        let grounding = config.parameterGroundingCheck(
          objective.description,
          step,
        );

        while (
          !grounding.valid &&
          groundingAttempt < MAX_BC_TOOL_PLAN_VERIFY_RETRIES
        ) {
          if (runContext) {
            await runContext.appendTrace(
              "verify",
              config.id,
              "PARAMETER_GROUNDING_FAILED",
              { diagnostic: grounding.diagnostic, toolName: step.toolName },
              parentEventId,
            );
          }

          const llmTrace = await planTools(
            config,
            ctx,
            objective,
            plan,
            undefined,
            grounding.diagnostic,
          );

          if (runContext) {
            await runContext.traceLlmInvocation(
              "capability",
              config.id,
              "TOOL_PLAN",
              {
                step: "bc_plan_grounding_retry",
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
              parentEventId,
            );
          }

          plan = llmTrace.result;
          const reverify = config.verifyToolPlan(plan);
          if (!reverify.valid) {
            const emptyPlan =
              !plan?.operations || plan.operations.length === 0;
            if (emptyPlan) {
              return {
                status: "not_supported",
                reason:
                  reverify.reason ?? "No applicable tools for this objective",
              };
            }
            return {
              status: "clarification_needed",
              reason: reverify.reason ?? "Invalid tool plan after grounding retry",
              requiredInfo:
                grounding.userMessage ??
                "Please provide more details about your request.",
            };
          }

          const reordered = config.sortByDependencies(plan.operations);
          const retriedStep = reordered.find(
            (op) => op.operationId === step.operationId,
          );
          if (retriedStep) {
            grounding = config.parameterGroundingCheck(
              objective.description,
              retriedStep,
            );
          } else {
            break;
          }
          groundingAttempt += 1;
        }

        if (!grounding.valid) {
          return {
            status: "clarification_needed",
            reason: grounding.diagnostic ?? "parameter_grounding_failed",
            requiredInfo:
              grounding.userMessage ??
              "Please provide more details about your request.",
          };
        }

        const result = await config.executeTool(
          step,
          ctx,
          runtimePorts,
          db,
        );
        Object.assign(facts, result);

        if (runContext) {
          await runContext.appendTrace(
            "capability",
            config.id,
            "TOOL_EXECUTED",
            {
              toolName: step.toolName,
              parameters: step.parameters,
              resultSummary: Object.keys(result),
            },
            parentEventId,
          );
        }
      }

      if (runContext) {
        runContext.storeBcInvocation(objective.objectiveId, plan, {
          status: "completed",
          verifiedFacts: facts,
        });
      }

      return { status: "completed", verifiedFacts: facts };
    } catch (error) {
      return config.mapToolError(error);
    }
  };
}
