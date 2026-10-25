/**
 * One-off: load USD/BDT history from Bangladesh Bank's Interbank FX Market tables.
 *
 *   npx tsx scripts/backfill-usd.ts            dry run: prints what it would load
 *   npx tsx scripts/backfill-usd.ts --ingest   posts through POST /api/ingest (reads INGEST_TOKEN from .dev.vars)
 *
 * The rows come from https://www.bb.org.bd/en/index.php/fxmarket/interbank_fxmarket (market SPOT, one
 * POST per month: fxmarketname, select_month, select_year). BB answers scripts with a bot check, so they
 * were read in a browser and saved as-is in scripts/data/bb-interbank-usd-*.json. The table only goes back
 * to July 2025.
 *
 * BB's "Exchange Rate of Taka" page, which the Worker reads every day, shows on date D the interbank
 * lowest / highest / WAR of the business day before D (its Oct 19 page shows Oct 18's 123.60 / 123.72 /
 * 123.65). So each row's figures are stored under the next row's date, as usd_bdt_low / usd_bdt_high /
 * usd_bdt_avg. BB's own "Highest" and "Lowest" columns are swapped in many 2025 rows, so low and high are
 * taken as the smaller and larger of the two; WAR must lie between them. Points are written only for dates
 * before the first one already stored, so the Worker's own figures are never replaced; dates the Worker
 * already has are compared instead, as a check of the mapping. Re-running is safe.
 */
import { readFileSync } from 'node:fs';
import type { Point, SeriesHistory } from '@bdnumbers/shared';

const API = process.env.API_BASE ?? 'https://api.bdrate.fyi';
const DATA = new URL('./data/bb-interbank-usd-2025-07_2026-10.json', import.meta.url);

interface InterbankFile {
  source: string;
  rows: Array<[date: string, lowest: number, highest: number, war: number]>;
}

function ingestToken(): string {
  const line = readFileSync('.dev.vars', 'utf8')
    .split('\n')
    .find((l) => l.startsWith('INGEST_TOKEN='));
  if (!line) throw new Error('INGEST_TOKEN not found in worker/.dev.vars');
  return line.slice('INGEST_TOKEN='.length).trim();
}

async function storedHistory(key: string): Promise<Map<string, number>> {
  const res = await fetch(`${API}/api/series/${key}.json`);
  if (!res.ok) throw new Error(`GET ${key} history returned HTTP ${res.status}`);
  const h = (await res.json()) as SeriesHistory;
  return new Map(h.points.map((p) => [p.date.slice(0, 10), p.value]));
}

async function main() {
  const ingest = process.argv.includes('--ingest');
  const data = JSON.parse(readFileSync(DATA, 'utf8')) as InterbankFile;
  const rows = [...data.rows].sort((a, b) => a[0].localeCompare(b[0]));

  // Each trading day's figures belong to the next trading day's exchange-rate page.
  const mapped = rows.slice(1).map((row, i) => {
    const [tradeDate, a, b, war] = rows[i]!;
    const low = Math.min(a, b);
    const high = Math.max(a, b);
    if (war < low - 1e-9 || war > high + 1e-9) throw new Error(`${tradeDate}: WAR ${war} outside ${low}–${high}`);
    return { date: row[0], tradeDate, low, high, war };
  });

  const stored = await storedHistory('usd_bdt_avg');
  const firstStored = [...stored.keys()].sort()[0] ?? '9999-12-31';
  for (const m of mapped.filter((x) => stored.has(x.date))) {
    const have = stored.get(m.date)!;
    console.log(`check ${m.date}: interbank ${m.tradeDate} WAR ${m.war} vs stored ${have}${Math.abs(have - m.war) < 0.005 ? ' ✓' : '  ✗ MISMATCH'}`);
  }

  const points: Point[] = mapped
    .filter((m) => m.date < firstStored)
    .flatMap((m) => {
      const meta = { source: 'bb-interbank', interbank_date: m.tradeDate, url: data.source, backfill: true };
      return [
        { series_key: 'usd_bdt_low', date: m.date, value: m.low, meta },
        { series_key: 'usd_bdt_high', date: m.date, value: m.high, meta },
        { series_key: 'usd_bdt_avg', date: m.date, value: m.war, meta },
      ];
    });
  const days = points.filter((p) => p.series_key === 'usd_bdt_avg');
  console.log(`${days.length} days, ${days[0]?.date} → ${days.at(-1)?.date} (stored data starts ${firstStored})`);

  if (!ingest) {
    console.log(`dry run: ${points.length} points would be written; run with --ingest to write them`);
    return;
  }
  const res = await fetch(`${API}/api/ingest`, {
    method: 'POST',
    headers: { authorization: `Bearer ${ingestToken()}`, 'content-type': 'application/json' },
    body: JSON.stringify({ source: 'usd-backfill', mode: 'upsert', points }),
  });
  console.log(`ingest: HTTP ${res.status} ${await res.text()}`);
  if (!res.ok) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
