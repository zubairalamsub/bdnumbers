import { SAVINGS_NOTICE, type Point } from '@bdnumbers/shared';
import { describe, expect, it } from 'vitest';
import { parseBpcFuel } from '../src/sources/fuelPrices';
import { parseHolidaysIcs } from '../src/sources/holidays';
import { parseUnbLpgArticle, parseUnbLpgSearch } from '../src/sources/lpgPrice';
import { findRatesDocument, latestRateNotice } from '../src/sources/savingsRates';
import { validatePoints } from '../src/validate';
import { FIXTURES, UNB_LPG_ARTICLE_URL } from './helpers';

const byKey = (points: Point[]) => Object.fromEntries(points.map((p) => [p.series_key, [p.date, p.value]]));

describe('parseBpcFuel', () => {
  it('reads fuel prices with their own effective dates, and the government LPG cylinder', async () => {
    const points = await parseBpcFuel(FIXTURES.bpcFuel);
    expect(byKey(points)).toEqual({
      fuel_diesel: ['2026-09-21', 135],
      fuel_kerosene: ['2026-09-21', 155],
      fuel_octane: ['2026-09-21', 165],
      fuel_petrol: ['2026-09-21', 160],
      fuel_furnace_oil: ['2026-10-01', 108.78],
      lpg_govt_12_5kg: ['2026-02-23', 776.93],
    });
    expect(() => validatePoints(points, '2026-10-22')).not.toThrow();
  });

  it('fails loudly when a product row disappears', async () => {
    await expect(parseBpcFuel(FIXTURES.bpcFuel.replace('ডিজেল', 'ডিজেল (পরিবর্তিত)'))).rejects.toThrow(/no row for Diesel/);
  });
});

describe('LPG via UNB', () => {
  it('lists LPG price articles newest first', async () => {
    const urls = await parseUnbLpgSearch(FIXTURES.unbLpgSearch);
    expect(urls.length).toBeGreaterThan(3);
    expect(urls).toContain(UNB_LPG_ARTICLE_URL);
    const ids = urls.map((u) => Number(/\/(\d+)$/.exec(u)![1]));
    expect(ids).toEqual([...ids].sort((a, b) => b - a));
  });

  it('reads the 12 kg and per-kg prices, which must agree', async () => {
    const points = await parseUnbLpgArticle(FIXTURES.unbLpgArticle, UNB_LPG_ARTICLE_URL);
    expect(byKey(points)).toEqual({ lpg_12kg: ['2026-10-04', 1837], lpg_per_kg: ['2026-10-04', 153.06] });
    expect(points[0]!.meta).toMatchObject({ source: 'mirror', mirror: 'unb' });
    expect(() => validatePoints(points, '2026-10-22')).not.toThrow();
  });

  it('rejects an article whose figures do not agree', async () => {
    const page = FIXTURES.unbLpgArticle.replaceAll('Tk1,837', 'Tk1,937');
    await expect(parseUnbLpgArticle(page, UNB_LPG_ARTICLE_URL)).rejects.toThrow(/doesn't match/);
  });
});

describe('parseHolidaysIcs', () => {
  it('keeps public holidays for this year and next, with Bengali names', () => {
    const list = parseHolidaysIcs(FIXTURES.holidaysIcs, '2026-10-22');
    expect(list).toContainEqual({ date: '2026-12-16', name: 'Victory Day', name_bn: 'বিজয় দিবস', type: 'public' });
    expect(list).toContainEqual(expect.objectContaining({ date: '2026-10-21', name: 'Durga Puja' }));
    expect(list.some((h) => h.name === 'Halloween')).toBe(false); // observance, not a holiday
    expect(list.every((h) => h.date >= '2026-01-01')).toBe(true);
    expect(list.filter((h) => !h.name_bn)).toEqual([]);
  });
});

describe('findRatesDocument', () => {
  it('finds the profit-rate document the curated table was read from', () => {
    expect(findRatesDocument(FIXTURES.nsdSchemes)).toBe(SAVINGS_NOTICE.documentUrl);
    // The notices page's newest rate notice is the last extension the table accounts for.
    const newest = latestRateNotice(FIXTURES.nsdNotices);
    expect(newest?.date).toBe('2026-07-02');
    expect(newest?.date).toBe(SAVINGS_NOTICE.extendedBy?.at(-1)?.issued);
    expect(newest?.url).toBe(SAVINGS_NOTICE.extendedBy?.at(-1)?.url);
  });
});
