import type { BusinessObjective } from "../capability-registry/index.js";
import type { OrchestrationContext } from "../global-orchestrator/types.js";
import { GEMINI_MODEL, MAX_BC_TOOL_PLAN_VERIFY_RETRIES } from "../global-orchestrator/constants.js";
import { generateJsonWithMeta } from "../global-orchestrator/gemini-client.js";
import type { RunContext } from "../store-durable-object/agent-state/run-context.js";
import type { RuntimePorts } from "../store-durable-object/runtime-ports/types.js";
import type { StoreDatabase } from "../store-durable-object/persistence/db.js";
import type { CapabilityResult, StructuredToolPlan } from "./types.js";
import {
  sortByDependencies,
  verifyToolPlan,
} from "./execution-engine/plan-verification.js";
import { parameterGroundingCheck } from "./parameter-grounding.js";
import { readShopProfile } from "./tools/read-shop-profile.js";
import { proposeShopIdentityUpdate } from "./tools/propose-shop-identity-update.js";
import { proposeTaxRegistrationUpdate } from "./tools/propose-tax-registration-update.js";
import { updateInstructionPreference } from "./tools/update-instruction-preference.js";

const TOOL_SYSTEM_PROMPT = `You are the Planning component of the My Shop Profile capability.

Your job: from a business objective assigned by the Global Orchestrator, produce a JSON tool execution plan.

Thought process:
1. Understand the business objective — what outcome must this capability achieve?
2. Determine which business operations are needed (read, propose update, instruction change, etc.).
3. Map operations to tools and parameters. Order by dependencies. Stop at the tool boundary.

You do NOT execute tools. You ONLY output the plan JSON.

Available tools (reference — code enforces):
- read_shop_profile: {}
- propose_shop_identity_update: { shopName?, ownerName? }
- propose_tax_registration_update: { gstRegistered, gstin? }
- update_instruction_preference: { instruction, mode?: "append"|"replace" }

Output JSON: { "operations": [{ operationId, operationDescription, toolName, parameters, dependencies }] }

On re-invoke, use prior tool plan and prior results in context to revise — what was attempted and what happened.

Output valid JSON only.`;

async function planTools(
  ctx: OrchestrationContext,
  objective: BusinessObjective,
  runContext: RunContext | undefined,
  priorPlan?: unknown,
  priorResults?: CapabilityResult,
  harnessDiagnostic?: string,
): Promise<import("../global-orchestrator/gemini-client.js").GeminiInvocationResult<StructuredToolPlan>> {
  const parts: string[] = [
    `Objective: ${objective.description}`,
    `User message: ${ctx.inbound.text}`,
    `Profile: ${JSON.stringify(ctx.ownerProfile)}`,
  ];

  if (priorPlan) {
    parts.push(`Prior tool plan:\n${JSON.stringify(priorPlan, null, 2)}`);
  }
  if (priorResults) {
    parts.push(`Prior execution results:\n${JSON.stringify(priorResults, null, 2)}`);
  }
  if (harnessDiagnostic) {
    parts.push(`Plan verification or grounding feedback: ${harnessDiagnostic}`);
  }

  return generateJsonWithMeta<StructuredToolPlan>(
    ctx.geminiApiKey,
    TOOL_SYSTEM_PROMPT,
    parts.join("\n\n"),
  );
}

