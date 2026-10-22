/**
 * One-off: load gold and silver price history from UNB's reports of BAJUS price changes.
 *
 *   npx tsx scripts/backfill-gold.ts            dry run: prints what it would load and what it skipped
 *   npx tsx scripts/backfill-gold.ts --ingest   posts through POST /api/ingest (reads INGEST_TOKEN from .dev.vars)
 *
 * BAJUS keeps only the current price file on its site, so its past announcements survive in news
 * reports. UNB reports every change with the new per-bhori price for each karat. This uses the same prose
 * parser, effective-date rule and karat-ladder check as the Worker's UNB fallback, marks every point
 * meta.source = "mirror" with the article URL, and drops isolated spikes (a value more than 12% away from
 * every report within three weeks either side, which is a misread, not a price move). Points are written
 * only for dates before the first one already stored, so BAJUS's own figures are never replaced;
 * re-running is safe.
 *
 * UNB's coverage is sparse before 2025 for gold and before 2026 for silver (gaps of many months), and a
 * chart line across such a gap would invent a trend, so history starts at SINCE.
 */
import { readFileSync } from 'node:fs';
import { KARAT_ORDER, toIsoDate, type Point, type SeriesHistory } from '@bdnumbers/shared';
import { effectiveDate, extractBhoriPrices } from '../src/sources/bajusMirrorParse';
import { assertKaratLadder } from '../src/sources/metals';

const API = process.env.API_BASE ?? 'https://api.bdrate.fyi';
const USER_AGENT = 'Mozilla/5.0 (compatible; bdnumbers/1.0; +https://bdrate.fyi)';
const SEARCH = 'https://unb.com.bd/search?q=gold+price';
const SEARCH_API = 'https://unb.com.bd/api/search?&q=gold%20price&item=';
const SPIKE = 0.12;
const NEIGHBOUR_DAYS = 21;
const SINCE: Record<string, string> = { gold: '2025-01-01', silver: '2026-01-01' };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function ingestToken(): string {
  const line = readFileSync('.dev.vars', 'utf8')
    .split('\n')
    .find((l) => l.startsWith('INGEST_TOKEN='));
  if (!line) throw new Error('INGEST_TOKEN not found in worker/.dev.vars');
  return line.slice('INGEST_TOKEN='.length).trim();
}

async function get(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'user-agent': USER_AGENT } });
  if (!res.ok) throw new Error(`GET ${url} returned HTTP ${res.status}`);
  return res.text();
}

interface Article {
  id: number;
  url: string;
}

/** Every "Gold price(s) …" article in UNB's search, through its infinite-scroll API. */
async function listArticles(): Promise<Article[]> {
  const found = new Map<number, Article>();
  const add = (html: string) => {
    for (const m of html.matchAll(/href="(https:\/\/unb\.com\.bd\/category\/[^"]+?\/(\d+))"[^>]*>([\s\S]*?)<\/a>/g)) {
      const title = m[3]!.replace(/<[^>]+>/g, ' ');
      if (/\bgold prices?\b/i.test(title)) found.set(Number(m[2]), { id: Number(m[2]), url: m[1]! });
    }
  };
  add(await get(SEARCH));
  for (let item = 2; item < 100; item++) {
    const data = JSON.parse(await get(SEARCH_API + item)) as { html?: string; hasMore?: boolean };
    add(data.html ?? '');
    if (!data.hasMore) break;
    await sleep(400);
  }
  return [...found.values()].sort((a, b) => a.id - b.id);
}

const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

/** Inner HTML of the first element whose class list contains `cls`, matching nested <div>s. */
function block(html: string, cls: string): string | null {
  const start = html.indexOf(cls);
  if (start < 0) return null;
  const open = html.lastIndexOf('<div', start);
  const re = /<div\b|<\/div>/g;
  re.lastIndex = html.indexOf('>', start) + 1;
  let depth = 1;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[0] === '</div>' ? -1 : 1;
    if (depth === 0) return html.slice(open, m.index);
  }
  return null;
}

const MONTH = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s*(\d{4})/;

