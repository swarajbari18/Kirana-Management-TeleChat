export interface Env {
  STORE_DO: DurableObjectNamespace;
  BROWSER: import("../artifact/types.js").BrowserRunBinding;
  BOT_TOKEN: string;
  WEBHOOK_SECRET: string;
  GEMINI_API_KEY: string;
  TELEGRAM_DELIVERY: TelegramDeliveryService;
}

export interface TelegramDeliveryService {
  deliverConfirmation(
    payload: import("./worker-telegram-adapter/contracts/delivery-payload.js").DeliverConfirmationPayload,
  ): Promise<void>;
  deliverOutbound(
    payload: import("./worker-telegram-adapter/contracts/delivery-payload.js").DeliverOutboundPayload,
  ): Promise<void>;
}
