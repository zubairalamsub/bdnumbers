// Every indexable page (paths without the /en prefix) and what its lastmod in sitemap.xml comes from.
import { DISTRICTS, SERIES, dhakaDate, type Category, type LatestResponse } from '@bdnumbers/shared';
import { CALCULATORS } from './calculators';
import { MFS_RETRIEVED } from './mfs-fees';

type LastMod =
  /** Newest data change among these categories. */
  | { categories: readonly Category[] }
  /** Computed fresh each day (prayer times). */
  | { daily: true }
  /** A fixed date (e.g. when fees were last checked). */
  | { date: string }
  /** Nothing data-driven: no lastmod. */
  | null;

const ALL_CATEGORIES = [...new Set(SERIES.map((s) => s.category))];

/** When /privacy last changed; bump it whenever the policy text or the services it describes change. */
export const PRIVACY_UPDATED = '2026-10-23';

export const INDEXABLE_PAGES: ReadonlyArray<{ path: string; lastmod: LastMod }> = [
  { path: '/', lastmod: { categories: ALL_CATEGORIES } },
  { path: '/dollar-rate-today', lastmod: { categories: ['fx'] } },
  { path: '/gold-price-today', lastmod: { categories: ['gold'] } },
  { path: '/silver-price-today', lastmod: { categories: ['silver'] } },
  { path: '/market-price-today', lastmod: { categories: ['market'] } },
  { path: '/share-market-today', lastmod: { categories: ['stock'] } },
  { path: '/weather', lastmod: { categories: ['weather'] } },
  { path: '/fuel-price', lastmod: { categories: ['fuel'] } },
  { path: '/lpg-price', lastmod: { categories: ['lpg'] } },
  { path: '/savings-rates', lastmod: { categories: ['savings'] } },
  { path: '/holidays', lastmod: { categories: ['holidays'] } },
  { path: '/prayer-times', lastmod: { daily: true } },
  ...DISTRICTS.map((d) => ({ path: `/prayer-times/${d.id}`, lastmod: { daily: true } as const })),
  { path: '/calculators', lastmod: null },
  ...CALCULATORS.map((c) => ({
    path: `/calculators/${c.slug}`,
    lastmod: (
      {
        'currency-converter': { categories: ['fx'] },
        gold: { categories: ['gold', 'silver'] },
        zakat: { categories: ['gold', 'silver'] },
        sanchayapatra: { categories: ['savings'] },
        'mobile-banking': { date: MFS_RETRIEVED },
      } as Record<string, LastMod>
    )[c.slug] ?? null,
  })),
  { path: '/about', lastmod: null },
  { path: '/privacy', lastmod: { date: PRIVACY_UPDATED } },
];

/** When a page's content last changed, from the data behind it (W3C datetime), or null. */
export function lastModified(lastmod: LastMod, latest: LatestResponse): string | null {
  if (lastmod === null) return null;
  if ('date' in lastmod) return lastmod.date;
  if ('daily' in lastmod) return dhakaDate();
  const times = latest.series
    .filter((e) => lastmod.categories.includes(e.category))
    .map((e) => e.fetched_at)
    .filter((t): t is string => t !== null)
    .sort();
  return times.at(-1) ?? null;
}