/** Article → per-bhori points (same rules as parseUnbArticle in the Worker). */
function parseArticle(html: string, url: string): { points: Point[]; notes: string[] } {
  const body = decode([...(block(html, 'news-article-text-block') ?? '').matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)].map((m) => m[1]).join(' '));
  if (!/BAJUS|Bangladesh Jewellers/i.test(body)) return { points: [], notes: ['does not mention BAJUS'] };
  const meta = html.slice(html.indexOf('post-meta'), html.indexOf('post-meta') + 2000);
  const m = MONTH.exec(decode(meta));
  const published = m ? toIsoDate(m[3]!, m[1]!, m[2]!) : null;
  if (!published) return { points: [], notes: ['no publish date'] };
  const date = effectiveDate(body, published);
  const prices = extractBhoriPrices(body);
  const points: Point[] = [];
  const notes: string[] = [];
  for (const metal of ['gold', 'silver'] as const) {
    try {
      assertKaratLadder(metal, prices[metal], 'UNB');
    } catch (err) {
      notes.push(`${metal}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    for (const k of KARAT_ORDER) {
      points.push({
        series_key: `${metal}_${k}`,
        date,
        value: prices[metal].get(k)!,
        meta: { source: 'mirror', mirror: 'unb', url, article_date: published, backfill: true },
      });
    }
  }
  return { points, notes };
}

const days = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;

/** Drop values more than SPIKE away from every other report in their series within NEIGHBOUR_DAYS. */
function dropSpikes(points: Point[]): { kept: Point[]; dropped: Point[] } {
  const bySeries = new Map<string, Point[]>();
  for (const p of points) bySeries.set(p.series_key, [...(bySeries.get(p.series_key) ?? []), p]);
  const dropped = new Set<Point>();
  for (const list of bySeries.values()) {
    for (const p of list) {
      const near = list.filter((q) => q !== p && days(q.date, p.date) <= NEIGHBOUR_DAYS);
      if (near.length > 0 && near.every((q) => Math.abs(p.value / q.value - 1) > SPIKE)) dropped.add(p);
    }
  }
  return { kept: points.filter((p) => !dropped.has(p)), dropped: [...dropped] };
}

async function main() {
  const ingest = process.argv.includes('--ingest');
  const articles = await listArticles();
  console.log(`${articles.length} UNB gold price articles (ids ${articles[0]?.id}…${articles.at(-1)?.id})`);

  // Newest article wins for a series and date (corrections come later).
  const byKey = new Map<string, Point>();
  for (const a of articles) {
    try {
      const { points, notes } = parseArticle(await get(a.url), a.url);
      for (const p of points) byKey.set(`${p.series_key}|${p.date}`, p);
      const day = points[0]?.date ?? '—';
      console.log(`${a.id} ${day}: ${points.length / 4} metal(s)${notes.length ? `; skipped ${notes.join('; ')}` : ''}`);
    } catch (err) {
      console.warn(`${a.id}: failed (${err instanceof Error ? err.message : String(err)})`);
    }
    await sleep(500);
  }

  // Only dates before what is already stored.
  const firstStored: Record<string, string> = {};
  for (const metal of ['gold', 'silver']) {
    const h = JSON.parse(await get(`${API}/api/series/${metal}_22k.json`)) as SeriesHistory;
    firstStored[metal] = h.points[0]?.date ?? '9999-12-31';
  }
  const candidates = [...byKey.values()].filter((p) => {
    const metal = p.series_key.split('_')[0]!;
    return p.date >= SINCE[metal]! && p.date < firstStored[metal]!;
  });
  const { kept, dropped } = dropSpikes(candidates);
  for (const p of dropped) console.warn(`dropped spike ${p.series_key} ${p.date} = ${p.value} (${(p.meta as { url: string }).url})`);

  for (const metal of ['gold', 'silver']) {
    const list = kept.filter((p) => p.series_key === `${metal}_22k`).sort((a, b) => a.date.localeCompare(b.date));
    console.log(`${metal} 22K: ${list.length} changes, ${list[0]?.date} → ${list.at(-1)?.date} (stored data starts ${firstStored[metal]})`);
  }
  if (!ingest) {
    if (process.argv.includes('--print')) {
      for (const p of [...kept, ...dropped].filter((q) => q.series_key.endsWith('_22k')).sort((a, b) => a.series_key.localeCompare(b.series_key) || a.date.localeCompare(b.date))) {
        console.log(`  ${p.series_key} ${p.date} ${p.value}${dropped.includes(p) ? '  <- dropped' : ''}`);
      }
    }
    console.log(`dry run: ${kept.length} points would be written; run with --ingest to write them`);
    return;
  }
  const res = await fetch(`${API}/api/ingest`, {
    method: 'POST',
    headers: { authorization: `Bearer ${ingestToken()}`, 'content-type': 'application/json' },
    body: JSON.stringify({ source: 'gold-backfill', mode: 'upsert', points: kept }),
  });
  console.log(`ingest: HTTP ${res.status} ${await res.text()}`);
  if (!res.ok) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
