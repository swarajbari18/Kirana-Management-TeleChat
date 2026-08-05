import type { ToolPlanStep } from "../capability-registry/types.js";
import type { ParameterGroundingContext } from "../capability-registry/parameter-grounding-context.js";
import { productLookupsFromVerifiedFacts } from "../capability-registry/verified-facts-merge.js";

export interface ParameterGroundingResult {
  valid: boolean;
  diagnostic?: string;
  userMessage?: string;
}

function containsSubstring(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function buildGroundingHaystack(context: ParameterGroundingContext): string {
  const parts = [context.objectiveDescription, context.userMessage];

  for (const depFacts of Object.values(context.priorObjectiveResults ?? {})) {
    for (const lookup of productLookupsFromVerifiedFacts(depFacts)) {
      if (typeof lookup.productName === "string") {
        parts.push(lookup.productName);
      }
    }
    if (typeof depFacts.productName === "string") {
      parts.push(depFacts.productName);
    }
  }

  return parts.join("\n");
}

function checkGrounded(
  haystack: string,
  field: string,
  value: unknown,
): ParameterGroundingResult | null {
  if (value === undefined || value === null) {
    return null;
  }
  const str = String(value);
  if (!containsSubstring(haystack, str)) {
    return {
      valid: false,
      diagnostic: `${field} value "${str}" not found in objective description`,
      userMessage: `Please confirm the ${field} mentioned in your request.`,
    };
  }
  return null;
}

export function parameterGroundingCheck(
  context: ParameterGroundingContext,
  operation: ToolPlanStep,
): ParameterGroundingResult {
  const haystack = buildGroundingHaystack(context);
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
      const fail = checkGrounded(haystack, field, params[field]);
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
