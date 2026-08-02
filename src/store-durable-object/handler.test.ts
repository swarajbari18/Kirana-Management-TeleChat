import { describe, expect, it } from "vitest";
import { WELCOME_MESSAGE, STUB_GREETING } from "./constants.js";
import { handleApplicationRequest } from "./handler.js";

describe("handleApplicationRequest", () => {
  it("returns welcome text for /start command", () => {
    const result = handleApplicationRequest({
      storeId: "1",
      delivery: { chatId: 1 },
      transport: {
        source: "telegram",
        updateId: 1,
        userId: 1,
        timestamp: 1,
      },
      inbound: { kind: "command", text: "/start", command: "start" },
      conversation: { resetRequested: false },
    });

    expect(result).toEqual({
      status: "ok",
      messages: [{ type: "text", text: WELCOME_MESSAGE }],
      attachments: [],
    });
  });

  it("returns stub greeting for plain text", () => {
    const result = handleApplicationRequest({
      storeId: "1",
      delivery: { chatId: 1 },
      transport: {
        source: "telegram",
        updateId: 1,
        userId: 1,
        timestamp: 1,
      },
      inbound: { kind: "text", text: "hello" },
      conversation: { resetRequested: false },
    });

    expect(result).toEqual({
      status: "ok",
      messages: [{ type: "text", text: STUB_GREETING }],
      attachments: [],
    });
  });

  it("returns stub greeting for /new with resetRequested (no-op reset)", () => {
    const result = handleApplicationRequest({
      storeId: "1",
      delivery: { chatId: 1 },
      transport: {
        source: "telegram",
        updateId: 1,
        userId: 1,
        timestamp: 1,
      },
      inbound: { kind: "command", text: "/new", command: "new" },
      conversation: { resetRequested: true },
    });

    expect(result.messages[0].text).toBe(STUB_GREETING);
    expect(result.attachments).toEqual([]);
  });
});
