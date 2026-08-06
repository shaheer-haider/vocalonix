const SLOT_STEP_MINUTES = 30;
const MAX_OFFERED_SLOTS = 8;

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month! - 1 &&
    date.getUTCDate() === day
  );
}

export function isValidTime(value: string): boolean {
  return TIME_PATTERN.test(value);
}

export function minutesOfDay(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours! * 60 + minutes!;
}

function timeZoneOffsetMs(at: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts: Record<string, number> = {};
  for (const part of formatter.formatToParts(at)) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  const asUtc = Date.UTC(
    parts.year!,
    parts.month! - 1,
    parts.day!,
    parts.hour! === 24 ? 0 : parts.hour!,
    parts.minute!,
    parts.second!,
  );
  return asUtc - at.getTime();
}

export function zonedTimeToUtc(
  date: string,
  minutes: number,
  timeZone: string,
): Date {
  const [year, month, day] = date.split("-").map(Number);
  const guess = Date.UTC(year!, month! - 1, day!, 0, minutes);
  const offset = timeZoneOffsetMs(new Date(guess), timeZone);
  let timestamp = guess - offset;
  const adjusted = timeZoneOffsetMs(new Date(timestamp), timeZone);
  if (adjusted !== offset) timestamp = guess - adjusted;
  return new Date(timestamp);
}

export function todayInTimeZone(timeZone: string, at = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(at);
}

export function weekdayInTimeZone(date: string, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
  });
  return formatter.format(zonedTimeToUtc(date, 12 * 60, timeZone));
}

export interface ExistingBooking {
  resourceId: string;
  startAt: Date;
  durationMinutes: number;
}

export function resourceIsFree(
  resourceId: string,
  startAt: Date,
  durationMinutes: number,
  existing: ExistingBooking[],
): boolean {
  const start = startAt.getTime();
  const end = start + durationMinutes * 60_000;
  return !existing.some(
    (booking) =>
      booking.resourceId === resourceId &&
      booking.startAt.getTime() < end &&
      booking.startAt.getTime() + booking.durationMinutes * 60_000 > start,
  );
}

export function computeOpenSlots(input: {
  date: string;
  timeZone: string;
  open: string;
  close: string;
  durationMinutes: number;
  resourceIds: string[];
  existing: ExistingBooking[];
  notBefore?: Date;
}): string[] {
  const openMinutes = minutesOfDay(input.open);
  const closeMinutes = minutesOfDay(input.close);
  const slots: string[] = [];
  for (
    let minutes = openMinutes;
    minutes + input.durationMinutes <= closeMinutes;
    minutes += SLOT_STEP_MINUTES
  ) {
    const startAt = zonedTimeToUtc(input.date, minutes, input.timeZone);
    if (input.notBefore && startAt < input.notBefore) continue;
    const free = input.resourceIds.some((resourceId) =>
      resourceIsFree(resourceId, startAt, input.durationMinutes, input.existing),
    );
    if (free) {
      const hours = Math.floor(minutes / 60);
      const remainder = minutes % 60;
      slots.push(
        `${String(hours).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`,
      );
      if (slots.length >= MAX_OFFERED_SLOTS) break;
    }
  }
  return slots;
}
