import type { StoreDatabase } from "../../store-durable-object/persistence/db.js";
import {
  exactSearchProducts,
  getProductBySku,
  listActiveProducts,
  listLowStockProducts,
} from "../../store-durable-object/persistence/repositories/inventory-repository.js";
import type { AgentStatePriorResults } from "../../capability-registry/capability-blueprint.js";
import type { ToolExecutionPlanContext } from "../../capability-registry/capability-blueprint.js";
import { ClarificationError } from "../errors.js";
import {
  findSimilarCandidates,
  formatExactMatchesMessage,
  formatSimilarCandidatesMessage,
} from "../search/product-search.js";
import {
  followingToolKind,
  getPriorQueryInventoryResult,
  type QueryInventoryAgentState,
} from "../agent-state.js";

export async function queryInventory(
  db: StoreDatabase,
  params: Record<string, unknown>,
  priorResults: AgentStatePriorResults,
  planContext: ToolExecutionPlanContext,
): Promise<{
  verifiedFacts: Record<string, unknown>;
  agentState: QueryInventoryAgentState;
}> {
  const lowStock = params.low_stock === true;
  const productName =
    typeof params.product_name === "string" ? params.product_name : undefined;
  const skuParam = typeof params.sku === "string" ? params.sku : undefined;

  if (lowStock) {
    const matches = await listLowStockProducts(db);
    const agentState: QueryInventoryAgentState = {
      exactMatchCount: matches.length,
      exactMatches: matches,
      lowStockMatches: matches,
      lookupMode: "low_stock",
    };
    const verifiedFacts: Record<string, unknown> = {
      lowStockCount: matches.length,
      lowStockItems: matches.map((m) => ({
        sku: m.sku,
        productName: m.productName,
        quantityOnHand: m.quantityOnHand,
        reorderLevel: m.reorderLevel,
      })),
    };
    return { verifiedFacts, agentState };
  }

  if (skuParam) {
    const priorQuery = getPriorQueryInventoryResult(priorResults);
    const allowedSku = priorQuery?.exactMatches.find((m) => m.sku === skuParam)?.sku;
    if (!allowedSku) {
      throw new Error(
        "SKU lookup only allowed when SKU came from prior exact query_inventory match",
      );
    }
    const product = await getProductBySku(db, allowedSku);
    const matches = product
      ? [
          {
            sku: product.sku,
            productName: product.productName,
            quantityOnHand: product.quantityOnHand,
            costPrice: product.costPrice,
            sellPrice: product.sellPrice,
            reorderLevel: product.reorderLevel,
            itemType: product.itemType,
            unit: product.unit,
            hsnCode: product.hsnCode,
            gstRate: product.gstRate,
          },
        ]
      : [];
    const agentState: QueryInventoryAgentState = {
      exactMatchCount: matches.length,
      exactMatches: matches,
      lookupMode: "sku",
    };
    return {
      verifiedFacts: buildQueryVerifiedFacts(agentState),
      agentState,
    };
  }

  if (!productName) {
    throw new ClarificationError(
      "Product name is required for inventory lookup (or use low_stock: true).",
    );
  }

  const exactMatches = await exactSearchProducts(db, productName);
  const agentState: QueryInventoryAgentState = {
    exactMatchCount: exactMatches.length,
    exactMatches,
    lookupMode: "product_name",
  };

  // Fuzzy/similar search runs ONLY inside query_inventory — never in write tools.
  if (exactMatches.length === 0) {
    const allProducts = await listActiveProducts(db);
    agentState.similarCandidates = findSimilarCandidates(
      productName,
      allProducts,
    );
  }

  if (exactMatches.length > 1) {
    throw new ClarificationError(
      `Multiple exact matches found for "${productName}". Which product did you mean?\n${formatExactMatchesMessage(exactMatches)}`,
      { exactMatches },
    );
  }

  const following = followingToolKind(
    planContext.orderedOperations,
    planContext.currentOperationId,
  );

  // update/allocate need exact identity — throw so BC executor stops; write tools never run.
  if (exactMatches.length === 0 && following === "identity_write") {
    const similar = agentState.similarCandidates ?? [];
    throw new ClarificationError(
      `No exact product match for "${productName}". Did you mean one of these?\n${formatSimilarCandidatesMessage(similar)}`,
      { similarCandidates: similar },
    );
  }

  // Standalone stock question: completed not-found. similarCandidates stay in agentState only — not Fact Catalog.
  if (exactMatches.length === 0 && following === "none") {
    return {
      verifiedFacts: {
        exactMatchCount: 0,
        productName,
        found: false,
      },
      agentState,
    };
  }

  // following === "register" with exact 0: return agent state so register_inventory can create.
  return {
    verifiedFacts: buildQueryVerifiedFacts(agentState, productName),
    agentState,
  };
}

function buildQueryVerifiedFacts(
  agentState: QueryInventoryAgentState,
  productName?: string,
): Record<string, unknown> {
  if (agentState.exactMatchCount === 1) {
    const match = agentState.exactMatches[0]!;
    return {
      exactMatchCount: 1,
      sku: match.sku,
      productName: match.productName,
      quantityOnHand: match.quantityOnHand,
      reorderLevel: match.reorderLevel,
      costPrice: match.costPrice,
      sellPrice: match.sellPrice,
    };
  }
  return {
    exactMatchCount: agentState.exactMatchCount,
    productName,
    found: false,
  };
}
