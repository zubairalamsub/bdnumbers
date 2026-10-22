import { DSE_URL, type Point } from '@bdnumbers/shared';
import { ParseError, parseAmount } from '../lib/errors';
import { Extractor, describePage } from '../lib/html';
import { fetchText } from '../lib/http';
import type { Source } from './types';

const TABLE_MARKER = 'data-cms="markets.recent-info"';

/**
 * Parse DSE's "Recent Market Information" table: one row per trading day (holidays have no row) with
 * turnover (Tk mn), market cap (two columns), DSEX, DSES, DS30 and DGEN. Turnover is stored in crore
 * (mn ÷ 10). The page is ~500 KB, so only the table is handed to HTMLRewriter.
 */
export async function parseDse(html: string): Promise<Point[]> {
  const start = html.indexOf(TABLE_MARKER);
  const end = start < 0 ? -1 : html.indexOf('</table>', start);
  if (start < 0 || end < 0) throw new ParseError(`recent market information table not found (${describePage(html)})`);
  const x = new Extractor();
  const tables = x.tables('table');
  await x.run(`<table ${html.slice(start, end)}</table>`);
  const table = tables[0];

  const header = table?.find((row) => ['DSEX', 'DSES', 'DS30', 'Turnover (mn)'].every((h) => row.includes(h)));
  if (!table || !header) throw new ParseError('DSE table: header with DSEX/DSES/DS30/Turnover not found');
  const rows = table.filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row[0] ?? ''));
  if (rows.length === 0) throw new ParseError('DSE table has no dated rows');

  // "Market Capitalization" spans two data columns, so columns after it shift right by the difference.
  const extra = rows[0]!.length - header.length;
  const capIndex = header.findIndex((h) => h.startsWith('Market Capitalization'));
  if (extra < 0 || extra > 1 || capIndex < 0) throw new ParseError(`DSE table: unexpected shape (${header.length} headers, ${rows[0]!.length} cells)`);
  const column = (name: string) => {
    const i = header.indexOf(name);
    return i > capIndex ? i + extra : i;
  };
  const cols = { turnover: column('Turnover (mn)'), dsex: column('DSEX'), dses: column('DSES'), ds30: column('DS30') };

  return rows.flatMap((row): Point[] => {
    const date = row[0]!;
    const value = (i: number, what: string) => parseAmount(row[i] ?? '', `${date} ${what}`);
    return [
      { series_key: 'dse_dsex', date, value: value(cols.dsex, 'DSEX') },
      { series_key: 'dse_dses', date, value: value(cols.dses, 'DSES') },
      { series_key: 'dse_ds30', date, value: value(cols.ds30, 'DS30') },
      {
        series_key: 'dse_turnover',
        date,
        value: Math.round(value(cols.turnover, 'turnover') * 10) / 100,
        meta: { turnover_mn: value(cols.turnover, 'turnover') },
      },
    ];
  });
}

export const dseIndex: Source = {
  key: 'dseIndex',
  cadence: 'daily',
  writeMode: 'upsert',
  async fetch(env) {
    return parseDse(await fetchText(env, DSE_URL));
  },
};
