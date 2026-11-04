// Mobile phone price pages: paths, grouping by brand, and the price history as chart points.
import {
  PHONE_BRANDS,
  addDays,
  type Lang,
  type PhoneBrand,
  type PhoneChange,
  type PhoneHistoryResponse,
  type PhoneKind,
  type PhoneModel,
  type PhonesResponse,
  type PhoneStock,
} from '@bdnumbers/shared';
import { STRINGS } from '../i18n';
import type { Pt } from './chart';
import { INDEX_GENERATED_PAGES } from './indexing';

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

export interface PriceDrop {
  model: PhoneModel;
  change: PhoneChange;
  /** Taka off, and as a share of the old price (%). */
  drop: number;
  pct: number;
}

/**
 * Recent price cuts worth a look: per phone its latest cut of at least `minPct`% within `days` days, and
 * only while the shop still sells it at that price (a cut taken back since isn't news). Cuts over
 * `maxPct`% are left out: they are almost always a listing error or a different variant. Newest first.
 */
export function recentDrops(
  phones: PhonesResponse,
  history: PhoneHistoryResponse,
  today: string,
  { days = 14, limit = 12, minPct = 1, maxPct = 35 } = {},
): PriceDrop[] {
  const since = addDays(today, -days);
  const byKey = new Map(phones.models.map((m) => [m.key, m]));
  const drops: PriceDrop[] = [];
  for (const [key, changes] of Object.entries(history.changes)) {
    const model = byKey.get(key);
    if (!model) continue;
    const offers = new Map(model.offers.map((o) => [o.url, o]));
    let best: PriceDrop | null = null;
    for (const change of changes) {
      if (change.date < since || change.price >= change.previous) continue;
      const offer = offers.get(change.url);
      if (!offer || offer.stock !== 'in' || offer.price !== change.price) continue;
      const drop = change.previous - change.price;
      const pct = (drop / change.previous) * 100;
      if (pct < minPct || pct > maxPct) continue;
      if (!best || change.date > best.change.date || (change.date === best.change.date && pct > best.pct)) {
        best = { model, change, drop, pct };
      }
    }
    if (best) drops.push(best);
  }
  return drops.sort((a, b) => b.change.date.localeCompare(a.change.date) || b.pct - a.pct).slice(0, limit);
}

/**
 * Shops that must have a phone in stock for its page to be offered to search engines. A page with one
 * shop compares nothing, and AdSense's review counted the ~1,700 such pages as low-value content; they stay
 * on the site for visitors, marked noindex and left out of the sitemap. While INDEX_GENERATED_PAGES is
 * off, no phone page is offered.
 */
export const MIN_SHOPS_TO_INDEX = 2;

export const isIndexed = (m: PhoneModel) => INDEX_GENERATED_PAGES && m.shops >= MIN_SHOPS_TO_INDEX;
