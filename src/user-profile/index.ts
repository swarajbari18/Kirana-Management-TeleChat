import type { BusinessObjective } from "../capability-registry/index.js";
import type { OrchestrationContext } from "../global-orchestrator/types.js";
import type { RuntimePorts } from "../store-durable-object/runtime-ports/types.js";
import type { StoreDatabase } from "../store-durable-object/persistence/db.js";
import type { CapabilityResult } from "../capability-registry/types.js";
import { createCapabilityExecutor } from "../capability-registry/capability-blueprint.js";
import {
  sortByDependencies,
  verifyToolPlan,
} from "./execution-engine/plan-verification.js";
import { parameterGroundingCheck } from "./parameter-grounding.js";
import { readShopProfile } from "./tools/read-shop-profile.js";
import { proposeShopIdentityUpdate } from "./tools/propose-shop-identity-update.js";
import { proposeTaxRegistrationUpdate } from "./tools/propose-tax-registration-update.js";
import { updateInstructionPreference } from "./tools/update-instruction-preference.js";

const TOOL_SYSTEM_PROMPT = `You are the Planning component of the User Profile capability.

Your job: from a business objective assigned by the Global Orchestrator, produce a JSON tool execution plan for shop identity, tax registration, and agent instruction preferences.

You do NOT execute tools. You ONLY output the plan JSON.

This is one-shot planning: emit every tool operation required to fulfill the objective in a single operations array.

Available tools (reference — code enforces):
- read_shop_profile: {}
- propose_shop_identity_update: { shopName?, ownerName? }
- propose_tax_registration_update: { gstRegistered, gstin? }
- update_instruction_preference: { instruction, mode?: "append"|"replace" }

Output JSON: { "operations": [{ operationId, operationDescription, toolName, parameters, dependencies }] }

Parameter names are enforced by code — use exact names from the tool list above; unknown keys fail verification.

Prior tool work in this run may already be in agent state. Use that as evidence, but still output a complete plan for the current objective.

On re-invoke, use prior tool plan and prior results in context to revise — what was attempted and what happened.

Output valid JSON only.`;

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

async function executeTool(
  step: import("../capability-registry/types.js").ToolPlanStep,
  ctx: OrchestrationContext,
  runtimePorts: RuntimePorts,
  db: StoreDatabase,
  _priorResults: import("../capability-registry/capability-blueprint.js").AgentStatePriorResults,
  _planContext: import("../capability-registry/capability-blueprint.js").ToolExecutionPlanContext,
): Promise<import("../capability-registry/capability-blueprint.js").ToolStepResult> {
  const wrap = (verifiedFacts: Record<string, unknown>) => ({
    verifiedFacts,
    agentState: verifiedFacts,
  });

  switch (step.toolName) {
    case "read_shop_profile":
      return wrap(await readShopProfile(db));
    case "propose_shop_identity_update":
      return wrap(
        await proposeShopIdentityUpdate(db, runtimePorts, {
          shopName: step.parameters.shopName as string | undefined,
          ownerName: step.parameters.ownerName as string | undefined,
          chatId: ctx.chatId,
          updateId: ctx.updateId,
          correlationId: ctx.correlationId,
        }),
      );
    case "propose_tax_registration_update":
      return wrap(
        await proposeTaxRegistrationUpdate(db, runtimePorts, {
          gstRegistered: step.parameters.gstRegistered as boolean,
          gstin: step.parameters.gstin as string | undefined,
          chatId: ctx.chatId,
          updateId: ctx.updateId,
          correlationId: ctx.correlationId,
        }),
      );
    case "update_instruction_preference":
      return wrap(
        await updateInstructionPreference(db, {
          instruction: step.parameters.instruction as string,
          mode: step.parameters.mode as "append" | "replace" | undefined,
          updateId: ctx.updateId,
          correlationId: ctx.correlationId,
        }),
      );
    default:
      throw new Error(`Unknown tool: ${step.toolName}`);
  }
}

const userProfileExecutor = createCapabilityExecutor({
  id: "user_profile",
  kind: "system",
  toolPlannerSystemPrompt: TOOL_SYSTEM_PROMPT,
  verifyToolPlan,
  sortByDependencies,
  parameterGroundingCheck,
  executeTool,
  mapToolError,
});

export async function executeUserProfile(
  objective: BusinessObjective,
  ctx: OrchestrationContext,
  runtimePorts: RuntimePorts,
  db: StoreDatabase,
  runContext?: import("../store-durable-object/agent-state/run-context.js").RunContext,
  parentEventId?: string,
): Promise<CapabilityResult> {
  return userProfileExecutor(
    objective,
    ctx,
    runtimePorts,
    db,
    runContext,
    parentEventId,
  );
}

export const USER_PROFILE_TOOL_SURFACE = [
  "read_shop_profile",
  "propose_shop_identity_update",
  "propose_tax_registration_update",
  "update_instruction_preference",
];
