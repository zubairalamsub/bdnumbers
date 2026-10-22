// Bangladesh is UTC+6 all year (no DST), so Dhaka dates are a fixed offset from UTC.
const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_HOUR = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/** Dhaka-local calendar date (YYYY-MM-DD) for an instant. */
export function dhakaDate(at: Date = new Date()): string {
  return new Date(at.getTime() + DHAKA_OFFSET_MS).toISOString().slice(0, 10);
}

/** The UTC instant at which a Dhaka-local date begins, as an ISO string. */
export function dhakaDayStartUtc(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) - DHAKA_OFFSET_MS).toISOString();
}

/** Shift a YYYY-MM-DD date by whole days. */
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date.slice(0, 10)}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** True for a real calendar date (YYYY-MM-DD) or date-hour (YYYY-MM-DDTHH:MM). */
export function isPointDate(s: string): boolean {
  if (!ISO_DATE.test(s) && !ISO_DATE_HOUR.test(s)) return false;
  const day = s.slice(0, 10);
  const t = Date.parse(`${day}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === day;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** Build YYYY-MM-DD from parts, accepting English month names or 3-letter abbreviations. Returns null if invalid. */
export function toIsoDate(year: number | string, month: number | string, day: number | string): string | null {
  const m = typeof month === 'number' ? month : MONTHS[month.slice(0, 3).toLowerCase()];
  if (!m) return null;
  const iso = `${String(year).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return isPointDate(iso) ? iso : null;
}
