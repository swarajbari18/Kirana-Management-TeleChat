import type { BusinessObjective } from "../capability-registry/index.js";
import type { OrchestrationContext } from "../global-orchestrator/types.js";
import type { RuntimePorts } from "../store-durable-object/runtime-ports/types.js";
import type { StoreDatabase } from "../store-durable-object/persistence/db.js";
import type { CapabilityResult } from "../capability-registry/types.js";
import { createBillingExecutor } from "./billing-executor.js";
import {
  sortByDependencies,
  verifyToolPlan,
} from "./execution-engine/plan-verification.js";
import { parameterGroundingCheck } from "./parameter-grounding.js";
import { ClarificationError, DraftStateError } from "./errors.js";

const TOOL_SYSTEM_PROMPT = `You are the Planning component of the Billing capability.

Your job: from a business objective assigned by the Global Orchestrator, produce a JSON tool execution plan for draft bills, finalization, and bill queries.

You do NOT execute tools. You ONLY output the plan JSON.

Available tools (reference — code enforces prerequisites and identity):
- manage_draft_bill: Single tool with operation enum. Operations: start_bill, set_customer, set_notes, add_item, remove_item, change_item_quantity, set_payment_method, set_payment_reference, show_draft, list_open_drafts, cancel_draft. Product identity for add_item is resolved in tool code via inventory exact search — pass product_name string only. Optional draft_target (implicit_latest | new | by_customer | ambiguous).
- finalize_bill: Validate and finalize the resolved draft. Separate single-op plan only — never mix with mutating manage_draft_bill operations in one plan. Optional generateArtifact boolean and draft_target.
- query_bill: Read-only. Operations: list_open_drafts, get_finalized (internal bill_id), list_recent_finalized, render_invoice_pdf (bill_id required — regenerates GST PDF from persisted bill).

Never plan inventory or khata tools. Never pass bill_id as identity source — draft focus is resolved in code.

Billing finalize persists the bill only. Stock reduction and khata credit are performed by separate capabilities the Global Orchestrator plans after finalize. Do not plan inventory or khata tools inside the billing tool plan.

Output JSON: { "operations": [{ operationId, operationDescription, toolName, parameters, dependencies }] }

On re-invoke, use prior tool plan and prior results in context to revise.

Output valid JSON only.`;

function mapToolError(error: unknown): CapabilityResult {
  if (error instanceof ClarificationError) {
    let requiredInfo = error.message.replace(/^clarification:/, "");
    if (error.options?.similarCandidates?.length) {
      requiredInfo += `\nSimilar options:\n${error.options.similarCandidates
        .map((c) => `- ${c.productName} (${c.sku})`)
        .join("\n")}`;
    }
    if (error.options?.exactMatches?.length) {
      requiredInfo += `\nExact options:\n${error.options.exactMatches
        .map((m) => `- ${m.productName} (${m.sku})`)
        .join("\n")}`;
    }
    if (error.options?.draftOptions?.length) {
      requiredInfo += `\nDraft options:\n${error.options.draftOptions
        .map((d) => `- ${d}`)
        .join("\n")}`;
    }
    return {
      status: "clarification_needed",
      reason: requiredInfo,
      requiredInfo,
    };
  }
  if (error instanceof DraftStateError) {
    const detail = error.message.replace(/^clarification:/, "");
    return {
      status: "clarification_needed",
      reason: detail,
      requiredInfo: detail,
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

const billingExecutor = createBillingExecutor({
  id: "billing",
  toolPlannerSystemPrompt: TOOL_SYSTEM_PROMPT,
  verifyToolPlan,
  sortByDependencies,
  parameterGroundingCheck,
  mapToolError,
});

export async function executeBilling(
  objective: BusinessObjective,
  ctx: OrchestrationContext,
  runtimePorts: RuntimePorts,
  db: StoreDatabase,
  runContext?: import("../store-durable-object/agent-state/run-context.js").RunContext,
  parentEventId?: string,
): Promise<CapabilityResult> {
  return billingExecutor(
    objective,
    ctx,
    runtimePorts,
    db,
    runContext,
    parentEventId,
  );
}

export const BILLING_TOOL_SURFACE = [
  "manage_draft_bill",
  "finalize_bill",
  "query_bill",
];
