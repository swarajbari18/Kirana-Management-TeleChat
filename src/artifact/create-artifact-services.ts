import type { Env } from "../env.js";
import { htmlToPdf } from "./html-to-pdf.js";
import { MINIMAL_PDF_BYTES } from "./minimal-pdf-bytes.js";
import type { ArtifactServices, BrowserRunBinding } from "./types.js";

export function createArtifactServices(env: Env): ArtifactServices {
  const browser = env.BROWSER as BrowserRunBinding;
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
