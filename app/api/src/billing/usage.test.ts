import { describe, expect, test } from "bun:test";

import { PLANS, UNLIMITED } from "./plans";
import { suspensionDecision, usageWindowStart } from "./usage";

describe("suspensionDecision", () => {
  test("stops a workspace that has spent its allowance", () => {
    expect(suspensionDecision(500, 500, false)).toBe("suspend");
    expect(suspensionDecision(500, 812, false)).toBe("suspend");
  });

  test("leaves a workspace alone while it is still under", () => {
    expect(suspensionDecision(500, 499, false)).toBe("none");
    expect(suspensionDecision(500, 0, false)).toBe("none");
  });

  test("never suspends an unlimited plan, however much it uses", () => {
    expect(suspensionDecision(UNLIMITED, 10_000_000, false)).toBe("none");
  });

  test("restores a suspended workspace once it is back under, as after an upgrade", () => {
    // Free spent its 30 minutes, then bought Starter: same usage, bigger
    // allowance, so the agent has to come back on.
    expect(
      suspensionDecision(PLANS.starter.monthlyMinutes, 30, true),
    ).toBe("resume");
  });

  test("does not act again on a workspace already in the right state", () => {
    // The sweep runs every minute; repeating the action would deactivate the
    // embed token over and over.
    expect(suspensionDecision(500, 900, true)).toBe("none");
    expect(suspensionDecision(500, 100, false)).toBe("none");
  });

  test("an upgrade to unlimited resumes a stopped workspace", () => {
    expect(suspensionDecision(UNLIMITED, 900, true)).toBe("resume");
  });
});

describe("usageWindowStart", () => {
  test("measures against the current period when a subscription is live", () => {
    const periodEnd = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const start = usageWindowStart(periodEnd);
    const expected = new Date(periodEnd);
    expected.setMonth(expected.getMonth() - 1);
    expect(start.getTime()).toBe(expected.getTime());
  });

  test("falls back to a rolling 30 days with no subscription", () => {
    const start = usageWindowStart(null);
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    // A second of slack: the function reads the clock itself.
    expect(Math.abs(start.getTime() - thirtyDaysAgo)).toBeLessThan(1000);
  });

  test("ignores a period end that has already passed", () => {
    // A lapsed subscription must not measure usage against a window that
    // closed, which would let a stale period hide current usage.
    const stale = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const start = usageWindowStart(stale);
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    expect(Math.abs(start.getTime() - thirtyDaysAgo)).toBeLessThan(1000);
  });
});
