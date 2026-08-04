import { buildYesNoKeyboard } from "../../worker-telegram-adapter/callback-parser.js";
import type { RuntimePorts } from "../../store-durable-object/runtime-ports/types.js";
import type { StoreDatabase } from "../../store-durable-object/persistence/db.js";
import {
  createProductWithMovement,
  defaultReorderLevel,
  generateSku,
  listAllSkus,
  type GstRate,
  type ItemType,
  type Unit,
} from "../../store-durable-object/persistence/repositories/inventory-repository.js";
import { getShopProfile } from "../../store-durable-object/persistence/repositories/shop-profile-repository.js";
import {
  finalizeConfirmationResolution,
  persistPendingConfirmation,
} from "../../store-durable-object/runtime-ports/worker-delivery-port.js";
import type { AgentStatePriorResults } from "../../capability-registry/capability-blueprint.js";
import { ClarificationError } from "../errors.js";
import { getPriorQueryInventoryResult } from "../agent-state.js";
import { formatExactMatchesMessage } from "../search/product-search.js";
import { formatRegisterConfirmationTable } from "../confirmation/format-confirmation-table.js";

const VALID_GST_RATES = new Set([0, 5, 12, 18]);
const VALID_ITEM_TYPES = new Set<ItemType>(["packaged", "loose"]);
const VALID_UNITS = new Set<Unit>([
  "packet",
  "kg",
  "g",
  "litre",
  "ml",
  "dozen",
  "piece",
]);

export async function registerInventory(
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
    throw new Error("Invariant violation: register_inventory requires prior query_inventory");
  }

  if (priorQuery.exactMatchCount >= 1) {
    throw new ClarificationError(
      `A product with this exact name already exists. Use update_inventory to add stock, or choose a distinct full product name.\n${formatExactMatchesMessage(priorQuery.exactMatches)}`,
      { exactMatches: priorQuery.exactMatches },
    );
  }

  const productName = params.product_name as string | undefined;
  const quantity = Number(params.quantity);
  const costPrice = Number(params.cost_price);
  const sellPrice = Number(params.sell_price);
  const hsnCode = params.hsn_code as string | undefined;
  const gstRate = Number(params.gst_rate);
  const itemType = params.item_type as ItemType | undefined;
  const unit = params.unit as Unit | undefined;
  const reorderLevelParam = params.reorder_level;
  const aliases = Array.isArray(params.aliases)
    ? (params.aliases as string[])
    : [];

  if (!productName) {
    throw new ClarificationError("What is the full product name for the new SKU?");
  }

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return {
      verifiedFacts: {},
      agentState: { refused: true },
      refusalMessage:
        "Stock cannot be reduced via register_inventory. To reduce inventory, create a bill (billing will handle stock decrease).",
    };
  }

  if (!itemType || !VALID_ITEM_TYPES.has(itemType)) {
    throw new ClarificationError(
      "Is this product packaged or loose? Set item_type to packaged or loose.",
    );
  }

  if (!unit || !VALID_UNITS.has(unit)) {
    throw new ClarificationError(
      "What unit should I use? Options: packet, kg, g, litre, ml, dozen, piece.",
    );
  }

  if (!Number.isFinite(costPrice) || costPrice < 0) {
    throw new ClarificationError("What is the cost price per unit (INR)?");
  }

  if (!Number.isFinite(sellPrice) || sellPrice < 0) {
    throw new ClarificationError("What is the sell price / MRP per unit (INR)?");
  }

  if (!hsnCode || hsnCode.trim().length === 0) {
    throw new ClarificationError("What is the HSN code for this product?");
  }

  if (!VALID_GST_RATES.has(gstRate)) {
    throw new ClarificationError(
      "Which GST slab applies? Allowed rates: 0%, 5%, 12%, or 18%.",
    );
  }

  // Advisory near-matches already computed by query_inventory (exact 0 path) — never re-fuzzy here.
  const similar = priorQuery.similarCandidates ?? [];

  const reorderDefaulted =
    reorderLevelParam === undefined || reorderLevelParam === null;
  const reorderLevel = reorderDefaulted
    ? defaultReorderLevel(quantity)
    : Number(reorderLevelParam);

  const existingSkus = await listAllSkus(db);
  const sku = generateSku(productName, existingSkus);
  const profile = await getShopProfile(db);

  const pendingWrite = {
    sku,
    productName,
    itemType,
    unit,
    quantity,
    costPrice,
    sellPrice,
    hsnCode,
    gstRate: gstRate as GstRate,
    reorderLevel,
    aliases,
    updateId: ctx.updateId,
    correlationId: ctx.correlationId,
  };

  const applyCreate = async () => {
    const created = await createProductWithMovement(db, pendingWrite);
    return {
      verifiedFacts: {
        sku: created.sku,
        productName: created.productName,
        quantityOnHand: created.quantityOnHand,
        costPrice: created.costPrice,
        sellPrice: created.sellPrice,
        hsnCode: created.hsnCode,
        gstRate: created.gstRate,
        reorderLevel: created.reorderLevel,
        reorderLevelDefaulted: reorderDefaulted,
        itemType: created.itemType,
        unit: created.unit,
      },
      agentState: {
        sku: created.sku,
        exactMatchCount: 0,
        created: true,
      },
    };
  };

  if (profile.completeAutonomy) {
    return applyCreate();
  }

  const confirmationId = crypto.randomUUID();
  const display = formatRegisterConfirmationTable({
    sku,
    productName,
    itemType,
    unit,
    quantity,
    costPrice,
    sellPrice,
    hsnCode,
    gstRate,
    reorderLevel,
    reorderDefaulted,
    aliases,
    similarCandidates: similar,
  });

  await persistPendingConfirmation(db, {
    confirmationId,
    updateId: ctx.updateId,
    correlationId: ctx.correlationId,
    toolName: "register_inventory",
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
    return applyCreate();
  }

  await finalizeConfirmationResolution(db, {
    confirmationId,
    status: outcome === "expired" ? "expired" : "denied",
  });

  throw new Error(outcome === "expired" ? "timeout" : "user_rejected");
}
