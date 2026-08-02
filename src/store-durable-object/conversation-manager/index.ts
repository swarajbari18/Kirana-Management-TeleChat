import type { ConversationContext } from "../../global-orchestrator/types.js";
import type { ApplicationRequest } from "../../worker-telegram-adapter/contracts/index.js";
import type { ExecutionContext } from "../execution-manager/execution-context.js";
import type { StoreDatabase } from "../persistence/db.js";
import {
  ensureShopProfileRow,
  getShopProfile,
} from "../persistence/repositories/shop-profile-repository.js";
import {
  getOrCreateStoreMeta,
  isStoreInitialized,
} from "../persistence/repositories/store-meta-repository.js";
import { loadActiveContext } from "./context-loader.js";
import { stripBotCommands } from "./strip-bot-commands.js";
import { stripNewCommand } from "./new-command-strip.js";
import {
  ensureActiveSession,
  persistAssistantTurn as insertAssistantTurn,
  persistTurn,
  rotateSession,
} from "./session.js";

export async function process(
  request: ApplicationRequest,
  db: StoreDatabase,
  _executionContext: ExecutionContext,
): Promise<ConversationContext> {
  const meta = await getOrCreateStoreMeta(db);
  await ensureShopProfileRow(db);
  const ownerProfile = await getShopProfile(db);

  const sessionId = request.conversation.resetRequested
    ? await rotateSession(db)
    : await ensureActiveSession(db);

  const contextText =
    request.inbound.kind === "command" && request.inbound.command === "new"
      ? stripNewCommand(request.inbound.text)
      : request.inbound.kind === "command"
        ? stripBotCommands(
            request.inbound.text,
            request.inbound.entities as
              | import("@grammyjs/types").MessageEntity[]
              | undefined,
          )
        : request.inbound.text;

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
    ownerProfile,
  };
}

export async function persistAssistantTurn(
  db: StoreDatabase,
  input: { sessionId: string; text: string; updateId: number },
): Promise<void> {
  await insertAssistantTurn(db, {
    sessionId: input.sessionId,
    updateId: input.updateId,
    rawText: input.text,
    contextText: input.text,
    inboundKind: "text",
    command: null,
    createdAt: new Date().toISOString(),
  });
}
