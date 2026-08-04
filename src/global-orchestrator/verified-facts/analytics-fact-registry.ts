import type { VerifiedFactRecord, VerifiedFactValueType } from "./types.js";
import { formatPaiseAsRupees } from "../../billing/gst.js";

const ANALYTICS_FIELDS: Array<{
  field: string;
  valueType: VerifiedFactValueType;
  label: (value: string) => string;
}> = [
  {
    field: "today_total_sales_paise",
    valueType: "number",
    label: (v) => `Today's total sales: ${formatPaiseAsRupees(Number(v))}`,
  },
  {
    field: "today_bill_count",
    valueType: "number",
    label: (v) => `Bills today: ${v}`,
  },
  {
    field: "today_gst_collected_paise",
    valueType: "number",
    label: (v) => `GST collected today: ${formatPaiseAsRupees(Number(v))}`,
  },
  {
    field: "total_outstanding_udhar_paise",
    valueType: "number",
    label: (v) => `Total outstanding udhar: ${formatPaiseAsRupees(Number(v))}`,
  },
  {
    field: "today_payment_cash_paise",
    valueType: "number",
    label: (v) => `Cash payments today: ${formatPaiseAsRupees(Number(v))}`,
  },
  {
    field: "today_payment_upi_paise",
    valueType: "number",
    label: (v) => `UPI payments today: ${formatPaiseAsRupees(Number(v))}`,
  },
  {
    field: "today_payment_khata_paise",
    valueType: "number",
    label: (v) => `Khata payments today: ${formatPaiseAsRupees(Number(v))}`,
  },
  {
    field: "analysis_attached",
    valueType: "boolean",
    label: () => "Full analysis report attached",
  },
];

function serializeValue(value: unknown, valueType: VerifiedFactValueType): string {
  if (valueType === "boolean") {
    return String(Boolean(value));
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
  field: string,
): string {
  return `${capabilityId}_${objectiveId}_${toolName}_daily_${field}`;
}

export function inferAnalyticsToolName(): string {
  return "generate_analytics";
}

export function buildAnalyticsFactRecords(
  objectiveId: string,
  capabilityId: string,
  toolName: string,
  verifiedFacts: Record<string, unknown>,
): VerifiedFactRecord[] {
  const records: VerifiedFactRecord[] = [];

  for (const spec of ANALYTICS_FIELDS) {
    if (!(spec.field in verifiedFacts)) {
      continue;
    }
    const raw = verifiedFacts[spec.field];
    if (raw === undefined || raw === null) {
      continue;
    }
    const value = serializeValue(raw, spec.valueType);
    records.push({
      factId: buildFactId(capabilityId, objectiveId, toolName, spec.field),
      objectiveId,
      capabilityId,
      toolName,
      jsonPath: spec.field,
      field: spec.field,
      value,
      valueType: spec.valueType,
      identity: { canonicalName: "daily_summary" },
      catalogLabel: spec.label(value),
    });
  }

  return records;
}
