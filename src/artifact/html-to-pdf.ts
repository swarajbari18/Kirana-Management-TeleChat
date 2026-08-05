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
      format: options.format ?? "a4",
      printBackground: options.printBackground ?? true,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const detail = `Browser Run PDF failed (${response.status}): ${body.slice(0, 200)}`;
    console.log(
      JSON.stringify({
        layer: "runtime",
        action: "browser_pdf_render_failed",
        status: response.status,
        detail,
      }),
    );
    throw new ArtifactRenderError("pdf_render_failed", detail);
  }

  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (!isPdfBytes(bytes)) {
    const detail = "Browser Run output is not a valid PDF";
    console.log(
      JSON.stringify({
        layer: "runtime",
        action: "browser_pdf_render_failed",
        detail,
      }),
    );
    throw new ArtifactRenderError("pdf_render_failed", detail);
  }

  return bytes;
}
