import type { CapabilityResult } from "../../my-shop-profile/types.js";
import type { ObjectiveStatus } from "../../store-durable-object/agent-state/run-context.js";

export interface ObjectivePhaseEntry {
  status: ObjectiveStatus;
  result?: CapabilityResult;
}

export interface ExecutionPhaseResult {
  objectives: Record<string, ObjectivePhaseEntry>;
}

export function createEmptyPhaseResult(): ExecutionPhaseResult {
  return { objectives: {} };
}
