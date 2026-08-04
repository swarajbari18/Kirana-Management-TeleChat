import type { AgentStatePriorResults } from "../../capability-registry/capability-blueprint.js";
import type { KhataCustomerMatch } from "../../store-durable-object/persistence/repositories/khata-repository.js";
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
