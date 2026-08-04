import { buildYesNoKeyboard } from "../../worker-telegram-adapter/callback-parser.js";
import type { RuntimePorts } from "../../store-durable-object/runtime-ports/types.js";
import type { StoreDatabase } from "../../store-durable-object/persistence/db.js";
import {
  getProductBySku,
  updateProductWithMovement,
} from "../../store-durable-object/persistence/repositories/inventory-repository.js";
import { getShopProfile } from "../../store-durable-object/persistence/repositories/shop-profile-repository.js";
import {
  finalizeConfirmationResolution,
  persistPendingConfirmation,
} from "../../store-durable-object/runtime-ports/worker-delivery-port.js";
import type { AgentStatePriorResults } from "../../capability-registry/capability-blueprint.js";
import { ClarificationError } from "../errors.js";
import { getPriorQueryInventoryResult } from "../agent-state.js";
import {
  formatExactMatchesMessage,
  formatSimilarCandidatesMessage,
} from "../search/product-search.js";
import { formatUpdateConfirmationTable } from "../confirmation/format-confirmation-table.js";

export async function updateInventory(
  db: StoreDatabase,
  runtimePorts: RuntimePorts,
  params: Record<string, unknown>,
  priorResults: AgentStatePriorResults,
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
  const priorQuery = getPriorQueryInventoryResult(priorResults);
  if (!priorQuery) {
    throw new Error("Invariant violation: update_inventory requires prior query_inventory");
  }

  // Normal path: query_inventory already threw on exact 0 when update follows.
  // Fallback only when LLM deps were wrong and both tools still ran: forward
  // similarCandidates already computed by query_inventory — never re-run fuzzy here.
  if (priorQuery.exactMatchCount === 0) {
    const similar = priorQuery.similarCandidates ?? [];
    throw new ClarificationError(
      `No exact product match found. Did you mean one of these?\n${formatSimilarCandidatesMessage(similar)}`,
      { similarCandidates: similar },
    );
  }

  if (priorQuery.exactMatchCount > 1) {
    throw new ClarificationError(
      `Multiple exact matches found. Which product should I update?\n${formatExactMatchesMessage(priorQuery.exactMatches)}`,
      { exactMatches: priorQuery.exactMatches },
    );
  }

  const match = priorQuery.exactMatches[0]!;
  const sku = match.sku;
  const quantityDelta =
    params.quantity !== undefined ? Number(params.quantity) : undefined;

  if (quantityDelta !== undefined && (!Number.isFinite(quantityDelta) || quantityDelta <= 0)) {
    return {
      verifiedFacts: { sku, productName: match.productName },
      agentState: { sku, refused: true },
      refusalMessage:
        "Stock cannot be reduced via update_inventory. To reduce inventory for a sale, finalize a bill and use commit_bill_sale.",
    };
  }

  const current = await getProductBySku(db, sku);
  if (!current) {
    throw new Error(`Product not found after exact match: ${sku}`);
  }

  const costPrice =
    params.cost_price !== undefined ? Number(params.cost_price) : undefined;
  const sellPrice =
    params.sell_price !== undefined ? Number(params.sell_price) : undefined;
  const reorderLevel =
    params.reorder_level !== undefined
      ? Number(params.reorder_level)
      : undefined;

  const delta = quantityDelta ?? 0;
  const afterQty = current.quantityOnHand + delta;
  const profile = await getShopProfile(db);

  const pendingWrite = {
    sku,
    quantityDelta: delta > 0 ? delta : undefined,
    costPrice,
    sellPrice,
    reorderLevel,
    updateId: ctx.updateId,
    correlationId: ctx.correlationId,
  };

  const applyUpdate = async () => {
    const updated = await updateProductWithMovement(db, pendingWrite);
    return {
      verifiedFacts: {
        sku: updated.sku,
        productName: updated.productName,
        quantityOnHand: updated.quantityOnHand,
        quantityDelta: delta,
        costPrice: updated.costPrice,
        sellPrice: updated.sellPrice,
        reorderLevel: updated.reorderLevel,
      },
      agentState: {
        sku: updated.sku,
        exactMatchCount: 1,
        updated: true,
        preQuantity: current.quantityOnHand,
        postQuantity: updated.quantityOnHand,
      },
    };
  };

  if (profile.completeAutonomy) {
    return applyUpdate();
  }

  const confirmationId = crypto.randomUUID();
  const display = formatUpdateConfirmationTable({
    sku,
    productName: match.productName,
    beforeQty: current.quantityOnHand,
    delta,
    afterQty,
    costPrice,
    sellPrice,
    reorderLevel,
  });

  await persistPendingConfirmation(db, {
    confirmationId,
    updateId: ctx.updateId,
    correlationId: ctx.correlationId,
    toolName: "update_inventory",
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
    return applyUpdate();
  }

  await finalizeConfirmationResolution(db, {
    confirmationId,
    status: outcome === "expired" ? "expired" : "denied",
  });

  throw new Error(outcome === "expired" ? "timeout" : "user_rejected");
}
