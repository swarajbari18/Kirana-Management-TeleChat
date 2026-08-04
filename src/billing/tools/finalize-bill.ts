import type { RuntimePorts } from "../../store-durable-object/runtime-ports/types.js";
import type { StoreDatabase } from "../../store-durable-object/persistence/db.js";
import {
  finalizeBillTransaction,
  getFinalizedBill,
  listFinalizedBillLines,
  type PaymentMethod,
} from "../../store-durable-object/persistence/repositories/billing-repository.js";
import { getShopProfile } from "../../store-durable-object/persistence/repositories/shop-profile-repository.js";
import {
  finalizeConfirmationResolution,
  persistPendingConfirmation,
} from "../../store-durable-object/runtime-ports/worker-delivery-port.js";
import { buildYesNoKeyboard } from "../../worker-telegram-adapter/callback-parser.js";
import {
  availabilityVerifiedFacts,
  checkLineAvailability,
  formatAvailabilityRefusal,
} from "../availability.js";
import { buildInvoicePdf } from "../../artifact/build-invoice-pdf.js";
import { ArtifactRenderError } from "../../artifact/errors.js";
import { formatFinalizeConfirmationTable } from "../confirmation/format-finalize-confirmation-table.js";
import { loadDraftProjection } from "../draft-projection.js";
import { ClarificationError } from "../errors.js";
import { computeDraftTotals, computeLineTax } from "../gst.js";
import type { DraftProjection, OutboundAttachmentDescriptor } from "../types.js";

export interface FinalizeBillContext {
  billId: string;
  projection: DraftProjection;
  chatId: number;
  updateId: number;
  correlationId: string;
}

function validateDraftCompleteness(
  projection: DraftProjection,
  defaultPayment: PaymentMethod | null,
): PaymentMethod {
  if (!projection.customerName?.trim()) {
    throw new ClarificationError("Customer name is required before finalize.");
  }
  if (projection.lines.length === 0) {
    throw new ClarificationError("At least one line item is required before finalize.");
  }
  const payment = projection.paymentMethod ?? defaultPayment;
  if (!payment) {
    throw new ClarificationError(
      "Payment method is required. Set cash, upi, or khata.",
    );
  }
  return payment;
}

