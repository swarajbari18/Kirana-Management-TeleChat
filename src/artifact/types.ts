export interface BrowserRunPdfOptions {
  html: string;
  pdfOptions?: {
    format?: string;
    printBackground?: boolean;
  };
}

export interface BrowserRunBinding {
  quickAction(action: "pdf", options: BrowserRunPdfOptions): Promise<Response>;
}

export interface ArtifactServices {
  htmlToPdf(html: string): Promise<Uint8Array>;
}

export type ArtifactKind = "invoice_pdf" | "analysis_pptx";

export interface ArtifactGeneratedTracePayload {
  kind: ArtifactKind;
  filename: string;
  byteLength: number;
  mimeType: string;
}
