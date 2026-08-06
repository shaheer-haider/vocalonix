import { describe, expect, test } from "bun:test";

import {
  computeOpenSlots,
  isValidDate,
  isValidTime,
  minutesOfDay,
  resourceIsFree,
  todayInTimeZone,
  weekdayInTimeZone,
  zonedTimeToUtc,
} from "./slots";

describe("date and time validation", () => {
  test("accepts real dates and rejects malformed ones", () => {
    expect(isValidDate("2026-08-05")).toBe(true);
    expect(isValidDate("2026-02-30")).toBe(false);
    expect(isValidDate("tomorrow")).toBe(false);
    expect(isValidDate("2026-8-5")).toBe(false);
  });

  test("accepts 24-hour times and rejects others", () => {
    expect(isValidTime("09:30")).toBe(true);
    expect(isValidTime("23:59")).toBe(true);
    expect(isValidTime("24:00")).toBe(false);
    expect(isValidTime("9:30")).toBe(false);
    expect(isValidTime("half past nine")).toBe(false);
  });
});

describe("timezone conversion", () => {
  test("converts business-local times to UTC", () => {
    const winter = zonedTimeToUtc("2026-01-15", minutesOfDay("09:00"), "America/Chicago");
    expect(winter.toISOString()).toBe("2026-01-15T15:00:00.000Z");
    const summer = zonedTimeToUtc("2026-07-15", minutesOfDay("09:00"), "America/Chicago");
    expect(summer.toISOString()).toBe("2026-07-15T14:00:00.000Z");
  });

  test("handles UTC and eastern-hemisphere zones", () => {
    expect(
      zonedTimeToUtc("2026-08-05", minutesOfDay("12:00"), "UTC").toISOString(),
    ).toBe("2026-08-05T12:00:00.000Z");
    expect(
      zonedTimeToUtc("2026-08-05", minutesOfDay("09:00"), "Asia/Karachi").toISOString(),
    ).toBe("2026-08-05T04:00:00.000Z");
  });

  test("derives the weekday in the business timezone", () => {
    expect(weekdayInTimeZone("2026-08-05", "UTC")).toBe("Wednesday");
    expect(weekdayInTimeZone("2026-08-09", "America/Chicago")).toBe("Sunday");
  });

  test("formats today as YYYY-MM-DD", () => {
    expect(todayInTimeZone("UTC", new Date("2026-08-05T23:30:00Z"))).toBe(
      "2026-08-05",
    );
    expect(todayInTimeZone("Asia/Karachi", new Date("2026-08-05T23:30:00Z"))).toBe(
      "2026-08-06",
    );
  });
});

describe("clash detection", () => {
  const startAt = new Date("2026-08-05T10:00:00Z");

  test("detects overlap on the same resource", () => {
    expect(
      resourceIsFree("chair-1", startAt, 30, [
        { resourceId: "chair-1", startAt: new Date("2026-08-05T10:15:00Z"), durationMinutes: 30 },
      ]),
    ).toBe(false);
  });

  test("allows overlap on a different resource", () => {
    expect(
      resourceIsFree("chair-2", startAt, 30, [
        { resourceId: "chair-1", startAt: new Date("2026-08-05T10:15:00Z"), durationMinutes: 30 },
      ]),
    ).toBe(true);
  });

  test("allows back-to-back bookings", () => {
    expect(
      resourceIsFree("chair-1", startAt, 30, [
        { resourceId: "chair-1", startAt: new Date("2026-08-05T10:30:00Z"), durationMinutes: 30 },
      ]),
    ).toBe(true);
  });
});

describe("open slot computation", () => {
  test("offers slots on a 30-minute grid within hours", () => {
    const slots = computeOpenSlots({
      date: "2026-08-05",
      timeZone: "UTC",
      open: "09:00",
      close: "11:00",
      durationMinutes: 30,
      resourceIds: ["chair-1"],
      existing: [],
    });
    expect(slots).toEqual(["09:00", "09:30", "10:00", "10:30"]);
  });

  test("excludes slots that clash on every resource but keeps ones freed by another resource", () => {
    const existing = [
      {
        resourceId: "chair-1",
        startAt: new Date("2026-08-05T09:00:00Z"),
        durationMinutes: 60,
      },
    ];
    const single = computeOpenSlots({
      date: "2026-08-05",
      timeZone: "UTC",
      open: "09:00",
      close: "10:30",
      durationMinutes: 30,
      resourceIds: ["chair-1"],
      existing,
    });
    expect(single).toEqual(["10:00"]);

    const double = computeOpenSlots({
      date: "2026-08-05",
      timeZone: "UTC",
      open: "09:00",
      close: "10:30",
      durationMinutes: 30,
      resourceIds: ["chair-1", "chair-2"],
      existing,
    });
    expect(double).toEqual(["09:00", "09:30", "10:00"]);
  });

  test("does not offer slots in the past or beyond closing", () => {
    const slots = computeOpenSlots({
      date: "2026-08-05",
      timeZone: "UTC",
      open: "09:00",
      close: "10:00",
      durationMinutes: 45,
      resourceIds: ["chair-1"],
      existing: [],
      notBefore: new Date("2026-08-05T09:10:00Z"),
    });
    expect(slots).toEqual([]);

    const later = computeOpenSlots({
      date: "2026-08-05",
      timeZone: "UTC",
      open: "09:00",
      close: "12:00",
      durationMinutes: 30,
      resourceIds: ["chair-1"],
      existing: [],
      notBefore: new Date("2026-08-05T10:10:00Z"),
    });
    expect(later[0]).toBe("10:30");
  });
});
