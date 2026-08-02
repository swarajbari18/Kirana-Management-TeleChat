export interface ApplicationRequestDelivery {
  chatId: number;
  replyToMessageId?: number;
}

export interface ApplicationRequestTransport {
  source: "telegram";
  updateId: number;
  messageId?: number;
  userId: number;
  timestamp: number;
}

export interface ApplicationRequestInbound {
  kind: "text" | "command";
  text: string;
  command?: string;
  entities?: Array<{ type: string; offset: number; length: number }>;
}

export interface ApplicationRequestConversation {
  resetRequested: boolean;
}

export interface ApplicationRequest {
  storeId: string;
  delivery: ApplicationRequestDelivery;
  transport: ApplicationRequestTransport;
  inbound: ApplicationRequestInbound;
  conversation: ApplicationRequestConversation;
}
