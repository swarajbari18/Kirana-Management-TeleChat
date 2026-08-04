import { ArtifactRenderError } from "./errors.js";
import { isPdfBytes } from "./minimal-pdf-bytes.js";
import type { BrowserRunBinding } from "./types.js";

export interface HtmlToPdfOptions {
  format?: string;
  printBackground?: boolean;
}

export async function htmlToPdf(
  browser: BrowserRunBinding,
  html: string,
  options: HtmlToPdfOptions = {},
): Promise<Uint8Array> {
  const response = await browser.quickAction("pdf", {
    html,
    pdfOptions: {
      format: options.format ?? "A4",
      printBackground: options.printBackground ?? true,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new ArtifactRenderError(
      "pdf_render_failed",
      `Browser Run PDF failed (${response.status}): ${body.slice(0, 200)}`,
    );
  }

  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (!isPdfBytes(bytes)) {
    throw new ArtifactRenderError(
      "pdf_render_failed",
      "Browser Run output is not a valid PDF",
    );
  }

  return bytes;
}
