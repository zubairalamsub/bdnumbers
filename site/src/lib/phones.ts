// Mobile phone price pages: paths, grouping by brand, and the price history as chart points.
import {
  PHONE_BRANDS,
  addDays,
  type Lang,
  type PhoneBrand,
  type PhoneHistoryResponse,
  type PhoneKind,
  type PhoneModel,
  type PhoneStock,
} from '@bdnumbers/shared';
import { STRINGS } from '../i18n';
import type { Pt } from './chart';

export const PHONES_PATH = '/mobile-price';
export const phonePath = (m: Pick<PhoneModel, 'slug'>) => `${PHONES_PATH}/${m.slug}`;
export const brandPath = (id: string) => `${PHONES_PATH}/brand/${id}`;

/** The lowest in-stock price, official or not; null when no shop has it in stock. */
export function lowestPrice(m: PhoneModel): number | null {
  const prices = [m.official, m.other].filter((p): p is number => p !== null);
  return prices.length > 0 ? Math.min(...prices) : null;
}

/** Highest price any shop lists for the model (the dearest variant where a shop gives a range). */
export const highestPrice = (m: PhoneModel) => Math.max(...m.offers.map((o) => o.high ?? o.price));

/** In stock somewhere first, then cheapest first. */
export function byPrice(a: PhoneModel, b: PhoneModel): number {
  const pa = lowestPrice(a);
  const pb = lowestPrice(b);
  if (pa === null || pb === null) return Number(pa === null) - Number(pb === null) || a.name.localeCompare(b.name);
  return pa - pb || a.name.localeCompare(b.name);
}

export interface BrandModels {
  brand: PhoneBrand;
  models: PhoneModel[];
}

/** Brands that have models, in catalogue order (the best-selling brands first), each brand's models by price. */
export function byBrand(models: readonly PhoneModel[]): BrandModels[] {
  return PHONE_BRANDS.map((brand) => ({ brand, models: models.filter((m) => m.brand === brand.id).sort(byPrice) })).filter(
    (b) => b.models.length > 0,
  );
}

/** The models most shops carry, for a brand's short list on the index page. */
export function popular(models: readonly PhoneModel[], n: number): PhoneModel[] {
  return [...models].sort((a, b) => b.shops - a.shops || b.offers.length - a.offers.length || byPrice(a, b)).slice(0, n).sort(byPrice);
}

export const kindLabel = (kind: PhoneKind | null, lang: Lang) => {
  const p = STRINGS[lang].phones;
  return kind === 'official' ? p.official : kind === 'unofficial' ? p.unofficial : p.unstated;
};

export const stockLabel = (stock: PhoneStock, lang: Lang) => STRINGS[lang].phones[stock];

/**
 * A model's chart: its lowest official price by day if it has ever had one, else its lowest unofficial or
 * unstated price. The history keeps only the days a price moved; this fills in every day up to `today`.
 */
export function priceHistory(history: PhoneHistoryResponse, key: string, today: string): { kind: 'official' | 'other'; points: Pt[] } {
  const steps = history.daily[key] ?? [];
  const kind = steps.some((s) => s[1] !== null) ? 'official' : 'other';
  const column = kind === 'official' ? 1 : 2;
  const points: Pt[] = [];
  for (let i = 0; i < steps.length; i++) {
    const value = steps[i]![column];
    const until = steps[i + 1]?.[0] ?? addDays(today, 1);
    if (value === null) continue;
    for (let d = steps[i]![0]; d < until; d = addDays(d, 1)) points.push([d, value]);
  }
  return { kind, points };
}
