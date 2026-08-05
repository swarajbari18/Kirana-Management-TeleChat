import type { VerifiedFactRecord, VerifiedFactValueType } from "./types.js";

const INVENTORY_FIELDS: Array<{
  field: string;
  valueType: VerifiedFactValueType;
  label: (value: string, sku: string, productName: string) => string;
}> = [
  {
    field: "sku",
    valueType: "string",
    label: (v, _sku, name) => `SKU (${name}): ${v}`,
  },
  {
    field: "productName",
    valueType: "string",
    label: (v, sku) => `Product name (${sku}): ${v}`,
  },
  {
    field: "found",
    valueType: "boolean",
    label: (v, _sku, name) =>
      `${name}: ${v === "true" ? "found in inventory" : "not in inventory"}`,
  },
  {
    field: "quantityOnHand",
    valueType: "number",
    label: (v, sku, name) => `${name} (${sku}) quantity on hand: ${v}`,
  },
  {
    field: "costPrice",
    valueType: "number",
    label: (v, sku, name) => `${name} (${sku}) cost price: ${v}`,
  },
  {
    field: "sellPrice",
    valueType: "number",
    label: (v, sku, name) => `${name} (${sku}) sell price: ${v}`,
  },
  {
    field: "reorderLevel",
    valueType: "number",
    label: (v, sku, name) => `${name} (${sku}) reorder level: ${v}`,
  },
  {
    field: "gstRate",
    valueType: "number",
    label: (v, sku, name) => `${name} (${sku}) GST rate: ${v}%`,
  },
  {
    field: "hsnCode",
    valueType: "string",
    label: (v, sku, name) => `${name} (${sku}) HSN: ${v}`,
  },
  {
    field: "availableAfter",
    valueType: "number",
    label: (v, sku, name) => `${name} (${sku}) available after reserve: ${v}`,
  },
  {
    field: "lowStockCount",
    valueType: "number",
    label: (v) => `Low stock SKU count: ${v}`,
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

function identityKeyForFacts(verifiedFacts: Record<string, unknown>): string {
  if (typeof verifiedFacts.sku === "string" && verifiedFacts.sku.length > 0) {
    return verifiedFacts.sku;
  }
  if (typeof verifiedFacts.productName === "string") {
    return `name_${verifiedFacts.productName.replace(/\s+/g, "_").toLowerCase()}`;
  }
  if (typeof verifiedFacts.operationId === "string") {
    return verifiedFacts.operationId;
  }
  return "unknown";
}

function buildFactId(
  capabilityId: string,
  objectiveId: string,
  toolName: string,
  identityKey: string,
  field: string,
): string {
  return `${capabilityId}_${objectiveId}_${toolName}_${identityKey}_${field}`;
}

export function inferInventoryToolName(
  verifiedFacts: Record<string, unknown>,
): string {
  if (Array.isArray(verifiedFacts.productLookups)) {
    return "query_inventory";
  }
  if ("lowStockCount" in verifiedFacts || "lowStockItems" in verifiedFacts) {
    return "query_inventory";
  }
  if ("reservationId" in verifiedFacts || "reservedQuantity" in verifiedFacts) {
    return "allocate_inventory";
  }
  if ("sale_committed" in verifiedFacts || "billId" in verifiedFacts) {
    return "commit_bill_sale";
  }
  if ("quantityDelta" in verifiedFacts) {
    return "update_inventory";
  }
  if ("reorderLevelDefaulted" in verifiedFacts) {
    return "register_inventory";
  }
  if ("exactMatchCount" in verifiedFacts && !("sku" in verifiedFacts)) {
    return "query_inventory";
  }
  if ("sku" in verifiedFacts && "quantityOnHand" in verifiedFacts) {
    return "query_inventory";
  }
  return "query_inventory";
}

export function buildInventoryFactRecords(
  objectiveId: string,
  capabilityId: string,
  toolName: string,
  verifiedFacts: Record<string, unknown>,
): VerifiedFactRecord[] {
  if (Array.isArray(verifiedFacts.productLookups)) {
    const records: VerifiedFactRecord[] = [];
    for (const lookup of verifiedFacts.productLookups as Array<
      Record<string, unknown>
    >) {
      records.push(
        ...buildInventoryFactRecords(
          objectiveId,
          capabilityId,
          toolName,
          lookup,
        ),
      );
    }
    return records;
  }

  const records: VerifiedFactRecord[] = [];
  const identityKey = identityKeyForFacts(verifiedFacts);
  const sku = String(verifiedFacts.sku ?? identityKey);
  const productName = String(verifiedFacts.productName ?? sku);

  for (const spec of INVENTORY_FIELDS) {
    if (!(spec.field in verifiedFacts)) {
      continue;
    }
    const raw = verifiedFacts[spec.field];
    if (raw === undefined || raw === null) {
      continue;
    }
    const value = serializeValue(raw, spec.valueType);
    records.push({
      factId: buildFactId(capabilityId, objectiveId, toolName, identityKey, spec.field),
      objectiveId,
      capabilityId,
      toolName,
      jsonPath: spec.field,
      field: spec.field,
      value,
      valueType: spec.valueType,
      identity: { sku, canonicalName: productName },
      catalogLabel: spec.label(value, sku, productName),
    });
  }

  if (Array.isArray(verifiedFacts.lowStockItems)) {
    for (const item of verifiedFacts.lowStockItems as Array<Record<string, unknown>>) {
      const itemSku = String(item.sku);
      const itemName = String(item.productName ?? itemSku);
      const qty = serializeValue(item.quantityOnHand, "number");
      records.push({
        factId: buildFactId(
          capabilityId,
          objectiveId,
          toolName,
          itemSku,
          "quantityOnHand",
        ),
        objectiveId,
        capabilityId,
        toolName,
        jsonPath: `lowStockItems[sku=${itemSku}].quantityOnHand`,
        field: "quantityOnHand",
        value: qty,
        valueType: "number",
        identity: { sku: itemSku, canonicalName: itemName },
        catalogLabel: `${itemName} (${itemSku}) quantity on hand: ${qty}`,
      });
    }
  }

  return records;
}

/** Fixture records for binding-verifier INV-* unit tests. */
export function buildInventoryFixtureRecords(): VerifiedFactRecord[] {
  return buildInventoryFactRecords(
    "check_stock",
    "inventory",
    "query_inventory",
    {
      sku: "maggi-5-pack-001",
      productName: "Maggi 5-pack",
      quantityOnHand: 5,
    },
  ).concat(
    buildInventoryFactRecords("check_stock", "inventory", "query_inventory", {
      sku: "atta-1kg-001",
      productName: "Atta 1kg",
      quantityOnHand: 26,
    }),
  );
}
