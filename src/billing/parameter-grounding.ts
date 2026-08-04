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

  if (operation.toolName === "manage_draft_bill") {
    for (const field of [
      "customer_name",
      "product_name",
      "quantity",
      "payment_method",
      "notes",
      "payment_reference",
    ] as const) {
      const fail = checkGrounded(objectiveDescription, field, params[field]);
      if (fail) {
        return fail;
      }
    }
    return { valid: true };
  }

  if (operation.toolName === "finalize_bill") {
    return { valid: true };
  }

  if (operation.toolName === "query_bill") {
    return { valid: true };
  }

  return { valid: true };
}
