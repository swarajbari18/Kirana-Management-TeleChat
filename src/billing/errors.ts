export class ClarificationError extends Error {
  constructor(
    message: string,
    readonly options?: {
      similarCandidates?: Array<{ sku: string; productName: string }>;
      exactMatches?: Array<{ sku: string; productName: string }>;
      draftOptions?: string[];
    },
  ) {
    super(message.startsWith("clarification:") ? message : `clarification:${message}`);
    this.name = "ClarificationError";
  }
}

export class DraftStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DraftStateError";
  }
}
