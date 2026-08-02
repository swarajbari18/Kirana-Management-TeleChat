import type { ConversationTurn } from "../../global-orchestrator/types.js";
import type { StoreDatabase } from "../persistence/db.js";
import { getTurnsBySessionId } from "../persistence/repositories/conversation-turn-repository.js";

export async function loadActiveContext(
  db: StoreDatabase,
  sessionId: string,
): Promise<ConversationTurn[]> {
  const rows = await getTurnsBySessionId(db, sessionId);
  return rows.map((row) => ({
    id: row.id,
    contextText: row.contextText,
    rawText: row.rawText,
    role: row.role,
    createdAt: row.createdAt,
  }));
}
