import { invokeCapability } from "../../capability-registry/index.js";
import type { RuntimePorts } from "../../store-durable-object/runtime-ports/types.js";
import type { StoreDatabase } from "../../store-durable-object/persistence/db.js";
import type {
  CapabilityPlanStep,
  OrchestrationContext,
} from "../types.js";
import type { CapabilityResult } from "../../my-shop-profile/types.js";

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
