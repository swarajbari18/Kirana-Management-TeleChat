import type { ToolContractEntry } from "./types.js";

const DRAFT_TARGET_FIELD = {
  name: "draft_target",
  kind: "enum" as const,
  enumValues: ["implicit_latest", "new", "by_customer", "ambiguous"],
};

const MANAGE_DRAFT_SHARED = [
  {
    name: "operation",
    kind: "enum" as const,
    required: true,
    enumValues: [
      "start_bill",
      "set_customer",
      "set_notes",
      "add_item",
      "remove_item",
      "change_item_quantity",
      "set_payment_method",
      "set_payment_reference",
      "show_draft",
      "list_open_drafts",
      "cancel_draft",
    ],
  },
  DRAFT_TARGET_FIELD,
];

export const BILLING_TOOL_CONTRACTS: Record<string, ToolContractEntry> = {
  manage_draft_bill: {
    kind: "operation",
    contract: {
      operationParam: "operation",
      operationEnumValues: [
        "start_bill",
        "set_customer",
        "set_notes",
        "add_item",
        "remove_item",
        "change_item_quantity",
        "set_payment_method",
        "set_payment_reference",
        "show_draft",
        "list_open_drafts",
        "cancel_draft",
      ],
      sharedFields: MANAGE_DRAFT_SHARED,
      byOperation: {
        start_bill: {
          fields: [
            { name: "customer_name", kind: "string" },
            { name: "notes", kind: "string" },
          ],
        },
        set_customer: {
          fields: [{ name: "customer_name", kind: "string", required: true }],
        },
        set_notes: {
          fields: [{ name: "notes", kind: "string", required: true }],
        },
        add_item: {
          fields: [
            { name: "product_name", kind: "string", required: true },
            { name: "quantity", kind: "number", required: true },
          ],
        },
        remove_item: {
          fields: [
            { name: "product_name", kind: "string" },
            { name: "line_ref", kind: "string" },
          ],
          requireOneOf: ["product_name", "line_ref"],
        },
        change_item_quantity: {
          fields: [
            { name: "quantity", kind: "number", required: true },
            { name: "product_name", kind: "string" },
            { name: "line_ref", kind: "string" },
          ],
        },
        set_payment_method: {
          fields: [
            {
              name: "payment_method",
              kind: "enum",
              required: true,
              enumValues: ["cash", "upi", "khata"],
            },
          ],
        },
        set_payment_reference: {
          fields: [
            { name: "payment_reference", kind: "string", required: true },
          ],
        },
        show_draft: { fields: [] },
        list_open_drafts: { fields: [] },
        cancel_draft: { fields: [] },
      },
    },
  },
  finalize_bill: {
    kind: "flat",
    contract: {
      fields: [
        { name: "generateArtifact", kind: "boolean" },
        {
          name: "draft_target",
          kind: "enum",
          enumValues: ["implicit_latest", "new", "by_customer", "ambiguous"],
        },
      ],
    },
  },
  query_bill: {
    kind: "operation",
    contract: {
      operationParam: "operation",
      operationEnumValues: [
        "list_open_drafts",
        "get_finalized",
        "list_recent_finalized",
        "render_invoice_pdf",
      ],
      sharedFields: [
        {
          name: "operation",
          kind: "enum",
          required: true,
          enumValues: [
            "list_open_drafts",
            "get_finalized",
            "list_recent_finalized",
            "render_invoice_pdf",
          ],
        },
      ],
      byOperation: {
        list_open_drafts: { fields: [] },
        list_recent_finalized: {
          fields: [{ name: "limit", kind: "number" }],
        },
        get_finalized: {
          fields: [{ name: "bill_id", kind: "string", required: true }],
        },
        render_invoice_pdf: {
          fields: [{ name: "bill_id", kind: "string", required: true }],
        },
      },
    },
  },
};
