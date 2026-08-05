import type { ToolPlanStep } from "../types.js";
import type { ParamValidationResult, ToolContractEntry } from "./types.js";
import { validateToolParameters } from "./validate-tool-parameters.js";
import { BILLING_TOOL_CONTRACTS } from "./billing.js";
import { INVENTORY_TOOL_CONTRACTS } from "./inventory.js";
import { KHATA_TOOL_CONTRACTS } from "./khata.js";
import { USER_PROFILE_TOOL_CONTRACTS } from "./user-profile.js";

/** Analytics has no inner tool plan — contracts N/A. */
const CAPABILITY_CONTRACTS: Record<string, Record<string, ToolContractEntry>> = {
  user_profile: USER_PROFILE_TOOL_CONTRACTS,
  inventory: INVENTORY_TOOL_CONTRACTS,
  billing: BILLING_TOOL_CONTRACTS,
  khata: KHATA_TOOL_CONTRACTS,
};

export function getToolContract(
  capabilityId: string,
  toolName: string,
): ToolContractEntry | undefined {
  return CAPABILITY_CONTRACTS[capabilityId]?.[toolName];
}

export function validateCapabilityToolParameters(
  capabilityId: string,
  step: ToolPlanStep,
): ParamValidationResult {
  return validateToolParameters(capabilityId, step, getToolContract);
}

export {
  BILLING_TOOL_CONTRACTS,
  INVENTORY_TOOL_CONTRACTS,
  KHATA_TOOL_CONTRACTS,
  USER_PROFILE_TOOL_CONTRACTS,
};
