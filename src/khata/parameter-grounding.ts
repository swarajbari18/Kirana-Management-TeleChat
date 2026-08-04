import type { ToolPlanStep } from "../capability-registry/types.js";

export interface ParameterGroundingResult {
  valid: boolean;
  diagnostic?: string;
  userMessage?: string;
}

function containsSubstring(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function checkGrounded(
  objectiveDescription: string,
  field: string,
  value: unknown,
): ParameterGroundingResult | null {
  if (value === undefined || value === null) {
    return null;
  }
  const str = String(value);
  if (!containsSubstring(objectiveDescription, str)) {
    return {
      valid: false,
      diagnostic: `${field} value "${str}" not found in objective description`,
      userMessage: `Please confirm the ${field} mentioned in your request.`,
    };
  }
  return null;
}

export function parameterGroundingCheck(
  objectiveDescription: string,
  operation: ToolPlanStep,
): ParameterGroundingResult {
  const params = operation.parameters;

  switch (operation.toolName) {
    case "query_khata": {
      if (params.mode !== "all_customers" && typeof params.customer_name === "string") {
        const fail = checkGrounded(
          objectiveDescription,
          "customer_name",
          params.customer_name,
        );
        if (fail) {
          return fail;
        }
      }
      return { valid: true };
    }

    case "manage_khata_transaction": {
      if (typeof params.customer_name === "string") {
        const fail = checkGrounded(
          objectiveDescription,
          "customer_name",
          params.customer_name,
        );
        if (fail) {
          return fail;
        }
      }
      if (params.amount !== undefined) {
        const fail = checkGrounded(
          objectiveDescription,
          "amount",
          params.amount,
        );
        if (fail) {
          return fail;
        }
      }
      if (typeof params.notes === "string") {
        const fail = checkGrounded(
          objectiveDescription,
          "notes",
          params.notes,
        );
        if (fail) {
          return fail;
        }
      }
      return { valid: true };
    }

    default:
      return { valid: true };
  }
}
