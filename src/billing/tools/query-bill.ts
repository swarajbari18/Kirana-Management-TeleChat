import type { StoreDatabase } from "../../store-durable-object/persistence/db.js";
import {
  buildOpenDraftSummaries,
  getFinalizedBill,
  listFinalizedBillLines,
  listRecentFinalizedBills,
} from "../../store-durable-object/persistence/repositories/billing-repository.js";

export async function queryBill(
  db: StoreDatabase,
  params: Record<string, unknown>,
): Promise<{
  verifiedFacts: Record<string, unknown>;
  agentState: Record<string, unknown>;
}> {
  const operation = String(params.operation ?? "list_recent_finalized");

  if (operation === "list_open_drafts") {
    const summaries = await buildOpenDraftSummaries(db);
    return {
      verifiedFacts: {
        open_draft_count: summaries.length,
        open_drafts: summaries.map((s) => ({
          customer_name: s.customerName,
          line_count: s.lineCount,
          last_edited: s.lastEventAt,
        })),
      },
      agentState: { operation, openDraftCount: summaries.length },
    };
  }

  if (operation === "get_finalized") {
    const billId = String(params.bill_id ?? "");
    const bill = await getFinalizedBill(db, billId);
    if (!bill) {
      return {
        verifiedFacts: { bill_found: false },
        agentState: { operation, billFound: false },
      };
    }
    const lines = await listFinalizedBillLines(db, billId);
    return {
      verifiedFacts: {
        bill_id: bill.billId,
        customer_name: bill.customerName,
        payment_method: bill.paymentMethod,
        grand_total_paise: bill.grandTotalPaise,
        finalized_at: bill.finalizedAt,
        bill_lines: lines.map((line) => ({
          line_no: line.lineNo,
          product_name: line.productName,
          quantity: line.quantity,
          line_total_paise: line.lineTotalPaise,
        })),
      },
      agentState: { operation, billId, billFound: true },
    };
  }

  const limit = Number(params.limit ?? 5);
  const bills = await listRecentFinalizedBills(db, Number.isFinite(limit) ? limit : 5);
  return {
    verifiedFacts: {
      recent_bill_count: bills.length,
      recent_bills: bills.map((bill) => ({
        bill_id: bill.billId,
        customer_name: bill.customerName,
        grand_total_paise: bill.grandTotalPaise,
        finalized_at: bill.finalizedAt,
        payment_method: bill.paymentMethod,
      })),
    },
    agentState: { operation: "list_recent_finalized", count: bills.length },
  };
}
