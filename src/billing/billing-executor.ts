import type { BusinessObjective } from "../capability-registry/index.js";
import type { OrchestrationContext } from "../global-orchestrator/types.js";
import {
  GEMINI_MODEL,
  MAX_BC_TOOL_PLAN_VERIFY_RETRIES,
} from "../global-orchestrator/constants.js";
import { generateJsonWithMeta } from "../global-orchestrator/gemini-client.js";
import type { RunContext } from "../store-durable-object/agent-state/run-context.js";
import type { RuntimePorts } from "../store-durable-object/runtime-ports/types.js";
import type { StoreDatabase } from "../store-durable-object/persistence/db.js";
import type {
  CapabilityResult,
  StructuredToolPlan,
  ToolPlanStep,
} from "../capability-registry/types.js";
import type {
  AgentStatePriorResults,
  ToolExecutionPlanContext,
  ToolStepResult,
} from "../capability-registry/capability-blueprint.js";
import { buildOpenDraftSummaries } from "../store-durable-object/persistence/repositories/billing-repository.js";
import { formatOpenDraftsSummaryForContext } from "./draft-focus-resolver.js";
import { loadDraftProjection } from "./draft-projection.js";
import { resolveDraftFocus } from "./draft-focus-resolver.js";
import { validateOperationAgainstStateMachine } from "./draft-state-machine.js";
import {
  finalizeBill,
  loadFinalizeProjection,
} from "./tools/finalize-bill.js";
import {
  manageDraftBill,
  type ManageDraftBillContext,
} from "./tools/manage-draft-bill.js";
import { queryBill } from "./tools/query-bill.js";
import type { ManageDraftOperation } from "./types.js";
import { artifactGeneratedPayload } from "../artifact/trace-payload.js";
import type {
  ToolPlanVerificationResult,
} from "./execution-engine/plan-verification.js";
import type { ParameterGroundingResult } from "./parameter-grounding.js";

export interface BillingExecutorConfig {
  id: string;
  toolPlannerSystemPrompt: string;
  verifyToolPlan: (plan: StructuredToolPlan) => ToolPlanVerificationResult;
  sortByDependencies: (
    steps: StructuredToolPlan["operations"],
  ) => StructuredToolPlan["operations"];
  parameterGroundingCheck: (
    objectiveDescription: string,
    step: StructuredToolPlan["operations"][number],
  ) => ParameterGroundingResult;
  mapToolError: (error: unknown) => CapabilityResult;
}

async function planTools(
  config: BillingExecutorConfig,
  ctx: OrchestrationContext,
  objective: BusinessObjective,
  db: StoreDatabase,
  runContext: RunContext | undefined,
  harnessDiagnostic?: string,
): Promise<
  import("../global-orchestrator/gemini-client.js").GeminiInvocationResult<
    StructuredToolPlan
  >
