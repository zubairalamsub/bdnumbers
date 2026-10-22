import { BB_EXCHANGE_URL, toIsoDate, type Point } from '@bdnumbers/shared';
import { ParseError, parseAmount } from '../lib/errors';
import { Extractor, describePage } from '../lib/html';
import { fetchText } from '../lib/http';
import type { Source } from './types';

/**
 * Parse Bangladesh Bank's "Exchange Rate of Taka" page.
 *
 * Table A (USD/BDT): Bid / Ask / WAR → usd_bdt_low / usd_bdt_high / usd_bdt_avg.
 * Table B (cross rates): Bid / Ask per currency → {ccy}_bdt_bid / {ccy}_bdt_ask.
 * The point date is the rate date in the page header, e.g. "Exchange Rate of Taka (Oct 19, 2026)",
 * which usually lags the fetch date by one or more business days.
 */
export async function parseBangladeshBank(html: string): Promise<Point[]> {
  const x = new Extractor();
  const tables = x.tables('table');
  const headers = x.text('.page_header');
  await x.run(html);

  const header = headers.find((h) => /Exchange Rate of Taka/i.test(h));
  if (!header) throw new ParseError(`"Exchange Rate of Taka" header not found (${describePage(html)})`);
  const dm = /\(\s*([A-Za-z]{3,9})\.?\s+(\d{1,2}),\s*(\d{4})\s*\)/.exec(header);
  const date = dm ? toIsoDate(dm[3]!, dm[1]!, dm[2]!) : null;
  if (!date) throw new ParseError(`no rate date in header "${header}"`);

  const usd = findTable(tables, /USD\s*\/\s*BDT/i);
  const cross = findTable(tables, /Cross Rates/i);
  if (!usd) throw new ParseError('USD/BDT table not found');
  if (!cross) throw new ParseError('cross rates table not found');

  const [bid, ask, war] = columns(usd, ['Bid Rate', 'Ask Rate', 'WAR']);
  const usdRow = usd.find((r) => r[0] === 'USD');
  if (!usdRow) throw new ParseError('USD row not found in USD/BDT table');
  const points: Point[] = [
    { series_key: 'usd_bdt_low', date, value: cell(usdRow, bid!, 'USD bid') },
    { series_key: 'usd_bdt_high', date, value: cell(usdRow, ask!, 'USD ask') },
    { series_key: 'usd_bdt_avg', date, value: cell(usdRow, war!, 'USD WAR') },
  ];

  const [crossBid, crossAsk] = columns(cross, ['Bid Rate', 'Ask Rate']);
  let currencies = 0;
  for (const row of cross) {
    const code = row[0];
    if (!code || !/^[A-Z]{3}$/.test(code)) continue;
    const ccy = code.toLowerCase();
    points.push(
      { series_key: `${ccy}_bdt_bid`, date, value: cell(row, crossBid!, `${code} bid`) },
      { series_key: `${ccy}_bdt_ask`, date, value: cell(row, crossAsk!, `${code} ask`) },
    );
    currencies++;
  }
  if (currencies === 0) throw new ParseError('cross rates table has no currency rows');
  return points;
}

function findTable(tables: string[][][], title: RegExp): string[][] | undefined {
  return tables.find((t) => t.some((row) => title.test(row.join(' '))));
}

/** Indexes of the named columns, from the header row that contains all of them. */
function columns(table: string[][], names: string[]): number[] {
  const lower = names.map((n) => n.toLowerCase());
  const header = table.find((row) => lower.every((n) => row.some((c) => c.toLowerCase() === n)));
  if (!header) throw new ParseError(`no header row with columns ${names.join(', ')}`);
  return lower.map((n) => header.findIndex((c) => c.toLowerCase() === n));
}

function cell(row: string[], index: number, what: string): number {
  const text = row[index];
  if (text === undefined) throw new ParseError(`${what}: missing cell`);
  return parseAmount(text, what);
}

export const bangladeshBank: Source = {
  key: 'bangladeshBank',
  cadence: 'daily',
  writeMode: 'upsert',
  async fetch(env) {
    return parseBangladeshBank(await fetchText(env, BB_EXCHANGE_URL));
  },
};