async function executeTool(
  step: StructuredToolPlan["operations"][number],
  ctx: OrchestrationContext,
  runtimePorts: RuntimePorts,
  db: StoreDatabase,
): Promise<Record<string, unknown>> {
  switch (step.toolName) {
    case "read_shop_profile":
      return readShopProfile(db);
    case "propose_shop_identity_update":
      return proposeShopIdentityUpdate(db, runtimePorts, {
        shopName: step.parameters.shopName as string | undefined,
        ownerName: step.parameters.ownerName as string | undefined,
        chatId: ctx.chatId,
        updateId: ctx.updateId,
        correlationId: ctx.correlationId,
      });
    case "propose_tax_registration_update":
      return proposeTaxRegistrationUpdate(db, runtimePorts, {
        gstRegistered: step.parameters.gstRegistered as boolean,
        gstin: step.parameters.gstin as string | undefined,
        chatId: ctx.chatId,
        updateId: ctx.updateId,
        correlationId: ctx.correlationId,
      });
    case "update_instruction_preference":
      return updateInstructionPreference(db, {
        instruction: step.parameters.instruction as string,
        mode: step.parameters.mode as "append" | "replace" | undefined,
        updateId: ctx.updateId,
        correlationId: ctx.correlationId,
      });
    default:
      throw new Error(`Unknown tool: ${step.toolName}`);
  }
}

function mapToolError(error: unknown): CapabilityResult {
  if (error instanceof Error) {
    if (error.message === "timeout") {
      return { status: "denied", reason: "timeout" };
    }
    if (error.message === "user_rejected") {
      return { status: "denied", reason: "user_rejected" };
    }
    if (error.message.startsWith("clarification:")) {
      const detail = error.message.slice("clarification:".length);
      return {
        status: "clarification_needed",
        reason: detail,
        requiredInfo: detail,
      };
    }
    return { status: "error", diagnostics: error.message };
  }
  return { status: "error", diagnostics: "Unknown tool error" };
}

export async function executeMyShopProfile(
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
    let verification: import("./execution-engine/plan-verification.js").ToolPlanVerificationResult = {
      valid: false,
    };
    let harnessAttempt = 0;
    let lastDiagnostic: string | undefined;

    while (harnessAttempt < MAX_BC_TOOL_PLAN_VERIFY_RETRIES) {
      const llmTrace = await planTools(
        ctx,
        objective,
        runContext,
        priorPlan,
        priorResults,
        lastDiagnostic,
      );

      if (runContext) {
        await runContext.traceLlmInvocation(
          "capability",
          "my_shop_profile",
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
      verification = verifyToolPlan(plan);

      if (verification.valid) {
        if (runContext) {
          await runContext.appendTrace(
            "verify",
            "my_shop_profile",
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
          "my_shop_profile",
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
      return {
        status: "clarification_needed",
        reason: verification.reason ?? "Invalid tool plan",
        requiredInfo:
          verification.reason ?? "Please provide more details about your request.",
      };
    }

    const ordered = sortByDependencies(plan.operations);
    const facts: Record<string, unknown> = {};

    for (const step of ordered) {
      let groundingAttempt = 0;
      let grounding = parameterGroundingCheck(objective.description, step);

      while (!grounding.valid && groundingAttempt < MAX_BC_TOOL_PLAN_VERIFY_RETRIES) {
        if (runContext) {
          await runContext.appendTrace(
            "verify",
            "my_shop_profile",
            "PARAMETER_GROUNDING_FAILED",
            { diagnostic: grounding.diagnostic, toolName: step.toolName },
            parentEventId,
          );
        }

        const llmTrace = await planTools(
          ctx,
          objective,
          runContext,
          plan,
          undefined,
          grounding.diagnostic,
        );

        if (runContext) {
          await runContext.traceLlmInvocation(
            "capability",
            "my_shop_profile",
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
        const reverify = verifyToolPlan(plan);
        if (!reverify.valid) {
          return {
            status: "clarification_needed",
            reason: reverify.reason ?? "Invalid tool plan after grounding retry",
            requiredInfo:
              grounding.userMessage ??
              "Please provide more details about your request.",
          };
        }

        const reordered = sortByDependencies(plan.operations);
        const retriedStep = reordered.find(
          (op) => op.operationId === step.operationId,
        );
        if (retriedStep) {
          grounding = parameterGroundingCheck(objective.description, retriedStep);
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

      const result = await executeTool(step, ctx, runtimePorts, db);
      Object.assign(facts, result);

      if (runContext) {
        await runContext.appendTrace(
          "capability",
          "my_shop_profile",
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
    return mapToolError(error);
  }
}
