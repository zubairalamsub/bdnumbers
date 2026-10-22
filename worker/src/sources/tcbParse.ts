// Pure parsing for TCB's daily price list and XLSX (no Workers APIs), shared with scripts/backfill-tcb.ts.
import { TCB_ITEMS, tcbItemForSheet, toIsoDate, toLatinDigits, type Point } from '@bdnumbers/shared';
import { ParseError } from '../lib/errors';
import { decodeEntities, describePage } from '../lib/text';
import { excelSerialToDate, type Sheet } from '../lib/xlsx';

/** Fewer matched items than this means TCB changed the sheet layout. */
const MIN_ITEMS = 30;

export interface TcbFile {
  url: string;
  /** Publish date shown in the list (Dhaka), YYYY-MM-DD. */
  date: string;
}

/**
 * The XLSX files listed on TCB's "daily retail market prices" page, newest first. Each table row has a
 * files cell linking the XLSX and a publish-date cell ("১৯-১০-২০২৬").
 */
export function parseTcbList(html: string): TcbFile[] {
  const files: TcbFile[] = [];
  for (const row of html.matchAll(/<tr\b[\s\S]*?<\/tr>/g)) {
    const url = /data-column="files"[\s\S]*?href="([^"]+\.xlsx)"/.exec(row[0])?.[1];
    const dateText = /data-column="publish_date"[^>]*>\s*<span>([^<]+)<\/span>/.exec(row[0])?.[1];
    if (!url || !dateText) continue;
    const m = /(\d{1,2})-(\d{1,2})-(\d{4})/.exec(toLatinDigits(dateText));
    const date = m ? toIsoDate(m[3]!, Number(m[2]), m[1]!) : null;
    if (date) files.push({ url: decodeEntities(url), date });
  }
  if (files.length === 0) throw new ParseError(`no XLSX files in the TCB list (${describePage(html)})`);
  return files.sort((a, b) => b.date.localeCompare(a.date));
}

export interface TcbSheetResult {
  date: string;
  points: Point[];
  /** Item rows with no catalog entry, as "name (unit)". */
  unmatched: string[];
}

const cellNumber = (s: string | undefined) => (s !== undefined && /^-?\d+(\.\d+)?$/.test(s.trim()) ? Number(s) : null);
const compact = (s: string) => s.replace(/\s+/g, '');

/**
 * Parse TCB's daily price sheet: a header row ("পণ্যের নাম"), a row of Excel serial dates for today / a week
 * / a month / a year ago, then item rows (A name, B unit, C today's min, D today's max) until the list of
 * markets surveyed ("যে সকল বাজার…"). A price of 0 means the item wasn't in the market that day.
 */
export function parseTcbSheet(sheet: Sheet): TcbSheetResult {
  const rows = [...sheet.entries()].sort(([a], [b]) => a - b);
  const headerIndex = rows.findIndex(([, cells]) => compact(cells.get('A') ?? '').includes('পণ্যেরনাম'));
  if (headerIndex < 0) throw new ParseError('TCB sheet: header row "পণ্যের নাম" not found');

  const serialRow = rows.slice(headerIndex + 1, headerIndex + 4).find(([, cells]) => (cellNumber(cells.get('C')) ?? 0) > 40000);
  const serialDate = serialRow ? excelSerialToDate(cellNumber(serialRow[1].get('C'))!) : null;
  const textDate = rows
    .map(([, cells]) => /তারিখঃ?\s*([০-৯\d]{1,2})-([০-৯\d]{1,2})-([০-৯\d]{4})/.exec(cells.get('A') ?? ''))
    .find((m) => m !== null);
  const headerDate = textDate ? toIsoDate(toLatinDigits(textDate[3]!), Number(toLatinDigits(textDate[2]!)), toLatinDigits(textDate[1]!)) : null;
  if (serialDate && headerDate && serialDate !== headerDate) {
    throw new ParseError(`TCB sheet: date cell ${serialDate} disagrees with header date ${headerDate}`);
  }
  const date = serialDate ?? headerDate;
  if (!date) throw new ParseError('TCB sheet: no date');

  const points: Point[] = [];
  const unmatched: string[] = [];
  const seen = new Set<string>();
  for (const [, cells] of rows.slice(headerIndex + 1)) {
    const name = (cells.get('A') ?? '').trim();
    if (compact(name).startsWith('যেসকলবাজার')) break;
    const unit = (cells.get('B') ?? '').trim();
    const min = cellNumber(cells.get('C'));
    const max = cellNumber(cells.get('D'));
    if (!name || !unit || min === null || max === null) continue; // section headings, repeated headers
    const item = tcbItemForSheet(name, unit);
    if (!item) {
      unmatched.push(`${name} (${unit})`);
      continue;
    }
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    if (min > 0) points.push({ series_key: `tcb_${item.id}_min`, date, value: min });
    if (max > 0) points.push({ series_key: `tcb_${item.id}_max`, date, value: max });
  }
  if (seen.size < MIN_ITEMS) {
    throw new ParseError(`TCB sheet: only ${seen.size} of ${TCB_ITEMS.length} known items found; layout changed?`);
  }
  return { date, points, unmatched };
}