export async function finalizeBill(
  db: StoreDatabase,
  runtimePorts: RuntimePorts,
  params: Record<string, unknown>,
  toolCtx: FinalizeBillContext,
): Promise<{
  verifiedFacts: Record<string, unknown>;
  agentState: Record<string, unknown>;
  refusalMessage?: string;
  attachments?: OutboundAttachmentDescriptor[];
}> {
  const projection = toolCtx.projection;
  const profile = await getShopProfile(db);
  const paymentMethod = validateDraftCompleteness(
    projection,
    profile.defaultPaymentMethod,
  );
  const totals = computeDraftTotals(projection.lines);

  const availabilityFailures = [];
  for (const line of projection.lines) {
    const failure = await checkLineAvailability(db, line);
    if (failure) {
      availabilityFailures.push(failure);
    }
  }

  if (availabilityFailures.length > 0) {
    return {
      verifiedFacts: availabilityVerifiedFacts(availabilityFailures),
      agentState: { refused: true, availabilityFailures },
      refusalMessage: formatAvailabilityRefusal(availabilityFailures),
    };
  }

  const applyFinalize = async () => {
    const lines = projection.lines.map((line, index) => {
      const tax = computeLineTax(
        line.quantity,
        line.sellPricePaise,
        line.gstRate,
      );
      return {
        lineNo: index + 1,
        sku: line.sku,
        productName: line.productName,
        quantity: line.quantity,
        unit: line.unit,
        sellPricePaise: line.sellPricePaise,
        costPricePaise: line.costPricePaise,
        hsnCode: line.hsnCode,
        gstRate: line.gstRate,
        taxablePaise: tax.taxablePaise,
        cgstPaise: tax.cgstPaise,
        sgstPaise: tax.sgstPaise,
        lineTotalPaise: tax.lineTotalPaise,
      };
    });

    await finalizeBillTransaction(db, {
      billId: toolCtx.billId,
      customerName: projection.customerName!,
      notes: projection.notes ?? null,
      paymentMethod,
      paymentReference: projection.paymentReference ?? null,
      subtotalPaise: totals.subtotalPaise,
      cgstTotalPaise: totals.cgstTotalPaise,
      sgstTotalPaise: totals.sgstTotalPaise,
      grandTotalPaise: totals.grandTotalPaise,
      lines,
      updateId: toolCtx.updateId,
      correlationId: toolCtx.correlationId,
    });

    const bill = await getFinalizedBill(db, toolCtx.billId);
    if (!bill || bill.grandTotalPaise !== totals.grandTotalPaise) {
      throw new Error("Post-finalize verify failed: bill totals mismatch");
    }

    const billLines = await listFinalizedBillLines(db, toolCtx.billId);
    const attachments: OutboundAttachmentDescriptor[] = [];
    const generateArtifact =
      params.generateArtifact !== false && profile.artifactsEnabled !== false;

    let invoiceAttached = false;
    let artifactRefusal: string | undefined;

    if (generateArtifact && bill) {
      try {
        const pdfBytes = await buildInvoicePdf(runtimePorts.artifacts, {
          shop: profile,
          bill,
          lines: billLines,
        });
        attachments.push({
          filename: `invoice-${toolCtx.billId.slice(0, 8)}.pdf`,
          mimeType: "application/pdf",
          bytes: pdfBytes,
        });
        invoiceAttached = true;
      } catch (error) {
        if (error instanceof ArtifactRenderError) {
          artifactRefusal =
            "Bill finalized, but the invoice PDF could not be generated.";
        } else {
          throw error;
        }
      }
    }

    const verifiedFacts: Record<string, unknown> = {
      bill_id: toolCtx.billId,
      customer_name: projection.customerName,
      payment_method: paymentMethod,
      notes: projection.notes,
      subtotal_paise: totals.subtotalPaise,
      cgst_total_paise: totals.cgstTotalPaise,
      sgst_total_paise: totals.sgstTotalPaise,
      grand_total_paise: totals.grandTotalPaise,
      finalized: true,
      bill_lines: billLines.map((line) => ({
        line_no: line.lineNo,
        sku: line.sku,
        product_name: line.productName,
        quantity: line.quantity,
        line_total_paise: line.lineTotalPaise,
      })),
    };

    if (invoiceAttached) {
      verifiedFacts.invoice_attached = true;
    }

    return {
      verifiedFacts,
      agentState: {
        billId: toolCtx.billId,
        finalized: true,
        attachmentCount: attachments.length,
      },
      attachments,
      refusalMessage: artifactRefusal,
    };
  };

  if (profile.completeAutonomy) {
    return applyFinalize();
  }

  const confirmationId = crypto.randomUUID();
  const display = formatFinalizeConfirmationTable({
    customerName: projection.customerName!,
    notes: projection.notes,
    paymentMethod,
    paymentReference: projection.paymentReference,
    lines: projection.lines,
    subtotalPaise: totals.subtotalPaise,
    cgstTotalPaise: totals.cgstTotalPaise,
    sgstTotalPaise: totals.sgstTotalPaise,
    grandTotalPaise: totals.grandTotalPaise,
  });

  const pendingWrite = {
    billId: toolCtx.billId,
    updateId: toolCtx.updateId,
    correlationId: toolCtx.correlationId,
  };

  await persistPendingConfirmation(db, {
    confirmationId,
    updateId: toolCtx.updateId,
    correlationId: toolCtx.correlationId,
    toolName: "finalize_bill",
    displayPayload: pendingWrite,
    pendingWrite,
  });

  await runtimePorts.deliverConfirmation({
    confirmationId,
    chatId: toolCtx.chatId,
    text: display,
    replyMarkup: buildYesNoKeyboard(confirmationId),
  });

  const outcome = await runtimePorts.waitForConfirmation(
    confirmationId,
    profile.confirmationTimeoutMs,
  );

  if (outcome === "approved") {
    await finalizeConfirmationResolution(db, {
      confirmationId,
      status: "approved",
    });
    return applyFinalize();
  }

  await finalizeConfirmationResolution(db, {
    confirmationId,
    status: outcome === "expired" ? "expired" : "denied",
  });
  throw new Error(outcome === "expired" ? "timeout" : "user_rejected");
}

export async function loadFinalizeProjection(
  db: StoreDatabase,
  billId: string,
): Promise<DraftProjection> {
  const projection = await loadDraftProjection(db, billId);
  if (!projection?.started) {
    throw new ClarificationError("No draft found to finalize.");
  }
  return projection;
}
