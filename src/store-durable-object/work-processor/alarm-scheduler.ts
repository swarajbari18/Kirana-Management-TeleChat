// Part 2.9.4 — DO alarm + work queue pattern (Component 3 plan).
// setAlarm schedules work processing; alarm handler may run up to 15 min wall time.

export async function scheduleAlarmIfNeeded(
  storage: DurableObjectStorage,
): Promise<void> {
  const existing = await storage.getAlarm();
  if (existing === null) {
    await storage.setAlarm(Date.now());
  }
}

export async function rescheduleAlarm(
  storage: DurableObjectStorage,
): Promise<void> {
  await storage.setAlarm(Date.now());
}

export async function clearAlarmIfIdle(
  storage: DurableObjectStorage,
  hasPending: boolean,
): Promise<void> {
  if (!hasPending) {
    await storage.deleteAlarm();
  }
}
