import { eq } from "drizzle-orm";
import type { StoreDatabase } from "../db.js";
import { conversationSessions } from "../schema.js";

export async function getActiveSession(db: StoreDatabase) {
  return db
    .select()
    .from(conversationSessions)
    .where(eq(conversationSessions.isActive, true))
    .get();
}

export async function createSession(
  db: StoreDatabase,
  id: string,
  startedAt: string,
): Promise<string> {
  await db.insert(conversationSessions).values({
    id,
    startedAt,
    endedAt: null,
    isActive: true,
  });
  return id;
}

export async function endSession(
  db: StoreDatabase,
  sessionId: string,
  endedAt: string,
): Promise<void> {
  await db
    .update(conversationSessions)
    .set({ isActive: false, endedAt })
    .where(eq(conversationSessions.id, sessionId));
}

export async function rotateSession(db: StoreDatabase): Promise<string> {
  const now = new Date().toISOString();
  const active = await getActiveSession(db);
  if (active) {
    await endSession(db, active.id, now);
  }
  const newId = crypto.randomUUID();
  await createSession(db, newId, now);
  return newId;
}

export async function ensureActiveSession(db: StoreDatabase): Promise<string> {
  const active = await getActiveSession(db);
  if (active) {
    return active.id;
  }
  const newId = crypto.randomUUID();
  await createSession(db, newId, new Date().toISOString());
  return newId;
}
