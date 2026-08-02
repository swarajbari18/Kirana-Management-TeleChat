import type { ConversationContext } from "../../global-orchestrator/types.js";
import type { ApplicationRequest } from "../../worker-telegram-adapter/contracts/index.js";
import type { ExecutionContext } from "../execution-manager/execution-context.js";
import type { StoreDatabase } from "../persistence/db.js";
import {
  getOrCreateStoreMeta,
  isStoreInitialized,
} from "../persistence/repositories/store-meta-repository.js";
import { loadActiveContext } from "./context-loader.js";
import { stripNewCommand } from "./new-command-strip.js";
import {
  ensureActiveSession,
  persistTurn,
  rotateSession,
} from "./session.js";

export async function process(
  request: ApplicationRequest,
  db: StoreDatabase,
  _executionContext: ExecutionContext,
): Promise<ConversationContext> {
  const meta = await getOrCreateStoreMeta(db);

  const sessionId = request.conversation.resetRequested
    ? await rotateSession(db)
    : await ensureActiveSession(db);

  let contextText = request.inbound.text;
  if (request.inbound.kind === "command" && request.inbound.command === "new") {
    contextText = stripNewCommand(request.inbound.text);
  }

  const now = new Date().toISOString();
  await persistTurn(db, {
    sessionId,
    updateId: request.transport.updateId,
    rawText: request.inbound.text,
    contextText,
    inboundKind: request.inbound.kind,
    command: request.inbound.command ?? null,
    createdAt: now,
  });

  const turns = await loadActiveContext(db, sessionId);

  return {
    activeSessionId: sessionId,
    turns,
    storeInitialized: isStoreInitialized(meta),
  };
}
