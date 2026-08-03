import type { VerifiedFactRecord, VerifiedFactValueType } from "./types.js";

const MSP_READ_FIELDS: Array<{
  field: string;
  valueType: VerifiedFactValueType;
  label: (value: string) => string;
}> = [
  {
    field: "shopName",
    valueType: "string",
    label: (v) => `Shop name (shopName): ${v}`,
  },
  {
    field: "ownerName",
    valueType: "string",
    label: (v) => `Owner name (ownerName): ${v}`,
  },
  {
    field: "gstin",
    valueType: "string",
    label: (v) => `GSTIN (gstin): ${v}`,
  },
  {
    field: "gstRegistered",
    valueType: "boolean",
    label: (v) => `GST registered (gstRegistered): ${v}`,
  },
  {
    field: "instructions",
    valueType: "json",
    label: (v) => `Instructions (instructions): ${v}`,
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
  field: string,
): string {
  return `${capabilityId}_${objectiveId}_${toolName}_${field}`;
}

export function inferMspToolName(
  verifiedFacts: Record<string, unknown>,
): string {
  const keys = new Set(Object.keys(verifiedFacts));
  if (
    keys.has("shopName") &&
    keys.has("ownerName") &&
    keys.has("gstRegistered") &&
    keys.has("gstin") &&
    keys.has("instructions")
  ) {
    return "read_shop_profile";
  }
  if (keys.has("instructions") && keys.size === 1) {
    return "update_instruction_preference";
  }
  if (keys.has("gstRegistered") || keys.has("gstin")) {
    return "propose_tax_registration_update";
  }
  if (keys.has("shopName") || keys.has("ownerName")) {
    return "propose_shop_identity_update";
  }
  return "read_shop_profile";
}

export function buildMspFactRecords(
  objectiveId: string,
  capabilityId: string,
  toolName: string,
  verifiedFacts: Record<string, unknown>,
): VerifiedFactRecord[] {
  const records: VerifiedFactRecord[] = [];

  for (const spec of MSP_READ_FIELDS) {
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
      identity: { entity: "shop" },
      catalogLabel: spec.label(value),
    });
  }

  return records;
}

/** Build inventory fixture records for pre-C5 unit tests (INV-*). */
export function buildInventoryFixtureRecords(): VerifiedFactRecord[] {
  return [
    {
      factId: "inventory_check_stock_read_inventory_MAG-001_quantity",
      objectiveId: "check_stock",
      capabilityId: "inventory",
      toolName: "read_inventory",
      jsonPath: "items[sku=MAG-001].quantity",
      field: "quantity",
      value: "5",
      valueType: "number",
      identity: { sku: "MAG-001", canonicalName: "Maggi" },
      catalogLabel: "Maggi (MAG-001) quantity: 5",
    },
    {
      factId: "inventory_check_stock_read_inventory_ATTA-001_quantity",
      objectiveId: "check_stock",
      capabilityId: "inventory",
      toolName: "read_inventory",
      jsonPath: "items[sku=ATTA-001].quantity",
      field: "quantity",
      value: "26",
      valueType: "number",
      identity: { sku: "ATTA-001", canonicalName: "Atta" },
      catalogLabel: "Atta (ATTA-001) quantity: 26",
    },
  ];
}
