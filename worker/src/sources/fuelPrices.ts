import { BPC_FUEL_URL, FUEL_ITEMS, toIsoDate, type Point } from '@bdnumbers/shared';
import { ParseError, parseAmount } from '../lib/errors';
import { Extractor, describePage } from '../lib/html';
import { fetchText } from '../lib/http';
import { normalizeBengali } from '../lib/text';
import type { Source } from './types';

function parseDmy(text: string, what: string): string {
  const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(normalizeBengali(text));
  const date = m ? toIsoDate(m[3]!, Number(m[2]), m[1]!) : null;
  if (!date) throw new ParseError(`${what}: no date in "${text}"`);
  return date;
}

/**
 * Parse BPC's "local sale price of petroleum products" table: rows of [no, product, "১৩৫.০০ (টাকা/লিটার)",
 * effective date dd/mm/yyyy]. Each price is dated by its own effective date. Also reads the government
 * 12.5 kg LPG cylinder price from the same table.
 */
export async function parseBpcFuel(html: string): Promise<Point[]> {
  const x = new Extractor();
  const tables = x.tables('table');
  await x.run(html);
  const rows = tables.flat().map((row) => row.map(normalizeBengali));
  if (rows.length === 0) throw new ParseError(`BPC fuel table not found (${describePage(html)})`);

  const points: Point[] = FUEL_ITEMS.map((item) => {
    const name = normalizeBengali(item.sheet);
    const row = rows.find((r) => r[1] === name);
    if (!row || row.length < 4) throw new ParseError(`BPC fuel table: no row for ${item.en}`);
    return {
      series_key: `fuel_${item.id}`,
      date: parseDmy(row[3]!, item.en),
      value: parseAmount(row[2]!, `${item.en} price`),
    };
  });

  const lpg = rows.find((r) => (r[1] ?? '').startsWith('এলপি গ্যাস') && (r[1] ?? '').includes('12.50'));
  if (lpg && lpg.length >= 4) {
    points.push({
      series_key: 'lpg_govt_12_5kg',
      date: parseDmy(lpg[3]!, 'government LPG'),
      value: parseAmount(lpg[2]!, 'government LPG price'),
    });
  }
  return points;
}

export const fuelPrices: Source = {
  key: 'fuelPrices',
  cadence: 'periodic',
  writeMode: 'on-change',
  async fetch(env) {
    return parseBpcFuel(await fetchText(env, BPC_FUEL_URL));
  },
};
