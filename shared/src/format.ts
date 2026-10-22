import type { Category } from './types';

export type Lang = 'bn' | 'en';
/** Numbering system: Bengali digits (০১২) or Latin digits (012). Independent of the page language. */
export type Digits = 'beng' | 'latn';

export const defaultDigits = (lang: Lang): Digits => (lang === 'bn' ? 'beng' : 'latn');

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';

export function toBengaliDigits(s: string): string {
  return s.replace(/\d/g, (d) => BN_DIGITS[Number(d)]!);
}

export function toLatinDigits(s: string): string {
  return s.replace(/[০-৯]/g, (d) => String(d.charCodeAt(0) - 0x09e6));
}

const withDigits = (s: string, digits: Digits) => (digits === 'beng' ? toBengaliDigits(s) : s);

/**
 * Format with South Asian grouping (2,26,340). Done with en-IN plus digit substitution rather than
 * the bn-BD locale so output doesn't depend on the runtime's ICU data.
 */
export function formatNumber(value: number, digits: Digits, maxFractionDigits = 2, minFractionDigits = 0): string {
  const s = new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: maxFractionDigits,
    minimumFractionDigits: minFractionDigits,
  }).format(value);
  return withDigits(s, digits);
}

/** Fraction digits for a series value: rates to 2 places (4 below 10, e.g. JPY), prices whole. */
export function fractionDigits(category: Category, value: number): number {
  if (category !== 'fx') return 0;
  return Math.abs(value) < 10 ? 4 : 2;
}

export function formatSeriesValue(value: number, category: Category, digits: Digits): string {
  const fd = fractionDigits(category, value);
  return formatNumber(value, digits, fd, fd);
}

const MONTHS: Record<Lang, readonly string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  bn: ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'],
};

/** "2026-10-19" → "19 Oct 2026" / "১৯ অক্টোবর ২০২৬". */
export function formatDate(date: string, lang: Lang, digits: Digits = defaultDigits(lang)): string {
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  return withDigits(`${d} ${MONTHS[lang][(m ?? 1) - 1]} ${y}`, digits);
}

/** "19 Oct" / "১৯ অক্টোবর", for chart axes. */
export function formatShortDate(date: string, lang: Lang, digits: Digits = defaultDigits(lang)): string {
  const [, m, d] = date.slice(0, 10).split('-').map(Number);
  return withDigits(`${d} ${MONTHS[lang][(m ?? 1) - 1]}`, digits);
}

/** "5 minutes ago" / "৫ মিনিট আগে". */
export function relativeTime(iso: string, lang: Lang, digits: Digits = defaultDigits(lang), now = Date.now()): string {
  const seconds = (Date.parse(iso) - now) / 1000;
  const abs = Math.abs(seconds);
  const rtf = new Intl.RelativeTimeFormat(`${lang}-u-nu-${digits}`, { numeric: 'auto' });
  if (abs < 60) return rtf.format(0, 'second');
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), 'hour');
  return rtf.format(Math.round(seconds / 86400), 'day');
}

const UNIT_LABELS: Record<string, Record<Lang, string>> = {
  BDT: { bn: 'টাকা', en: 'Tk' },
  'BDT/bhori': { bn: 'টাকা/ভরি', en: 'Tk/bhori' },
};

export function unitLabel(unit: string, lang: Lang): string {
  return UNIT_LABELS[unit]?.[lang] ?? unit;
}

/** Evergreen site page for each category (Bengali at the root, English under /en). */
export const CATEGORY_PAGE: Record<Category, string> = {
  fx: '/dollar-rate-today',
  gold: '/gold-price-today',
  silver: '/silver-price-today',
};

export function pageUrl(siteUrl: string, category: Category, lang: Lang): string {
  return `${siteUrl}${lang === 'en' ? '/en' : ''}${CATEGORY_PAGE[category]}`;
}
