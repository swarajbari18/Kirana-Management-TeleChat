import type { BusinessObjective } from "../../capability-registry/index.js";
import type { RuntimePorts } from "../../store-durable-object/runtime-ports/types.js";
import type { StoreDatabase } from "../../store-durable-object/persistence/db.js";
import {
  appendDraftEvent,
  buildOpenDraftSummaries,
  createDraftHeader,
  hardDeleteDraft,
  listOpenDraftHeaders,
} from "../../store-durable-object/persistence/repositories/billing-repository.js";
import {
  exactSearchProducts,
  listActiveProducts,
} from "../../store-durable-object/persistence/repositories/inventory-repository.js";
import { getShopProfile } from "../../store-durable-object/persistence/repositories/shop-profile-repository.js";
import {
  finalizeConfirmationResolution,
  persistPendingConfirmation,
} from "../../store-durable-object/runtime-ports/worker-delivery-port.js";
import { buildYesNoKeyboard } from "../../worker-telegram-adapter/callback-parser.js";
import {
  findSimilarCandidates,
  formatExactMatchesMessage,
  formatSimilarCandidatesMessage,
} from "../../inventory/search/product-search.js";
import { resolveDraftFocus } from "../draft-focus-resolver.js";
import { loadDraftProjection } from "../draft-projection.js";
import { validateOperationAgainstStateMachine } from "../draft-state-machine.js";
import { ClarificationError } from "../errors.js";
import { computeDraftTotals } from "../gst.js";
import { formatCancelDraftConfirmationTable } from "../confirmation/format-cancel-draft-confirmation-table.js";
import type {
  DraftProjection,
  ManageDraftOperation,
  OutboundAttachmentDescriptor,
} from "../types.js";

export interface ManageDraftBillContext {
  billId: string;
  projection: DraftProjection | null;
  createNew: boolean;
  objective: BusinessObjective;
  chatId: number;
  updateId: number;
  correlationId: string;
  runContext?: {
    appendTrace: (
      layer: string,
      component: string,
      stage: string,
      payload: unknown,
    ) => Promise<string>;
  };
}

function buildDraftVerifiedFacts(
  projection: DraftProjection,
): Record<string, unknown> {
  const totals = computeDraftTotals(projection.lines);
  return {
    bill_id: projection.billId,
    customer_name: projection.customerName,
    payment_method: projection.paymentMethod,
    notes: projection.notes,
    draft_lines: projection.lines.map((line) => ({
      line_no: line.lineNo,
      product_name: line.productName,
      quantity: line.quantity,
      sell_price_paise: line.sellPricePaise,
      sku: line.sku,
    })),
    draft_subtotal_paise: totals.subtotalPaise,
    draft_grand_total_paise: totals.grandTotalPaise,
  };
}

async function resolveProductForName(
  db: StoreDatabase,
  productName: string,
): Promise<{
  sku: string;
  productName: string;
  unit: string;
  sellPricePaise: number;
  costPricePaise: number;
  hsnCode: string;
  gstRate: number;
}> {
  const exactMatches = await exactSearchProducts(db, productName);
  if (exactMatches.length === 0) {
    const all = await listActiveProducts(db);
    const similar = findSimilarCandidates(productName, all);
    throw new ClarificationError(
      `No exact product match for "${productName}".\n${formatSimilarCandidatesMessage(similar)}`,
      { similarCandidates: similar },
    );
  }
  if (exactMatches.length > 1) {
    throw new ClarificationError(
      `Multiple exact matches for "${productName}".\n${formatExactMatchesMessage(exactMatches)}`,
      { exactMatches },
    );
  }
  const match = exactMatches[0]!;
  return {
    sku: match.sku,
    productName: match.productName,
    unit: match.unit,
    sellPricePaise: match.sellPrice,
    costPricePaise: match.costPrice,
    hsnCode: match.hsnCode,
    gstRate: match.gstRate,
  };
}

function findLinesByProductName(
  projection: DraftProjection,
  productName: string,
): Array<{ lineRef: string; lineNo: number; quantity: number }> {
  const normalized = productName.toLowerCase();
  return projection.lines
    .filter((line) => line.productName.toLowerCase() === normalized)
    .map((line) => ({
      lineRef: line.lineRef,
      lineNo: line.lineNo,
      quantity: line.quantity,
    }));
}

