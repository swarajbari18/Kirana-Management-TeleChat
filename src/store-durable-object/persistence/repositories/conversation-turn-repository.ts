import { asc, eq } from "drizzle-orm";
import type { StoreDatabase } from "../db.js";
import { conversationTurns } from "../schema.js";

export interface TurnInsert {
  id: string;
  sessionId: string;
  updateId: number;
  role: "user";
  rawText: string;
  contextText: string;
  inboundKind: "text" | "command";
  command?: string | null;
  createdAt: string;
}

export async function insertTurn(
  db: StoreDatabase,
  turn: TurnInsert,
): Promise<void> {
  await db.insert(conversationTurns).values({
    id: turn.id,
    sessionId: turn.sessionId,
    updateId: turn.updateId,
    role: turn.role,
    rawText: turn.rawText,
    contextText: turn.contextText,
    inboundKind: turn.inboundKind,
    command: turn.command ?? null,
    createdAt: turn.createdAt,
  });
}

export async function getTurnsBySessionId(
  db: StoreDatabase,
  sessionId: string,
) {
  return db
    .select()
    .from(conversationTurns)
    .where(eq(conversationTurns.sessionId, sessionId))
    .orderBy(asc(conversationTurns.createdAt))
    .all();
}
