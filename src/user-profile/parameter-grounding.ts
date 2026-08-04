import type { ToolPlanStep } from "./types.js";

export interface ParameterGroundingResult {
  valid: boolean;
  diagnostic?: string;
  userMessage?: string;
}

function containsSubstring(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

export function parameterGroundingCheck(
  objectiveDescription: string,
  operation: ToolPlanStep,
): ParameterGroundingResult {
  const params = operation.parameters;

  switch (operation.toolName) {
    case "propose_tax_registration_update": {
      const gstRegistered = params.gstRegistered;
      if (gstRegistered === true && !params.gstin) {
        return {
          valid: false,
          diagnostic: "gstRegistered true requires gstin parameter",
          userMessage:
            "Please provide your GSTIN — it is required when you are GST registered.",
        };
      }
      return { valid: true };
    }

    case "propose_shop_identity_update": {
      const hasShopName =
        typeof params.shopName === "string" && params.shopName.length > 0;
      const hasOwnerName =
        typeof params.ownerName === "string" && params.ownerName.length > 0;
      if (!hasShopName && !hasOwnerName) {
        return {
          valid: false,
          diagnostic: "At least one of shopName or ownerName required",
          userMessage:
            "Which shop name or owner name would you like to set?",
        };
      }
      if (
        hasShopName &&
        containsSubstring(objectiveDescription, params.shopName as string) ===
          false &&
        /\b(name|shop|store)\b/i.test(objectiveDescription)
      ) {
        const quoted = objectiveDescription.match(/"([^"]+)"/);
        if (quoted && !containsSubstring(params.shopName as string, quoted[1])) {
          return {
            valid: false,
            diagnostic: `shopName does not match quoted name in objective: ${quoted[1]}`,
            userMessage: `Did you mean the shop name "${quoted[1]}"?`,
          };
        }
      }
      return { valid: true };
    }

    case "update_instruction_preference": {
      const instruction = params.instruction;
      if (typeof instruction !== "string" || instruction.trim().length === 0) {
        return {
          valid: false,
          diagnostic: "instruction must be non-empty",
          userMessage: "What instruction would you like me to remember?",
        };
      }
      const quoted = objectiveDescription.match(/"([^"]+)"/);
      if (
        quoted &&
        !containsSubstring(instruction, quoted[1])
      ) {
        return {
          valid: false,
          diagnostic: `instruction does not contain quoted text from objective: ${quoted[1]}`,
          userMessage: `Please confirm the exact instruction: "${quoted[1]}"`,
        };
      }
      return { valid: true };
    }

    default:
      return { valid: true };
  }
}
