import { TCB_ITEMS, type LatestEntry } from '@bdnumbers/shared';
import { describe, expect, it } from 'vitest';
import { midpoints } from './chart';
import { COMMODITIES, commodityItems } from './commodities';
import { CURRENCY_PAGES, currencyByCode, midEntry, pegEntry } from './currencies';

const entry = (key: string, value: number, from: number): LatestEntry => ({
  key,
  name_bn: key,
  name_en: key,
  unit: 'BDT',
  category: 'fx',
  source_name: 'Bangladesh Bank',
  source_url: 'https://www.bb.org.bd/',
  value,
  date: '2026-10-25',
  fetched_at: null,
  checked_at: null,
  stale: false,
  overridden: false,
  meta: null,
  change: { prev: { from, date: '2026-10-23', abs: value - from, pct: ((value - from) / from) * 100 }, d7: null, d30: null, y1: null },
});

describe('commodity pages', () => {
  it('cover every TCB item exactly once', () => {
    const ids = COMMODITIES.flatMap((c) => commodityItems(c).map((i) => i.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(TCB_ITEMS.map((i) => i.id).sort());
  });
  it('have unique slugs', () => {
    expect(new Set(COMMODITIES.map((c) => c.slug)).size).toBe(COMMODITIES.length);
  });
});

describe('currency pages', () => {
  it('have unique codes and slugs', () => {
    expect(new Set(CURRENCY_PAGES.map((c) => c.code)).size).toBe(CURRENCY_PAGES.length);
    expect(new Set(CURRENCY_PAGES.map((c) => c.slug)).size).toBe(CURRENCY_PAGES.length);
  });
  it('restate the dollar in a pegged currency', () => {
    const sar = pegEntry(entry('usd_bdt_avg', 123.75, 123.0), currencyByCode('sar')!);
    expect(sar.key).toBe('sar_bdt_peg');
    expect(sar.value).toBeCloseTo(33);
    expect(sar.change.prev?.from).toBeCloseTo(32.8);
    expect(sar.change.prev?.abs).toBeCloseTo(0.2);
    // A peg leaves the percentage change as it is.
    expect(sar.change.prev?.pct).toBeCloseTo((0.75 / 123) * 100);
  });
  it('take the midpoint of a cross rate', () => {
    const eur = midEntry(entry('eur_bdt_bid', 138, 137), entry('eur_bdt_ask', 140, 139), currencyByCode('eur')!);
    expect(eur.value).toBe(139);
    expect(eur.change.prev).toMatchObject({ from: 138, abs: 1 });
    expect(eur.change.d7).toBeNull();
  });
});

describe('midpoints', () => {
  it('pairs dates both series have', () => {
    expect(
      midpoints(
        [
          ['2026-10-20', 10],
          ['2026-10-21', 12],
        ],
        [
          ['2026-10-21', 14],
          ['2026-10-22', 20],
        ],
      ),
    ).toEqual([['2026-10-21', 13]]);
  });
});
