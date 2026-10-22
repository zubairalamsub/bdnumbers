import { BPC_FUEL_URL, FUEL_ITEMS, HOLIDAYS_ICS_URL, LPG_SERIES, NSD_SCHEMES_URL, UNB_LPG_SEARCH_URL } from './catalog/periodic';
import { TCB_ITEMS, TCB_LIST_URL } from './catalog/tcb';
import { MET_CREDIT_URL, WEATHER_CITIES, WEATHER_METRICS, type WeatherMetric } from './catalog/weather';
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

const TCB = {
  source_name: 'TCB',
  source_url: TCB_LIST_URL,
  cadence: 'daily',
  category: 'market',
  source_key: 'tcbMarketPrices',
} as const;

const MARKET: SeriesDef[] = TCB_ITEMS.flatMap((i) =>
  (['min', 'max'] as const).map(
    (side): SeriesDef => ({
      ...TCB,
      key: `tcb_${i.id}_${side}`,
      name_bn: `${i.bn} (${side === 'min' ? 'সর্বনিম্ন' : 'সর্বোচ্চ'})`,
      name_en: `${i.en} (${side === 'min' ? 'lowest' : 'highest'})`,
      unit: `BDT/${i.unit}`,
      group: i.group,
      bounds: [i.ref / 5, i.ref * 5],
    }),
  ),
);

export const DSE_URL = 'https://www.dse.com.bd/recent-market-information';

const DSE = {
  source_name: 'Dhaka Stock Exchange',
  source_url: DSE_URL,
  cadence: 'daily',
  category: 'stock',
  source_key: 'dseIndex',
} as const;

const STOCK: SeriesDef[] = [
  { ...DSE, key: 'dse_dsex', name_bn: 'ডিএসইএক্স সূচক', name_en: 'DSEX index', unit: 'points', bounds: [1000, 20000] },
  { ...DSE, key: 'dse_dses', name_bn: 'ডিএসইএস (শরিয়াহ) সূচক', name_en: 'DSES (Shariah) index', unit: 'points', bounds: [200, 5000] },
  { ...DSE, key: 'dse_ds30', name_bn: 'ডিএস৩০ সূচক', name_en: 'DS30 index', unit: 'points', bounds: [500, 8000] },
  { ...DSE, key: 'dse_turnover', name_bn: 'ডিএসইতে লেনদেন', name_en: 'DSE turnover', unit: 'BDT crore', bounds: [1, 20000] },
];

const WEATHER: SeriesDef[] = WEATHER_CITIES.flatMap((city) =>
  (Object.keys(WEATHER_METRICS) as WeatherMetric[]).map(
    (metric): SeriesDef => ({
      key: `weather_${city.id}_${metric}`,
      name_bn: `${city.bn}: ${WEATHER_METRICS[metric].bn}`,
      name_en: `${city.en}: ${WEATHER_METRICS[metric].en}`,
      unit: WEATHER_METRICS[metric].unit,
      source_name: 'MET Norway',
      source_url: MET_CREDIT_URL,
      cadence: 'hourly',
      category: 'weather',
      source_key: 'weather',
      group: city.id,
      bounds: WEATHER_METRICS[metric].bounds,
    }),
  ),
);

const FUEL: SeriesDef[] = [
  ...FUEL_ITEMS.map(
    (f): SeriesDef => ({
      key: `fuel_${f.id}`,
      name_bn: `${f.bn}`,
      name_en: `${f.en}`,
      unit: 'BDT/litre',
      source_name: 'BPC',
      source_url: BPC_FUEL_URL,
      cadence: 'periodic',
      category: 'fuel',
      source_key: 'fuelPrices',
      bounds: [f.ref / 3, f.ref * 3],
    }),
  ),
  {
    key: 'lpg_govt_12_5kg',
    name_bn: 'সরকারি এলপিজি (১২.৫ কেজি সিলিন্ডার)',
    name_en: 'Government LPG (12.5 kg cylinder)',
    unit: 'BDT/cylinder',
    source_name: 'BPC',
    source_url: BPC_FUEL_URL,
    cadence: 'periodic',
    category: 'lpg',
    source_key: 'fuelPrices',
    bounds: [200, 5000],
  },
];

const LPG: SeriesDef[] = LPG_SERIES.map(
  (l): SeriesDef => ({
    key: l.key,
    name_bn: l.bn,
    name_en: l.en,
    unit: l.unit,
    source_name: 'BERC (via UNB)',
    source_url: UNB_LPG_SEARCH_URL,
    cadence: 'periodic',
    category: 'lpg',
    source_key: 'lpgPrice',
    bounds: l.bounds,
  }),
);

const PERIODIC_OTHER: SeriesDef[] = [
  {
    key: 'savings_rates',
    name_bn: 'সঞ্চয়পত্রের মুনাফার হার (৫ বছর মেয়াদি, সর্বোচ্চ)',
    name_en: 'Savings certificate rate (5-year, top)',
    unit: '%',
    source_name: 'National Savings Directorate',
    source_url: NSD_SCHEMES_URL,
    cadence: 'periodic',
    category: 'savings',
    source_key: 'savingsRates',
    bounds: [1, 25],
  },
  {
    key: 'holidays_public',
    name_bn: 'সরকারি ছুটি (এ বছর)',
    name_en: 'Public holidays (this year)',
    unit: 'days',
    source_name: 'Google Calendar (Bangladesh holidays)',
    source_url: HOLIDAYS_ICS_URL,
    cadence: 'periodic',
    category: 'holidays',
    source_key: 'holidays',
    bounds: [1, 120],
  },
];

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
  ...MARKET,
  ...STOCK,
  ...WEATHER,
  ...FUEL,
  ...LPG,
  ...PERIODIC_OTHER,
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
