import { describe, expect, it, vi } from "vitest";
import { emitTransportLog } from "./observability.js";

describe("emitTransportLog", () => {
  it("logs structured JSON transport entry", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    emitTransportLog({
      layer: "transport",
      workerRequestId: "req-1",
      updateId: 10,
      messageId: 5,
      chatId: 99,
      storeId: "12345",
      durableObjectId: "do-id",
      durationMs: 42,
      resultStatus: "success",
      inboundKind: "text",
    });

    expect(logSpy).toHaveBeenCalledOnce();
    const logged = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(logged).toMatchObject({
      layer: "transport",
      workerRequestId: "req-1",
      updateId: 10,
      resultStatus: "success",
    });
  });
});
