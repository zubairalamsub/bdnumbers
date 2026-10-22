import type { Category } from './types';

export type Lang = 'bn' | 'en';

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';

export function toBengaliDigits(s: string): string {
  return s.replace(/\d/g, (d) => BN_DIGITS[Number(d)]!);
}

/**
 * Format with South Asian grouping (2,26,340). Bengali uses Bengali digits. Done by hand rather than
 * via the bn-BD locale so output doesn't depend on the runtime's ICU data.
 */
export function formatNumber(value: number, lang: Lang, maxFractionDigits = Math.abs(value) < 10 ? 4 : 2): string {
  const s = new Intl.NumberFormat('en-IN', { maximumFractionDigits: maxFractionDigits }).format(value);
  return lang === 'bn' ? toBengaliDigits(s) : s;
}

const MONTHS: Record<Lang, readonly string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  bn: ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'],
};

/** "2026-10-19" → "19 Oct 2026" / "১৯ অক্টোবর ২০২৬". */
export function formatDate(date: string, lang: Lang): string {
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  const s = `${d} ${MONTHS[lang][(m ?? 1) - 1]} ${y}`;
  return lang === 'bn' ? toBengaliDigits(s) : s;
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
