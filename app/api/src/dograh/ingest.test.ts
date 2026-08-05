import { describe, expect, test } from "bun:test";

import { extractCaller } from "./ingest";
import type { DograhWorkflowRun } from "./types";

function run(context: Record<string, unknown> | null): DograhWorkflowRun {
  return {
    id: 1,
    workflow_id: 1,
    name: "run",
    mode: "voice",
    is_completed: true,
    created_at: "2026-08-05T00:00:00Z",
    gathered_context: context,
  };
}

describe("extractCaller", () => {
  test("reads extracted caller details and callback request", () => {
    const caller = extractCaller(
      run({
        caller_name: " Marcus Bell ",
        caller_phone: "+44 7700 900482",
        caller_email: "m.bell@example.com",
        callback_requested: true,
        callback_reason: "Wants an Invisalign quote.",
      }),
    );
    expect(caller).toEqual({
      name: "Marcus Bell",
      phone: "+44 7700 900482",
      email: "m.bell@example.com",
      callbackRequested: true,
      callbackReason: "Wants an Invisalign quote.",
    });
  });

  test("treats placeholder and empty values as absent", () => {
    const caller = extractCaller(
      run({
        caller_name: "unknown",
        caller_phone: "  ",
        caller_email: "N/A",
        callback_requested: "true",
        callback_reason: "none",
      }),
    );
    expect(caller).toEqual({
      name: null,
      phone: null,
      email: null,
      callbackRequested: false,
      callbackReason: null,
    });
  });

  test("handles a missing gathered context", () => {
    const caller = extractCaller(run(null));
    expect(caller.callbackRequested).toBe(false);
    expect(caller.name).toBeNull();
  });
});
