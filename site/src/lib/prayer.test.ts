import { DISTRICTS } from '@bdnumbers/shared';
import { describe, expect, it } from 'vitest';
import { PRAYERS, formatTime, monthTimes, prayerTimes, ramadanDates } from './prayer';

const dhaka = DISTRICTS.find((d) => d.id === 'dhaka')!;
const minutes = (iso: string) => {
  const t = new Date(Date.parse(iso) + 6 * 3600_000);
  return t.getUTCHours() * 60 + t.getUTCMinutes();
};

describe('prayerTimes', () => {
  it('gives Dhaka times in order and in a plausible window for late October', () => {
    const { times } = prayerTimes(dhaka.lat, dhaka.lon, '2026-10-22');
    const m = PRAYERS.map((p) => minutes(times[p]));
    expect([...m].sort((a, b) => a - b)).toEqual(m);
    expect(m[0]).toBeGreaterThan(4 * 60 + 20); // Fajr after 04:20
    expect(m[0]).toBeLessThan(5 * 60); // and before 05:00
    expect(m[4]).toBeGreaterThan(17 * 60 + 10); // Maghrib (sunset) after 17:10
    expect(m[4]).toBeLessThan(17 * 60 + 40);
  });

  it('is later in the west: Rajshahi sunset is after Dhaka sunset', () => {
    const rajshahi = DISTRICTS.find((d) => d.id === 'rajshahi')!;
    const a = minutes(prayerTimes(dhaka.lat, dhaka.lon, '2026-10-22').times.maghrib);
    const b = minutes(prayerTimes(rajshahi.lat, rajshahi.lon, '2026-10-22').times.maghrib);
    expect(b).toBeGreaterThan(a);
  });

  it('formats in Dhaka time with either digit system', () => {
    const iso = '2026-10-21T22:48:00.000Z'; // 04:48 in Dhaka
    expect(formatTime(iso, 'en', 'latn')).toMatch(/^4:48\s?AM$/);
    expect(formatTime(iso, 'bn', 'beng')).toContain('৪:৪৮');
  });
});

describe('monthTimes', () => {
  it('covers every day of the month', () => {
    expect(monthTimes(dhaka.lat, dhaka.lon, '2026-02-10')).toHaveLength(28);
    expect(monthTimes(dhaka.lat, dhaka.lon, '2026-10-22').map((d) => d.date).at(-1)).toBe('2026-10-31');
  });
});

describe('ramadanDates', () => {
  it('finds the next Ramadan (1448 AH, early 2027)', () => {
    const r = ramadanDates('2026-10-22');
    expect(r.hijriYear).toBe(1448);
    expect(r.dates.length).toBeGreaterThanOrEqual(29);
    expect(r.dates.length).toBeLessThanOrEqual(30);
    expect(r.dates[0]!.startsWith('2027-02')).toBe(true);
  });
  it('applies a moon-sighting offset', () => {
    expect(ramadanDates('2026-10-22', 1).dates[0]).toBe(
      new Date(Date.parse(`${ramadanDates('2026-10-22').dates[0]}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10),
    );
  });
});
