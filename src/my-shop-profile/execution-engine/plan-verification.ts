import type { StructuredToolPlan, ToolPlanStep } from "../types.js";
import { isValidGstin } from "../validation/gstin.js";

export interface ToolPlanVerificationResult {
  valid: boolean;
  reason?: string;
  diagnostics?: string[];
}

const KNOWN_TOOLS = new Set([
  "read_shop_profile",
  "propose_shop_identity_update",
  "propose_tax_registration_update",
  "update_instruction_preference",
]);

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

    if (op.toolName === "propose_tax_registration_update") {
      const params = op.parameters;
      const gstRegistered = params.gstRegistered;
      if (typeof gstRegistered !== "boolean") {
        diagnostics.push("gstRegistered must be boolean");
        return { valid: false, reason: diagnostics[0], diagnostics };
      }
      if (gstRegistered) {
        const gstin = params.gstin;
        if (typeof gstin !== "string" || !isValidGstin(gstin)) {
          diagnostics.push("Valid gstin required when gstRegistered is true");
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

  return sorted.length === steps.length ? sorted : steps;
}
