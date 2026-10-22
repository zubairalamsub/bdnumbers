import { BAJUS_GOLD_URL, BHORI_GRAMS, KARAT_ORDER, dhakaDate, toIsoDate, type Karat, type Point } from '@bdnumbers/shared';
import { ParseError, errorMessage, parseAmount } from '../lib/errors';
import { Extractor, describePage } from '../lib/html';
import { fetchText } from '../lib/http';
import { fetchUnbMirror } from './bajusMirror';
import { assertKaratLadder, type Metal } from './metals';
import type { Source } from './types';

/**
 * Parse BAJUS's /gold-price page: `table.gold-table` and `table.silver-table`, one row per karat with a
 * "19,405 BDT/GRAM" price. Values are stored per bhori (per gram × 11.664, rounded to the taka); the
 * per-gram price is kept in meta. The point date is the effective date in the PDF link
 * ("…/Gold Price/22-Oct-2026.pdf"), falling back to today's Dhaka date.
 */
export async function parseBajus(html: string, today: string = dhakaDate()): Promise<Point[]> {
  const x = new Extractor();
  const gold = x.tables('table.gold-table');
  const silver = x.tables('table.silver-table');
  const links = x.attrs('.report-page-title a', 'href');
  await x.run(html);

  const pdfUrl = links.find((href) => /\.pdf$/i.test(href)) ?? null;
  const effectiveDate = pdfUrl ? dateFromPdfUrl(pdfUrl) : null;
  const date = effectiveDate ?? today;
  const meta = { source: 'bajus', effective_date: effectiveDate, pdf_url: pdfUrl };

  return [...metalPoints('gold', gold[0], date, meta, html), ...metalPoints('silver', silver[0], date, meta, html)];
}

function metalPoints(
  metal: Metal,
  table: string[][] | undefined,
  date: string,
  meta: Record<string, unknown>,
  html: string,
): Point[] {
  if (!table) throw new ParseError(`table.${metal}-table not found (${describePage(html)})`);
  const perGram = new Map<Karat, number>();
  for (const [label = '', , price = ''] of table) {
    const karat = karatOf(label, metal);
    if (!karat) continue;
    if (!/BDT\s*\/\s*GRAM/i.test(price)) {
      throw new ParseError(`${metal} ${karat}: expected a BDT/GRAM price, got "${price}"`);
    }
    perGram.set(karat, parseAmount(price, `${metal} ${karat}`));
  }
  assertKaratLadder(metal, perGram, 'BAJUS');
  return KARAT_ORDER.map((k) => ({
    series_key: `${metal}_${k}`,
    date,
    value: Math.round(perGram.get(k)! * BHORI_GRAMS),
    meta: { ...meta, per_gram: perGram.get(k)! },
  }));
}

/** "22 KARAT Gold" → '22k', "TRADITIONAL Silver" → 'traditional'; null if the label isn't for `metal`. */
export function karatOf(label: string, metal: Metal): Karat | null {
  if (!new RegExp(`\\b${metal}\\b`, 'i').test(label)) return null;
  if (/traditional/i.test(label)) return 'traditional';
  const m = /\b(22|21|18)\s*-?\s*(?:karat|carat|k)\b/i.exec(label);
  return m ? (`${m[1]}k` as Karat) : null;
}

function dateFromPdfUrl(href: string): string | null {
  let decoded = href;
  try {
    decoded = decodeURIComponent(href);
  } catch {
    // keep the raw href
  }
  const m = /(\d{1,2})-([A-Za-z]{3,9})-(\d{4})\.pdf$/i.exec(decoded);
  return m ? toIsoDate(m[3]!, m[2]!, m[1]!) : null;
}

export const bajusGold: Source = {
  key: 'bajusGold',
  cadence: 'daily',
  writeMode: 'on-change',
  async fetch(env, ctx) {
    let primaryError: string;
    try {
      return await parseBajus(await fetchText(env, BAJUS_GOLD_URL));
    } catch (err) {
      primaryError = errorMessage(err);
    }
    let mirror: Awaited<ReturnType<typeof fetchUnbMirror>>;
    try {
      mirror = await fetchUnbMirror(env);
    } catch (err) {
      throw new Error(`BAJUS: ${primaryError}; UNB mirror: ${errorMessage(err)}`);
    }
    ctx.warn(`BAJUS failed (${primaryError}); used UNB mirror ${mirror.url}`);
    for (const warning of mirror.warnings) ctx.warn(warning);
    return mirror.points;
  },
};
