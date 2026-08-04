import type { ProductMatch } from "../../store-durable-object/persistence/repositories/inventory-repository.js";
import { normalizeProductKey } from "../../store-durable-object/persistence/repositories/inventory-repository.js";

export interface SimilarCandidate {
  sku: string;
  productName: string;
  quantityOnHand: number;
  score: number;
}

function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0]![j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i]![j] = matrix[i - 1]![j - 1]!;
      } else {
        matrix[i]![j] = Math.min(
          matrix[i - 1]![j - 1]! + 1,
          matrix[i]![j - 1]! + 1,
          matrix[i - 1]![j]! + 1,
        );
      }
    }
  }
  return matrix[b.length]![a.length]!;
}

function similarityScore(query: string, candidate: string): number {
  const a = normalizeProductKey(query);
  const b = normalizeProductKey(candidate);
  if (!a || !b) {
    return 0;
  }
  if (a === b) {
    return 1;
  }
  if (a.includes(b) || b.includes(a)) {
    return 0.85;
  }
  const distance = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  return maxLen === 0 ? 0 : 1 - distance / maxLen;
}

export function findSimilarCandidates(
  query: string,
  products: ProductMatch[],
  limit = 5,
  minScore = 0.45,
): SimilarCandidate[] {
  const scored = products
    .map((product) => ({
      sku: product.sku,
      productName: product.productName,
      quantityOnHand: product.quantityOnHand,
      score: similarityScore(query, product.productName),
    }))
    .filter((entry) => entry.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return scored;
}

export function formatSimilarCandidatesMessage(
  candidates: SimilarCandidate[],
): string {
  if (candidates.length === 0) {
    return "No similar products found.";
  }
  return candidates
    .map(
      (c) =>
        `- ${c.productName} (${c.sku}): ${c.quantityOnHand} on hand`,
    )
    .join("\n");
}

export function formatExactMatchesMessage(matches: ProductMatch[]): string {
  return matches
    .map(
      (m) =>
        `- ${m.productName} (${m.sku}): ${m.quantityOnHand} on hand`,
    )
    .join("\n");
}
