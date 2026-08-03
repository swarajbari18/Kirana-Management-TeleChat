export type VerifiedFactValueType = "string" | "number" | "boolean" | "json";

export interface VerifiedFactIdentity {
  sku?: string;
  canonicalName?: string;
  entity?: string;
}

export interface VerifiedFactRecord {
  factId: string;
  objectiveId: string;
  capabilityId: string;
  toolName: string;
  jsonPath: string;
  field: string;
  value: string;
  valueType: VerifiedFactValueType;
  identity?: VerifiedFactIdentity;
  catalogLabel: string;
}

export interface FactCatalogEntry {
  factId: string;
  catalogLabel: string;
  field: string;
  valueType: VerifiedFactValueType;
}

export interface OutcomeRecord {
  outcomeId: string;
  objectiveId: string;
  kind: "denied";
  reason: string;
  catalogLabel: string;
}

export interface OutcomeCatalogEntry {
  outcomeId: string;
  catalogLabel: string;
  kind: "denied";
}
