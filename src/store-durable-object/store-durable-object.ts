import { DurableObject } from "cloudflare:workers";
import type { ApplicationRequest } from "../worker-telegram-adapter/contracts/index.js";
import type { ExecutionResult } from "../worker-telegram-adapter/contracts/index.js";
import { handleApplicationRequest as handleRequest } from "./handler.js";

export class StoreDurableObject extends DurableObject {
  async handleApplicationRequest(
    request: ApplicationRequest,
  ): Promise<ExecutionResult> {
    return handleRequest(request);
  }
}
