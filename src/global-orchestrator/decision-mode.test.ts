import { describe, expect, it } from "vitest";
import { normalizeDecision } from "./decision-mode.js";

describe("DEC-01 decision schema ask_user", () => {
  it("accepts ask_user action", () => {
    const result = normalizeDecision({
      action: "ask_user",
      rationale: "GSTIN required",
      askUserFocus: "Please provide GSTIN",
    });
    expect(result.action).toBe("ask_user");
    expect(result.askUserFocus).toBe("Please provide GSTIN");
  });

  it("maps legacy clarify to ask_user", () => {
    const result = normalizeDecision({
      action: "clarify",
      rationale: "missing info",
      clarificationFocus: "GSTIN",
    });
    expect(result.action).toBe("ask_user");
    expect(result.askUserFocus).toBe("GSTIN");
  });
});
