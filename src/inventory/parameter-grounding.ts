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
    case "register_inventory": {
      for (const field of [
        "product_name",
        "quantity",
        "cost_price",
        "sell_price",
        "hsn_code",
        "gst_rate",
      ] as const) {
        const fail = checkGrounded(objectiveDescription, field, params[field]);
        if (fail) {
          return fail;
        }
      }
      return { valid: true };
    }

    case "update_inventory": {
      for (const field of [
        "product_name",
        "quantity",
        "cost_price",
        "sell_price",
        "hsn_code",
        "gst_rate",
      ] as const) {
        if (params[field] === undefined) {
          continue;
        }
        const fail = checkGrounded(objectiveDescription, field, params[field]);
        if (fail) {
          return fail;
        }
      }
      return { valid: true };
    }

    case "allocate_inventory": {
      const qtyFail = checkGrounded(
        objectiveDescription,
        "quantity",
        params.quantity,
      );
      if (qtyFail) {
        return qtyFail;
      }
      if (typeof params.product_name === "string") {
        const nameFail = checkGrounded(
          objectiveDescription,
          "product_name",
          params.product_name,
        );
        if (nameFail) {
          return nameFail;
        }
      }
      return { valid: true };
    }

    case "query_inventory": {
      if (typeof params.product_name === "string") {
        const fail = checkGrounded(
          objectiveDescription,
          "product_name",
          params.product_name,
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
