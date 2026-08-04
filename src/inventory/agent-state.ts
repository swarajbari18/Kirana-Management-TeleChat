import type { AgentStatePriorResults } from "../capability-registry/capability-blueprint.js";
import type { ProductMatch } from "../store-durable-object/persistence/repositories/inventory-repository.js";

export interface QueryInventoryAgentState {
  exactMatchCount: number;
  exactMatches: ProductMatch[];
  similarCandidates?: Array<{
    sku: string;
    productName: string;
    quantityOnHand: number;
    score: number;
  }>;
  lowStockMatches?: ProductMatch[];
  lookupMode: "product_name" | "sku" | "low_stock";
}

export function getPriorQueryInventoryResult(
  priorResults: AgentStatePriorResults,
): QueryInventoryAgentState | null {
  const state = priorResults.byToolName.get("query_inventory");
  if (!state) {
    return null;
  }
  return state as unknown as QueryInventoryAgentState;
}

type FollowingToolKind = "register" | "identity_write" | "none";

/**
 * What kind of inventory write follows this query_inventory op in the ordered plan.
 * - register: create path — exact 0 must continue (not clarify)
 * - identity_write: update/allocate — exact 0 must clarify here and stop the BC chain
 * - none: standalone read
 */
export function followingToolKind(
  orderedOperations: Array<{ operationId: string; toolName: string }>,
  currentOperationId: string,
): FollowingToolKind {
  const currentIndex = orderedOperations.findIndex(
    (op) => op.operationId === currentOperationId,
  );
  if (currentIndex === -1) {
    return "none";
  }
  const following = orderedOperations.slice(currentIndex + 1);
  if (following.some((op) => op.toolName === "register_inventory")) {
    return "register";
  }
  if (
    following.some(
      (op) =>
        op.toolName === "update_inventory" ||
        op.toolName === "allocate_inventory",
    )
  ) {
    return "identity_write";
  }
  return "none";
}
