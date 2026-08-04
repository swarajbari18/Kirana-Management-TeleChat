import type { BusinessObjective } from "../capability-registry/index.js";
import type { OrchestrationContext } from "../global-orchestrator/types.js";
import type { RuntimePorts } from "../store-durable-object/runtime-ports/types.js";
import type { StoreDatabase } from "../store-durable-object/persistence/db.js";
import type { CapabilityResult, ToolPlanStep } from "../capability-registry/types.js";
import {
  createCapabilityExecutor,
  type AgentStatePriorResults,
  type ToolExecutionPlanContext,
  type ToolStepResult,
} from "../capability-registry/capability-blueprint.js";
import {
  sortByDependencies,
  verifyToolPlan,
} from "./execution-engine/plan-verification.js";
import { parameterGroundingCheck } from "./parameter-grounding.js";
import { queryInventory } from "./tools/query-inventory.js";
import { registerInventory } from "./tools/register-inventory.js";
import { updateInventory } from "./tools/update-inventory.js";
import { allocateInventory } from "./tools/allocate-inventory.js";
import { ClarificationError } from "./errors.js";

const TOOL_SYSTEM_PROMPT = `You are the Planning component of the Inventory capability.

Your job: from a business objective assigned by the Global Orchestrator, produce a JSON tool execution plan for stock reads, new SKU creation, stock increases, and billing buffer allocation.

You do NOT execute tools. You ONLY output the plan JSON.

Available tools (reference — code enforces prerequisites and identity):
- query_inventory: Read-only lookup by product_name, low_stock scan, or sku (sku only when already resolved). Returns exactMatchCount and exactMatches. Never modifies stock.
- register_inventory: Create a NEW SKU only when exact search found zero matches. Fields: product_name, item_type, unit, quantity, cost_price, sell_price, hsn_code, gst_rate, optional reorder_level, optional aliases.
- update_inventory: Increase quantity or update prices/reorder on an EXISTING SKU. Identity comes from prior query_inventory exact match — never pass sku as identity source.
- allocate_inventory: Reserve/commit/release billing buffer. Fields: quantity, operation (reserve|commit|release), draft_bill_id, idempotency_key. Product identity from prior query_inventory exact match.

Identity for writes is resolved from exact query_inventory results in agent state — not from invented SKUs.

Output JSON: { "operations": [{ operationId, operationDescription, toolName, parameters, dependencies }] }

On re-invoke, use prior tool plan and prior results in context to revise.

Output valid JSON only.`;

function mapToolError(error: unknown): CapabilityResult {
  if (error instanceof ClarificationError) {
    let requiredInfo = error.message.replace(/^clarification:/, "");
    if (error.similarCandidates?.length) {
      requiredInfo += `\nSimilar options:\n${error.similarCandidates
        .map((c) => `- ${c.productName} (${c.sku})`)
        .join("\n")}`;
    }
    if (error.exactMatches?.length) {
      requiredInfo += `\nExact options:\n${error.exactMatches
        .map((m) => `- ${m.productName} (${m.sku})`)
        .join("\n")}`;
    }
    return {
      status: "clarification_needed",
      reason: requiredInfo,
      requiredInfo,
    };
  }
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
    if (error.message.startsWith("insufficient_stock:")) {
      return {
        status: "completed",
        verifiedFacts: {},
        refusalMessage: error.message.replace(/^insufficient_stock:\s*/, ""),
      };
    }
    return { status: "error", diagnostics: error.message };
  }
  return { status: "error", diagnostics: "Unknown tool error" };
}

async function executeTool(
  step: ToolPlanStep,
  ctx: OrchestrationContext,
  runtimePorts: RuntimePorts,
  db: StoreDatabase,
  priorResults: AgentStatePriorResults,
  planContext: ToolExecutionPlanContext,
): Promise<ToolStepResult> {
  const toolCtx = {
    chatId: ctx.chatId,
    updateId: ctx.updateId,
    correlationId: ctx.correlationId,
  };

  switch (step.toolName) {
    case "query_inventory": {
      const result = await queryInventory(
        db,
        step.parameters,
        priorResults,
        planContext,
      );
      return {
        verifiedFacts: result.verifiedFacts,
        agentState: result.agentState as unknown as Record<string, unknown>,
      };
    }
    case "register_inventory": {
      const result = await registerInventory(
        db,
        runtimePorts,
        step.parameters,
        priorResults,
        toolCtx,
      );
      return {
        verifiedFacts: result.verifiedFacts,
        agentState: result.agentState,
        refusalMessage: result.refusalMessage,
      };
    }
    case "update_inventory": {
      const result = await updateInventory(
        db,
        runtimePorts,
        step.parameters,
        priorResults,
        toolCtx,
      );
      return {
        verifiedFacts: result.verifiedFacts,
        agentState: result.agentState,
        refusalMessage: result.refusalMessage,
      };
    }
    case "allocate_inventory": {
      const result = await allocateInventory(
        db,
        runtimePorts,
        step.parameters,
        priorResults,
        toolCtx,
      );
      return {
        verifiedFacts: result.verifiedFacts,
        agentState: result.agentState,
        refusalMessage: result.refusalMessage,
      };
    }
    default:
      throw new Error(`Unknown tool: ${step.toolName}`);
  }
}

const inventoryExecutor = createCapabilityExecutor({
  id: "inventory",
  kind: "business",
  toolPlannerSystemPrompt: TOOL_SYSTEM_PROMPT,
  verifyToolPlan,
  sortByDependencies,
  parameterGroundingCheck,
  executeTool,
  mapToolError,
});

export async function executeInventory(
  objective: BusinessObjective,
  ctx: OrchestrationContext,
  runtimePorts: RuntimePorts,
  db: StoreDatabase,
  runContext?: import("../store-durable-object/agent-state/run-context.js").RunContext,
  parentEventId?: string,
): Promise<CapabilityResult> {
  return inventoryExecutor(
    objective,
    ctx,
    runtimePorts,
    db,
    runContext,
    parentEventId,
  );
}

export const INVENTORY_TOOL_SURFACE = [
  "query_inventory",
  "register_inventory",
  "update_inventory",
  "allocate_inventory",
];
