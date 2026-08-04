import type { RuntimePorts } from "../../store-durable-object/runtime-ports/types.js";
import type { StoreDatabase } from "../../store-durable-object/persistence/db.js";
import {
  buildOpenDraftSummaries,
  getFinalizedBill,
  listFinalizedBillLines,
  listRecentFinalizedBills,
} from "../../store-durable-object/persistence/repositories/billing-repository.js";
import { getShopProfile } from "../../store-durable-object/persistence/repositories/shop-profile-repository.js";
import { buildInvoicePdf } from "../../artifact/build-invoice-pdf.js";
import { ArtifactRenderError } from "../../artifact/errors.js";
import type { OutboundAttachmentDescriptor } from "../types.js";

const QUERY_OPERATIONS = new Set([
  "list_open_drafts",
  "get_finalized",
  "list_recent_finalized",
  "render_invoice_pdf",
]);

export async function queryBill(
  db: StoreDatabase,
  runtimePorts: RuntimePorts,
  params: Record<string, unknown>,
): Promise<{
  verifiedFacts: Record<string, unknown>;
  agentState: Record<string, unknown>;
  attachments?: OutboundAttachmentDescriptor[];
  refusalMessage?: string;
}> {
  const operation = String(params.operation ?? "list_recent_finalized");

  if (!QUERY_OPERATIONS.has(operation)) {
    throw new Error(`Unknown query_bill operation: ${operation}`);
  }

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

  if (operation === "render_invoice_pdf") {
    const billId = String(params.bill_id ?? "");
    if (!billId) {
      throw new Error("bill_id is required for render_invoice_pdf");
    }

    const profile = await getShopProfile(db);
    if (profile.artifactsEnabled === false) {
      return {
        verifiedFacts: { bill_id: billId, invoice_attached: false },
        agentState: { operation, billId, artifactsDisabled: true },
        refusalMessage: "Invoice PDF generation is disabled in shop settings.",
      };
    }

    const bill = await getFinalizedBill(db, billId);
    if (!bill) {
      return {
        verifiedFacts: { bill_found: false },
        agentState: { operation, billId, billFound: false },
        refusalMessage: "Bill not found — cannot generate invoice PDF.",
      };
    }

    const lines = await listFinalizedBillLines(db, billId);
    try {
      const pdfBytes = await buildInvoicePdf(runtimePorts.artifacts, {
        shop: profile,
        bill,
        lines,
      });
      return {
        verifiedFacts: {
          bill_id: bill.billId,
          customer_name: bill.customerName,
          grand_total_paise: bill.grandTotalPaise,
          invoice_attached: true,
        },
        agentState: { operation, billId, billFound: true },
        attachments: [
          {
            filename: `invoice-${bill.billId.slice(0, 8)}.pdf`,
            mimeType: "application/pdf",
            bytes: pdfBytes,
          },
        ],
      };
    } catch (error) {
      if (error instanceof ArtifactRenderError) {
        return {
          verifiedFacts: {
            bill_id: bill.billId,
            customer_name: bill.customerName,
            invoice_attached: false,
          },
          agentState: { operation, billId, pdfRenderFailed: true },
          refusalMessage: "Could not generate invoice PDF for this bill.",
        };
      }
      throw error;
    }
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
