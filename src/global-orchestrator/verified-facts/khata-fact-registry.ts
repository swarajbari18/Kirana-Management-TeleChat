import type { VerifiedFactRecord, VerifiedFactValueType } from "./types.js";

const KHATA_FIELDS: Array<{
  field: string;
  valueType: VerifiedFactValueType;
  label: (value: string, customerName: string) => string;
}> = [
  {
    field: "customer_name",
    valueType: "string",
    label: (v) => `Customer: ${v}`,
  },
  {
    field: "balance_after_paise",
    valueType: "number",
    label: (v, name) => `${name} balance: ₹${(Number(v) / 100).toFixed(2)}`,
  },
  {
    field: "amount_paise",
    valueType: "number",
    label: (v, name) => `${name} transaction amount: ₹${(Number(v) / 100).toFixed(2)}`,
  },
  {
    field: "entry_type",
    valueType: "string",
    label: (v, name) => `${name} entry type: ${v}`,
  },
  {
    field: "bill_id",
    valueType: "string",
    label: (v, name) => `${name} bill: ${v}`,
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
  customerId: string,
  field: string,
): string {
  return `${capabilityId}_${objectiveId}_${toolName}_${customerId}_${field}`;
}

export function inferKhataToolName(
  verifiedFacts: Record<string, unknown>,
): string {
  if ("recent_entries" in verifiedFacts || verifiedFacts.mode === "all_customers") {
    return "query_khata";
  }
  if ("entry_id" in verifiedFacts || "entry_type" in verifiedFacts) {
    return "manage_khata_transaction";
  }
  if ("balance_after_paise" in verifiedFacts && !("entry_type" in verifiedFacts)) {
    return "query_khata";
  }
  return "manage_khata_transaction";
}

export function buildKhataFactRecords(
  objectiveId: string,
  capabilityId: string,
  toolName: string,
  verifiedFacts: Record<string, unknown>,
): VerifiedFactRecord[] {
  const records: VerifiedFactRecord[] = [];
  const customerId = String(verifiedFacts.customer_id ?? "unknown");
  const customerName = String(verifiedFacts.customer_name ?? customerId);

  for (const spec of KHATA_FIELDS) {
    if (!(spec.field in verifiedFacts)) {
      continue;
    }
    const raw = verifiedFacts[spec.field];
    if (raw === undefined || raw === null) {
      continue;
    }
    const value = serializeValue(raw, spec.valueType);
    records.push({
      factId: buildFactId(capabilityId, objectiveId, toolName, customerId, spec.field),
      objectiveId,
      capabilityId,
      toolName,
      jsonPath: spec.field,
      field: spec.field,
      value,
      valueType: spec.valueType,
      identity: { sku: customerId, canonicalName: customerName },
      catalogLabel: spec.label(value, customerName),
    });
  }

  if (Array.isArray(verifiedFacts.customers)) {
    for (const item of verifiedFacts.customers as Array<Record<string, unknown>>) {
      const id = String(item.customer_id);
      const name = String(item.customer_name ?? id);
      const balance = serializeValue(item.balance_after_paise, "number");
      records.push({
        factId: buildFactId(
          capabilityId,
          objectiveId,
          toolName,
          id,
          "balance_after_paise",
        ),
        objectiveId,
        capabilityId,
        toolName,
        jsonPath: `customers[customer_id=${id}].balance_after_paise`,
        field: "balance_after_paise",
        value: balance,
        valueType: "number",
        identity: { sku: id, canonicalName: name },
        catalogLabel: `${name} balance: ₹${(Number(balance) / 100).toFixed(2)}`,
      });
    }
  }

  return records;
}
