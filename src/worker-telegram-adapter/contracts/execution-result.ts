export interface OutboundMessage {
  type: "text";
  text: string;
  parseMode?: "Markdown" | "HTML";
}

export interface OutboundAttachment {
  type: "document";
  filename: string;
  mimeType: string;
  data: ArrayBuffer;
  caption?: string;
}

export interface ExecutionResult {
  status: "ok" | "error";
  messages: OutboundMessage[];
  attachments: OutboundAttachment[];
}
