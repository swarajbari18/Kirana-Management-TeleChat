import type { AgentStatePriorResults } from "../capability-registry/capability-blueprint.js";
import type { KhataCustomerMatch } from "../store-durable-object/persistence/repositories/khata-repository.js";
import type { SimilarCustomerCandidate } from "./errors.js";

export interface QueryKhataAgentState {
  exactMatchCount: number;
  exactMatches: KhataCustomerMatch[];
  similarCandidates?: SimilarCustomerCandidate[];
  customerId?: string;
  canonicalName?: string;
  balanceAfterPaise?: number;
  mode?: "by_customer" | "all_customers";
}

export function getPriorQueryKhataResult(
  priorResults: AgentStatePriorResults,
): QueryKhataAgentState | undefined {
  const fromTool = priorResults.byToolName.get("query_khata");
  if (fromTool) {
    return fromTool as unknown as QueryKhataAgentState;
  }
  for (const state of priorResults.byOperationId.values()) {
    if ("exactMatchCount" in state && "mode" in state) {
      return state as unknown as QueryKhataAgentState;
    }
  }
  return undefined;
}

type KhataManageOperationParam =
  | "create_customer"
  | "record_manual_credit"
  | "record_payment"
  | "record_credit_from_bill";

export type FollowingKhataToolKind = "create_customer" | "identity_write" | "none";

function manageKhataOperation(
  op: { toolName: string; parameters?: Record<string, unknown> },
): KhataManageOperationParam | undefined {
  if (op.toolName !== "manage_khata_transaction") {
    return undefined;
  }
  const operation = String(op.parameters?.operation ?? "");
  if (
    operation === "create_customer" ||
    operation === "record_manual_credit" ||
    operation === "record_payment" ||
    operation === "record_credit_from_bill"
  ) {
    return operation;
  }
  return undefined;
}

/**
 * What kind of khata write appears anywhere later in the ordered plan (not only
 * the immediate next step). Used by query_khata to decide whether zero exact
 * matches are a verified fact or must clarify and stop the BC chain.
 */
export function followingKhataToolKind(
  orderedOperations: Array<{
    operationId: string;
    toolName: string;
    parameters?: Record<string, unknown>;
  }>,
  currentOperationId: string,
): FollowingKhataToolKind {
  const currentIndex = orderedOperations.findIndex(
    (op) => op.operationId === currentOperationId,
  );
  if (currentIndex === -1) {
    return "none";
  }

  const following = orderedOperations.slice(currentIndex + 1);

  if (
    following.some((op) => manageKhataOperation(op) === "create_customer")
  ) {
    return "create_customer";
  }

  if (
    following.some((op) => {
      const operation = manageKhataOperation(op);
      return (
        operation === "record_manual_credit" || operation === "record_payment"
      );
    })
  ) {
    return "identity_write";
  }

  return "none";
}
