import type { StoreDatabase } from "../../store-durable-object/persistence/db.js";
import type { AgentStatePriorResults } from "../../capability-registry/capability-blueprint.js";
import {
  exportFullLedger,
  getLatestBalancePaise,
  listAllCustomers,
  listAllCustomersWithBalances,
  listRecentEntries,
  searchCustomersExact,
  searchSimilarCustomers,
} from "../../store-durable-object/persistence/repositories/khata-repository.js";
import { ClarificationError } from "../errors.js";
import {
  formatExactCustomersMessage,
  formatSimilarCustomersMessage,
} from "../search/customer-search.js";
import type { QueryKhataAgentState } from "../agent-state.js";
import { renderKhataLedgerCsv } from "../artifact/render-khata-ledger-export.js";
import type { OutboundAttachmentDescriptor } from "../types.js";

export async function queryKhata(
  db: StoreDatabase,
  params: Record<string, unknown>,
  priorResults: AgentStatePriorResults,
): Promise<{
  verifiedFacts: Record<string, unknown>;
  agentState: QueryKhataAgentState;
  attachments?: OutboundAttachmentDescriptor[];
}> {
  const mode =
    params.mode === "all_customers" ? "all_customers" : "by_customer";

  if (mode === "all_customers") {
    const summaries = await listAllCustomersWithBalances(db);
    const customers = await listAllCustomers(db);
    const entries = await exportFullLedger(db);
    const csv = renderKhataLedgerCsv({
      title: "Full shop khata ledger",
      customers: customers.map((c) => ({
        customerId: c.id,
        canonicalName: c.canonicalName,
      })),
      entries,
    });
    const bytes = new TextEncoder().encode(csv);

    return {
      verifiedFacts: {
        mode: "all_customers",
        customer_count: summaries.length,
        customers: summaries.map((s) => ({
          customer_id: s.customerId,
          customer_name: s.canonicalName,
          balance_after_paise: s.balanceAfterPaise,
        })),
      },
      agentState: {
        exactMatchCount: summaries.length,
        exactMatches: [],
        mode: "all_customers",
      },
      attachments: [
        {
          filename: "khata-full-ledger.csv",
          mimeType: "text/csv",
          bytes,
        },
      ],
    };
  }

  const customerName =
    typeof params.customer_name === "string" ? params.customer_name : undefined;
  if (!customerName) {
    throw new ClarificationError("customer_name is required for by_customer mode.");
  }

  const exactMatches = await searchCustomersExact(db, customerName);

  if (exactMatches.length > 1) {
    throw new ClarificationError(
      `Multiple exact customer matches found. Which customer?\n${formatExactCustomersMessage(exactMatches)}`,
      { exactMatches },
    );
  }

  if (exactMatches.length === 0) {
    const similar = await searchSimilarCustomers(db, customerName);
    throw new ClarificationError(
      `No exact customer match found. Did you mean one of these?\n${formatSimilarCustomersMessage(similar)}`,
      { similarCandidates: similar },
    );
  }

  const match = exactMatches[0]!;
  const balance = await getLatestBalancePaise(db, match.id);
  const recent = await listRecentEntries(db, match.id, 5);
  const allEntries = await exportFullLedger(db, match.id);
  const csv = renderKhataLedgerCsv({
    title: `${match.canonicalName} — full ledger`,
    customers: [{ customerId: match.id, canonicalName: match.canonicalName }],
    entries: allEntries,
  });
  const bytes = new TextEncoder().encode(csv);

  return {
    verifiedFacts: {
      mode: "by_customer",
      customer_id: match.id,
      customer_name: match.canonicalName,
      balance_after_paise: balance,
      recent_entries: recent.map((entry) => ({
        entry_id: entry.id,
        entry_type: entry.entryType,
        amount_paise: entry.amountPaise,
        balance_after_paise: entry.balanceAfterPaise,
        created_at: entry.createdAt,
      })),
    },
    agentState: {
      exactMatchCount: 1,
      exactMatches,
      customerId: match.id,
      canonicalName: match.canonicalName,
      balanceAfterPaise: balance,
      mode: "by_customer",
    },
    attachments: [
      {
        filename: `khata-${match.canonicalName.replace(/\s+/g, "-").toLowerCase()}.csv`,
        mimeType: "text/csv",
        bytes,
      },
    ],
  };
}
