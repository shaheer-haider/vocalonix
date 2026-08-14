import type { SelectOption } from "./components/ui";

/**
 * Timezone was a free-text IANA field in one place ("Use an IANA timezone such as
 * America/New_York") and a four-option US-only select in another, while the country
 * list carries 60+ countries — a salon in Manchester could not state its own hours
 * correctly.
 *
 * The list is derived from the browser's own tz database so it is always complete
 * and current, with a small static fallback for engines without `supportedValuesOf`.
 */
const FALLBACK_ZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Warsaw",
  "Europe/Istanbul",
  "Africa/Lagos",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
];

function listZones(): string[] {
  const withSupported = Intl as typeof Intl & {
    supportedValuesOf?: (key: string) => string[];
  };
  try {
    const zones = withSupported.supportedValuesOf?.("timeZone");
    if (zones && zones.length > 0) return zones;
  } catch {
    // Fall through to the static list.
  }
  return FALLBACK_ZONES;
}

/** Current UTC offset in minutes for a zone, used only for sorting and labelling. */
function offsetMinutes(timeZone: string, now: Date): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "longOffset",
    }).formatToParts(now);
    const name = parts.find((part) => part.type === "timeZoneName")?.value ?? "";
    const match = name.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
    if (!match) return 0;
    const sign = match[1] === "-" ? -1 : 1;
    return sign * (Number(match[2]) * 60 + Number(match[3] ?? 0));
  } catch {
    return 0;
  }
}

function formatOffset(minutes: number): string {
  if (minutes === 0) return "UTC";
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  const hours = Math.floor(abs / 60);
  const rest = abs % 60;
  return `UTC${sign}${hours}${rest ? `:${String(rest).padStart(2, "0")}` : ""}`;
}

/** "London — UTC+1", sorted west to east so nearby zones sit together. */
export function timezoneOptions(): SelectOption[] {
  const now = new Date();
  return listZones()
    .map((zone) => {
      const minutes = offsetMinutes(zone, now);
      const city = zone.split("/").pop()?.replace(/_/g, " ") ?? zone;
      return {
        value: zone,
        label: `${city} — ${formatOffset(minutes)}`,
        minutes,
      };
    })
    .sort((a, b) => a.minutes - b.minutes || a.label.localeCompare(b.label))
    .map(({ value, label }) => ({ value, label }));
}

/** The visitor's own zone, so the field starts on the almost-always-right answer. */
export function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
  } catch {
    return "America/New_York";
  }
}
