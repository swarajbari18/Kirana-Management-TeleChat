import { buildYesNoKeyboard } from "../../worker-telegram-adapter/callback-parser.js";
import type { RuntimePorts } from "../../store-durable-object/runtime-ports/types.js";
import type { StoreDatabase } from "../../store-durable-object/persistence/db.js";
import {
  getActiveReservedQuantity,
  getProductBySku,
  reserveInventory,
  resolveReservation,
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
import { formatAllocateConfirmationTable } from "../confirmation/format-confirmation-table.js";

type AllocateOperation = "reserve" | "commit" | "release";

export async function allocateInventory(
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
    throw new Error(
      "Invariant violation: allocate_inventory requires prior query_inventory",
    );
  }

  // Normal path: query_inventory already threw on exact 0 when allocate follows.
  // Fallback: forward similarCandidates from query agent state — never re-run fuzzy.
  if (priorQuery.exactMatchCount === 0) {
    const similar = priorQuery.similarCandidates ?? [];
    throw new ClarificationError(
      `No exact product match for allocation. Did you mean one of these?\n${formatSimilarCandidatesMessage(similar)}`,
      { similarCandidates: similar },
    );
  }

  if (priorQuery.exactMatchCount > 1) {
    throw new ClarificationError(
      `Multiple exact matches found. Which product should I allocate?\n${formatExactMatchesMessage(priorQuery.exactMatches)}`,
      { exactMatches: priorQuery.exactMatches },
    );
  }

  const match = priorQuery.exactMatches[0]!;
  const sku = match.sku;
  const quantity = Number(params.quantity);
  const operation = params.operation as AllocateOperation;
  const draftBillId = params.draft_bill_id as string;
  const idempotencyKey = params.idempotency_key as string;

  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new ClarificationError("Allocation quantity must be greater than zero.");
  }

  if (!["reserve", "commit", "release"].includes(operation)) {
    throw new ClarificationError(
      "Allocation operation must be reserve, commit, or release.",
    );
  }

  if (!draftBillId || !idempotencyKey) {
    throw new ClarificationError(
      "draft_bill_id and idempotency_key are required for allocate_inventory.",
    );
  }

  const product = await getProductBySku(db, sku);
  if (!product) {
    throw new Error(`Product not found after exact match: ${sku}`);
  }

  const reserved = await getActiveReservedQuantity(db, sku);
  const available = product.quantityOnHand - reserved;

  if (operation === "reserve" && quantity > available) {
    return {
      verifiedFacts: { sku, productName: match.productName, available },
      agentState: { sku, refused: true, available },
      refusalMessage: `Cannot reserve ${quantity} units — only ${available} available (${product.quantityOnHand} on hand, ${reserved} reserved).`,
    };
  }

  const profile = await getShopProfile(db);
  const pendingWrite = {
    sku,
    quantity,
    operation,
    draftBillId,
    idempotencyKey,
    updateId: ctx.updateId,
    correlationId: ctx.correlationId,
  };

  const applyAllocate = async () => {
    if (operation === "reserve") {
      const result = await reserveInventory(db, {
        sku,
        quantity,
        draftBillId,
        idempotencyKey,
        updateId: ctx.updateId,
        correlationId: ctx.correlationId,
      });
      return {
        verifiedFacts: {
          sku,
          productName: match.productName,
          operation,
          reservedQuantity: quantity,
          quantityOnHand: product.quantityOnHand,
          availableAfter: result.availableAfter,
          reservationId: result.reservationId,
        },
        agentState: {
          sku,
          operation,
          reservationId: result.reservationId,
          availableAfter: result.availableAfter,
        },
      };
    }

    const result = await resolveReservation(db, {
      idempotencyKey,
      operation,
      updateId: ctx.updateId,
      correlationId: ctx.correlationId,
    });
    return {
      verifiedFacts: {
        sku,
        productName: match.productName,
        operation,
        reservationId: result.reservationId,
        reservationStatus: result.status,
      },
      agentState: {
        sku,
        operation,
        reservationId: result.reservationId,
        status: result.status,
      },
    };
  };

  if (profile.completeAutonomy) {
    return applyAllocate();
  }

  const confirmationId = crypto.randomUUID();
  const display = formatAllocateConfirmationTable({
    sku,
    productName: match.productName,
    operation,
    quantity,
    available,
    draftBillId,
  });

  await persistPendingConfirmation(db, {
    confirmationId,
    updateId: ctx.updateId,
    correlationId: ctx.correlationId,
    toolName: "allocate_inventory",
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
    return applyAllocate();
  }

  await finalizeConfirmationResolution(db, {
    confirmationId,
    status: outcome === "expired" ? "expired" : "denied",
  });

  throw new Error(outcome === "expired" ? "timeout" : "user_rejected");
}
