import type { ToolContractEntry } from "./types.js";

const KHATA_AMOUNT_FIELDS = [
  { name: "customer_name", kind: "string" as const, required: true },
  { name: "amount", kind: "number" as const },
  { name: "amount_paise", kind: "number" as const },
  { name: "notes", kind: "string" as const },
];

export const KHATA_TOOL_CONTRACTS: Record<string, ToolContractEntry> = {
  query_khata: {
    kind: "flat",
    contract: {
      fields: [
        {
          name: "mode",
          kind: "enum",
          enumValues: ["by_customer", "all_customers"],
        },
        { name: "customer_name", kind: "string" },
      ],
    },
  },
  manage_khata_transaction: {
    kind: "operation",
    contract: {
      operationParam: "operation",
      operationEnumValues: [
        "create_customer",
        "record_manual_credit",
        "record_payment",
        "record_credit_from_bill",
      ],
      sharedFields: [
        {
          name: "operation",
          kind: "enum",
          required: true,
          enumValues: [
            "create_customer",
            "record_manual_credit",
            "record_payment",
            "record_credit_from_bill",
          ],
        },
      ],
      byOperation: {
        create_customer: {
          fields: [
            { name: "customer_name", kind: "string", required: true },
            { name: "aliases", kind: "string[]" },
          ],
        },
        record_manual_credit: {
          fields: KHATA_AMOUNT_FIELDS,
          requireOneOf: ["amount", "amount_paise"],
        },
        record_payment: {
          fields: KHATA_AMOUNT_FIELDS,
          requireOneOf: ["amount", "amount_paise"],
        },
        record_credit_from_bill: {
          fields: [
            { name: "bill_id", kind: "string", required: true },
            { name: "create_customer", kind: "boolean" },
          ],
        },
      },
    },
  },
};
