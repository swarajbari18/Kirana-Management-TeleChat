import { describe, expect, it } from "vitest";
import {
  GEMINI_MODEL,
  GENERIC_ORCHESTRATION_ERROR,
  MAX_BC_TOOL_PLAN_VERIFY_RETRIES,
  MAX_CLAIM_EXTRACTION_RETRIES,
  MAX_FAITHFULNESS_REGEN,
  MAX_GO_GEMINI_ROUNDS,
  MAX_GO_PLAN_VERIFY_RETRIES,
} from "./constants.js";

describe("global-orchestrator constants", () => {
  it("defines all C4 harness constants", () => {
    expect(GEMINI_MODEL).toBe("gemini-3.6-flash");
    expect(MAX_GO_PLAN_VERIFY_RETRIES).toBeGreaterThan(0);
    expect(MAX_BC_TOOL_PLAN_VERIFY_RETRIES).toBeGreaterThan(0);
    expect(MAX_GO_GEMINI_ROUNDS).toBeGreaterThan(MAX_GO_PLAN_VERIFY_RETRIES);
    expect(MAX_FAITHFULNESS_REGEN).toBeGreaterThan(0);
    expect(MAX_CLAIM_EXTRACTION_RETRIES).toBeGreaterThan(0);
    expect(GENERIC_ORCHESTRATION_ERROR.length).toBeGreaterThan(0);
  });
});
