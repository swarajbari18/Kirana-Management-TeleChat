import type { ToolPlanStep } from "./types.js";

/** Per-product inventory lookup result preserved across multi-query plans. */
export interface ProductLookupFact {
  operationId: string;
  exactMatchCount?: number;
  productName?: string;
  found?: boolean;
  sku?: string;
  quantityOnHand?: number;
  [key: string]: unknown;
}

const QUERY_INVENTORY_MULTI_KEY = "productLookups";

export function mergeToolVerifiedFacts(
  facts: Record<string, unknown>,
  step: ToolPlanStep,
  toolVerifiedFacts: Record<string, unknown>,
): void {
  if (
    step.toolName === "query_inventory" &&
    typeof toolVerifiedFacts.productName === "string"
  ) {
    const lookups = Array.isArray(facts[QUERY_INVENTORY_MULTI_KEY])
      ? ([...(facts[QUERY_INVENTORY_MULTI_KEY] as ProductLookupFact[])] as ProductLookupFact[])
      : [];
    lookups.push({
      operationId: step.operationId,
      ...toolVerifiedFacts,
    });
    facts[QUERY_INVENTORY_MULTI_KEY] = lookups;
    return;
  }

  Object.assign(facts, toolVerifiedFacts);
}

export function productLookupsFromVerifiedFacts(
  verifiedFacts: Record<string, unknown>,
): ProductLookupFact[] {
  if (!Array.isArray(verifiedFacts[QUERY_INVENTORY_MULTI_KEY])) {
    return [];
  }
  return verifiedFacts[QUERY_INVENTORY_MULTI_KEY] as ProductLookupFact[];
}
