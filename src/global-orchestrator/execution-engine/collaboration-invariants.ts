import type { CapabilityResult } from "../../capability-registry/types.js";
import type { StructuredCapabilityPlan } from "../types.js";
import type { ExecutionPhaseResult } from "./types.js";

export type CollaborationCheckResult =
  | { ok: true }
  | {
      ok: false;
      diagnostics: string[];
      replanNarrative: string;
      billId?: string;
      paymentMethod?: string;
    };

function findFinalizedBillingObjectives(
  plan: StructuredCapabilityPlan,
  phaseResult: ExecutionPhaseResult,
): Array<{
  objectiveId: string;
  billId: string;
  paymentMethod: string;
}> {
  const finalized: Array<{
    objectiveId: string;
    billId: string;
    paymentMethod: string;
  }> = [];

  for (const step of plan.objectives) {
    if (step.capabilityId !== "billing") {
      continue;
    }
    const entry = phaseResult.objectives[step.objectiveId];
    if (entry?.status !== "completed" || entry.result?.status !== "completed") {
      continue;
    }
    const facts = entry.result.verifiedFacts;
    if (facts.finalized !== true) {
      continue;
    }
    const billId = String(facts.bill_id ?? "");
    const paymentMethod = String(facts.payment_method ?? "");
    if (!billId) {
      continue;
    }
    finalized.push({
      objectiveId: step.objectiveId,
      billId,
      paymentMethod,
    });
  }

  return finalized;
}

function hasPostBillInventoryObjective(
  plan: StructuredCapabilityPlan,
  billingObjectiveId: string,
  phaseResult: ExecutionPhaseResult,
): boolean {
  for (const step of plan.objectives) {
    if (step.capabilityId !== "inventory") {
      continue;
    }
    const deps = step.dependencies ?? [];
    if (!deps.includes(billingObjectiveId)) {
      continue;
    }
    const entry = phaseResult.objectives[step.objectiveId];
    if (entry?.status === "completed" && entry.result?.status === "completed") {
      const facts = entry.result.verifiedFacts;
      if (facts.bill_id || facts.billId || facts.sale_committed === true) {
        return true;
      }
      const agentState = entry.result.verifiedFacts;
      if ("sale_committed" in agentState) {
        return true;
      }
    }
    if (entry?.status === "pending" || entry?.status === "running") {
      return true;
    }
    if (
      entry?.status === "completed" &&
      entry.result?.status === "completed" &&
      !entry.result.refusalMessage
    ) {
      return true;
    }
  }
  return false;
}

function hasKhataObjectiveForBill(
  plan: StructuredCapabilityPlan,
  billingObjectiveId: string,
): boolean {
  return plan.objectives.some(
    (step) =>
      step.capabilityId === "khata" &&
      (step.dependencies ?? []).includes(billingObjectiveId),
  );
}

export function checkSaleCollaborationInvariant(
  plan: StructuredCapabilityPlan,
  phaseResult: ExecutionPhaseResult,
): CollaborationCheckResult {
  const finalizedBills = findFinalizedBillingObjectives(plan, phaseResult);
  if (finalizedBills.length === 0) {
    return { ok: true };
  }

  const diagnostics: string[] = [];

  for (const bill of finalizedBills) {
    if (!hasPostBillInventoryObjective(plan, bill.objectiveId, phaseResult)) {
      diagnostics.push(
        `Bill ${bill.billId} finalized but no inventory objective depends on billing objective ${bill.objectiveId} for commit_bill_sale`,
      );
    }

    if (
      bill.paymentMethod === "khata" &&
      !hasKhataObjectiveForBill(plan, bill.objectiveId)
    ) {
      diagnostics.push(
        `Bill ${bill.billId} finalized on khata but no khata objective depends on billing objective ${bill.objectiveId}`,
      );
    }
  }

  if (diagnostics.length === 0) {
    return { ok: true };
  }

  const bill = finalizedBills[0]!;
  return {
    ok: false,
    diagnostics,
    replanNarrative: [
      "Sale collaboration invariant failed after bill finalize.",
      "A finalized sale requires:",
      "- An inventory objective (depending on billing) to commit_bill_sale and reduce stock",
      bill.paymentMethod === "khata"
        ? "- A khata objective (depending on billing) to record credit_sale"
        : "- No khata objective needed (payment is not khata)",
      `Bill ${bill.billId} was finalized with payment_method=${bill.paymentMethod}.`,
      "Add the missing post-finalize objectives with correct dependencies. Do not re-finalize the bill.",
    ].join("\n"),
    billId: bill.billId,
    paymentMethod: bill.paymentMethod,
  };
}
