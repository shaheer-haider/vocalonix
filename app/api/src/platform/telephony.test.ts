import { describe, expect, test } from "bun:test";

import { ApiError } from "../errors";
import { derivePool, isDialable, normalizeE164 } from "./telephony";
import type { ReleaseHistoryRow } from "./telephony";

const MINE = "biz-mine";
const THEIRS = "biz-theirs";

function released(
  e164: string,
  businessId: string,
  businessName: string,
  releasedAt: string,
): ReleaseHistoryRow {
  return { e164, businessId, businessName, releasedAt: new Date(releasedAt) };
}

describe("phone number normalisation", () => {
  test("accepts full international numbers and strips formatting", () => {
    expect(normalizeE164("+1 (415) 555-0123")).toBe("+14155550123");
    expect(normalizeE164(" +44 161 496 0000 ")).toBe("+441614960000");
    expect(normalizeE164("+441614960000")).toBe("+441614960000");
  });

  test("rejects anything the engine could not dial", () => {
    // Bare digits are the dangerous case: without a dial code they normalise
    // to a plausible-looking but wrong E.164, and inbound calls silently never
    // arrive.
    for (const input of ["4155550123", "0161 496 0000", "+44", "", "not a number"]) {
      expect(() => normalizeE164(input)).toThrow(ApiError);
    }
  });

  test("the error explains the required format", () => {
    try {
      normalizeE164("01614960000");
      throw new Error("expected a rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).message).toContain("+14155550123");
    }
  });
});

describe("whether a callback can be dialled", () => {
  test("accepts what normalisation accepts, formatting and all", () => {
    expect(isDialable("+14155550123")).toBe(true);
    expect(isDialable("+1 (415) 555-0123")).toBe(true);
  });

  test("rejects the channels a callback may legitimately hold instead", () => {
    // A callback is also a human to-do list, so an email or a local number is
    // valid to store — it just cannot be handed to the engine.
    expect(isDialable("someone@example.com")).toBe(false);
    expect(isDialable("0161 496 0000")).toBe(false);
    expect(isDialable("")).toBe(false);
  });

  test("answers rather than throwing, so the view can be built from it", () => {
    expect(() => isDialable("not a number")).not.toThrow();
  });
});

describe("the parked-number pool", () => {
  test("offers what we own and nobody is answering on", () => {
    const pool = derivePool({
      owned: ["+14155550100", "+14155550101"],
      liveClaims: ["+14155550101"],
      history: [],
      viewerBusinessId: MINE,
    });

    expect(pool.map((row) => row.e164)).toEqual(["+14155550100"]);
  });

  test("a number another workspace is using never appears", () => {
    // The important half of the rule: the pool is platform-wide, so a live
    // claim anywhere has to hide the number from everyone, not just from the
    // business holding it.
    const pool = derivePool({
      owned: ["+14155550100"],
      liveClaims: ["+14155550100"],
      history: [released("+14155550100", THEIRS, "Rival Salon", "2026-08-01")],
      viewerBusinessId: MINE,
    });

    expect(pool).toEqual([]);
  });

  test("names the previous tenant only to the workspace that was it", () => {
    const pool = derivePool({
      owned: ["+14155550100"],
      liveClaims: [],
      history: [released("+14155550100", MINE, "My Salon", "2026-08-01")],
      viewerBusinessId: MINE,
    });

    expect(pool[0]).toMatchObject({
      previousUse: "yours",
      previousBusinessName: "My Salon",
      releasedAt: new Date("2026-08-01").toISOString(),
    });
  });

  test("never leaks another workspace's name or release date", () => {
    const pool = derivePool({
      owned: ["+14155550100"],
      liveClaims: [],
      history: [released("+14155550100", THEIRS, "Rival Salon", "2026-08-01")],
      viewerBusinessId: MINE,
    });

    expect(pool[0]?.previousUse).toBe("other");
    expect(pool[0]?.previousBusinessName).toBeNull();
    expect(JSON.stringify(pool)).not.toContain("Rival Salon");
  });

  test("attributes a number to whoever gave it up last", () => {
    // Passed newest-first, as the query orders it. A number that has been round
    // the houses belongs, for display, to its most recent tenant.
    const pool = derivePool({
      owned: ["+14155550100"],
      liveClaims: [],
      history: [
        released("+14155550100", MINE, "My Salon", "2026-08-10"),
        released("+14155550100", THEIRS, "Rival Salon", "2026-08-01"),
      ],
      viewerBusinessId: MINE,
    });

    expect(pool[0]?.previousUse).toBe("yours");
    expect(pool[0]?.previousBusinessName).toBe("My Salon");
  });

  test("reports a number we hold that no business ever claimed", () => {
    // Bought straight from the provider console. It is still ours to connect,
    // and saying so beats hiding a number we are already paying for.
    const pool = derivePool({
      owned: ["+14155550100"],
      liveClaims: [],
      history: [],
      viewerBusinessId: MINE,
    });

    expect(pool[0]).toEqual({
      e164: "+14155550100",
      previousUse: "unused",
      previousBusinessName: null,
      releasedAt: null,
    });
  });

  test("a released row for a number we no longer own does not conjure one", () => {
    // Ownership is the provider's answer, never ours. If Telnyx does not list
    // it, no history row should put it back on offer.
    const pool = derivePool({
      owned: [],
      liveClaims: [],
      history: [released("+14155550100", MINE, "My Salon", "2026-08-01")],
      viewerBusinessId: MINE,
    });

    expect(pool).toEqual([]);
  });
});
