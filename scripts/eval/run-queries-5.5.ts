/**
 * Component 5.5 eval spine — posts C55 queries to deployed Worker webhook.
 *
 * Prerequisites: wrangler deploy (Browser Run binding), WORKER_WEBHOOK_URL + WEBHOOK_SECRET in .dev.vars
 * Run: npm run eval:5.5
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { textMessageUpdate } from "../../src/worker-telegram-adapter/fixtures/telegram-updates.js";
import {
  INTEGRATION_PROBE_CHAT_ID,
  INTEGRATION_PROBE_USER_ID,
} from "../../src/worker-telegram-adapter/fixtures/test-identities.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");

const WORKER_WEBHOOK_URL = process.env.WORKER_WEBHOOK_URL;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
const EVAL_WAIT_MS = Number(process.env.EVAL_WAIT_MS ?? "30000");
const TEST_CHAT_ID = process.env.TEST_CHAT_ID
  ? Number(process.env.TEST_CHAT_ID)
  : INTEGRATION_PROBE_CHAT_ID;

const hasConfig = Boolean(WORKER_WEBHOOK_URL && WEBHOOK_SECRET);

interface CsvRow {
  id: string;
  query: string;
}

function parseQueriesCsv(path: string): CsvRow[] {
  const lines = readFileSync(path, "utf8").trim().split("\n");
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;
    const match = line.match(/^([^,]+),([^,]+),([^,]+),([^,]+),"([^"]*)"/);
    if (!match) {
      continue;
    }
    rows.push({
      id: match[1]!,
      query: match[5]!,
    });
  }
  return rows;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postWebhook(update: object): Promise<void> {
  const response = await fetch(WORKER_WEBHOOK_URL!, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Telegram-Bot-Api-Secret-Token": WEBHOOK_SECRET!,
    },
    body: JSON.stringify(update),
  });
  if (!response.ok) {
    throw new Error(`Webhook POST failed: ${response.status} ${await response.text()}`);
  }
}

async function main(): Promise<void> {
  if (!hasConfig) {
    console.warn(
      "[eval:5.5] Skipped — set WORKER_WEBHOOK_URL and WEBHOOK_SECRET in .dev.vars",
    );
    process.exit(0);
  }

  const csvPath = resolve(ROOT, "queries-5.5.csv");
  const rows = parseQueriesCsv(csvPath);
  const baseUpdateId = Date.now();

  console.log(`[eval:5.5] Posting ${rows.length} queries to webhook`);
  console.log(`[eval:5.5] Wait per query: ${EVAL_WAIT_MS}ms (set EVAL_WAIT_MS to override)`);
  console.log("---");

  const results: Array<{ id: string; updateId: number; query: string }> = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const updateId = baseUpdateId + i * 10;
    const messageId = updateId;

    const update = textMessageUpdate({
      updateId,
      messageId,
      chatId: TEST_CHAT_ID,
      userId: INTEGRATION_PROBE_USER_ID,
      text: row.query,
    });

    await postWebhook(update);
    console.log(`[eval:5.5] Posted ${row.id} update_id=${updateId} query="${row.query}"`);
    results.push({ id: row.id, updateId, query: row.query });

    await sleep(EVAL_WAIT_MS);
  }

  console.log("---");
  console.log("[eval:5.5] Done. Export traces and run sql/agent-trace.sql for each update_id:");
  for (const r of results) {
    console.log(`${r.id}: update_id=${r.updateId}`);
  }
}

main().catch((err) => {
  console.error("[eval:5.5] Failed:", err);
  process.exit(1);
});
