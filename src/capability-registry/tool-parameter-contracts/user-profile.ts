import type { ToolContractEntry } from "./types.js";

export const USER_PROFILE_TOOL_CONTRACTS: Record<string, ToolContractEntry> = {
  read_shop_profile: {
    kind: "flat",
    contract: { fields: [] },
  },
  propose_shop_identity_update: {
    kind: "flat",
    contract: {
      fields: [
        { name: "shopName", kind: "string" },
        { name: "ownerName", kind: "string" },
      ],
      requireOneOf: ["shopName", "ownerName"],
    },
  },
  propose_tax_registration_update: {
    kind: "flat",
    contract: {
      fields: [
        { name: "gstRegistered", kind: "boolean", required: true },
        { name: "gstin", kind: "string" },
      ],
    },
  },
  update_instruction_preference: {
    kind: "flat",
    contract: {
      fields: [
        { name: "instruction", kind: "string", required: true },
        {
          name: "mode",
          kind: "enum",
          enumValues: ["append", "replace"],
        },
      ],
    },
  },
};
