import { describe, expect, it, vi } from "vitest";
import {
  ConfirmationRegistry,
  waitForConfirmation,
} from "./confirmation-registry.js";

describe("waitForConfirmation", () => {
  it("returns expired on timeout", async () => {
    vi.useFakeTimers();
    const registry = new ConfirmationRegistry();

    const promise = waitForConfirmation(registry, "test-id", 1000);
    await vi.advanceTimersByTimeAsync(1001);

    await expect(promise).resolves.toBe("expired");
    vi.useRealTimers();
  });

  it("returns approved when resolved before timeout", async () => {
    vi.useFakeTimers();
    const registry = new ConfirmationRegistry();

    const promise = waitForConfirmation(registry, "test-id", 5000);
    registry.resolve("test-id", "approved");

    await expect(promise).resolves.toBe("approved");
    vi.useRealTimers();
  });
});
