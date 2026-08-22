import { describe, expect, test } from "bun:test";

import { PLANS, UNLIMITED } from "./plans";
import {
  USAGE_WARNING_PERCENT,
  suspensionDecision,
  usageNoticeDecision,
  usageNoticeLevelFor,
  usageWindowStart,
} from "./usage";

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

describe("usageNoticeLevelFor", () => {
  test("says nothing until the warning threshold", () => {
    expect(usageNoticeLevelFor(500, 0)).toBe(0);
    expect(usageNoticeLevelFor(500, 399)).toBe(0);
  });

  test("warns exactly on the threshold, not a minute after", () => {
    // 80% of 500 is 400. An off-by-one here is the difference between a
    // warning and no warning for a whole class of plan.
    expect(usageNoticeLevelFor(500, 400)).toBe(80);
  });

  test("warns on a threshold that is not a round number of minutes", () => {
    // Free is 30 minutes, so the threshold is 24 exactly. The float form of
    // this comparison is what would drift.
    expect(usageNoticeLevelFor(30, 23)).toBe(0);
    expect(usageNoticeLevelFor(30, 24)).toBe(80);
  });

  test("reports exhaustion from the minute the allowance is met", () => {
    expect(usageNoticeLevelFor(500, 500)).toBe(100);
    expect(usageNoticeLevelFor(500, 900)).toBe(100);
  });

  test("has no threshold on an unlimited plan", () => {
    expect(usageNoticeLevelFor(UNLIMITED, 10_000_000)).toBe(0);
  });

  test("treats a zero allowance as nothing to warn about", () => {
    // Otherwise an account on a zero-minute plan is mailed "you have stopped
    // answering" on its very first sweep, before it has done anything.
    expect(usageNoticeLevelFor(0, 0)).toBe(0);
  });

  test("agrees with the constant the copy is written against", () => {
    expect(USAGE_WARNING_PERCENT).toBe(80);
  });
});

describe("usageNoticeDecision", () => {
  test("sends the warning the first time the threshold is crossed", () => {
    expect(usageNoticeDecision(500, 400, 0)).toEqual({ level: 80, notify: 80 });
  });

  test("does not send it again on the next sweep", () => {
    // The worker re-measures every minute; this is the whole reason the level
    // is stored rather than derived.
    expect(usageNoticeDecision(500, 420, 80)).toEqual({
      level: 80,
      notify: null,
    });
  });

  test("escalates from warned to exhausted", () => {
    expect(usageNoticeDecision(500, 500, 80)).toEqual({
      level: 100,
      notify: 100,
    });
  });

  test("sends only the exhausted mail when both are crossed at once", () => {
    // One long call can take an account from comfortable to spent. Telling
    // somebody they are close to a limit they have already passed is noise.
    expect(usageNoticeDecision(500, 500, 0)).toEqual({
      level: 100,
      notify: 100,
    });
  });

  test("stays quiet once exhausted", () => {
    expect(usageNoticeDecision(500, 900, 100)).toEqual({
      level: 100,
      notify: null,
    });
  });

  test("re-arms when usage falls back, as at a new period", () => {
    // The level drops with no mail sent, which is what lets the next period
    // warn again. A rolling 30-day window has no period start to reset on, so
    // this is the only thing that re-arms a Free account.
    expect(usageNoticeDecision(500, 10, 100)).toEqual({
      level: 0,
      notify: null,
    });
    expect(usageNoticeDecision(500, 400, 0)).toEqual({
      level: 80,
      notify: 80,
    });
  });

  test("re-arms after an upgrade without mailing about the old plan", () => {
    // Free spent 30 of 30 and was mailed at 100. Buying Essential puts the
    // same 30 minutes against 500, which must not send anything at all.
    expect(usageNoticeDecision(PLANS.starter.monthlyMinutes, 30, 100)).toEqual({
      level: 0,
      notify: null,
    });
  });

  test("never mails an unlimited plan", () => {
    expect(usageNoticeDecision(UNLIMITED, 10_000_000, 0)).toEqual({
      level: 0,
      notify: null,
    });
  });
});
