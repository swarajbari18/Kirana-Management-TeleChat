import { describe, expect, it } from "vitest";
import { checkSaleCollaborationInvariant } from "./collaboration-invariants.js";
import type { StructuredCapabilityPlan } from "../types.js";
import type { ExecutionPhaseResult } from "./types.js";

function plan(objectives: StructuredCapabilityPlan["objectives"]): StructuredCapabilityPlan {
  return { businessIntent: "test", objectives };
}

function phaseResult(
  entries: ExecutionPhaseResult["objectives"],
): ExecutionPhaseResult {
  return { objectives: entries };
}

describe("COLLAB-01", () => {
  it("fails when bill finalized without post-inventory objective", () => {
    const p = plan([
      {
        objectiveId: "bill",
        objectiveDescription: "finalize",
        capabilityId: "billing",
        dependencies: [],
      },
    ]);
    const result = phaseResult({
      bill: {
        status: "completed",
        result: {
          status: "completed",
          verifiedFacts: {
            finalized: true,
            bill_id: "bill-1",
            payment_method: "cash",
          },
        },
      },
    });

    const check = checkSaleCollaborationInvariant(p, result);
    expect(check.ok).toBe(false);
    if (!check.ok) {
      expect(check.diagnostics.some((d) => d.includes("inventory"))).toBe(true);
    }
  });
});

describe("COLLAB-02", () => {
  it("fails when khata bill finalized without khata objective", () => {
    const p = plan([
      {
        objectiveId: "bill",
        objectiveDescription: "finalize khata bill",
        capabilityId: "billing",
        dependencies: [],
      },
      {
        objectiveId: "inv-commit",
        objectiveDescription: "commit stock",
        capabilityId: "inventory",
        dependencies: ["bill"],
      },
    ]);
    const result = phaseResult({
      bill: {
        status: "completed",
        result: {
          status: "completed",
          verifiedFacts: {
            finalized: true,
            bill_id: "bill-2",
            payment_method: "khata",
          },
        },
      },
      "inv-commit": {
        status: "completed",
        result: {
          status: "completed",
          verifiedFacts: { sale_committed: true, bill_id: "bill-2" },
        },
      },
    });

    const check = checkSaleCollaborationInvariant(p, result);
    expect(check.ok).toBe(false);
    if (!check.ok) {
      expect(check.diagnostics.some((d) => d.includes("khata"))).toBe(true);
    }
  });
});

describe("COLLAB-03", () => {
  it("passes cash sale with inventory commit and no khata", () => {
    const p = plan([
      {
        objectiveId: "bill",
        objectiveDescription: "finalize cash bill",
        capabilityId: "billing",
        dependencies: [],
      },
      {
        objectiveId: "inv-commit",
        objectiveDescription: "commit stock",
        capabilityId: "inventory",
        dependencies: ["bill"],
      },
    ]);
    const result = phaseResult({
      bill: {
        status: "completed",
        result: {
          status: "completed",
          verifiedFacts: {
            finalized: true,
            bill_id: "bill-3",
            payment_method: "cash",
          },
        },
      },
      "inv-commit": {
        status: "completed",
        result: {
          status: "completed",
          verifiedFacts: { sale_committed: true, bill_id: "bill-3" },
        },
      },
    });

    expect(checkSaleCollaborationInvariant(p, result).ok).toBe(true);
  });
});
