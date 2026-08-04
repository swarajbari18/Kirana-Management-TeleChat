import { normalizeCustomerName } from "../../store-durable-object/persistence/repositories/khata-repository.js";
import type { SimilarCustomerCandidate } from "../errors.js";

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
  const a = normalizeCustomerName(query);
  const b = normalizeCustomerName(candidate);
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

export function findSimilarCustomerCandidates(
  query: string,
  customers: Array<{ id: string; canonicalName: string }>,
  limit = 5,
  minScore = 0.45,
): SimilarCustomerCandidate[] {
  return customers
    .map((customer) => ({
      id: customer.id,
      canonicalName: customer.canonicalName,
      score: similarityScore(query, customer.canonicalName),
    }))
    .filter((entry) => entry.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function formatSimilarCustomersMessage(
  candidates: SimilarCustomerCandidate[],
): string {
  if (candidates.length === 0) {
    return "No similar customers found.";
  }
  return candidates
    .map((c) => `- ${c.canonicalName}`)
    .join("\n");
}

export function formatExactCustomersMessage(
  matches: Array<{ canonicalName: string }>,
): string {
  return matches.map((m) => `- ${m.canonicalName}`).join("\n");
}
