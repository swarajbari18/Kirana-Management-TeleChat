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
import { queryKhata } from "./tools/query-khata.js";
import { manageKhataTransaction } from "./tools/manage-khata-transaction.js";
import { ClarificationError } from "./errors.js";

const TOOL_SYSTEM_PROMPT = `You are the Planning component of the Khata capability.

Your job: from a business objective assigned by the Global Orchestrator, produce a JSON tool execution plan for customer credit ledger reads and writes.

You do NOT execute tools. You ONLY output the plan JSON.

Available tools (reference — code enforces prerequisites and identity):
- query_khata: Read-only. Modes: by_customer (requires customer_name) returns balance, last 5 entries, full-ledger artifact; all_customers returns all balances + shop-wide ledger artifact.
- manage_khata_transaction: All ledger mutations via operation enum:
  - create_customer: Add customer after confirmation
  - record_manual_credit: Standalone udhar (requires prior query_khata when identifying by name)
  - record_payment: Customer repayment (requires prior query_khata when identifying by name)
  - record_credit_from_bill: credit_sale from finalized bill (requires bill_id from billing dependency facts)

Never plan billing or inventory tools. All writes require confirmation unless shop has completeAutonomy.

Output JSON: { "operations": [{ operationId, operationDescription, toolName, parameters, dependencies }] }

On re-invoke, use prior tool plan and prior results in context to revise.

Output valid JSON only.`;

function mapToolError(error: unknown): CapabilityResult {
  if (error instanceof ClarificationError) {
    let requiredInfo = error.message.replace(/^clarification:/, "");
    if (error.similarCandidates?.length) {
      requiredInfo += `\nSimilar options:\n${error.similarCandidates
        .map((c) => `- ${c.canonicalName}`)
        .join("\n")}`;
    }
    if (error.exactMatches?.length) {
      requiredInfo += `\nExact options:\n${error.exactMatches
        .map((m) => `- ${m.canonicalName}`)
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
    case "query_khata": {
      const result = await queryKhata(
        db,
        step.parameters,
        priorResults,
        planContext,
      );
      return {
        verifiedFacts: result.verifiedFacts,
        agentState: result.agentState as unknown as Record<string, unknown>,
        attachments: result.attachments,
      };
    }
    case "manage_khata_transaction": {
      const result = await manageKhataTransaction(
        db,
        runtimePorts,
        step.parameters,
        priorResults,
        planContext,
        toolCtx,
      );
      return {
        verifiedFacts: result.verifiedFacts,
        agentState: result.agentState,
      };
    }
    default:
      throw new Error(`Unknown tool: ${step.toolName}`);
  }
}

const khataExecutor = createCapabilityExecutor({
  id: "khata",
  kind: "business",
  toolPlannerSystemPrompt: TOOL_SYSTEM_PROMPT,
  verifyToolPlan,
  sortByDependencies,
  parameterGroundingCheck,
  executeTool,
  mapToolError,
});

export async function executeKhata(
  objective: BusinessObjective,
  ctx: OrchestrationContext,
  runtimePorts: RuntimePorts,
  db: StoreDatabase,
  runContext?: import("../store-durable-object/agent-state/run-context.js").RunContext,
  parentEventId?: string,
): Promise<CapabilityResult> {
  return khataExecutor(
    objective,
    ctx,
    runtimePorts,
    db,
    runContext,
    parentEventId,
  );
}

export const KHATA_TOOL_SURFACE = ["query_khata", "manage_khata_transaction"];
