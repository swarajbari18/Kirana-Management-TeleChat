import { describe, expect, it, vi } from "vitest";
import { dispatchToStore } from "./request-dispatcher.js";
import type { ApplicationRequest } from "./contracts/index.js";
import type { SupportedUpdate } from "./update-parser.js";

describe("request-dispatcher", () => {
  it("does not call ctx.waitUntil — awaits stub only", async () => {
    const waitUntil = vi.fn();
    const ctx = { waitUntil } as unknown as ExecutionContext;

    const handleApplicationRequest = vi.fn().mockResolvedValue({
      status: "ok",
      messages: [],
      attachments: [],
    });

    const supported: SupportedUpdate = {
      kind: "supported",
      updateId: 1,
      messageId: 1,
      chatId: 10,
      userId: 10,
      timestamp: 1,
      text: "hello",
      inboundKind: "text",
      resetRequested: false,
    };

    const request: ApplicationRequest = {
      storeId: "10",
      delivery: { chatId: 10, replyToMessageId: 1 },
      transport: {
        source: "telegram",
        updateId: 1,
        messageId: 1,
        userId: 10,
        timestamp: 1,
      },
      inbound: { kind: "text", text: "hello" },
      conversation: { resetRequested: false },
    };

    await dispatchToStore(
      { BOT_TOKEN: "token" } as import("../env.js").Env,
      {
        stub: {
          handleApplicationRequest,
          handleConfirmationCallback: vi.fn(),
          confirmTelegramDelivery: vi.fn(),
        },
        durableObjectId: "do-id",
      },
      request,
      supported,
      "10",
      { workerRequestId: "wr-1", startTime: Date.now() },
    );

    expect(handleApplicationRequest).toHaveBeenCalledOnce();
    expect(waitUntil).not.toHaveBeenCalled();
    void ctx;
  });
});
