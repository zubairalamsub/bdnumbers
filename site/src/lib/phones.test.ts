import type { PhoneHistoryResponse, PhoneModel } from '@bdnumbers/shared';
import { describe, expect, it } from 'vitest';
import { byBrand, lowestPrice, popular, priceHistory } from './phones';
import { phonePages } from './site-pages';

const model = (o: Partial<PhoneModel> & Pick<PhoneModel, 'key' | 'brand'>): PhoneModel => ({
  slug: o.key,
  name: o.key,
  official: null,
  other: null,
  shops: 1,
  offers: [],
  first_seen: '2026-10-25',
  ...o,
});

describe('phone models', () => {
  it('lowest price takes either kind, or none when out of stock everywhere', () => {
    expect(lowestPrice(model({ key: 'a', brand: 'samsung', official: 52999, other: 47500 }))).toBe(47500);
    expect(lowestPrice(model({ key: 'b', brand: 'samsung', official: 52999 }))).toBe(52999);
    expect(lowestPrice(model({ key: 'c', brand: 'samsung', shops: 0 }))).toBeNull();
  });

  it('groups by brand, best-selling brands first, cheapest first, out of stock last', () => {
    const groups = byBrand([
      model({ key: 'x', brand: 'xiaomi', other: 20000 }),
      model({ key: 'gone', brand: 'samsung', shops: 0 }),
      model({ key: 'dear', brand: 'samsung', official: 90000 }),
      model({ key: 'cheap', brand: 'samsung', other: 15000 }),
      model({ key: 'i', brand: 'apple', other: 150000 }),
    ]);
    expect(groups.map((g) => g.brand.id)).toEqual(['apple', 'samsung', 'xiaomi']);
    expect(groups[1]!.models.map((m) => m.key)).toEqual(['cheap', 'dear', 'gone']);
  });

  it('picks the phones most shops carry for a short list', () => {
    const models = [
      model({ key: 'one', brand: 'honor', other: 10000, shops: 1 }),
      model({ key: 'four', brand: 'honor', other: 30000, shops: 4 }),
      model({ key: 'three', brand: 'honor', other: 20000, shops: 3 }),
    ];
    expect(popular(models, 2).map((m) => m.key)).toEqual(['three', 'four']);
  });
});

describe('priceHistory', () => {
  const history: PhoneHistoryResponse = {
    generated_at: '',
    daily: {
      a57: [
        ['2026-10-25', 52999, 47500],
        ['2026-10-27', 52999, 44999],
      ],
      pixel: [
        ['2026-10-25', null, 90000],
        ['2026-10-26', null, null],
        ['2026-10-27', null, 88000],
      ],
    },
    changes: {},
  };

  it('fills in every day up to today from the days a price moved', () => {
    expect(priceHistory(history, 'a57', '2026-10-28')).toEqual({
      kind: 'official',
      points: [
        ['2026-10-25', 52999],
        ['2026-10-26', 52999],
        ['2026-10-27', 52999],
        ['2026-10-28', 52999],
      ],
    });
  });

  it('charts the unofficial price when there has never been an official one, skipping days out of stock', () => {
    expect(priceHistory(history, 'pixel', '2026-10-27')).toEqual({
      kind: 'other',
      points: [
        ['2026-10-25', 90000],
        ['2026-10-27', 88000],
      ],
    });
    expect(priceHistory(history, 'unknown', '2026-10-27').points).toEqual([]);
  });
});

describe('phonePages', () => {
  it('lists each brand and model page with when a price on it last changed', () => {
    const offer = (changed_at: string) => ({
      shop: 'rio',
      url: 'u',
      name: 'n',
      variant: null,
      kind: null,
      price: 1,
      high: null,
      stock: 'in' as const,
      seen_at: changed_at,
      changed_at,
    });
    const pages = phonePages({
      generated_at: '2026-10-25T10:00:00Z',
      models: [
        model({ key: 'a', slug: 'samsung-galaxy-a57-5g', brand: 'samsung', offers: [offer('2026-10-24T01:00:00Z'), offer('2026-10-25T02:00:00Z')] }),
        model({ key: 'b', slug: 'samsung-galaxy-a37', brand: 'samsung', offers: [offer('2026-10-20T01:00:00Z')] }),
      ],
    });
    expect(pages).toEqual([
      { path: '/mobile-price/brand/samsung', lastmod: { date: '2026-10-25T02:00:00Z' } },
      { path: '/mobile-price/samsung-galaxy-a57-5g', lastmod: { date: '2026-10-25T02:00:00Z' } },
      { path: '/mobile-price/samsung-galaxy-a37', lastmod: { date: '2026-10-20T01:00:00Z' } },
    ]);
  });
});
