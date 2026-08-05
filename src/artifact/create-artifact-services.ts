import type { Env } from "../env.js";
import { htmlToPdf } from "./html-to-pdf.js";
import { ArtifactRenderError } from "./errors.js";
import { MINIMAL_PDF_BYTES } from "./minimal-pdf-bytes.js";
import type { ArtifactServices, BrowserRunBinding } from "./types.js";

export function createArtifactServices(env: Env): ArtifactServices {
  const browser = env.BROWSER as BrowserRunBinding | undefined;
  if (!browser?.quickAction) {
    return {
      htmlToPdf: async () => {
        throw new ArtifactRenderError(
          "pdf_render_failed",
          "BROWSER binding is not available in this runtime",
        );
      },
    };
  }
  return {
    htmlToPdf: (html: string) => htmlToPdf(browser, html),
  };
}

export function createStubArtifactServices(
  htmlToPdfImpl?: (html: string) => Promise<Uint8Array>,
): ArtifactServices {
  return {
    htmlToPdf:
      htmlToPdfImpl ?? (async () => new Uint8Array(MINIMAL_PDF_BYTES)),
  };
}
