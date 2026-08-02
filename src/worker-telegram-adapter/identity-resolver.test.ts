import { describe, expect, it } from "vitest";
import { IdentityError, resolveStoreId } from "./identity-resolver.js";
import type { SupportedUpdate } from "./update-parser.js";

function supported(userId: number): SupportedUpdate {
  return {
    kind: "supported",
    updateId: 1,
    messageId: 1,
    chatId: 1,
    userId,
    timestamp: 1,
    text: "hello",
    inboundKind: "text",
    resetRequested: false,
  };
}

describe("resolveStoreId", () => {
  it("maps userId 12345 to storeId '12345'", () => {
    expect(resolveStoreId(supported(12345))).toBe("12345");
  });

  it("throws IdentityError when userId is invalid", () => {
    expect(() =>
      resolveStoreId({
        ...supported(0),
        userId: undefined as unknown as number,
      }),
    ).toThrow(IdentityError);
  });
});
