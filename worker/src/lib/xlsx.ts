// Minimal XLSX reader for the Workers runtime: walk the ZIP central directory, inflate the two parts we
// need with the native DecompressionStream, and scan the worksheet XML. No library, little JS CPU.
import { ParseError } from './errors';
import { decodeEntities } from './text';

/** Row number → column letters → cell text. */
export type Sheet = Map<number, Map<string, string>>;

interface ZipEntry {
  method: number;
  compressedSize: number;
  offset: number;
}

/** Read the first worksheet of an XLSX file, resolving shared strings. */
export async function readFirstSheet(data: ArrayBuffer): Promise<Sheet> {
  const entries = listZip(data);
  const sheetPath = [...entries.keys()].filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort()[0];
  if (!sheetPath) throw new ParseError('xlsx: no worksheet');
  const strings = entries.has('xl/sharedStrings.xml')
    ? parseSharedStrings(await readEntry(data, entries.get('xl/sharedStrings.xml')!))
    : [];
  return parseSheet(await readEntry(data, entries.get(sheetPath)!), strings);
}

/** Excel's serial day number (1900 date system) → YYYY-MM-DD. */
export function excelSerialToDate(serial: number): string {
  return new Date(Math.round((serial - 25569) * 86_400_000)).toISOString().slice(0, 10);
}

function listZip(data: ArrayBuffer): Map<string, ZipEntry> {
  const view = new DataView(data);
  // The end-of-central-directory record sits in the last 22 bytes plus an optional comment (≤ 64 KiB).
  let eocd = -1;
  for (let i = data.byteLength - 22; i >= Math.max(0, data.byteLength - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ParseError('xlsx: not a zip file');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const entries = new Map<string, ZipEntry>();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new ParseError('xlsx: corrupt zip directory');
    const nameLength = view.getUint16(p + 28, true);
    entries.set(decoder.decode(new Uint8Array(data, p + 46, nameLength)), {
      method: view.getUint16(p + 10, true),
      compressedSize: view.getUint32(p + 20, true),
      offset: view.getUint32(p + 42, true),
    });
    p += 46 + nameLength + view.getUint16(p + 30, true) + view.getUint16(p + 32, true);
  }
  return entries;
}

async function readEntry(data: ArrayBuffer, entry: ZipEntry): Promise<string> {
  const view = new DataView(data);
  if (view.getUint32(entry.offset, true) !== 0x04034b50) throw new ParseError('xlsx: corrupt zip entry');
  const start = entry.offset + 30 + view.getUint16(entry.offset + 26, true) + view.getUint16(entry.offset + 28, true);
  const bytes = new Uint8Array(data, start, entry.compressedSize);
  if (entry.method === 0) return new TextDecoder().decode(bytes);
  if (entry.method !== 8) throw new ParseError(`xlsx: unsupported compression method ${entry.method}`);
  return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
}

function textRuns(xml: string): string {
  let text = '';
  for (const t of xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) text += t[1];
  return decodeEntities(text);
}

function parseSharedStrings(xml: string): string[] {
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((si) => textRuns(si[1]!));
}

function parseSheet(xml: string, strings: readonly string[]): Sheet {
  const sheet: Sheet = new Map();
  for (const row of xml.matchAll(/<row\b[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = new Map<string, string>();
    for (const cell of row[2]!.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cell[1]!;
      const body = cell[2] ?? '';
      const column = /\br="([A-Z]+)\d+"/.exec(attrs)?.[1];
      if (!column) continue;
      const type = /\bt="(\w+)"/.exec(attrs)?.[1];
      if (type === 'inlineStr') {
        cells.set(column, textRuns(body));
        continue;
      }
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      if (v === undefined) continue;
      cells.set(column, type === 's' ? (strings[Number(v)] ?? '') : decodeEntities(v));
    }
    sheet.set(Number(row[1]), cells);
  }
  return sheet;
}
