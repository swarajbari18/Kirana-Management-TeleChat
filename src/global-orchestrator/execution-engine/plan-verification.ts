import type { StructuredCapabilityPlan } from "../types.js";

export interface PlanVerificationResult {
  valid: boolean;
  reason?: string;
}

const KNOWN_CAPABILITIES = new Set(["my_shop_profile"]);

export function verifyCapabilityPlan(
  plan: StructuredCapabilityPlan,
): PlanVerificationResult {
  if (!plan.objectives || plan.objectives.length === 0) {
    return { valid: false, reason: "Plan has no objectives" };
  }

  const objectiveIds = new Set<string>();

  for (const step of plan.objectives) {
    if (!step.objectiveId || !step.capabilityId) {
      return { valid: false, reason: "Missing objectiveId or capabilityId" };
    }

    if (objectiveIds.has(step.objectiveId)) {
      return { valid: false, reason: `Duplicate objectiveId ${step.objectiveId}` };
    }
    objectiveIds.add(step.objectiveId);

    if (!KNOWN_CAPABILITIES.has(step.capabilityId)) {
      return {
        valid: false,
        reason: `Unknown capability: ${step.capabilityId}`,
      };
    }

    for (const dep of step.dependencies ?? []) {
      if (!objectiveIds.has(dep) && !plan.objectives.some((o) => o.objectiveId === dep)) {
        return { valid: false, reason: `Unknown dependency: ${dep}` };
      }
    }
  }

  return { valid: true };
}
