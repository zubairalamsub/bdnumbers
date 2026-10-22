import { TCB_LIST_URL } from '@bdnumbers/shared';
import { fetchBytes, fetchText } from '../lib/http';
import { readFirstSheet } from '../lib/xlsx';
import { parseTcbList, parseTcbSheet } from './tcbParse';
import type { Source } from './types';

export { parseTcbList, parseTcbSheet, type TcbFile, type TcbSheetResult } from './tcbParse';

export const tcbMarketPrices: Source = {
  key: 'tcbMarketPrices',
  cadence: 'daily',
  writeMode: 'upsert',
  async fetch(env, ctx) {
    const [latest] = parseTcbList(await fetchText(env, TCB_LIST_URL));
    const result = parseTcbSheet(await readFirstSheet(await fetchBytes(env, latest!.url)));
    if (result.date !== latest!.date) ctx.warn(`TCB list says ${latest!.date}, sheet says ${result.date}`);
    if (result.unmatched.length > 0) ctx.warn(`TCB rows not in the catalog: ${result.unmatched.join('; ')}`);
    return result.points;
  },
};
