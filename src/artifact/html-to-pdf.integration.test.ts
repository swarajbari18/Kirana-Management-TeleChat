/**
 * ARTIFACT-PDF-01 — Browser Run HTML→PDF integration.
 * Requires deployed Browser Run binding; skips without wrangler remote / account.
 */
import { describe, expect, it } from "vitest";
import { htmlToPdf } from "./html-to-pdf.js";
import { isPdfBytes } from "./minimal-pdf-bytes.js";
import type { BrowserRunBinding } from "./types.js";

const RUN_BROWSER_INTEGRATION = process.env.RUN_BROWSER_INTEGRATION === "1";

describe("ARTIFACT-PDF-01 Browser Run integration", () => {
  it.skipIf(!RUN_BROWSER_INTEGRATION)(
    "converts simple HTML to PDF bytes",
    async () => {
      const browser = (globalThis as { BROWSER?: BrowserRunBinding }).BROWSER;
      if (!browser) {
        return;
      }

      const bytes = await htmlToPdf(
        browser,
        "<!DOCTYPE html><html><body><h1>Test Invoice</h1></body></html>",
      );
      expect(isPdfBytes(bytes)).toBe(true);
      expect(bytes.byteLength).toBeGreaterThan(100);
    },
  );
});
