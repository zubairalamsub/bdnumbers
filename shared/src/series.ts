import type { SeriesDef } from './types';

/** Grams in one bhori (tola), the unit Bangladeshi gold prices are quoted in. */
export const BHORI_GRAMS = 11.664;

export const BB_EXCHANGE_URL = 'https://www.bb.org.bd/en/index.php/econdata/exchangerate';
export const BAJUS_GOLD_URL = 'https://www.bajus.org/gold-price';

const BB = {
  source_name: 'Bangladesh Bank',
  source_url: BB_EXCHANGE_URL,
  cadence: 'daily',
  category: 'fx',
  source_key: 'bangladeshBank',
} as const;

const BAJUS = {
  source_name: 'BAJUS',
  source_url: BAJUS_GOLD_URL,
  cadence: 'daily',
  source_key: 'bajusGold',
} as const;

const USD: SeriesDef[] = [
  { ...BB, key: 'usd_bdt_low', name_bn: 'ডলার রেট (বিড)', name_en: 'US Dollar rate (bid)', unit: 'BDT', bounds: [80, 250] },
  { ...BB, key: 'usd_bdt_high', name_bn: 'ডলার রেট (আস্ক)', name_en: 'US Dollar rate (ask)', unit: 'BDT', bounds: [80, 250] },
  { ...BB, key: 'usd_bdt_avg', name_bn: 'ডলার রেট (গড়)', name_en: 'US Dollar rate (weighted average)', unit: 'BDT', bounds: [80, 250] },
];

/** Cross currencies Bangladesh Bank lists, with rough BDT bounds (about 2.5x either side of 2026 levels). */
const CROSS: Record<string, { bn: string; en: string; bounds: readonly [number, number] }> = {
  // Not a cross rate (USD has its own series above); listed so currencyName() covers it.
  usd: { bn: 'মার্কিন ডলার', en: 'US Dollar', bounds: [80, 250] },
  eur: { bn: 'ইউরো', en: 'Euro', bounds: [55, 350] },
  gbp: { bn: 'ব্রিটিশ পাউন্ড', en: 'British Pound', bounds: [65, 410] },
  aud: { bn: 'অস্ট্রেলিয়ান ডলার', en: 'Australian Dollar', bounds: [34, 215] },
  jpy: { bn: 'জাপানি ইয়েন', en: 'Japanese Yen', bounds: [0.3, 2] },
  cad: { bn: 'কানাডিয়ান ডলার', en: 'Canadian Dollar', bounds: [35, 220] },
  sek: { bn: 'সুইডিশ ক্রোনা', en: 'Swedish Krona', bounds: [5, 31] },
  sgd: { bn: 'সিঙ্গাপুর ডলার', en: 'Singapore Dollar', bounds: [38, 240] },
  cnh: { bn: 'চীনা ইউয়ান', en: 'Chinese Yuan (offshore)', bounds: [7, 46] },
  inr: { bn: 'ভারতীয় রুপি', en: 'Indian Rupee', bounds: [0.5, 3.3] },
  lkr: { bn: 'শ্রীলঙ্কান রুপি', en: 'Sri Lankan Rupee', bounds: [1, 6.7] },
};

const FX_KEY = /^([a-z]{3})_bdt_(bid|ask)$/;

/** Series definition for a Bangladesh Bank cross rate. Works for currencies BB adds later, too. */
export function crossRateDef(ccy: string, side: 'bid' | 'ask'): SeriesDef {
  const code = ccy.toLowerCase();
  const known = CROSS[code];
  const nameBn = known?.bn ?? code.toUpperCase();
  const nameEn = known?.en ?? code.toUpperCase();
  return {
    ...BB,
    key: `${code}_bdt_${side}`,
    name_bn: `${nameBn} রেট (${side === 'bid' ? 'বিড' : 'আস্ক'})`,
    name_en: `${nameEn} rate (${side})`,
    unit: 'BDT',
    ...(known ? { bounds: known.bounds } : {}),
  };
}

const KARATS = [
  { k: '22k', bn: '২২ ক্যারেট', en: '22 karat' },
  { k: '21k', bn: '২১ ক্যারেট', en: '21 karat' },
  { k: '18k', bn: '১৮ ক্যারেট', en: '18 karat' },
  { k: 'traditional', bn: 'সনাতন পদ্ধতি', en: 'traditional' },
] as const;

export type Karat = (typeof KARATS)[number]['k'];
export const KARAT_ORDER: readonly Karat[] = KARATS.map((k) => k.k);

const GOLD: SeriesDef[] = KARATS.map(({ k, bn, en }) => ({
  ...BAJUS,
  key: `gold_${k}`,
  category: 'gold',
  name_bn: `সোনার দাম (${bn})`,
  name_en: `Gold price (${en})`,
  unit: 'BDT/bhori',
  bounds: [50_000, 1_000_000],
}));

const SILVER: SeriesDef[] = KARATS.map(({ k, bn, en }) => ({
  ...BAJUS,
  key: `silver_${k}`,
  category: 'silver',
  name_bn: `রুপার দাম (${bn})`,
  name_en: `Silver price (${en})`,
  unit: 'BDT/bhori',
  bounds: [500, 50_000],
}));

/** Display name of a currency code, e.g. ('eur', 'bn') → 'ইউরো'. Unknown codes return the code. */
export function currencyName(ccy: string, lang: 'bn' | 'en'): string {
  return CROSS[ccy.toLowerCase()]?.[lang] ?? ccy.toUpperCase();
}

export const SERIES: readonly SeriesDef[] = [
  ...USD,
  ...Object.keys(CROSS)
    .filter((c) => c !== 'usd')
    .flatMap((c) => [crossRateDef(c, 'bid'), crossRateDef(c, 'ask')]),
  ...GOLD,
  ...SILVER,
];

const BY_KEY = new Map(SERIES.map((s) => [s.key, s]));

/** Look up a series by key. Unknown `{ccy}_bdt_bid|ask` keys resolve to a generated cross-rate definition. */
export function getSeriesDef(key: string): SeriesDef | undefined {
  const known = BY_KEY.get(key);
  if (known) return known;
  const fx = FX_KEY.exec(key);
  // USD has its own low/high/avg series; usd_bdt_bid/ask are not valid keys.
  return fx && fx[1] !== 'usd' ? crossRateDef(fx[1]!, fx[2] as 'bid' | 'ask') : undefined;
}
