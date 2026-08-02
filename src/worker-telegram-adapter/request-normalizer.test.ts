import { describe, expect, it } from "vitest";
import { newCommandUpdate, textMessageUpdate } from "./fixtures/telegram-updates.js";
import { normalizeRequest } from "./request-normalizer.js";
import { parseUpdate } from "./update-parser.js";

describe("normalizeRequest", () => {
  it("builds valid ApplicationRequest from supported update", () => {
    const supported = parseUpdate(textMessageUpdate({
      updateId: 99,
      messageId: 42,
      chatId: 10,
      userId: 12345,
      text: "hello",
      date: 1700000000,
    }));

    if (supported.kind !== "supported") {
      throw new Error("expected supported update");
    }

    const request = normalizeRequest(supported, "12345");

    expect(request).toEqual({
      storeId: "12345",
      delivery: { chatId: 10, replyToMessageId: 42 },
      transport: {
        source: "telegram",
        updateId: 99,
        messageId: 42,
        userId: 12345,
        timestamp: 1700000000,
      },
      inbound: { kind: "text", text: "hello" },
      conversation: { resetRequested: false },
    });
  });

  it("sets resetRequested=true for /new command", () => {
    const supported = parseUpdate(newCommandUpdate());
    if (supported.kind !== "supported") {
      throw new Error("expected supported update");
    }

    const request = normalizeRequest(supported, "12345");
    expect(request.conversation.resetRequested).toBe(true);
    expect(request.inbound).toMatchObject({
      kind: "command",
      command: "new",
    });
  });
});
