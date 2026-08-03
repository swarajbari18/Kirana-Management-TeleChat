/**
 * Model id for all production Gemini API calls.
 */
export const GEMINI_MODEL = "gemini-3.6-flash";

/**
 * Harness retries when GO capability plan verification fails structurally.
 * Does NOT cap strategic replan rounds (see MAX_GO_GEMINI_ROUNDS).
 */
export const MAX_GO_PLAN_VERIFY_RETRIES = 2;

/**
 * Harness retries when BC tool plan verification or parameter grounding triggers replan.
 * Does NOT cap the GO strategic loop.
 */
export const MAX_BC_TOOL_PLAN_VERIFY_RETRIES = 2;

/**
 * Strategic GO cycles: plan → execute → decide, including replan.
 * Does NOT cap harness plan-verify retries (see MAX_GO_PLAN_VERIFY_RETRIES).
 */
export const MAX_GO_GEMINI_ROUNDS = 4;

/**
 * Response regeneration attempts after binding verification fails.
 * Does NOT cap grounded-response schema retries (see MAX_GROUNDED_RESPONSE_SCHEMA_RETRIES).
 */
export const MAX_FAITHFULNESS_REGEN = 2;

/**
 * Schema correction retries when grounded response JSON is invalid.
 * Does NOT cap faithfulness binding regen (see MAX_FAITHFULNESS_REGEN).
 */
export const MAX_GROUNDED_RESPONSE_SCHEMA_RETRIES = 2;

/** User-facing terminal error when orchestration fails unexpectedly. */
export const GENERIC_ORCHESTRATION_ERROR =
  "Sorry, I couldn't process that right now. Please try again in a moment.";

/** Safe fallback when faithfulness gate cannot produce a verified response. */
export const FAITHFULNESS_SAFE_FALLBACK =
  "I completed your request but cannot summarize details right now. Please check your profile or try again.";
