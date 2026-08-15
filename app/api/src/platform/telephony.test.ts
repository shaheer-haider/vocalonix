import { describe, expect, test } from "bun:test";

import { ApiError } from "../errors";
import { normalizeE164 } from "./telephony";

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
