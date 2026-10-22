import { EBL_FOREX_URL, toIsoDate, type Point } from '@bdnumbers/shared';
import { ParseError, parseAmount } from '../lib/errors';
import { Extractor, describePage } from '../lib/html';
import { fetchText } from '../lib/http';
import type { Source } from './types';

/**
 * Parse Eastern Bank's "Currency Exchange Rate" box (on every ebl.com.bd page): Currency | T.T Clean
 * Buying | B.C Selling, then a row "As on 19 October, 2026". USD buying / selling → usd_bdt_ebl_buy /
 * usd_bdt_ebl_sell, dated by that row. These are a bank's customer rates, the backup for Bangladesh
 * Bank's interbank rate while bb.org.bd is down.
 */
export async function parseEblRates(html: string): Promise<Point[]> {
  const x = new Extractor();
  const tables = x.tables('table');
  await x.run(html);

  const table = tables.find((t) => t.some((row) => row.some((c) => /T\.?\s*T\.?\s+Clean\s+Buying/i.test(c))));
  if (!table) throw new ParseError(`EBL rate table not found (${describePage(html)})`);
  const header = table.find((row) => row.some((c) => /Clean\s+Buying/i.test(c)))!;
  const buyCol = header.findIndex((c) => /Clean\s+Buying/i.test(c));
  const sellCol = header.findIndex((c) => /Selling/i.test(c));
  if (sellCol < 0) throw new ParseError('EBL rate table has no selling column');

  const usd = table.find((row) => row[0] === 'USD');
  if (!usd) throw new ParseError('USD row not found in EBL rate table');
  const buy = parseAmount(usd[buyCol] ?? '', 'EBL USD buying');
  const sell = parseAmount(usd[sellCol] ?? '', 'EBL USD selling');
  if (sell < buy) throw new ParseError(`EBL USD selling ${sell} is below buying ${buy}`);

  const asOf = table.map((row) => /As on\s+(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})/i.exec(row.join(' '))).find(Boolean);
  const date = asOf ? toIsoDate(asOf[3]!, asOf[2]!, asOf[1]!) : null;
  if (!date) throw new ParseError('no "As on <date>" row in EBL rate table');

  return [
    { series_key: 'usd_bdt_ebl_buy', date, value: buy, meta: { kind: 'TT clean buying' } },
    { series_key: 'usd_bdt_ebl_sell', date, value: sell, meta: { kind: 'BC selling' } },
  ];
}

export const eblRates: Source = {
  key: 'eblRates',
  cadence: 'daily',
  writeMode: 'upsert',
  async fetch(env) {
    return parseEblRates(await fetchText(env, EBL_FOREX_URL));
  },
};
