import type { StructuredToolPlan, ToolPlanStep } from "../../capability-registry/types.js";
import { validateCapabilityToolParameters } from "../../capability-registry/tool-parameter-contracts/index.js";

export interface ToolPlanVerificationResult {
  valid: boolean;
  reason?: string;
  diagnostics?: string[];
}

const KNOWN_TOOLS = new Set([
  "manage_draft_bill",
  "finalize_bill",
  "query_bill",
]);

const MANAGE_OPERATIONS = new Set([
  "start_bill",
  "set_customer",
  "set_notes",
  "add_item",
  "remove_item",
  "change_item_quantity",
  "set_payment_method",
  "set_payment_reference",
  "show_draft",
  "list_open_drafts",
  "cancel_draft",
]);

const DRAFT_TARGETS = new Set([
  "implicit_latest",
  "new",
  "by_customer",
  "ambiguous",
]);

const MUTATING_MANAGE_OPS = new Set([
  "start_bill",
  "set_customer",
  "set_notes",
  "add_item",
  "remove_item",
  "change_item_quantity",
  "set_payment_method",
  "set_payment_reference",
  "cancel_draft",
]);

export function verifyToolPlan(plan: StructuredToolPlan): ToolPlanVerificationResult {
  const diagnostics: string[] = [];

  if (!plan.operations || plan.operations.length === 0) {
    diagnostics.push("Plan has no operations");
    return { valid: false, reason: diagnostics[0], diagnostics };
  }

  const hasFinalize = plan.operations.some((op) => op.toolName === "finalize_bill");
  const hasMutatingDraft = plan.operations.some(
    (op) =>
      op.toolName === "manage_draft_bill" &&
      MUTATING_MANAGE_OPS.has(String(op.parameters.operation)),
  );

  if (hasFinalize && hasMutatingDraft) {
    diagnostics.push(
      "finalize_bill cannot appear in the same plan as mutating manage_draft_bill operations",
    );
    return { valid: false, reason: diagnostics[0], diagnostics };
  }

  if (hasFinalize && plan.operations.length > 1) {
    diagnostics.push("finalize_bill must be a single-operation plan");
    return { valid: false, reason: diagnostics[0], diagnostics };
  }

  const operationIds = new Set<string>();

  for (const op of plan.operations) {
    const paramResult = validateCapabilityToolParameters("billing", op);
    if (!paramResult.valid) {
      return paramResult;
    }

    if (!KNOWN_TOOLS.has(op.toolName)) {
      diagnostics.push(`Unknown tool: ${op.toolName}`);
      return { valid: false, reason: diagnostics[0], diagnostics };
    }

    if (operationIds.has(op.operationId)) {
      diagnostics.push(`Duplicate operationId ${op.operationId}`);
      return { valid: false, reason: diagnostics[0], diagnostics };
    }
    operationIds.add(op.operationId);

    if (op.toolName === "manage_draft_bill") {
      const operation = String(op.parameters.operation ?? "");
      if (!MANAGE_OPERATIONS.has(operation)) {
        diagnostics.push(`Invalid manage_draft_bill operation: ${operation}`);
        return { valid: false, reason: diagnostics[0], diagnostics };
      }
    }

    if (op.parameters.draft_target !== undefined) {
      if (!DRAFT_TARGETS.has(String(op.parameters.draft_target))) {
        diagnostics.push(`Invalid draft_target: ${op.parameters.draft_target}`);
        return { valid: false, reason: diagnostics[0], diagnostics };
      }
    }
  }

  return { valid: true };
}

export function sortByDependencies(steps: ToolPlanStep[]): ToolPlanStep[] {
  const sorted: ToolPlanStep[] = [];
  const remaining = [...steps];
  const completed = new Set<string>();

  while (remaining.length > 0) {
    const nextIndex = remaining.findIndex((step) =>
      (step.dependencies ?? []).every((dep) => completed.has(dep)),
    );
    if (nextIndex === -1) {
      break;
    }
    const [step] = remaining.splice(nextIndex, 1);
    sorted.push(step);
    completed.add(step.operationId);
  }

  return sorted.length === steps.length ? sorted : steps;
}