export async function manageDraftBill(
  db: StoreDatabase,
  runtimePorts: RuntimePorts,
  params: Record<string, unknown>,
  toolCtx: ManageDraftBillContext,
): Promise<{
  verifiedFacts: Record<string, unknown>;
  agentState: Record<string, unknown>;
  attachments?: OutboundAttachmentDescriptor[];
}> {
  const operation = params.operation as ManageDraftOperation;
  const { billId, createNew, updateId, correlationId } = {
    billId: toolCtx.billId,
    createNew: toolCtx.createNew,
    updateId: toolCtx.updateId,
    correlationId: toolCtx.correlationId,
  };

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
      agentState: { openDraftCount: summaries.length },
    };
  }

  if (operation === "start_bill") {
    await createDraftHeader(
      db,
      billId,
      typeof params.customer_name === "string" ? params.customer_name : null,
    );
    await appendDraftEvent(db, {
      billId,
      eventType: "bill_started",
      payload: {
        customer_name: params.customer_name,
        notes: params.notes,
      },
      updateId,
      correlationId,
      customerName:
        typeof params.customer_name === "string" ? params.customer_name : null,
    });
  } else if (operation === "set_customer") {
    await appendDraftEvent(db, {
      billId,
      eventType: "customer_set",
      payload: { customer_name: params.customer_name },
      updateId,
      correlationId,
      customerName: String(params.customer_name),
    });
  } else if (operation === "set_notes") {
    await appendDraftEvent(db, {
      billId,
      eventType: "notes_set",
      payload: { notes: params.notes },
      updateId,
      correlationId,
    });
  } else if (operation === "add_item") {
    const product = await resolveProductForName(db, String(params.product_name));
    const quantity = Number(params.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new ClarificationError("Quantity must be greater than zero.");
    }
    const lineRef = crypto.randomUUID();
    await appendDraftEvent(db, {
      billId,
      eventType: "item_added",
      payload: {
        line_ref: lineRef,
        sku: product.sku,
        product_name: product.productName,
        quantity,
        unit: product.unit,
        sell_price_paise: product.sellPricePaise,
        cost_price_paise: product.costPricePaise,
        hsn_code: product.hsnCode,
        gst_rate: product.gstRate,
      },
      updateId,
      correlationId,
    });
  } else if (operation === "remove_item") {
    const projection = toolCtx.projection ?? (await loadDraftProjection(db, billId));
    if (!projection) {
      throw new ClarificationError("Bill not found.");
    }
    const productName = params.product_name as string | undefined;
    const lineRef = params.line_ref as string | undefined;
    if (lineRef) {
      await appendDraftEvent(db, {
        billId,
        eventType: "item_removed",
        payload: { line_ref: lineRef },
        updateId,
        correlationId,
      });
    } else if (productName) {
      const matches = findLinesByProductName(projection, productName);
      if (matches.length === 0) {
        throw new ClarificationError(`No line found for product "${productName}".`);
      }
      if (matches.length > 1) {
        const options = matches
          .map((m) => `Line ${m.lineNo}: ${productName} (qty ${m.quantity})`)
          .join("\n");
        throw new ClarificationError(
          `Multiple lines for "${productName}". Which line?\n${options}`,
        );
      }
      await appendDraftEvent(db, {
        billId,
        eventType: "item_removed",
        payload: { line_ref: matches[0]!.lineRef },
        updateId,
        correlationId,
      });
    } else {
      throw new ClarificationError("remove_item requires product_name or line_ref.");
    }
  } else if (operation === "change_item_quantity") {
    const quantity = Number(params.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new ClarificationError("Quantity must be greater than zero.");
    }
    const projection = toolCtx.projection ?? (await loadDraftProjection(db, billId));
    if (!projection) {
      throw new ClarificationError("Bill not found.");
    }
    const productName = params.product_name as string | undefined;
    const lineRef = params.line_ref as string | undefined;
    if (lineRef) {
      await appendDraftEvent(db, {
        billId,
        eventType: "item_qty_changed",
        payload: { line_ref: lineRef, quantity },
        updateId,
        correlationId,
      });
    } else if (productName) {
      const matches = findLinesByProductName(projection, productName);
      if (matches.length === 0) {
        throw new ClarificationError(`No line found for product "${productName}".`);
      }
      if (matches.length > 1) {
        const options = matches
          .map((m) => `Line ${m.lineNo}: ${productName} (qty ${m.quantity})`)
          .join("\n");
        throw new ClarificationError(
          `Multiple lines for "${productName}". Which line?\n${options}`,
        );
      }
      await appendDraftEvent(db, {
        billId,
        eventType: "item_qty_changed",
        payload: { line_ref: matches[0]!.lineRef, quantity },
        updateId,
        correlationId,
      });
    } else {
      throw new ClarificationError(
        "change_item_quantity requires product_name or line_ref.",
      );
    }
  } else if (operation === "set_payment_method") {
    const method = String(params.payment_method);
    if (!["cash", "upi", "khata"].includes(method)) {
      throw new ClarificationError("payment_method must be cash, upi, or khata.");
    }
    await appendDraftEvent(db, {
      billId,
      eventType: "payment_method_set",
      payload: { payment_method: method },
      updateId,
      correlationId,
    });
  } else if (operation === "set_payment_reference") {
    await appendDraftEvent(db, {
      billId,
      eventType: "payment_reference_set",
      payload: { payment_reference: params.payment_reference },
      updateId,
      correlationId,
    });
  } else if (operation === "cancel_draft") {
    const projection =
      toolCtx.projection ?? (await loadDraftProjection(db, billId));
    if (!projection?.started) {
      throw new ClarificationError("No draft to cancel.");
    }

    const profile = await getShopProfile(db);
    const applyCancel = async () => {
      await hardDeleteDraft(db, billId);
      if (toolCtx.runContext) {
        await toolCtx.runContext.appendTrace(
          "capability",
          "billing",
          "DRAFT_CANCELLED",
          {
            bill_id: billId,
            customer_name: projection.customerName,
            line_count: projection.lines.length,
          },
        );
      }
      return {
        verifiedFacts: { draft_cancelled: true, bill_id: billId },
        agentState: { cancelled: true, billId },
      };
    };

    if (profile.completeAutonomy) {
      return applyCancel();
    }

    const confirmationId = crypto.randomUUID();
    const display = formatCancelDraftConfirmationTable(projection);
    const pendingWrite = { billId, updateId, correlationId };

    await persistPendingConfirmation(db, {
      confirmationId,
      updateId,
      correlationId,
      toolName: "manage_draft_bill",
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
      return applyCancel();
    }

    await finalizeConfirmationResolution(db, {
      confirmationId,
      status: outcome === "expired" ? "expired" : "denied",
    });
    throw new Error(outcome === "expired" ? "timeout" : "user_rejected");
  }

  const projection = await loadDraftProjection(db, billId);
  if (!projection) {
    throw new ClarificationError("Draft projection failed after operation.");
  }

  return {
    verifiedFacts: buildDraftVerifiedFacts(projection),
    agentState: {
      billId,
      operation,
      lineCount: projection.lines.length,
    },
  };
}

export async function resolveShopCustomerName(db: StoreDatabase): Promise<string> {
  const profile = await getShopProfile(db);
  return profile.shopName?.trim() || "Shop";
}

export async function prepareManageDraftContext(
  db: StoreDatabase,
  params: Record<string, unknown>,
  objective: BusinessObjective,
  planContext?: { planBillId?: string },
): Promise<{
  billId: string;
  projection: DraftProjection | null;
  createNew: boolean;
}> {
  const operation = params.operation as ManageDraftOperation;
  const focus = await resolveDraftFocus(
    db,
    params,
    objective,
    operation,
    planContext,
  );
  const projection =
    focus.billId && !focus.createNew
      ? await loadDraftProjection(db, focus.billId)
      : null;

  validateOperationAgainstStateMachine(
    operation,
    projection,
    focus.createNew,
  );

  return {
    billId: focus.billId ?? crypto.randomUUID(),
    projection,
    createNew: focus.createNew,
  };
}
