// Centralised date/time formatting for Maxenergy Fitness.
//
// Important: the backend stores datetimes in MongoDB and Motor returns them
// *naive* (no timezone), so the API sends ISO strings WITHOUT an offset
// (e.g. "2026-08-10T17:00:00"). JavaScript parses tz-less date-time strings in
// the DEVICE's local timezone, which shifts times on non-UTC devices. To be
// fully device-independent we always interpret a tz-less string as UTC.
//
// Two kinds of values exist:
//  1) Class / event `start_at` — the stored number IS the Queensland (GMT+10)
//     wall-clock (e.g. 17:00 = 5:00pm). We display those components as-is.
//  2) `created_at` / `paid_at` / message times — a true UTC instant. We convert
//     those to Queensland time for display.

const QLD = "Australia/Brisbane";
const LOCALE = "en-AU";

// Parse an API ISO string as an absolute instant, treating a tz-less string as UTC.
function toDate(iso: string): Date {
  const hasTZ = /([zZ])|([+-]\d{2}:?\d{2})$/.test(iso);
  return new Date(hasTZ ? iso : iso + "Z");
}

// ---- Schedule wall-clock (class / event start_at): show stored value as-is ----
export function classTime(iso?: string): string {
  if (!iso) return "";
  return toDate(iso).toLocaleTimeString(LOCALE, { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
}
export function classDate(iso?: string, opts: Intl.DateTimeFormatOptions = {}): string {
  if (!iso) return "";
  return toDate(iso).toLocaleDateString(LOCALE, { ...opts, timeZone: "UTC" });
}
// Absolute ms of a class/event start_at (QLD wall-clock interpreted as UTC).
export function classStartMs(iso?: string): number {
  if (!iso) return NaN;
  return toDate(iso).getTime();
}
// A UTC-midnight Date carrying the schedule's wall-clock Y/M/D (for day grouping).
export function scheduleDay(iso: string): Date {
  const d = toDate(iso);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
// Wall-clock parts (used to prefill admin forms).
export function classParts(iso: string): { y: number; mo: number; d: number; h: number; mi: number } {
  const d = toDate(iso);
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes() };
}

// ---- Current Queensland calendar / clock ----
// Today's Queensland date as a UTC-midnight Date (matches scheduleDay space).
export function qldTodayUTC(): Date {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: QLD, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return new Date(Date.UTC(g("year"), g("month") - 1, g("day")));
}
export function qldHour(): number {
  return Number(new Date().toLocaleString(LOCALE, { hour: "numeric", hour12: false, timeZone: QLD })) % 24;
}
// Current Queensland wall-clock as a UTC-based Date, so it is directly
// comparable to a class/event `start_at` (which stores QLD wall-clock as UTC).
export function qldNowUTC(): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: QLD,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  let h = g("hour");
  if (h === 24) h = 0; // some engines report midnight as 24
  return new Date(Date.UTC(g("year"), g("month") - 1, g("day"), h, g("minute"), g("second")));
}

// ---- True UTC instants (created_at / paid_at / message times) → Queensland ----
export function stampTime(iso?: string): string {
  if (!iso) return "";
  return toDate(iso).toLocaleTimeString(LOCALE, { hour: "numeric", minute: "2-digit", timeZone: QLD });
}
export function stampDate(iso?: string, opts: Intl.DateTimeFormatOptions = {}): string {
  if (!iso) return "";
  return toDate(iso).toLocaleDateString(LOCALE, { ...opts, timeZone: QLD });
}
export function isQldToday(iso: string): boolean {
  const day = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: QLD });
  return day(toDate(iso)) === day(new Date());
}
