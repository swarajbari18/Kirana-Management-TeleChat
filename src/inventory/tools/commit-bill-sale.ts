import type { ToolExecutionPlanContext } from "../../capability-registry/capability-blueprint.js";
import type { RuntimePorts } from "../../store-durable-object/runtime-ports/types.js";
import type { StoreDatabase } from "../../store-durable-object/persistence/db.js";
import {
  getFinalizedBill,
  listFinalizedBillLines,
} from "../../store-durable-object/persistence/repositories/billing-repository.js";
import { commitBillSale } from "../../store-durable-object/persistence/repositories/inventory-repository.js";
import { getShopProfile } from "../../store-durable-object/persistence/repositories/shop-profile-repository.js";
import {
  finalizeConfirmationResolution,
  persistPendingConfirmation,
} from "../../store-durable-object/runtime-ports/worker-delivery-port.js";
import { buildYesNoKeyboard } from "../../worker-telegram-adapter/callback-parser.js";
import { formatCommitBillSaleConfirmationTable } from "../confirmation/format-commit-bill-sale-confirmation-table.js";

function resolveBillId(
  params: Record<string, unknown>,
  planContext: ToolExecutionPlanContext,
): string | null {
  if (typeof params.bill_id === "string" && params.bill_id.length > 0) {
    return params.bill_id;
  }

  const prior = planContext.priorObjectiveResults ?? {};
  for (const facts of Object.values(prior)) {
    if (facts.finalized === true && typeof facts.bill_id === "string") {
      return facts.bill_id;
    }
  }

  return null;
}

export async function commitBillSaleTool(
  db: StoreDatabase,
  runtimePorts: RuntimePorts,
  params: Record<string, unknown>,
  planContext: ToolExecutionPlanContext,
  ctx: {
    chatId: number;
    updateId: number;
    correlationId: string;
  },
): Promise<{
  verifiedFacts: Record<string, unknown>;
  agentState: Record<string, unknown>;
  refusalMessage?: string;
}> {
  const billId = resolveBillId(params, planContext);
  if (!billId) {
    throw new Error("commit_bill_sale requires bill_id from billing dependency facts");
  }

  const bill = await getFinalizedBill(db, billId);
  if (!bill) {
    return {
      verifiedFacts: { bill_id: billId },
      agentState: { billId, refused: true },
      refusalMessage: `Bill ${billId.slice(0, 8)} is not finalized — cannot commit sale stock.`,
    };
  }

  const billLines = await listFinalizedBillLines(db, billId);
  if (billLines.length === 0) {
    throw new Error(`No bill lines found for bill ${billId}`);
  }

  const lineInputs = billLines.map((line) => ({
    sku: line.sku,
    productName: line.productName,
    quantity: line.quantity,
  }));

  const previewLines = [];
  for (const line of lineInputs) {
    const { getProductBySku, getActiveReservedQuantity } = await import(
      "../../store-durable-object/persistence/repositories/inventory-repository.js"
    );
    const product = await getProductBySku(db, line.sku);
    if (!product) {
      return {
        verifiedFacts: { bill_id: billId, sku: line.sku },
        agentState: { billId, refused: true },
        refusalMessage: `Cannot commit sale — product ${line.productName} (${line.sku}) not found.`,
      };
    }
    const reserved = await getActiveReservedQuantity(db, line.sku);
    const sellable = product.quantityOnHand - reserved;
    if (line.quantity > sellable) {
      return {
        verifiedFacts: {
          bill_id: billId,
          sku: line.sku,
          productName: line.productName,
          quantityOnHand: product.quantityOnHand,
          availableQuantity: sellable,
          requestedQuantity: line.quantity,
        },
        agentState: { billId, refused: true },
        refusalMessage: `${line.productName}: requested ${line.quantity}, sellable ${sellable} (${product.quantityOnHand} on hand, ${reserved} reserved). Bill is finalized but stock commit failed.`,
      };
    }
    previewLines.push({
      sku: line.sku,
      productName: line.productName,
      quantity: line.quantity,
      beforeQty: product.quantityOnHand,
      afterQty: product.quantityOnHand - line.quantity,
    });
  }

  const applyCommit = async () => {
    try {
      const result = await commitBillSale(db, {
        billId,
        lines: lineInputs,
        updateId: ctx.updateId,
        correlationId: ctx.correlationId,
      });

      return {
        verifiedFacts: {
          bill_id: billId,
          billId,
          sale_committed: true,
          customer_name: bill.customerName,
          committed_lines: result.lines.map((line) => ({
            sku: line.sku,
            product_name: line.productName,
            quantity: line.quantity,
            quantity_on_hand: line.afterQty,
          })),
        },
        agentState: {
          billId,
          saleCommitted: true,
          alreadyCommitted: result.alreadyCommitted,
          lineCount: result.lines.length,
        },
      };
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("insufficient_stock:")) {
        return {
          verifiedFacts: { bill_id: billId },
          agentState: { billId, refused: true },
          refusalMessage: error.message.replace(/^insufficient_stock:\s*/, ""),
        };
      }
      throw error;
    }
  };

  const profile = await getShopProfile(db);
  if (profile.completeAutonomy) {
    return applyCommit();
  }

  const confirmationId = crypto.randomUUID();
  const display = formatCommitBillSaleConfirmationTable({
    billId,
    customerName: bill.customerName,
    lines: previewLines,
  });

  const pendingWrite = {
    billId,
    updateId: ctx.updateId,
    correlationId: ctx.correlationId,
  };

  await persistPendingConfirmation(db, {
    confirmationId,
    updateId: ctx.updateId,
    correlationId: ctx.correlationId,
    toolName: "commit_bill_sale",
    displayPayload: pendingWrite,
    pendingWrite,
  });

  await runtimePorts.deliverConfirmation({
    confirmationId,
    chatId: ctx.chatId,
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
    return applyCommit();
  }

  await finalizeConfirmationResolution(db, {
    confirmationId,
    status: outcome === "expired" ? "expired" : "denied",
  });
  throw new Error(outcome === "expired" ? "timeout" : "user_rejected");
}
