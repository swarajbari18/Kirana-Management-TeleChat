import type { StructuredToolPlan, ToolPlanStep } from "../../capability-registry/types.js";

export interface ToolPlanVerificationResult {
  valid: boolean;
  reason?: string;
  diagnostics?: string[];
}

const KNOWN_TOOLS = new Set(["query_khata", "manage_khata_transaction"]);

const MUTATING_OPS = new Set([
  "create_customer",
  "record_manual_credit",
  "record_payment",
  "record_credit_from_bill",
]);

function hasPriorQueryKhata(
  operations: ToolPlanStep[],
  targetOp: ToolPlanStep,
): boolean {
  const ordered = sortByDependencies(operations);
  const targetIndex = ordered.findIndex(
    (op) => op.operationId === targetOp.operationId,
  );
  if (targetIndex <= 0) {
    return false;
  }
  return ordered
    .slice(0, targetIndex)
    .some((op) => op.toolName === "query_khata");
}

export function verifyToolPlan(plan: StructuredToolPlan): ToolPlanVerificationResult {
  const diagnostics: string[] = [];

  if (!plan.operations || plan.operations.length === 0) {
    diagnostics.push("Plan has no operations");
    return { valid: false, reason: diagnostics[0], diagnostics };
  }

  const operationIds = new Set<string>();

  for (const op of plan.operations) {
    if (!KNOWN_TOOLS.has(op.toolName)) {
      diagnostics.push(`Unknown tool: ${op.toolName}`);
      return { valid: false, reason: diagnostics[0], diagnostics };
    }

    if (operationIds.has(op.operationId)) {
      diagnostics.push(`Duplicate operationId ${op.operationId}`);
      return { valid: false, reason: diagnostics[0], diagnostics };
    }
    operationIds.add(op.operationId);

    if (op.toolName === "query_khata") {
      const mode = op.parameters.mode ?? "by_customer";
      if (mode === "by_customer") {
        if (
          typeof op.parameters.customer_name !== "string" ||
          !op.parameters.customer_name
        ) {
          diagnostics.push(
            "query_khata by_customer requires customer_name",
          );
          return { valid: false, reason: diagnostics[0], diagnostics };
        }
      }
    }

    if (op.toolName === "manage_khata_transaction") {
      const operation = String(op.parameters.operation ?? "");
      if (!MUTATING_OPS.has(operation)) {
        diagnostics.push(`Unknown manage_khata_transaction operation: ${operation}`);
        return { valid: false, reason: diagnostics[0], diagnostics };
      }

      if (
        operation !== "record_credit_from_bill" &&
        !hasPriorQueryKhata(plan.operations, op)
      ) {
        diagnostics.push(
          "query_khata is a required dependency of manage_khata_transaction for name-driven operations",
        );
        return { valid: false, reason: diagnostics[0], diagnostics };
      }

      if (operation === "record_credit_from_bill") {
        if (
          typeof op.parameters.bill_id !== "string" ||
          !op.parameters.bill_id
        ) {
          diagnostics.push(
            "record_credit_from_bill requires bill_id (or billing dependency facts at runtime)",
          );
          return { valid: false, reason: diagnostics[0], diagnostics };
        }
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

  if (sorted.length !== steps.length) {
    return [
      ...steps.filter((s) => s.toolName === "query_khata"),
      ...steps.filter((s) => s.toolName !== "query_khata"),
    ];
  }

  return sorted;
}
