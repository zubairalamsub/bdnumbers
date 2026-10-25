// One page per currency (/currency/<slug>). Two kinds:
// - Bangladesh Bank's cross rates ({code}_bdt_bid / _ask in the API), shown as published.
// - Gulf currencies with a fixed official peg to the US dollar, which Bangladesh Bank doesn't list. Their taka
//   rate is Bangladesh Bank's dollar rate divided by the peg, worked out at build time and labelled as such.
import type { LatestEntry } from '@bdnumbers/shared';

export interface CurrencyPage {
  code: string;
  slug: string;
  bn: string;
  en: string;
  /** Where it is used, for the page text (Bengali in the genitive: "সৌদি আরবের"). */
  where: { bn: string; en: string };
  /** Units of this currency per US dollar under its official peg; absent for Bangladesh Bank cross rates. */
  peg?: { perUsd: number; bank: { bn: string; en: string }; since: number };
}

export const CURRENCY_PAGES: readonly CurrencyPage[] = [
  {
    code: 'sar',
    slug: 'saudi-riyal',
    bn: 'সৌদি রিয়াল',
    en: 'Saudi Riyal',
    where: { bn: 'সৌদি আরবের', en: 'Saudi Arabia' },
    peg: { perUsd: 3.75, bank: { bn: 'সৌদি কেন্দ্রীয় ব্যাংক (সামা)', en: 'the Saudi Central Bank (SAMA)' }, since: 1986 },
  },
  {
    code: 'aed',
    slug: 'uae-dirham',
    bn: 'দুবাই দিরহাম',
    en: 'UAE Dirham',
    where: { bn: 'সংযুক্ত আরব আমিরাতের (দুবাই, আবুধাবি)', en: 'the United Arab Emirates (Dubai, Abu Dhabi)' },
    peg: { perUsd: 3.6725, bank: { bn: 'সংযুক্ত আরব আমিরাতের কেন্দ্রীয় ব্যাংক', en: 'the Central Bank of the UAE' }, since: 1997 },
  },
  {
    code: 'qar',
    slug: 'qatari-riyal',
    bn: 'কাতারি রিয়াল',
    en: 'Qatari Riyal',
    where: { bn: 'কাতারের', en: 'Qatar' },
    peg: { perUsd: 3.64, bank: { bn: 'কাতার কেন্দ্রীয় ব্যাংক', en: 'Qatar Central Bank' }, since: 2001 },
  },
  {
    code: 'omr',
    slug: 'omani-rial',
    bn: 'ওমানি রিয়াল',
    en: 'Omani Rial',
    where: { bn: 'ওমানের', en: 'Oman' },
    peg: { perUsd: 0.3845, bank: { bn: 'ওমানের কেন্দ্রীয় ব্যাংক', en: 'the Central Bank of Oman' }, since: 1986 },
  },
  {
    code: 'bhd',
    slug: 'bahraini-dinar',
    bn: 'বাহরাইনি দিনার',
    en: 'Bahraini Dinar',
    where: { bn: 'বাহরাইনের', en: 'Bahrain' },
    peg: { perUsd: 0.376, bank: { bn: 'বাহরাইনের কেন্দ্রীয় ব্যাংক', en: 'the Central Bank of Bahrain' }, since: 2001 },
  },
  { code: 'eur', slug: 'euro', bn: 'ইউরো', en: 'Euro', where: { bn: 'ইউরো অঞ্চলের দেশগুলোর (ইতালি, ফ্রান্স, জার্মানি, স্পেন প্রভৃতি)', en: 'the euro area (Italy, France, Germany, Spain and others)' } },
  { code: 'gbp', slug: 'british-pound', bn: 'ব্রিটিশ পাউন্ড', en: 'British Pound', where: { bn: 'যুক্তরাজ্যের', en: 'the United Kingdom' } },
  { code: 'inr', slug: 'indian-rupee', bn: 'ভারতীয় রুপি', en: 'Indian Rupee', where: { bn: 'ভারতের', en: 'India' } },
  { code: 'sgd', slug: 'singapore-dollar', bn: 'সিঙ্গাপুর ডলার', en: 'Singapore Dollar', where: { bn: 'সিঙ্গাপুরের', en: 'Singapore' } },
  { code: 'cad', slug: 'canadian-dollar', bn: 'কানাডিয়ান ডলার', en: 'Canadian Dollar', where: { bn: 'কানাডার', en: 'Canada' } },
  { code: 'aud', slug: 'australian-dollar', bn: 'অস্ট্রেলিয়ান ডলার', en: 'Australian Dollar', where: { bn: 'অস্ট্রেলিয়ার', en: 'Australia' } },
  { code: 'jpy', slug: 'japanese-yen', bn: 'জাপানি ইয়েন', en: 'Japanese Yen', where: { bn: 'জাপানের', en: 'Japan' } },
  { code: 'cnh', slug: 'chinese-yuan', bn: 'চীনা ইউয়ান', en: 'Chinese Yuan', where: { bn: 'চীনের', en: 'China' } },
  { code: 'sek', slug: 'swedish-krona', bn: 'সুইডিশ ক্রোনা', en: 'Swedish Krona', where: { bn: 'সুইডেনের', en: 'Sweden' } },
  { code: 'lkr', slug: 'sri-lankan-rupee', bn: 'শ্রীলঙ্কান রুপি', en: 'Sri Lankan Rupee', where: { bn: 'শ্রীলঙ্কার', en: 'Sri Lanka' } },
];

export const currencyPath = (c: CurrencyPage) => `/currency/${c.slug}`;

export function currencyByCode(code: string): CurrencyPage | undefined {
  return CURRENCY_PAGES.find((c) => c.code === code);
}

type Period = keyof LatestEntry['change'];
const PERIODS: readonly Period[] = ['prev', 'd7', 'd30', 'y1'];

// Derived entries get keys the API doesn't have, so a page's live refresh leaves them alone; the site
// rebuilds whenever the rates behind them change.

/**
 * A dollar entry restated in a pegged currency: every value and change divided by the peg (percentages are
 * unchanged).
 */
export function pegEntry(usd: LatestEntry, c: CurrencyPage): LatestEntry {
  const per = c.peg!.perUsd;
  const change = Object.fromEntries(
    PERIODS.map((p) => {
      const ch = usd.change[p];
      return [p, ch ? { ...ch, from: ch.from / per, abs: ch.abs / per } : null];
    }),
  ) as LatestEntry['change'];
  return {
    ...usd,
    key: `${c.code}_bdt_peg`,
    name_bn: `${c.bn} রেট (ডলারের গড় রেট থেকে হিসাব)`,
    name_en: `${c.en} rate (worked out from the dollar's average rate)`,
    value: usd.value / per,
    change,
  };
}

/** The midpoint of a cross rate's bid and ask, the "average" the currency converter uses too. */
export function midEntry(bid: LatestEntry, ask: LatestEntry, c: CurrencyPage): LatestEntry {
  const value = (bid.value + ask.value) / 2;
  const change = Object.fromEntries(
    PERIODS.map((p) => {
      const a = bid.change[p];
      const b = ask.change[p];
      if (!a || !b) return [p, null];
      const from = (a.from + b.from) / 2;
      return [p, { from, date: b.date, abs: value - from, pct: from ? ((value - from) / from) * 100 : null }];
    }),
  ) as LatestEntry['change'];
  return {
    ...ask,
    key: `${c.code}_bdt_mid`,
    name_bn: `${c.bn} রেট (বিড ও আস্কের গড়)`,
    name_en: `${c.en} rate (mid of bid and ask)`,
    value,
    change,
  };
}
