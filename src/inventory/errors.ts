import type { ProductMatch } from "../store-durable-object/persistence/repositories/inventory-repository.js";
import type { SimilarCandidate } from "./search/product-search.js";

export class ClarificationError extends Error {
  readonly similarCandidates?: SimilarCandidate[];
  readonly exactMatches?: ProductMatch[];

  constructor(
    message: string,
    options?: {
      similarCandidates?: SimilarCandidate[];
      exactMatches?: ProductMatch[];
    },
  ) {
    super(`clarification:${message}`);
    this.name = "ClarificationError";
    this.similarCandidates = options?.similarCandidates;
    this.exactMatches = options?.exactMatches;
  }
}

export class RefusalResult {
  constructor(public readonly message: string) {}
}
