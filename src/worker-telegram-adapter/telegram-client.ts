import type { OutboundAttachment } from "./contracts/index.js";

export class TelegramApiError extends Error {
  readonly status: number;
  readonly responseBody: string;

  constructor(status: number, responseBody: string) {
    super(`Telegram API error: ${status} ${responseBody}`);
    this.name = "TelegramApiError";
    this.status = status;
    this.responseBody = responseBody;
  }
}

export interface SendMessageOptions {
  parseMode?: "Markdown" | "HTML";
  replyToMessageId?: number;
}

const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;

export async function sendMessage(
  botToken: string,
  chatId: number,
  text: string,
  options?: SendMessageOptions,
): Promise<void> {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
  };

  if (options?.parseMode) {
    body.parse_mode = options.parseMode;
  }
  if (options?.replyToMessageId !== undefined) {
    body.reply_to_message_id = options.replyToMessageId;
  }

  const response = await fetch(
    `https://api.telegram.org/bot${botToken}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    const responseBody = await response.text();
    throw new TelegramApiError(response.status, responseBody);
  }
}

export async function sendDocument(
  botToken: string,
  chatId: number,
  attachment: OutboundAttachment,
  options?: { replyToMessageId?: number },
): Promise<void> {
  if (attachment.data.byteLength > MAX_DOCUMENT_BYTES) {
    throw new TelegramApiError(
      400,
      "Document exceeds Telegram 50MB multipart upload limit",
    );
  }

  const formData = new FormData();
  formData.append("chat_id", String(chatId));
  formData.append(
    "document",
    new Blob([attachment.data], { type: attachment.mimeType }),
    attachment.filename,
  );

  if (attachment.caption) {
    formData.append("caption", attachment.caption);
  }
  if (options?.replyToMessageId !== undefined) {
    formData.append("reply_to_message_id", String(options.replyToMessageId));
  }

  const response = await fetch(
    `https://api.telegram.org/bot${botToken}/sendDocument`,
    {
      method: "POST",
      body: formData,
    },
  );

  if (!response.ok) {
    const responseBody = await response.text();
    throw new TelegramApiError(response.status, responseBody);
  }
}
