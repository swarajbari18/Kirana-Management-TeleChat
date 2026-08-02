/**
 * Synthetic Telegram identities for tests.
 *
 * These are NOT real Telegram accounts. Integration tests POST fabricated webhook
 * JSON directly to the deployed Worker — Telegram servers are never involved.
 * Each userId becomes `storeId = String(userId)` and gets its own Durable Object
 * with a separate SQLite database.
 *
 * When `TEST_CHAT_ID` is set in `.dev.vars` (real Telegram chat), integration
 * tests target a deliverable chat and the operator's store DO for full pipeline
 * validation including Telegram delivery and confirmTelegramDelivery.
 *
 * Fallback fake IDs (900000001) apply when TEST_CHAT_ID is absent — bot replies
 * fail at the Telegram API (TelegramApiError) but Worker + DO logic still run.
 *
 * Data Studio: use `durableObjectId` from `wrangler tail`, not these IDs, when
 * inspecting your real Telegram store.
 */

const parsedTestChatId = Number(process.env.TEST_CHAT_ID);
const resolvedTestChatId =
  Number.isFinite(parsedTestChatId) && parsedTestChatId > 0
    ? parsedTestChatId
    : 900000001;

/** Primary user/chat for production webhook integration tests (`npm test`). */
export const INTEGRATION_PROBE_USER_ID = resolvedTestChatId;
export const INTEGRATION_PROBE_CHAT_ID = resolvedTestChatId;
export const INTEGRATION_PROBE_STORE_ID = String(resolvedTestChatId);

/** Probe message text written to SQLite by worker integration tests. */
export const INTEGRATION_PROBE_MESSAGE = "production integration probe";

/** Probe messages used by store DO integration tests. */
export const DO_RUNTIME_PROBE_MESSAGE = "production do runtime probe";
export const DUPLICATE_UPDATE_PROBE_MESSAGE = "duplicate updateId probe";

/** Defaults for unit-test fixtures (`telegram-updates.ts`). Separate DO per test file run. */
export const FIXTURE_USER_ID = 12345;
export const FIXTURE_CHAT_ID = 10;
export const FIXTURE_STORE_ID = "12345";

/** Minimal defaults when fixtures omit userId/chatId (e.g. `textMessageUpdate()`). */
export const FIXTURE_MINIMAL_USER_ID = 1;
export const FIXTURE_MINIMAL_CHAT_ID = 1;
export const FIXTURE_MINIMAL_STORE_ID = "1";
