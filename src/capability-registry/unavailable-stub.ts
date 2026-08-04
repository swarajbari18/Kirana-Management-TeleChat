import type { BusinessObjective } from "./index.js";
import type { CapabilityResult } from "./types.js";

export function unavailableStub(
  capabilityId: string,
  _objective: BusinessObjective,
): CapabilityResult {
  return {
    status: "unavailable",
    capabilityId,
    reason: "not_implemented",
  };
}
