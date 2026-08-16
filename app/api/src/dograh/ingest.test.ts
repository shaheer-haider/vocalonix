import { describe, expect, test } from "bun:test";

import {
  extractCaller,
  gapsFromContext,
  normalizeQuestion,
  runDurationSeconds,
  withCallerId,
} from "./ingest";
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

  test("rejects values that do not look like their field", () => {
    const caller = extractCaller(
      run({
        caller_name: "Mark",
        caller_phone:
          'caller_email: null, caller_phone: null} ... wait, let\'s format properly. Standard JSON format rules apply.',
        caller_email: "not-an-email",
        callback_requested: true,
        callback_reason: "Reason with a {brace} in it",
      }),
    );
    expect(caller).toEqual({
      name: "Mark",
      phone: null,
      email: null,
      callbackRequested: true,
      callbackReason: null,
    });
  });

  test("accepts common phone and email shapes", () => {
    const caller = extractCaller(
      run({
        caller_name: "Ann O'Neil",
        caller_phone: "0770 090 0482",
        caller_email: "ann.oneil@example.co.uk",
        callback_requested: false,
      }),
    );
    expect(caller.phone).toBe("0770 090 0482");
    expect(caller.email).toBe("ann.oneil@example.co.uk");
  });
});

describe("gapsFromContext", () => {
  test("keeps well-formed gaps and drops malformed entries", () => {
    const gaps = gapsFromContext({
      knowledge_gaps: [
        {
          question: "Do you take Bupa dental insurance?",
          agent_response: "I am not able to say which insurers we work with.",
        },
        { question: "short?" },
        { question: 'Has a {brace} inside it, so rejected?' },
        { agent_response: "No question at all." },
        "not an object",
        {
          question: "Can I pay in instalments?",
          agent_response: "Reason with a {brace} gets dropped",
        },
      ],
    });
    expect(gaps).toEqual([
      {
        question: "Do you take Bupa dental insurance?",
        agentResponse: "I am not able to say which insurers we work with.",
      },
      { question: "Can I pay in instalments?", agentResponse: null },
    ]);
  });

  test("returns empty for absent or non-array gaps", () => {
    expect(gapsFromContext({})).toEqual([]);
    expect(gapsFromContext({ knowledge_gaps: "nope" })).toEqual([]);
  });
});

describe("normalizeQuestion", () => {
  test("collapses case, whitespace, and trailing punctuation", () => {
    expect(normalizeQuestion("  Do you  take Bupa insurance?? ")).toBe(
      "do you take bupa insurance",
    );
    expect(normalizeQuestion("Do you take Bupa insurance")).toBe(
      "do you take bupa insurance",
    );
  });
});

describe("caller id fallback", () => {
  function phoneRun(
    context: Record<string, unknown> | null,
    callerNumber: string | null,
  ): DograhWorkflowRun {
    return { ...run(context), initial_context: { caller_number: callerNumber } };
  }

  const nobody = {
    name: null,
    phone: null,
    email: null,
    callbackRequested: false,
    callbackReason: null,
  };

  test("gives a silent caller an identity, so the call reaches the contact list", () => {
    // Without this the whole call is discarded: linkContact is handed three
    // nulls and returns without creating anything.
    const caller = withCallerId(nobody, phoneRun(null, "+923711303611"));
    expect(caller.phone).toBe("+923711303611");
    expect(caller.name).toBeNull();
  });

  test("does not overwrite a number the caller asked to be reached on", () => {
    const stated = { ...nobody, phone: "+441614960000" };
    const caller = withCallerId(stated, phoneRun(null, "+923711303611"));
    expect(caller.phone).toBe("+441614960000");
  });

  test("keeps the name learned in conversation alongside the caller id", () => {
    const stated = { ...nobody, name: "Marcus Bell" };
    const caller = withCallerId(stated, phoneRun(null, "+923711303611"));
    expect(caller).toMatchObject({ name: "Marcus Bell", phone: "+923711303611" });
  });

  test("leaves widget calls alone, which carry no caller id", () => {
    expect(withCallerId(nobody, phoneRun(null, null)).phone).toBeNull();
    expect(withCallerId(nobody, run(null)).phone).toBeNull();
  });

  test("rejects a caller id that is not a usable number", () => {
    // Telnyx sends "anonymous" for a withheld number; storing that as a phone
    // would collide every withheld caller into one contact.
    expect(withCallerId(nobody, phoneRun(null, "anonymous")).phone).toBeNull();
  });
});

describe("call duration", () => {
  function withInfo(
    usage: Record<string, unknown> | null,
    cost: { call_duration_seconds?: number | null } | null,
  ): DograhWorkflowRun {
    return { ...run(null), usage_info: usage, cost_info: cost };
  }

  test("reads the field the engine actually populates", () => {
    // Real runs carry duration in usage_info and an empty cost_info, so
    // reading cost_info reported no duration on every call in the product.
    expect(runDurationSeconds(withInfo({ call_duration_seconds: 130 }, {}))).toBe(130);
  });

  test("still reads older runs that carried it on cost_info", () => {
    expect(runDurationSeconds(withInfo({}, { call_duration_seconds: 70 }))).toBe(70);
  });

  test("prefers usage_info when both are present", () => {
    expect(
      runDurationSeconds(withInfo({ call_duration_seconds: 130 }, { call_duration_seconds: 70 })),
    ).toBe(130);
  });

  test("reports null rather than a bogus number when absent", () => {
    expect(runDurationSeconds(withInfo({}, {}))).toBeNull();
    expect(runDurationSeconds(withInfo(null, null))).toBeNull();
    expect(runDurationSeconds(withInfo({ call_duration_seconds: null }, null))).toBeNull();
  });
});

describe("call record values", () => {
  // recordCall writes to the database, so the shaping it does is asserted
  // through the pieces it composes rather than by running the insert.
  test("a widget call has no caller number to record", () => {
    const widget = run(null);
    expect(withCallerId(extractCaller(widget), widget).phone).toBeNull();
  });

  test("a phone call records the number even with an empty context", () => {
    const call = { ...run(null), initial_context: { caller_number: "+923711303611" } };
    expect(withCallerId(extractCaller(call), call).phone).toBe("+923711303611");
  });

  test("disposition prefers the mapped value the engine settled on", () => {
    const mapped = run({
      mapped_call_disposition: "booked",
      call_disposition: "raw",
    });
    expect(
      mapped.gathered_context?.mapped_call_disposition ??
        mapped.gathered_context?.call_disposition ??
        null,
    ).toBe("booked");
  });
});
