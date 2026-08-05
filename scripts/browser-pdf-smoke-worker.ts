import { htmlToPdf } from "../src/artifact/html-to-pdf.js";
import { isPdfBytes } from "../src/artifact/minimal-pdf-bytes.js";

interface Env {
  BROWSER: {
    quickAction(
      action: "pdf",
      options: { html: string; pdfOptions?: Record<string, unknown> },
    ): Promise<Response>;
  };
}

export default {
  async fetch(_request: Request, env: Env): Promise<Response> {
    try {
      const bytes = await htmlToPdf(
        env.BROWSER,
        "<!DOCTYPE html><html><body><h1>Browser PDF smoke</h1></body></html>",
      );
      if (!isPdfBytes(bytes)) {
        return new Response("not a pdf", { status: 500 });
      }
      return new Response(bytes, {
        headers: { "content-type": "application/pdf" },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return new Response(message, { status: 500 });
    }
  },
};
