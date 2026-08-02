import type { SupportedUpdate } from "./update-parser.js";

export class IdentityError extends Error {
  constructor(message = "Unable to resolve store identity") {
    super(message);
    this.name = "IdentityError";
  }
}

export function resolveStoreId(supported: SupportedUpdate): string {
  const userId = supported.userId;
  if (userId === undefined || userId === null || Number.isNaN(userId)) {
    throw new IdentityError();
  }
  return String(userId);
}
