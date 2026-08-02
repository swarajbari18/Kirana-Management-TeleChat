import type { ApplicationRequest } from "../worker-telegram-adapter/contracts/index.js";
import type { ExecutionResult } from "../worker-telegram-adapter/contracts/index.js";
import { STUB_GREETING, WELCOME_MESSAGE } from "./constants.js";

export function handleApplicationRequest(
  request: ApplicationRequest,
): ExecutionResult {
  if (
    request.inbound.kind === "command" &&
    request.inbound.command === "start"
  ) {
    return {
      status: "ok",
      messages: [{ type: "text", text: WELCOME_MESSAGE }],
      attachments: [],
    };
  }

  return {
    status: "ok",
    messages: [{ type: "text", text: STUB_GREETING }],
    attachments: [],
  };
}
