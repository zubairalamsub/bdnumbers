import { NSD_NOTICES_URL, NSD_SCHEMES_URL, SAVINGS_NOTICE, type Point } from '@bdnumbers/shared';
import { fetchText } from '../lib/http';
import { normalizeBengali } from '../lib/text';
import type { Source } from './types';

/**
 * The link to the profit-rate document on the National Savings Directorate's "existing schemes" page
 * (the table row whose name mentions "মুনাফার হার").
 */
export function findRatesDocument(html: string): string | null {
  for (const row of html.matchAll(/<tr\b[\s\S]*?<\/tr>/g)) {
    const text = normalizeBengali(row[0].replace(/<[^>]+>/g, ' '));
    if (!text.includes('মুনাফার হার')) continue;
    const href = /href="(https:\/\/[^"]+\.(?:pdf|jpe?g|png))"/i.exec(row[0])?.[1];
    if (href) return href;
  }
  return null;
}

/** The newest notice about profit rates ("মুনাফার হার") on the directorate's notices page. */
export function latestRateNotice(html: string): { date: string; title: string; url: string | null } | null {
  let newest: { date: string; title: string; url: string | null } | null = null;
  for (const row of html.matchAll(/<tr\b[\s\S]*?<\/tr>/g)) {
    const text = normalizeBengali(row[0].replace(/<[^>]+>/g, ' '));
    if (!text.includes('হার')) continue;
    const d = /(\d{2})-(\d{2})-(\d{4})/.exec(text);
    if (!d) continue;
    const date = `${d[3]}-${d[2]}-${d[1]}`;
    if (!newest || date > newest.date) {
      const title = text.replace(d[0], '').replace(/^\s*\d+\s*/, '').trim();
      newest = { date, title, url: /href="(https:\/\/[^"]+)"/i.exec(row[0])?.[1] ?? null };
    }
  }
  return newest;
}

/**
 * Savings-certificate rates are published as scanned PDFs, so the table itself is curated in
 * shared/src/catalog/periodic.ts from the official notice. This source watches the directorate's page and
 * warns on /status when it links a different rate document, or when the notices page has a rate notice
 * newer than the last one the table accounts for (including "rates stay the same" notices).
 */
export const savingsRates: Source = {
  key: 'savingsRates',
  cadence: 'periodic',
  writeMode: 'on-change',
  async fetch(env, ctx) {
    const linked = findRatesDocument(await fetchText(env, NSD_SCHEMES_URL));
    if (!linked) ctx.warn('the National Savings page no longer links a profit-rate document');
    else if (linked !== SAVINGS_NOTICE.documentUrl) {
      ctx.warn(`the National Savings page links a new rate document (${linked}); update the curated table`);
    }
    const known = SAVINGS_NOTICE.extendedBy?.at(-1)?.issued ?? SAVINGS_NOTICE.issued;
    const newest = latestRateNotice(await fetchText(env, NSD_NOTICES_URL));
    if (!newest) ctx.warn('the National Savings notices page lists no profit-rate notice');
    else if (newest.date > known) {
      ctx.warn(`new profit-rate notice dated ${newest.date}: "${newest.title}" (${newest.url ?? NSD_NOTICES_URL}); update the curated table`);
    }
    const fiveYear = SAVINGS_NOTICE.schemes.find((s) => s.id === 'bsp_5y')!;
    const point: Point = {
      series_key: 'savings_rates',
      date: SAVINGS_NOTICE.effectiveFrom,
      value: fiveYear.upTo7_5Lakh[fiveYear.upTo7_5Lakh.length - 1]!,
      meta: { notice: SAVINGS_NOTICE },
    };
    return [point];
  },
};
