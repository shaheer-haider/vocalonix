import { describe, expect, test } from "bun:test";

import { synchronizationDecision } from "./tenant";

describe("tenant synchronization decisions", () => {
  test("unchanged successful configuration is a no-op", () => {
    expect(
      synchronizationDecision(
        {
          syncState: "synced",
          syncedConfigHash: "hash-a",
          configHash: "hash-a",
          workflowId: "42",
        },
        "hash-a",
        false,
      ),
    ).toBe("no-op");
  });

  test("rejected unchanged configuration does not auto-loop", () => {
    expect(
      synchronizationDecision(
        {
          syncState: "rejected",
          syncedConfigHash: null,
          configHash: "rejected-hash",
          workflowId: "42",
        },
        "rejected-hash",
        false,
      ),
    ).toBe("rejected");
  });

  test("configuration changes and manual retries synchronize", () => {
    const mapping = {
      syncState: "rejected" as const,
      syncedConfigHash: null,
      configHash: "old-hash",
      workflowId: "42",
    };
    expect(synchronizationDecision(mapping, "new-hash", false)).toBe(
      "synchronize",
    );
    expect(synchronizationDecision(mapping, "old-hash", true)).toBe(
      "synchronize",
    );
  });
});
