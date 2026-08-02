import type { StoreDatabase } from "../persistence/db.js";
import {
  ensureActiveSession,
  rotateSession,
} from "../persistence/repositories/conversation-session-repository.js";
import {
  insertTurn,
  type TurnInsert,
} from "../persistence/repositories/conversation-turn-repository.js";

export { ensureActiveSession, rotateSession };

export async function persistTurn(
  db: StoreDatabase,
  input: Omit<TurnInsert, "id" | "role">,
): Promise<void> {
  await insertTurn(db, {
    id: crypto.randomUUID(),
    role: "user",
    ...input,
  });
}

export async function persistAssistantTurn(
  db: StoreDatabase,
  input: Omit<TurnInsert, "id" | "role">,
): Promise<void> {
  await insertTurn(db, {
    id: crypto.randomUUID(),
    role: "assistant",
    ...input,
  });
}
