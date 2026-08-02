import type { RuntimePorts } from "./types.js";

type ConfirmationOutcome = "approved" | "denied" | "expired";

interface Deferred {
  resolve: (outcome: ConfirmationOutcome) => void;
}

export class ConfirmationRegistry {
  private readonly pending = new Map<string, Deferred>();

  register(confirmationId: string): Promise<ConfirmationOutcome> {
    return new Promise((resolve) => {
      this.pending.set(confirmationId, { resolve });
    });
  }

  resolve(
    confirmationId: string,
    outcome: "approved" | "denied",
  ): boolean {
    const deferred = this.pending.get(confirmationId);
    if (!deferred) {
      return false;
    }
    this.pending.delete(confirmationId);
    deferred.resolve(outcome);
    return true;
  }

  clear(confirmationId: string): void {
    this.pending.delete(confirmationId);
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForConfirmation(
  registry: ConfirmationRegistry,
  confirmationId: string,
  timeoutMs: number,
): Promise<ConfirmationOutcome> {
  const waitPromise = registry.register(confirmationId);
  const timeoutPromise = sleep(timeoutMs).then(
    (): ConfirmationOutcome => "expired",
  );
  const outcome = await Promise.race([waitPromise, timeoutPromise]);
  if (outcome === "expired") {
    registry.clear(confirmationId);
  }
  return outcome;
}

export type { RuntimePorts };
