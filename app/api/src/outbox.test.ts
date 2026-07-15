import { describe, expect, it } from "bun:test";

import { failureUpdate, pollRescheduleUpdate } from "./outbox";

describe("outbox attempt accounting", () => {
  const now = new Date("2026-07-15T12:00:00.000Z");

  it("polling a healthy-but-slow event resets the retry budget", () => {
    const update = pollRescheduleUpdate(5_000, now);
    expect(update.status).toBe("pending");
    expect(update.attemptCount).toBe(0);
    expect(update.lastError).toBeNull();
    expect(update.availableAt.getTime()).toBe(now.getTime() + 5_000);
  });

  it("repeated polling never exhausts the failure allowance", () => {
    // Even after many polls, attemptCount stays 0 so a later genuine failure
    // still gets the full retry budget.
    for (let i = 0; i < 100; i += 1) {
      expect(pollRescheduleUpdate(5_000, now).attemptCount).toBe(0);
    }
  });

  it("retryable failures stay pending until attempts are exhausted", () => {
    const retrying = failureUpdate(
      { attemptCount: 2, maxAttempts: 5 },
      true,
      "temporary",
      now,
    );
    expect(retrying.status).toBe("pending");

    const exhausted = failureUpdate(
      { attemptCount: 5, maxAttempts: 5 },
      true,
      "temporary",
      now,
    );
    expect(exhausted.status).toBe("failed");
  });

  it("non-retryable (rejected) failures do not loop", () => {
    const rejected = failureUpdate(
      { attemptCount: 1, maxAttempts: 5 },
      false,
      "rejected configuration",
      now,
    );
    expect(rejected.status).toBe("failed");
    expect(rejected.lastError).toBe("rejected configuration");
  });
});
