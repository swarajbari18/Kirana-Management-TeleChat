import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Load local `.dev.vars` into process.env for integration tests.
 * Required: WORKER_WEBHOOK_URL, WEBHOOK_SECRET
 * Optional: TEST_CHAT_ID (real Telegram chat for unsupported-reply tests)
 * Human operators keep secrets in `.dev.vars` (gitignored); never commit it.
 */
const devVarsPath = resolve(process.cwd(), ".dev.vars");
if (existsSync(devVarsPath)) {
  const content = readFileSync(devVarsPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) {
      continue;
    }
    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed.slice(equalsIndex + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}
