import type { StructuredToolPlan, ToolPlanStep } from "../../capability-registry/types.js";
import type {
  PriorBcQueryState,
  ToolPlanVerifyContext,
} from "../../capability-registry/tool-plan-verify-context.js";
import { validateCapabilityToolParameters } from "../../capability-registry/tool-parameter-contracts/index.js";

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

const OPS_REQUIRING_PRIOR_QUERY = new Set([
  "create_customer",
  "record_manual_credit",
  "record_payment",
]);

function customerNameFromWriteOp(op: ToolPlanStep): string | undefined {
  if (typeof op.parameters.customer_name === "string") {
    return op.parameters.customer_name;
  }
  return undefined;
}

function khataManageOperation(op: ToolPlanStep): string | undefined {
  if (op.toolName !== "manage_khata_transaction") {
    return undefined;
  }
  const operation = String(op.parameters.operation ?? "");
  return MUTATING_OPS.has(operation) ? operation : undefined;
}

function hasPriorKhataQueryInAgentState(
  writeOperation: string,
  customerName: string | undefined,
  priorStates: PriorBcQueryState[],
): boolean {
  const normalizedTarget = customerName?.trim().toLowerCase();

  for (let i = priorStates.length - 1; i >= 0; i--) {
    const entry = priorStates[i]!;
    if (entry.queryTool !== "query_khata") {
      continue;
    }

    const entryCustomer = entry.customerName;
    if (
      normalizedTarget &&
      entryCustomer &&
      entryCustomer.trim().toLowerCase() !== normalizedTarget
    ) {
      continue;
    }

    const exactMatchCount = Number(
      (entry.agentState as { exactMatchCount?: number }).exactMatchCount ?? -1,
    );

    if (writeOperation === "create_customer" && exactMatchCount === 0) {
      return true;
    }
    if (
      (writeOperation === "record_manual_credit" ||
        writeOperation === "record_payment") &&
      exactMatchCount === 1
    ) {
      return true;
    }
  }

  return false;
}

function hasCreateCustomerBefore(
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
  return ordered.slice(0, targetIndex).some(
    (op) => khataManageOperation(op) === "create_customer",
  );
}

function hasPriorQueryKhataInPlan(
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

function hasPriorQueryKhata(
  operations: ToolPlanStep[],
  targetOp: ToolPlanStep,
  context?: ToolPlanVerifyContext,
): boolean {
  const writeOperation = khataManageOperation(targetOp);
  if (!writeOperation || !OPS_REQUIRING_PRIOR_QUERY.has(writeOperation)) {
    return true;
  }

  if (hasPriorQueryKhataInPlan(operations, targetOp)) {
    return true;
  }

  if (
    (writeOperation === "record_manual_credit" ||
      writeOperation === "record_payment") &&
    hasCreateCustomerBefore(operations, targetOp) &&
    context?.priorQueryAgentStates.length
  ) {
    const customerName = customerNameFromWriteOp(targetOp);
    if (
      hasPriorKhataQueryInAgentState(
        "create_customer",
        customerName,
        context.priorQueryAgentStates,
      )
    ) {
      return true;
    }
  }

  if (context?.priorQueryAgentStates.length) {
    return hasPriorKhataQueryInAgentState(
      writeOperation,
      customerNameFromWriteOp(targetOp),
      context.priorQueryAgentStates,
    );
  }

  return false;
}

function verifyQueryBeforeWrites(
  operations: ToolPlanStep[],
  diagnostics: string[],
): boolean {
  const ordered = sortByDependencies(operations);
  const firstQueryIndex = ordered.findIndex((op) => op.toolName === "query_khata");
  const firstWriteIndex = ordered.findIndex((op) => {
    const operation = khataManageOperation(op);
    return operation != null && OPS_REQUIRING_PRIOR_QUERY.has(operation);
  });

  if (firstWriteIndex === -1) {
    return true;
  }

  if (firstQueryIndex !== -1 && firstQueryIndex > firstWriteIndex) {
    diagnostics.push(
      "query_khata must be planned before manage_khata_transaction operations that depend on customer identity",
    );
    return false;
  }

  return true;
}

export function verifyToolPlan(
  plan: StructuredToolPlan,
  context?: ToolPlanVerifyContext,
): ToolPlanVerificationResult {
  const diagnostics: string[] = [];

  if (!plan.operations || plan.operations.length === 0) {
    diagnostics.push("Plan has no operations");
    return { valid: false, reason: diagnostics[0], diagnostics };
  }

  if (!verifyQueryBeforeWrites(plan.operations, diagnostics)) {
    return { valid: false, reason: diagnostics[0], diagnostics };
  }

  const operationIds = new Set<string>();

  for (const op of plan.operations) {
    const paramResult = validateCapabilityToolParameters("khata", op);
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
        OPS_REQUIRING_PRIOR_QUERY.has(operation) &&
        !hasPriorQueryKhata(plan.operations, op, context)
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
