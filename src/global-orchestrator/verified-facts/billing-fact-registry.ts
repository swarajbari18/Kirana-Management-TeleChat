import { formatPaiseAsRupees } from "../../billing/gst.js";
import type { VerifiedFactRecord, VerifiedFactValueType } from "./types.js";

function formatPaiseLabel(paise: string): string {
  const n = Number.parseInt(paise, 10);
  if (Number.isNaN(n)) {
    return paise;
  }
  return formatPaiseAsRupees(n);
}

const BILL_FIELDS: Array<{
  field: string;
  valueType: VerifiedFactValueType;
  label: (value: string, context: Record<string, string>) => string;
}> = [
  {
    field: "customer_name",
    valueType: "string",
    label: (v) => `Bill customer: ${v}`,
  },
  {
    field: "payment_method",
    valueType: "string",
    label: (v) => `Payment method: ${v}`,
  },
  {
    field: "notes",
    valueType: "string",
    label: (v) => `Bill notes: ${v}`,
  },
  {
    field: "draft_subtotal_paise",
    valueType: "number",
    label: (v) => `Draft subtotal: ${formatPaiseLabel(v)}`,
  },
  {
    field: "grand_total_paise",
    valueType: "number",
    label: (v, ctx) =>
      `Bill total for ${ctx.customer_name ?? "customer"}: ${formatPaiseLabel(v)}`,
  },
  {
    field: "invoice_attached",
    valueType: "boolean",
    label: () => "Invoice PDF attached",
  },
  {
    field: "subtotal_paise",
    valueType: "number",
    label: (v) => `Bill subtotal: ${formatPaiseLabel(v)}`,
  },
  {
    field: "cgst_total_paise",
    valueType: "number",
    label: (v) => `CGST total: ${formatPaiseLabel(v)}`,
  },
  {
    field: "sgst_total_paise",
    valueType: "number",
    label: (v) => `SGST total: ${formatPaiseLabel(v)}`,
  },
  {
    field: "quantityOnHand",
    valueType: "number",
    label: (v, ctx) =>
      `${ctx.productName ?? "Product"} on hand: ${v}`,
  },
  {
    field: "availableQuantity",
    valueType: "number",
    label: (v, ctx) =>
      `${ctx.productName ?? "Product"} available to sell: ${v}`,
  },
];

function serializeValue(value: unknown, valueType: VerifiedFactValueType): string {
  if (valueType === "boolean") {
    return String(Boolean(value));
  }
  if (valueType === "json") {
    return JSON.stringify(value);
  }
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}

function buildFactId(
  capabilityId: string,
  objectiveId: string,
  toolName: string,
  key: string,
  field: string,
): string {
  return `${capabilityId}_${objectiveId}_${toolName}_${key}_${field}`;
}

export function inferBillingToolName(
  verifiedFacts: Record<string, unknown>,
): string {
  if ("finalized" in verifiedFacts) {
    return "finalize_bill";
  }
  if ("open_draft_count" in verifiedFacts || "recent_bills" in verifiedFacts) {
    return "query_bill";
  }
  if ("draft_cancelled" in verifiedFacts) {
    return "manage_draft_bill";
  }
  return "manage_draft_bill";
}

export function buildBillingFactRecords(
  objectiveId: string,
  capabilityId: string,
  toolName: string,
  verifiedFacts: Record<string, unknown>,
): VerifiedFactRecord[] {
  const records: VerifiedFactRecord[] = [];
  const billId = String(verifiedFacts.bill_id ?? "draft");
  const customerName = String(verifiedFacts.customer_name ?? "");
  const context = {
    customer_name: customerName,
    productName: String(verifiedFacts.productName ?? ""),
  };

  for (const spec of BILL_FIELDS) {
    if (!(spec.field in verifiedFacts)) {
      continue;
    }
    const raw = verifiedFacts[spec.field];
    if (raw === undefined || raw === null) {
      continue;
    }
    const value = serializeValue(raw, spec.valueType);
    records.push({
      factId: buildFactId(capabilityId, objectiveId, toolName, billId, spec.field),
      objectiveId,
      capabilityId,
      toolName,
      jsonPath: spec.field,
      field: spec.field,
      value,
      valueType: spec.valueType,
      identity: {
        canonicalName: customerName || context.productName || billId,
      },
      catalogLabel: spec.label(value, context),
    });
  }

  if (Array.isArray(verifiedFacts.draft_lines)) {
    for (const line of verifiedFacts.draft_lines as Array<Record<string, unknown>>) {
      const productName = String(line.product_name ?? "");
      const qty = serializeValue(line.quantity, "number");
      const price = serializeValue(line.sell_price_paise, "number");
      records.push({
        factId: buildFactId(
          capabilityId,
          objectiveId,
          toolName,
          `${billId}_${productName}`,
          "quantity",
        ),
        objectiveId,
        capabilityId,
        toolName,
        jsonPath: `draft_lines[${productName}].quantity`,
        field: "quantity",
        value: qty,
        valueType: "number",
        identity: { canonicalName: productName },
        catalogLabel: `${productName} on draft: qty ${qty} @ ${formatPaiseLabel(price)}`,
      });
    }
  }

  if (Array.isArray(verifiedFacts.bill_lines)) {
    for (const line of verifiedFacts.bill_lines as Array<Record<string, unknown>>) {
      const productName = String(line.product_name ?? "");
      const total = serializeValue(line.line_total_paise, "number");
      records.push({
        factId: buildFactId(
          capabilityId,
          objectiveId,
          toolName,
          `${billId}_${productName}`,
          "line_total_paise",
        ),
        objectiveId,
        capabilityId,
        toolName,
        jsonPath: `bill_lines[${productName}].line_total_paise`,
        field: "line_total_paise",
        value: total,
        valueType: "number",
        identity: { canonicalName: productName },
        catalogLabel: `${productName} line total: ${formatPaiseLabel(total)}`,
      });
    }
  }

  return records;
}
