import type { BusinessObjective } from "../capability-registry/index.js";
import type { OrchestrationContext } from "../global-orchestrator/types.js";
import type { RuntimePorts } from "../store-durable-object/runtime-ports/types.js";
import type { StoreDatabase } from "../store-durable-object/persistence/db.js";
import { generateJson } from "../global-orchestrator/gemini-client.js";
import type { CapabilityResult, StructuredToolPlan } from "./types.js";
import { sortByDependencies, verifyToolPlan } from "./execution-engine/plan-verification.js";
import { readShopProfile } from "./tools/read-shop-profile.js";
import { proposeShopIdentityUpdate } from "./tools/propose-shop-identity-update.js";
import { proposeTaxRegistrationUpdate } from "./tools/propose-tax-registration-update.js";
import { updateInstructionPreference } from "./tools/update-instruction-preference.js";

const TOOL_SYSTEM_PROMPT = `You plan business operations for My Shop Profile capability.
Available tools:
- read_shop_profile: {} — read current profile
- propose_shop_identity_update: { shopName?: string, ownerName?: string }
- propose_tax_registration_update: { gstRegistered: boolean, gstin?: string } — GSTIN required when gstRegistered true
- update_instruction_preference: { instruction: string, mode?: "append"|"replace" }

Output JSON: { "operations": [{ "operationId", "operationDescription", "toolName", "parameters", "dependencies": [] }] }`;

async function planTools(
  ctx: OrchestrationContext,
  objective: BusinessObjective,
): Promise<StructuredToolPlan> {
  const userPrompt = `Objective: ${objective.description}
User message: ${ctx.inbound.text}
Profile: ${JSON.stringify(ctx.ownerProfile)}`;

  return generateJson<StructuredToolPlan>(
    ctx.geminiApiKey,
    TOOL_SYSTEM_PROMPT,
    userPrompt,
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
): Promise<CapabilityResult> {
  try {
    const plan = await planTools(ctx, objective);
    const verification = verifyToolPlan(plan);
    if (!verification.valid) {
      return {
        status: "clarification_needed",
        reason: verification.reason ?? "Invalid tool plan",
        requiredInfo: verification.reason ?? "Please provide more details",
      };
    }

    const ordered = sortByDependencies(plan.operations);
    const facts: Record<string, unknown> = {};

    for (const step of ordered) {
      const result = await executeTool(step, ctx, runtimePorts, db);
      Object.assign(facts, result);
    }

    return { status: "completed", verifiedFacts: facts };
  } catch (error) {
    return mapToolError(error);
  }
}
