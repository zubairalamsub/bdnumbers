import type { Lang } from '@bdnumbers/shared';

/** Path of a page in a language: '/dollar-rate-today' → '/en/dollar-rate-today'. Bengali lives at the root. */
export function localePath(lang: Lang, path: string): string {
  if (lang === 'bn') return path;
  return path === '/' ? '/en' : `/en${path}`;
}

const bn = {
  tagline: 'বাংলাদেশের আজকের ডলার রেট, সোনা-রুপার দাম',
  nav: { home: 'হোম', dollar: 'ডলার রেট', gold: 'সোনার দাম', silver: 'রুপার দাম', status: 'ডেটার অবস্থা' },
  otherLang: 'English',
  digitsLabel: 'সংখ্যা দেখান',
  digitsBeng: 'বাংলা অঙ্কে',
  digitsLatn: 'ইংরেজি অঙ্কে',
  breadcrumbs: 'পথনির্দেশ',
  asOf: 'তারিখ',
  updated: 'হালনাগাদ',
  stale: 'পুরোনো তথ্য',
  staleHint: 'সর্বশেষ চেষ্টায় উৎস থেকে নতুন তথ্য পাওয়া যায়নি; শেষ পাওয়া মান দেখানো হচ্ছে।',
  mirror: 'সংবাদমাধ্যম থেকে',
  mirrorHint: 'মূল উৎস সাময়িকভাবে পাওয়া যায়নি, তাই সংবাদমাধ্যমে প্রকাশিত দাম দেখানো হচ্ছে।',
  source: 'উৎস',
  up: 'বেড়েছে',
  down: 'কমেছে',
  unchanged: 'অপরিবর্তিত',
  vs: { prev: 'আগেরবারের তুলনায়', d7: '৭ দিনে', d30: '৩০ দিনে', y1: '১ বছরে' },
  period: 'সময়',
  change: 'পরিবর্তন',
  ranges: { '30': '৩০ দিন', '90': '৯০ দিন', '365': '১ বছর', all: 'সব' },
  rangeLabel: 'সময়সীমা',
  chartEmpty: 'চার্টের জন্য যথেষ্ট ইতিহাস এখনো জমেনি।',
  history: 'পুরো ইতিহাস ও CSV',
  downloadCsv: 'CSV ডাউনলোড',
  related: 'আরও দেখুন',
  table: { currency: 'মুদ্রা', bid: 'বিড (ক্রয়)', ask: 'আস্ক (বিক্রয়)', purity: 'মান', perBhori: 'প্রতি ভরি', perGram: 'প্রতি গ্রাম', date: 'তারিখ', value: 'মান' },
  karats: { '22k': '২২ ক্যারেট', '21k': '২১ ক্যারেট', '18k': '১৮ ক্যারেট', traditional: 'সনাতন পদ্ধতি' },
  footer:
    'তথ্য বাংলাদেশ ব্যাংক, বাজুসসহ প্রাতিষ্ঠানিক উৎস থেকে স্বয়ংক্রিয়ভাবে সংগ্রহ করা হয়। লেনদেনের আগে মূল উৎস যাচাই করুন।',
  notFound: 'পাতাটি পাওয়া যায়নি',
  status: {
    source: 'উৎস',
    result: 'সর্বশেষ ফল',
    lastRun: 'সর্বশেষ চেষ্টা',
    lastOk: 'সর্বশেষ সফল',
    failures: '২৪ ঘণ্টায় ব্যর্থ',
    staleSeries: 'পুরোনো সিরিজ',
    ok: 'ঠিক আছে',
    failed: 'ব্যর্থ',
    never: 'এখনো চলেনি',
    none: 'নেই',
  },
};

type Strings = typeof bn;

const en: Strings = {
  tagline: "Today's dollar rate and gold and silver prices in Bangladesh",
  nav: { home: 'Home', dollar: 'Dollar rate', gold: 'Gold price', silver: 'Silver price', status: 'Data status' },
  otherLang: 'বাংলা',
  digitsLabel: 'Show numbers',
  digitsBeng: 'in Bengali digits',
  digitsLatn: 'in English digits',
  breadcrumbs: 'Breadcrumbs',
  asOf: 'As of',
  updated: 'Updated',
  stale: 'Stale',
  staleHint: 'The source did not respond on the last attempt; showing the last value received.',
  mirror: 'From news reports',
  mirrorHint: 'The official source was unavailable, so these prices come from published news reports.',
  source: 'Source',
  up: 'up',
  down: 'down',
  unchanged: 'unchanged',
  vs: { prev: 'vs previous', d7: '7 days', d30: '30 days', y1: '1 year' },
  period: 'Period',
  change: 'Change',
  ranges: { '30': '30D', '90': '90D', '365': '1Y', all: 'All' },
  rangeLabel: 'Time range',
  chartEmpty: 'Not enough history for a chart yet.',
  history: 'Full history & CSV',
  downloadCsv: 'Download CSV',
  related: 'See also',
  table: { currency: 'Currency', bid: 'Bid', ask: 'Ask', purity: 'Purity', perBhori: 'Per bhori', perGram: 'Per gram', date: 'Date', value: 'Value' },
  karats: { '22k': '22 karat', '21k': '21 karat', '18k': '18 karat', traditional: 'Traditional' },
  footer:
    'Figures are collected automatically from Bangladesh Bank, BAJUS and other institutional sources. Check the original source before you transact.',
  notFound: 'Page not found',
  status: {
    source: 'Source',
    result: 'Last result',
    lastRun: 'Last attempt',
    lastOk: 'Last success',
    failures: 'Failures (24 h)',
    staleSeries: 'Stale series',
    ok: 'OK',
    failed: 'Failed',
    never: 'Not run yet',
    none: 'None',
  },
};

export const STRINGS: Record<Lang, Strings> = { bn, en };
