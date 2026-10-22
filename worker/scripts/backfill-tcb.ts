/**
 * One-off: load the last N days of TCB market prices so charts start with history.
 *
 *   npx tsx scripts/backfill-tcb.ts [days=50]        (from worker/; reads INGEST_TOKEN from .dev.vars)
 *
 * Uses the same parser as the Worker and posts through POST /api/ingest (upsert, so re-running is safe).
 * TCB's list page takes page_size, so one request lists every file.
 */
import { readFileSync } from 'node:fs';
import { TCB_LIST_URL, type Point } from '@bdnumbers/shared';
import { readFirstSheet } from '../src/lib/xlsx';
import { parseTcbList, parseTcbSheet } from '../src/sources/tcbParse';

const API = process.env.API_BASE ?? 'https://api.bdrate.fyi';
const USER_AGENT = 'Mozilla/5.0 (compatible; bdnumbers/1.0; +https://bdrate.fyi)';
const BATCH = 2000;

function ingestToken(): string {
  const line = readFileSync('.dev.vars', 'utf8')
    .split('\n')
    .find((l) => l.startsWith('INGEST_TOKEN='));
  if (!line) throw new Error('INGEST_TOKEN not found in worker/.dev.vars');
  return line.slice('INGEST_TOKEN='.length).trim();
}

async function get(url: string): Promise<Response> {
  const res = await fetch(url, { headers: { 'user-agent': USER_AGENT } });
  if (!res.ok) throw new Error(`GET ${url} returned HTTP ${res.status}`);
  return res;
}

async function main() {
  const days = Number(process.argv[2] ?? 50);
  const token = ingestToken();
  const files = parseTcbList(await (await get(`${TCB_LIST_URL}?page=1&page_size=${days}`)).text());
  console.log(`${files.length} TCB files, ${files.at(-1)?.date} … ${files[0]?.date}`);

  const points: Point[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    try {
      const result = parseTcbSheet(await readFirstSheet(await (await get(file.url)).arrayBuffer()));
      if (seen.has(result.date)) continue; // TCB sometimes re-uploads a day
      seen.add(result.date);
      points.push(...result.points);
      console.log(`${result.date}: ${result.points.length} points${result.unmatched.length ? `, unmatched: ${result.unmatched.join('; ')}` : ''}`);
    } catch (err) {
      console.warn(`${file.date}: skipped (${err instanceof Error ? err.message : String(err)})`);
    }
  }

  for (let i = 0; i < points.length; i += BATCH) {
    const res = await fetch(`${API}/api/ingest`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ source: 'tcb-backfill', mode: 'upsert', points: points.slice(i, i + BATCH) }),
    });
    console.log(`ingest ${i / BATCH + 1}: HTTP ${res.status} ${await res.text()}`);
    if (!res.ok) process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
