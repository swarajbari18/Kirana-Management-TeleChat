import type { StructuredCapabilityPlan } from "../types.js";

export interface PlanVerificationResult {
  valid: boolean;
  reason?: string;
  diagnostics?: string[];
}

const KNOWN_CAPABILITIES = new Set(["my_shop_profile"]);

export function verifyCapabilityPlan(
  plan: StructuredCapabilityPlan,
): PlanVerificationResult {
  const diagnostics: string[] = [];

  if (!plan.objectives || plan.objectives.length === 0) {
    diagnostics.push("Plan has no objectives");
    return { valid: false, reason: diagnostics[0], diagnostics };
  }

  const objectiveIds = new Set<string>();

  for (const step of plan.objectives) {
    if (!step.objectiveId || !step.capabilityId) {
      diagnostics.push("Missing objectiveId or capabilityId");
      return { valid: false, reason: diagnostics[0], diagnostics };
    }

    if (objectiveIds.has(step.objectiveId)) {
      diagnostics.push(`Duplicate objectiveId ${step.objectiveId}`);
      return { valid: false, reason: diagnostics[0], diagnostics };
    }
    objectiveIds.add(step.objectiveId);

    if (!KNOWN_CAPABILITIES.has(step.capabilityId)) {
      diagnostics.push(`Unknown capability: ${step.capabilityId}`);
      return { valid: false, reason: diagnostics[0], diagnostics };
    }

    for (const dep of step.dependencies ?? []) {
      if (
        !objectiveIds.has(dep) &&
        !plan.objectives.some((o) => o.objectiveId === dep)
      ) {
        diagnostics.push(`Unknown dependency: ${dep}`);
        return { valid: false, reason: diagnostics[0], diagnostics };
      }
    }
  }

  // Cycle detection via topological sort
  const sorted: string[] = [];
  const remaining = [...plan.objectives];
  const completed = new Set<string>();

  while (remaining.length > 0) {
    const nextIndex = remaining.findIndex((step) =>
      (step.dependencies ?? []).every((dep) => completed.has(dep)),
    );
    if (nextIndex === -1) {
      diagnostics.push("Circular or unsatisfiable dependencies detected");
      return { valid: false, reason: diagnostics[0], diagnostics };
    }
    const [step] = remaining.splice(nextIndex, 1);
    sorted.push(step.objectiveId);
    completed.add(step.objectiveId);
  }

  return { valid: true };
}
