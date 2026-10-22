/**
 * Turn history CSVs into a SQL file for D1, so charts aren't empty at launch.
 *
 *   npm run seed -w worker -- ../data/seed            # writes worker/seed.sql
 *   npm run seed -w worker -- ../data/seed --per-gram # gold/silver files are per gram
 *   cd worker && npx wrangler d1 execute bdnumbers --remote --file=seed.sql
 *
 * Each CSV is named <series_key>.csv (usd_bdt_avg.csv, gold_22k.csv, …) with a header row containing
 * `date` and `value`. Dates may be YYYY-MM-DD, DD/MM/YYYY or DD-MM-YYYY; values may use thousands
 * separators (quote them) or Bengali digits. Gold and silver are stored per bhori.
 * Existing points always win (ON CONFLICT DO NOTHING), so the script is safe to re-run.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { BHORI_GRAMS, dhakaDayStartUtc, getSeriesDef, isPointDate } from '@bdnumbers/shared';

const ROWS_PER_INSERT = 400;

function parseArgs(argv: string[]) {
  const positional = argv.filter((a) => !a.startsWith('--'));
  const outIndex = argv.indexOf('--out');
  return {
    dir: positional[0],
    out: outIndex >= 0 ? argv[outIndex + 1] : 'seed.sql',
    perGram: argv.includes('--per-gram'),
  };
}

/** Minimal RFC 4180 CSV parser (quoted fields, doubled quotes, CRLF). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const toLatinDigits = (s: string) => s.replace(/[০-৯]/g, (d) => String(d.charCodeAt(0) - 0x09e6));

function normalizeDate(raw: string): string | null {
  const s = toLatinDigits(raw.trim());
  if (isPointDate(s)) return s;
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
  if (!m) return null;
  const iso = `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
  return isPointDate(iso) ? iso : null;
}

const sql = (s: string) => `'${s.replace(/'/g, "''")}'`;

function main() {
  const { dir, out, perGram } = parseArgs(process.argv.slice(2));
  if (!dir) {
    console.error('usage: npm run seed -w worker -- <csv-dir> [--out seed.sql] [--per-gram]');
    process.exit(2);
  }

  const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.csv'));
  if (files.length === 0) {
    console.error(`no .csv files in ${resolve(dir)}`);
    process.exit(2);
  }

  const statements: string[] = [];
  const errors: string[] = [];

  for (const file of files) {
    const key = basename(file, '.csv').toLowerCase();
    const def = getSeriesDef(key);
    if (!def) {
      errors.push(`${file}: no series "${key}" in the catalog`);
      continue;
    }
    const [header, ...rows] = parseCsv(readFileSync(join(dir, file), 'utf8').replace(/^﻿/, ''));
    const cols = (header ?? []).map((h) => h.trim().toLowerCase());
    const dateCol = cols.indexOf('date');
    const valueCol = cols.indexOf('value');
    if (dateCol < 0 || valueCol < 0) {
      errors.push(`${file}: header must contain "date" and "value" (got ${cols.join(', ')})`);
      continue;
    }

    const convert = perGram && /^(gold|silver)_/.test(key) ? (v: number) => Math.round(v * BHORI_GRAMS) : (v: number) => v;
    const values: string[] = [];
    rows.forEach((row, i) => {
      const line = i + 2;
      const date = normalizeDate(row[dateCol] ?? '');
      const value = convert(Number(toLatinDigits(row[valueCol] ?? '').replace(/[,\s]/g, '')));
      if (!date) return errors.push(`${file}:${line}: bad date "${row[dateCol]}"`);
      if (!Number.isFinite(value)) return errors.push(`${file}:${line}: bad value "${row[valueCol]}"`);
      if (def.bounds && (value < def.bounds[0] || value > def.bounds[1])) {
        return errors.push(`${file}:${line}: ${value} outside [${def.bounds[0]}, ${def.bounds[1]}]${perGram ? '' : ' (per-gram file? use --per-gram)'}`);
      }
      values.push(`(${sql(key)}, ${sql(date)}, ${value}, '{"source":"seed"}', ${sql(dhakaDayStartUtc(date))}, 0)`);
    });

    statements.push(
      `INSERT INTO series (key, name_bn, name_en, unit, source_name, source_url, cadence, source_key) VALUES (` +
        [def.key, def.name_bn, def.name_en, def.unit, def.source_name, def.source_url, def.cadence, def.source_key].map(sql).join(', ') +
        `) ON CONFLICT (key) DO NOTHING;`,
    );
    for (let i = 0; i < values.length; i += ROWS_PER_INSERT) {
      statements.push(
        `INSERT INTO points (series_key, date, value, meta, fetched_at, stale) VALUES\n  ${values
          .slice(i, i + ROWS_PER_INSERT)
          .join(',\n  ')}\nON CONFLICT (series_key, date) DO NOTHING;`,
      );
    }
    console.log(`${file}: ${values.length} rows`);
  }

  if (errors.length > 0) {
    console.error(`\n${errors.length} problem(s); nothing written:\n  ${errors.slice(0, 50).join('\n  ')}`);
    process.exit(1);
  }
  writeFileSync(out!, `${statements.join('\n\n')}\n`);
  console.log(`\nWrote ${resolve(out!)}. Load it with:\n  npx wrangler d1 execute bdnumbers --remote --file=${out}`);
}

main();
