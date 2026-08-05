import type { ToolContractEntry } from "./types.js";

export const INVENTORY_TOOL_CONTRACTS: Record<string, ToolContractEntry> = {
  query_inventory: {
    kind: "flat",
    contract: {
      fields: [
        { name: "product_name", kind: "string" },
        { name: "low_stock", kind: "boolean" },
        { name: "sku", kind: "string" },
      ],
    },
  },
  register_inventory: {
    kind: "flat",
    contract: {
      fields: [
        { name: "product_name", kind: "string", required: true },
        {
          name: "item_type",
          kind: "enum",
          required: true,
          enumValues: ["packaged", "loose"],
        },
        {
          name: "unit",
          kind: "enum",
          required: true,
          enumValues: ["packet", "kg", "g", "litre", "ml", "dozen", "piece"],
        },
        { name: "quantity", kind: "number", required: true },
        { name: "cost_price", kind: "number", required: true },
        { name: "sell_price", kind: "number", required: true },
        { name: "hsn_code", kind: "string", required: true },
        { name: "gst_rate", kind: "number", required: true },
        { name: "reorder_level", kind: "number" },
        { name: "aliases", kind: "string[]" },
      ],
    },
  },
  update_inventory: {
    kind: "flat",
    contract: {
      fields: [
        { name: "product_name", kind: "string" },
        { name: "quantity", kind: "number" },
        { name: "cost_price", kind: "number" },
        { name: "sell_price", kind: "number" },
        { name: "reorder_level", kind: "number" },
      ],
      requireOneOf: ["quantity", "cost_price", "sell_price", "reorder_level"],
    },
  },
  allocate_inventory: {
    kind: "flat",
    contract: {
      fields: [
        { name: "quantity", kind: "number", required: true },
        {
          name: "operation",
          kind: "enum",
          required: true,
          enumValues: ["reserve", "commit", "release"],
        },
        { name: "draft_bill_id", kind: "string", required: true },
        { name: "idempotency_key", kind: "string", required: true },
        { name: "product_name", kind: "string" },
      ],
    },
  },
  commit_bill_sale: {
    kind: "flat",
    contract: {
      fields: [{ name: "bill_id", kind: "string", required: true }],
    },
  },
};
