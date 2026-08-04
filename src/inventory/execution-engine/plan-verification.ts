import type { StructuredToolPlan, ToolPlanStep } from "../../capability-registry/types.js";

export interface ToolPlanVerificationResult {
  valid: boolean;
  reason?: string;
  diagnostics?: string[];
}

const KNOWN_TOOLS = new Set([
  "query_inventory",
  "register_inventory",
  "update_inventory",
  "allocate_inventory",
]);

const WRITE_TOOLS = new Set([
  "register_inventory",
  "update_inventory",
  "allocate_inventory",
]);

const VALID_GST_RATES = new Set([0, 5, 12, 18]);
const VALID_ITEM_TYPES = new Set(["packaged", "loose"]);
const VALID_UNITS = new Set([
  "packet",
  "kg",
  "g",
  "litre",
  "ml",
  "dozen",
  "piece",
]);
const VALID_ALLOCATE_OPS = new Set(["reserve", "commit", "release"]);

function hasPriorQueryInventory(
  operations: ToolPlanStep[],
  targetOp: ToolPlanStep,
): boolean {
  const queryOps = operations.filter((op) => op.toolName === "query_inventory");
  if (queryOps.length === 0) {
    return false;
  }

  const ordered = sortByDependencies(operations);
  const targetIndex = ordered.findIndex(
    (op) => op.operationId === targetOp.operationId,
  );
  if (targetIndex <= 0) {
    return false;
  }

  const prior = ordered.slice(0, targetIndex);
  return prior.some((op) => op.toolName === "query_inventory");
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

    if (op.toolName === "query_inventory") {
      const lowStock = op.parameters.low_stock === true;
      const hasProductName =
        typeof op.parameters.product_name === "string" &&
        op.parameters.product_name.length > 0;
      const hasSku = typeof op.parameters.sku === "string";

      if (lowStock && (hasProductName || hasSku)) {
        diagnostics.push(
          "query_inventory: low_stock cannot be combined with product_name or sku lookup",
        );
        return { valid: false, reason: diagnostics[0], diagnostics };
      }

      if (!lowStock && !hasProductName && !hasSku) {
        diagnostics.push(
          "query_inventory requires low_stock, product_name, or sku (sku only from prior exact match)",
        );
        return { valid: false, reason: diagnostics[0], diagnostics };
      }
    }

    if (op.toolName === "register_inventory") {
      if (!hasPriorQueryInventory(plan.operations, op)) {
        diagnostics.push(
          "query_inventory is a required dependency of register_inventory",
        );
        return { valid: false, reason: diagnostics[0], diagnostics };
      }
      const p = op.parameters;
      const required = [
        "product_name",
        "item_type",
        "unit",
        "quantity",
        "cost_price",
        "sell_price",
        "hsn_code",
        "gst_rate",
      ] as const;
      for (const field of required) {
        if (p[field] === undefined || p[field] === null) {
          diagnostics.push(`register_inventory missing required field: ${field}`);
          return { valid: false, reason: diagnostics[0], diagnostics };
        }
      }
      if (!VALID_ITEM_TYPES.has(String(p.item_type))) {
        diagnostics.push("register_inventory item_type must be packaged or loose");
        return { valid: false, reason: diagnostics[0], diagnostics };
      }
      if (!VALID_UNITS.has(String(p.unit))) {
        diagnostics.push("register_inventory unit is invalid");
        return { valid: false, reason: diagnostics[0], diagnostics };
      }
      if (!VALID_GST_RATES.has(Number(p.gst_rate))) {
        diagnostics.push("register_inventory gst_rate must be 0, 5, 12, or 18");
        return { valid: false, reason: diagnostics[0], diagnostics };
      }
    }

    if (op.toolName === "update_inventory") {
      if (!hasPriorQueryInventory(plan.operations, op)) {
        diagnostics.push(
          "query_inventory is a required dependency of update_inventory",
        );
        return { valid: false, reason: diagnostics[0], diagnostics };
      }
      const hasUpdateField =
        op.parameters.quantity !== undefined ||
        op.parameters.cost_price !== undefined ||
        op.parameters.sell_price !== undefined ||
        op.parameters.reorder_level !== undefined ||
        typeof op.parameters.product_name === "string";
      if (!hasUpdateField) {
        diagnostics.push("update_inventory requires at least one field to update");
        return { valid: false, reason: diagnostics[0], diagnostics };
      }
    }

    if (op.toolName === "allocate_inventory") {
      if (!hasPriorQueryInventory(plan.operations, op)) {
        diagnostics.push(
          "query_inventory is a required dependency of allocate_inventory",
        );
        return { valid: false, reason: diagnostics[0], diagnostics };
      }
      const p = op.parameters;
      if (!VALID_ALLOCATE_OPS.has(String(p.operation))) {
        diagnostics.push("allocate_inventory operation must be reserve, commit, or release");
        return { valid: false, reason: diagnostics[0], diagnostics };
      }
      if (p.quantity === undefined || p.draft_bill_id === undefined || p.idempotency_key === undefined) {
        diagnostics.push(
          "allocate_inventory requires quantity, draft_bill_id, and idempotency_key",
        );
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

  if (sorted.length !== steps.length) {
    const queryFirst = [
      ...steps.filter((s) => s.toolName === "query_inventory"),
      ...steps.filter((s) => s.toolName !== "query_inventory"),
    ];
    return queryFirst;
  }

  return sorted;
}
