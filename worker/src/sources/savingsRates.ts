import { NSD_SCHEMES_URL, SAVINGS_NOTICE, type Point } from '@bdnumbers/shared';
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

/**
 * Savings-certificate rates are published as scanned PDFs, so the table itself is curated in
 * shared/src/catalog/periodic.ts from the official notice. This source watches the directorate's page and
 * warns on /status when it links a different rate document, so the table can be updated.
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