> {
  const openDrafts = await buildOpenDraftSummaries(db);
  const parts: string[] = [
    ...(runContext?.buildBcPlanningPriorSlices(config.id, objective.objectiveId) ??
      []),
    `Objective: ${objective.description}`,
    `User message: ${ctx.inbound.text}`,
    `Profile: ${JSON.stringify(ctx.ownerProfile)}`,
    formatOpenDraftsSummaryForContext(openDrafts),
  ];

  if (objective.draftTarget) {
    parts.push(`GO draft intent: ${objective.draftTarget}`);
  }

  if (objective.priorObjectiveResults) {
    parts.push(
      `Dependency verified facts:\n${JSON.stringify(objective.priorObjectiveResults, null, 2)}`,
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

async function executeBillingTool(
  step: ToolPlanStep,
  ctx: OrchestrationContext,
  runtimePorts: RuntimePorts,
  db: StoreDatabase,
  objective: BusinessObjective,
  runContext?: RunContext,
): Promise<ToolStepResult> {
  const toolCtxBase = {
    chatId: ctx.chatId,
    updateId: ctx.updateId,
    correlationId: ctx.correlationId,
    objective,
    runContext: runContext
      ? {
          appendTrace: (
            layer: string,
            component: string,
            stage: string,
            payload: unknown,
          ) =>
            runContext.appendTrace(
              layer as "capability",
              component,
              stage as "TOOL_EXECUTED",
              payload,
            ),
        }
      : undefined,
  };

  if (step.toolName === "query_bill") {
    const result = await queryBill(db, runtimePorts, step.parameters);
    if (result.attachments?.[0] && runContext) {
      const attachment = result.attachments[0];
      await runContext.appendTrace(
        "capability",
        "billing",
        "ARTIFACT_GENERATED",
        artifactGeneratedPayload({
          kind: "invoice_pdf",
          filename: attachment.filename,
          byteLength: attachment.bytes.byteLength,
          mimeType: attachment.mimeType,
        }),
      );
    }
    return {
      verifiedFacts: result.verifiedFacts,
      agentState: result.agentState,
      attachments: result.attachments,
      refusalMessage: result.refusalMessage,
    };
  }

  if (step.toolName === "manage_draft_bill") {
    const operation = step.parameters.operation as ManageDraftOperation;
    const focus = await resolveDraftFocus(db, step.parameters, objective, operation);
    const projection =
      focus.billId && !focus.createNew
        ? await loadDraftProjection(db, focus.billId)
        : null;

    validateOperationAgainstStateMachine(operation, projection, focus.createNew);

    const manageCtx: ManageDraftBillContext = {
      billId: focus.billId ?? crypto.randomUUID(),
      projection,
      createNew: focus.createNew,
      chatId: toolCtxBase.chatId,
      updateId: toolCtxBase.updateId,
      correlationId: toolCtxBase.correlationId,
      objective: toolCtxBase.objective,
      runContext: toolCtxBase.runContext,
    };

    const result = await manageDraftBill(
      db,
      runtimePorts,
      step.parameters,
      manageCtx,
    );
    return {
      verifiedFacts: result.verifiedFacts,
      agentState: result.agentState,
      attachments: result.attachments,
    };
  }

  if (step.toolName === "finalize_bill") {
    const focus = await resolveDraftFocus(
      db,
      step.parameters,
      objective,
      "finalize_bill",
    );
    if (!focus.billId) {
      throw new Error("No draft resolved for finalize_bill");
    }
    const projection = await loadFinalizeProjection(db, focus.billId);
    const result = await finalizeBill(db, runtimePorts, step.parameters, {
      billId: focus.billId,
      projection,
      chatId: toolCtxBase.chatId,
      updateId: toolCtxBase.updateId,
      correlationId: toolCtxBase.correlationId,
    });
    if (result.attachments?.[0] && runContext) {
      const attachment = result.attachments[0];
      await runContext.appendTrace(
        "capability",
        "billing",
        "ARTIFACT_GENERATED",
        artifactGeneratedPayload({
          kind: "invoice_pdf",
          filename: attachment.filename,
          byteLength: attachment.bytes.byteLength,
          mimeType: attachment.mimeType,
        }),
      );
    }
    return {
      verifiedFacts: result.verifiedFacts,
      agentState: result.agentState,
      refusalMessage: result.refusalMessage,
      attachments: result.attachments,
    };
  }

  throw new Error(`Unknown billing tool: ${step.toolName}`);
}

export function createBillingExecutor(
  config: BillingExecutorConfig,
): (
  objective: BusinessObjective,
  ctx: OrchestrationContext,
  runtimePorts: RuntimePorts,
  db: StoreDatabase,
  runContext?: RunContext,
  parentEventId?: string,
) => Promise<CapabilityResult> {
  return async function executeBillingCapability(
    objective: BusinessObjective,
    ctx: OrchestrationContext,
    runtimePorts: RuntimePorts,
    db: StoreDatabase,
    runContext?: RunContext,
    parentEventId?: string,
  ): Promise<CapabilityResult> {
    try {
      let plan: StructuredToolPlan | null = null;
      let verification: ToolPlanVerificationResult = { valid: false };
      let harnessAttempt = 0;
      let lastDiagnostic: string | undefined;

      while (harnessAttempt < MAX_BC_TOOL_PLAN_VERIFY_RETRIES) {
        const llmTrace = await planTools(
          config,
          ctx,
          objective,
          db,
          runContext,
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
      const attachments: Array<{
        filename: string;
        mimeType: string;
        bytes: Uint8Array;
      }> = [];
      const l1ToolResults: AgentStatePriorResults = {
        byOperationId: new Map(),
        byToolName: new Map(),
      };

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
            db,
            runContext,
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

        if (
          step.toolName === "manage_draft_bill" ||
          step.toolName === "finalize_bill"
        ) {
          const operation =
            step.toolName === "manage_draft_bill"
              ? String(step.parameters.operation)
              : "finalize_bill";
          const focus = await resolveDraftFocus(
            db,
            step.parameters,
            objective,
            operation,
          );
          const projection =
            focus.billId && !focus.createNew
              ? await loadDraftProjection(db, focus.billId)
              : null;
          if (step.toolName === "manage_draft_bill") {
            validateOperationAgainstStateMachine(
              step.parameters.operation as ManageDraftOperation,
              projection,
              focus.createNew,
            );
          }
        }

        const toolResult = await executeBillingTool(
          step,
          ctx,
          runtimePorts,
          db,
          objective,
          runContext,
        );

        l1ToolResults.byOperationId.set(step.operationId, toolResult.agentState);
        l1ToolResults.byToolName.set(step.toolName, toolResult.agentState);
        Object.assign(facts, toolResult.verifiedFacts);
        if (toolResult.attachments?.length) {
          attachments.push(...toolResult.attachments);
        }

        if (runContext) {
          await runContext.appendTrace(
            "capability",
            config.id,
            "TOOL_EXECUTED",
            {
              toolName: step.toolName,
              parameters: step.parameters,
              agentState: toolResult.agentState,
              verifiedFactKeys: Object.keys(toolResult.verifiedFacts),
              refusalMessage: toolResult.refusalMessage,
              attachmentMeta: toolResult.attachments?.map((a) => ({
                filename: a.filename,
                mimeType: a.mimeType,
              })),
            },
            parentEventId,
          );
        }

        if (toolResult.refusalMessage) {
          const refusalResult: CapabilityResult = {
            status: "completed",
            verifiedFacts: facts,
            refusalMessage: toolResult.refusalMessage,
            attachments: attachments.length > 0 ? attachments : undefined,
          };
          if (runContext) {
            runContext.storeBcInvocation(
              objective.objectiveId,
              plan,
              refusalResult,
              {
                capabilityId: config.id,
                objectiveDescription: objective.description,
              },
            );
          }
          return refusalResult;
        }
      }

      const completedResult: CapabilityResult = {
        status: "completed",
        verifiedFacts: facts,
        attachments: attachments.length > 0 ? attachments : undefined,
      };

      if (runContext) {
        runContext.storeBcInvocation(
          objective.objectiveId,
          plan,
          completedResult,
          {
            capabilityId: config.id,
            objectiveDescription: objective.description,
          },
        );
      }

      return completedResult;
    } catch (error) {
      return config.mapToolError(error);
    }
  };
}
