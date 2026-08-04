import type { AgentStatePriorResults } from "../../capability-registry/capability-blueprint.js";
import type { StoreDatabase } from "../../store-durable-object/persistence/db.js";
import {
  searchCustomersExact,
  type KhataCustomerMatch,
} from "../../store-durable-object/persistence/repositories/khata-repository.js";
import { getPriorQueryKhataResult } from "../agent-state.js";
import { ClarificationError } from "../errors.js";
import { formatExactCustomersMessage } from "./customer-search.js";

export type KhataPaymentCustomerLookup =
  | { status: "found"; customer: KhataCustomerMatch }
  | { status: "not_found"; customerName: string };

/**
 * Resolves customer for record_payment. Unknown customer → not_found (confirmation),
 * not clarification. Ambiguous exact matches still clarify.
 */
export async function resolveCustomerForKhataPayment(
  db: StoreDatabase,
  customerName: string,
  priorResults: AgentStatePriorResults,
): Promise<KhataPaymentCustomerLookup> {
  const priorQuery = getPriorQueryKhataResult(priorResults);
  if (priorQuery?.exactMatchCount === 1 && priorQuery.exactMatches[0]) {
    return { status: "found", customer: priorQuery.exactMatches[0] };
  }

  const exactMatches = await searchCustomersExact(db, customerName);
  if (exactMatches.length > 1) {
    throw new ClarificationError(
      `Multiple exact customer matches found.\n${formatExactCustomersMessage(exactMatches)}`,
      { exactMatches },
    );
  }
  if (exactMatches.length === 1) {
    return { status: "found", customer: exactMatches[0]! };
  }

  return { status: "not_found", customerName: customerName.trim() };
}
