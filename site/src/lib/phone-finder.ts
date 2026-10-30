// The phone finder on /mobile-price: filters (name, budget, brand, official only), sort, and the markup of
// one result row. Shared by the build (the first rows are in the HTML) and the browser (everything after),
// so both draw the same rows.
import { formatNumber, type Digits, type Lang } from '@bdnumbers/shared';

/** One phone, kept short because the page carries all of them: name, link, brand id, official and other lowest price, shops. */
export type FinderPhone = [name: string, href: string, brand: string, official: number | null, other: number | null, shops: number];

export interface Budget {
  id: string;
  min: number;
  max: number;
  bn: string;
  en: string;
}

/** Budget bands, in taka, as phone shops in Bangladesh usually group them. */
export const BUDGETS: readonly Budget[] = [
  { id: 'all', min: 0, max: Infinity, bn: 'সব দাম', en: 'Any price' },
  { id: 'u15', min: 0, max: 15_000, bn: '১৫ হাজার পর্যন্ত', en: 'Up to Tk 15k' },
  { id: '15-25', min: 15_000, max: 25_000, bn: '১৫–২৫ হাজার', en: 'Tk 15k–25k' },
  { id: '25-40', min: 25_000, max: 40_000, bn: '২৫–৪০ হাজার', en: 'Tk 25k–40k' },
  { id: '40-70', min: 40_000, max: 70_000, bn: '৪০–৭০ হাজার', en: 'Tk 40k–70k' },
  { id: '70-120', min: 70_000, max: 120_000, bn: '৭০ হাজার–১.২ লাখ', en: 'Tk 70k–120k' },
  { id: 'o120', min: 120_000, max: Infinity, bn: '১.২ লাখের বেশি', en: 'Over Tk 120k' },
];

export type FinderSort = 'popular' | 'low' | 'high';

export interface FinderState {
  query: string;
  budget: string;
  /** Brand id, or '' for every brand. */
  brand: string;
  sort: FinderSort;
  /** Official prices only. */
  official: boolean;
}

export const DEFAULT_FINDER: FinderState = { query: '', budget: 'all', brand: '', sort: 'popular', official: false };

/** Rows shown at first, and added by each "show more". */
export const FINDER_PAGE = 20;

/** The price a phone is listed and sorted by: its lowest in-stock price, or its lowest official one. */
export function finderPrice(p: FinderPhone, official: boolean): number | null {
  if (official) return p[3];
  if (p[3] === null) return p[4];
  return p[4] === null ? p[3] : Math.min(p[3], p[4]);
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9.]+/g, '');

/** "Galaxy A57", "galaxya57" and "a57" all find "Samsung Galaxy A57 5G": each typed word must match the name from the start of one of its words. */
export function matchesName(name: string, query: string): boolean {
  const typed = query.trim().split(/\s+/).map(norm).filter(Boolean);
  if (typed.length === 0) return true;
  const words = name.split(/\s+/).map(norm);
  const starts = words.map((_, i) => words.slice(i).join(''));
  return typed.every((t) => starts.some((s) => s.startsWith(t)));
}

export function findPhones(phones: readonly FinderPhone[], s: FinderState): FinderPhone[] {
  const budget = BUDGETS.find((b) => b.id === s.budget) ?? BUDGETS[0]!;
  const found = phones.filter((p) => {
    if (s.brand && p[2] !== s.brand) return false;
    if (!matchesName(p[0], s.query)) return false;
    const price = finderPrice(p, s.official);
    if (price === null) return !s.official && budget.id === 'all';
    return price >= budget.min && price < budget.max;
  });
  // Phones out of stock everywhere (no price) always come last.
  const priceOrder = (a: FinderPhone, b: FinderPhone, dir: 1 | -1) => {
    const pa = finderPrice(a, s.official);
    const pb = finderPrice(b, s.official);
    if (pa === null || pb === null) return Number(pa === null) - Number(pb === null);
    return (pa - pb) * dir;
  };
  return found.sort((a, b) => {
    if (s.sort === 'popular') return b[5] - a[5] || priceOrder(a, b, 1) || a[0].localeCompare(b[0]);
    return priceOrder(a, b, s.sort === 'low' ? 1 : -1) || a[0].localeCompare(b[0]);
  });
}

export interface RowText {
  official: string;
  other: string;
  out: string;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** One result: name and brand with how many shops have it, then its price and which kind it is. */
export function finderRow(
  p: FinderPhone,
  o: { lang: Lang; digits: Digits; brands: Readonly<Record<string, string>>; text: RowText; official: boolean },
): string {
  const n = (v: number) => `<span data-num="${v}" data-fd="0">${formatNumber(v, o.digits, 0)}</span>`;
  const price = finderPrice(p, o.official);
  const shops = p[5] === 0 ? o.text.out : o.lang === 'bn' ? `${n(p[5])}টি দোকানে` : `${n(p[5])} shop${p[5] === 1 ? '' : 's'}`;
  const note =
    price === null ? '' : !o.official && p[3] !== null && p[3] !== price ? `${o.text.official} ৳${n(p[3])}` : price === p[3] ? o.text.official : o.text.other;
  return (
    `<li><a href="${esc(p[1])}" class="flex items-center justify-between gap-3 px-4 py-2.5 text-ink no-underline hover:bg-page">` +
    `<span class="min-w-0"><span class="block font-medium">${esc(p[0])}</span>` +
    `<span class="block text-xs text-muted">${esc(o.brands[p[2]] ?? p[2])} · ${shops}</span></span>` +
    `<span class="shrink-0 text-right"><span class="block font-semibold">${price === null ? `<span class="font-normal text-muted">${o.text.out}</span>` : `৳${n(price)}`}</span>` +
    `<span class="block text-xs text-muted">${note}</span></span></a></li>`
  );
}

/** "123 phones" in the page's language and digits. */
export const finderCount = (count: number, lang: Lang, digits: Digits) =>
  lang === 'bn' ? `${formatNumber(count, digits, 0)}টি ফোন` : `${formatNumber(count, digits, 0)} phone${count === 1 ? '' : 's'}`;
