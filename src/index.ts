import type { Env } from "./env.js";
import { handleWebhook } from "./worker-telegram-adapter/index.js";
import { StoreDurableObject } from "./store-durable-object/index.js";
import { TelegramDeliveryService } from "./worker-telegram-adapter/telegram-delivery-service.js";

export { StoreDurableObject, TelegramDeliveryService };

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/webhook") {
      return handleWebhook(request, env, ctx);
    }

    return new Response("Not Found", { status: 404 });
  },
};
