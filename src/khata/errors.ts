import type { KhataCustomerMatch } from "../store-durable-object/persistence/repositories/khata-repository.js";

export interface SimilarCustomerCandidate {
  id: string;
  canonicalName: string;
  score: number;
}

export class ClarificationError extends Error {
  readonly similarCandidates?: SimilarCustomerCandidate[];
  readonly exactMatches?: KhataCustomerMatch[];

  constructor(
    message: string,
    options?: {
      similarCandidates?: SimilarCustomerCandidate[];
      exactMatches?: KhataCustomerMatch[];
    },
  ) {
    super(`clarification:${message}`);
    this.name = "ClarificationError";
    this.similarCandidates = options?.similarCandidates;
    this.exactMatches = options?.exactMatches;
  }
}
