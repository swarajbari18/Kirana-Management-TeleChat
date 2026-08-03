import type { CapabilityResult } from "../../my-shop-profile/types.js";
import type { RunContext } from "../../store-durable-object/agent-state/run-context.js";
import type { RuntimePorts } from "../../store-durable-object/runtime-ports/types.js";
import type { StoreDatabase } from "../../store-durable-object/persistence/db.js";
import { invokeCapability } from "../../capability-registry/index.js";
import type {
  CapabilityPlanStep,
  OrchestrationContext,
  StructuredCapabilityPlan,
} from "../types.js";
import type { ExecutionPhaseResult } from "./types.js";

const BLOCKING_STATUSES = new Set([
  "pending",
  "running",
  "clarification_needed",
  "denied",
  "error",
]);

function isDependencyBlocked(
  dependencies: string[],
  phaseResult: ExecutionPhaseResult,
): boolean {
  for (const dep of dependencies) {
    const entry = phaseResult.objectives[dep];
    if (!entry) {
      return true;
    }
    if (BLOCKING_STATUSES.has(entry.status)) {
      return true;
    }
    if (entry.status === "skipped_blocked") {
      return true;
    }
  }
  return false;
}

function resultStatusFromCapability(
  result: CapabilityResult,
): "completed" | "clarification_needed" | "denied" | "error" {
  switch (result.status) {
    case "completed":
      return "completed";
    case "clarification_needed":
      return "clarification_needed";
    case "denied":
      return "denied";
    default:
      return "error";
  }
}

export async function executePhase(
  plan: StructuredCapabilityPlan,
  ctx: OrchestrationContext,
  runtimePorts: RuntimePorts,
  db: StoreDatabase,
  runContext: RunContext,
): Promise<ExecutionPhaseResult> {
  const phaseResult: ExecutionPhaseResult = { objectives: {} };

  for (const step of plan.objectives) {
    phaseResult.objectives[step.objectiveId] = { status: "pending" };
  }

  let changed = true;
  while (changed) {
    changed = false;

    for (const step of plan.objectives) {
      const entry = phaseResult.objectives[step.objectiveId];
      if (!entry || entry.status !== "pending") {
        continue;
      }

      const deps = step.dependencies ?? [];
      if (isDependencyBlocked(deps, phaseResult)) {
        phaseResult.objectives[step.objectiveId] = {
          status: "skipped_blocked",
        };
        changed = true;
        continue;
      }

      phaseResult.objectives[step.objectiveId] = { status: "running" };

      const parentEventId = await runContext.appendTrace(
        "go",
        "global_orchestrator",
        "CAPABILITY_INVOKED",
        {
          objectiveId: step.objectiveId,
          capabilityId: step.capabilityId,
          objectiveDescription: step.objectiveDescription,
        },
      );

      const result = await invokeCapability(
        step.capabilityId,
        {
          objectiveId: step.objectiveId,
          description: step.objectiveDescription,
        },
        ctx,
        runtimePorts,
        db,
        runContext,
        parentEventId,
      );

      const status = resultStatusFromCapability(result);
      phaseResult.objectives[step.objectiveId] = { status, result };
      runContext.storeBcInvocation(step.objectiveId, null, result);

      await runContext.appendTrace(
        "go",
        "global_orchestrator",
        "CAPABILITY_STEP_COMPLETED",
        {
          objectiveId: step.objectiveId,
          status,
          resultSummary:
            result.status === "completed"
              ? Object.keys(result.verifiedFacts)
              : result.status,
        },
        parentEventId,
      );

      changed = true;
    }
  }

  return phaseResult;
}

/** @deprecated Use executePhase */
export async function executeCapabilityPlan(
  plan: CapabilityPlanStep[],
  ctx: OrchestrationContext,
  runtimePorts: RuntimePorts,
  db: StoreDatabase,
): Promise<CapabilityResult[]> {
  const results: CapabilityResult[] = [];
  for (const step of plan) {
    const result = await invokeCapability(
      step.capabilityId,
      {
        objectiveId: step.objectiveId,
        description: step.objectiveDescription,
      },
      ctx,
      runtimePorts,
      db,
    );
    results.push(result);
  }
  return results;
}
