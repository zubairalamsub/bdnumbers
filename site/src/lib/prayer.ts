// Prayer times computed locally with adhan (Karachi method: Fajr 18°, Isha 18°; Hanafi Asr), the
// convention used in Bangladesh. Runs both at build time and in the browser.
import { CalculationMethod, Coordinates, Madhab, PrayerTimes } from 'adhan';
import { addDays } from '@bdnumbers/shared';

export const PRAYERS = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;
export type PrayerName = (typeof PRAYERS)[number];

/** Times as ISO instants (format them in Asia/Dhaka). */
export interface DayTimes {
  date: string;
  times: Record<PrayerName, string>;
}

function parameters() {
  const p = CalculationMethod.Karachi();
  p.madhab = Madhab.Hanafi;
  return p;
}

/** Prayer times for a Dhaka calendar day (YYYY-MM-DD) at a place. */
export function prayerTimes(lat: number, lon: number, date: string): DayTimes {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  // adhan reads the calendar day from local date fields, so a local midnight works in any time zone.
  const t = new PrayerTimes(new Coordinates(lat, lon), new Date(y, m - 1, d), parameters());
  return {
    date,
    times: {
      fajr: t.fajr.toISOString(),
      sunrise: t.sunrise.toISOString(),
      dhuhr: t.dhuhr.toISOString(),
      asr: t.asr.toISOString(),
      maghrib: t.maghrib.toISOString(),
      isha: t.isha.toISOString(),
    },
  };
}

/** Every day of the month containing `date`. */
export function monthTimes(lat: number, lon: number, date: string): DayTimes[] {
  const first = `${date.slice(0, 7)}-01`;
  const days: DayTimes[] = [];
  for (let d = first; d.slice(0, 7) === first.slice(0, 7); d = addDays(d, 1)) days.push(prayerTimes(lat, lon, d));
  return days;
}

/** "4:48 AM" / "৪:৪৮ AM" in Dhaka time. */
export function formatTime(iso: string, lang: 'bn' | 'en', digits: 'beng' | 'latn'): string {
  return new Intl.DateTimeFormat(`${lang}-u-nu-${digits}`, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Dhaka',
  }).format(new Date(iso));
}

const hijri = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  timeZone: 'UTC',
});

function hijriParts(date: string) {
  const parts = hijri.formatToParts(new Date(`${date}T12:00:00Z`));
  const get = (type: string) => Number.parseInt(parts.find((p) => p.type === type)?.value ?? '', 10);
  return { year: get('year'), month: get('month'), day: get('day') };
}

/**
 * The Gregorian dates of the current or next Ramadan by the Umm al-Qura calendar, shifted by
 * `offsetDays` (Bangladesh starts Ramadan on its own moon sighting, often a day later).
 */
export function ramadanDates(today: string, offsetDays = 0): { hijriYear: number; dates: string[] } {
  const dates: string[] = [];
  let hijriYear = 0;
  for (let d = addDays(today, -30), i = 0; i < 420; d = addDays(d, 1), i++) {
    const h = hijriParts(d);
    if (h.month === 9) {
      hijriYear = h.year;
      dates.push(addDays(d, offsetDays));
    } else if (dates.length > 0) break;
  }
  // Skip a Ramadan that ended before today.
  if (dates.length > 0 && dates[dates.length - 1]! < today) return ramadanDates(addDays(today, 40), offsetDays);
  return { hijriYear, dates };
}
