import { describe, expect, it } from "vitest";
import { GENERIC_ORCHESTRATION_ERROR } from "../../global-orchestrator/constants.js";
import { shouldDeliverOutbound } from "./delivery-policy.js";

describe("shouldDeliverOutbound", () => {
  it("skips EMPTY_OK duplicate ledger result", () => {
    expect(
      shouldDeliverOutbound({
        status: "ok",
        messages: [],
        attachments: [],
      }),
    ).toBe(false);
  });

  it("delivers ok result with messages", () => {
    expect(
      shouldDeliverOutbound({
        status: "ok",
        messages: [{ type: "text", text: "hello" }],
        attachments: [],
      }),
    ).toBe(true);
  });

  it("delivers error result with orchestration sorry message", () => {
    expect(
      shouldDeliverOutbound({
        status: "error",
        messages: [{ type: "text", text: GENERIC_ORCHESTRATION_ERROR }],
        attachments: [],
      }),
    ).toBe(true);
  });

  it("delivers bare error result for generic worker fallback", () => {
    expect(
      shouldDeliverOutbound({
        status: "error",
        messages: [],
        attachments: [],
      }),
    ).toBe(true);
  });
});
