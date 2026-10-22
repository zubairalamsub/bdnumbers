import {
  SERIES,
  dhakaDayStartUtc,
  getSeriesDef,
  type Change,
  type ChangeEntry,
  type ChangesResponse,
  type HistoryPoint,
  type LatestEntry,
  type LatestResponse,
  type PointMeta,
  type RunSummary,
  type SeriesDef,
  type SeriesHistory,
  type SourceStatus,
  type StatusResponse,
} from '@bdnumbers/shared';
import { SOURCES } from './sources';

type Ref = [date: string, value: number];

interface LatestRow {
  series_key: string;
  date: string;
  value: number;
  meta: string | null;
  fetched_at: string;
  stale: number;
  prev: string | null;
  d7: string | null;
  d30: string | null;
  y1: string | null;
}

interface OverrideRow {
  series_key: string;
  date: string;
  value: number;
  note: string | null;
}

/** The point on or before `modifier` (e.g. '-7 days') relative to the latest date, as json [date, value]. */
function refBefore(modifier: string): string {
  const target = `CASE WHEN length(l.d) > 10 THEN strftime('%Y-%m-%dT%H:%M', l.d, '${modifier}') ELSE date(l.d, '${modifier}') END`;
  return `(SELECT json_array(q.date, q.value) FROM points q
           WHERE q.series_key = l.key AND q.date <= ${target} ORDER BY q.date DESC LIMIT 1)`;
}

// Every lookup is a primary-key range scan, so rows read stay proportional to the number of series,
// not to the length of history.
const LATEST_SQL = `
  WITH last AS (
    SELECT s.key, (SELECT MAX(q.date) FROM points q WHERE q.series_key = s.key) AS d FROM series s
  )
  SELECT p.series_key, p.date, p.value, p.meta, p.fetched_at, p.stale,
    (SELECT json_array(q.date, q.value) FROM points q
      WHERE q.series_key = l.key AND q.date < l.d ORDER BY q.date DESC LIMIT 1) AS prev,
    ${refBefore('-7 days')} AS d7,
    ${refBefore('-30 days')} AS d30,
    ${refBefore('-1 years')} AS y1
  FROM last l JOIN points p ON p.series_key = l.key AND p.date = l.d`;

interface Draft {
  def: SeriesDef;
  date: string;
  value: number;
  fetched_at: string | null;
  stale: boolean;
  overridden: boolean;
  meta: PointMeta | null;
  refs: Record<'prev' | 'd7' | 'd30' | 'y1', Ref | null>;
}

const ORDER = new Map(SERIES.map((s, i) => [s.key, i]));

/** Latest value of every series with change vs the previous point and 7d/30d/1y ago. Manual overrides win. */
export async function buildLatest(db: D1Database): Promise<LatestResponse> {
  const [latest, overrides, lastOk] = await db.batch([
    db.prepare(LATEST_SQL),
    db.prepare('SELECT series_key, date, value, note FROM manual_overrides ORDER BY date'),
    db.prepare('SELECT source, MAX(finished_at) AS at FROM runs WHERE ok = 1 GROUP BY source'),
  ]);
  const checkedAt = new Map(((lastOk?.results ?? []) as { source: string; at: string }[]).map((r) => [r.source, r.at]));
  const drafts = new Map<string, Draft>();

  for (const row of (latest?.results ?? []) as LatestRow[]) {
    const def = getSeriesDef(row.series_key);
    if (!def) continue;
    drafts.set(row.series_key, {
      def,
      date: row.date,
      value: row.value,
      fetched_at: row.fetched_at,
      stale: row.stale === 1,
      overridden: false,
      meta: row.meta ? (JSON.parse(row.meta) as PointMeta) : null,
      refs: { prev: parseRef(row.prev), d7: parseRef(row.d7), d30: parseRef(row.d30), y1: parseRef(row.y1) },
    });
  }

  for (const o of (overrides?.results ?? []) as OverrideRow[]) {
    const def = getSeriesDef(o.series_key);
    if (!def) continue;
    const current = drafts.get(o.series_key);
    if (current && o.date < current.date) continue;
    if (current && o.date === current.date) {
      current.value = o.value;
      current.overridden = true;
      current.stale = false;
      continue;
    }
    // An override newer than any fetched point becomes the latest value. The 7d/30d/1y references
    // still come from fetched points, so they are approximate in this case.
    drafts.set(o.series_key, {
      def,
      date: o.date,
      value: o.value,
      fetched_at: null,
      stale: false,
      overridden: true,
      meta: o.note ? { note: o.note } : null,
      refs: {
        prev: current ? [current.date, current.value] : null,
        d7: current?.refs.d7 ?? null,
        d30: current?.refs.d30 ?? null,
        y1: current?.refs.y1 ?? null,
      },
    });
  }

  const series = [...drafts.values()]
    .sort((a, b) => (ORDER.get(a.def.key) ?? Infinity) - (ORDER.get(b.def.key) ?? Infinity) || a.def.key.localeCompare(b.def.key))
    .map((d) => toEntry(d, checkedAt.get(d.def.source_key) ?? d.fetched_at));
  return { generated_at: new Date().toISOString(), series };
}

function toEntry(d: Draft, checkedAt: string | null): LatestEntry {
  return {
    key: d.def.key,
    name_bn: d.def.name_bn,
    name_en: d.def.name_en,
    unit: d.def.unit,
    category: d.def.category,
    source_name: d.def.source_name,
    source_url: d.def.source_url,
    value: d.value,
    date: d.date,
    fetched_at: d.fetched_at,
    checked_at: checkedAt,
    stale: d.stale,
    overridden: d.overridden,
    meta: d.meta,
    change: {
      prev: change(d.refs.prev, d.value),
      d7: change(d.refs.d7, d.value),
      d30: change(d.refs.d30, d.value),
      y1: change(d.refs.y1, d.value),
    },
  };
}

function parseRef(json: string | null): Ref | null {
  if (!json) return null;
  const [date, value] = JSON.parse(json) as [string, number];
  return [date, value];
}

function round(x: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}

export function change(ref: Ref | null, value: number): Change | null {
  if (!ref) return null;
  const [date, from] = ref;
  return {
    from,
    date,
    abs: round(value - from, 6),
    pct: from === 0 ? null : round(((value - from) / from) * 100, 4),
  };
}

/** History of one series between optional inclusive dates (date-only bounds include all hours of that day). */
export async function buildHistory(db: D1Database, def: SeriesDef, from: string | null, to: string | null): Promise<SeriesHistory> {
  const [points, overrides] = await db.batch([
    db
      .prepare(
        `SELECT date, value, stale FROM points
         WHERE series_key = ?1 AND date >= ?2 AND substr(date, 1, length(?3)) <= ?3 ORDER BY date`,
      )
      .bind(def.key, from ?? '0000', to ?? '9999'),
    db
      .prepare(
        `SELECT date, value FROM manual_overrides
         WHERE series_key = ?1 AND date >= ?2 AND substr(date, 1, length(?3)) <= ?3`,
      )
      .bind(def.key, from ?? '0000', to ?? '9999'),
  ]);

  const byDate = new Map<string, HistoryPoint>();
  for (const p of (points?.results ?? []) as { date: string; value: number; stale: number }[]) {
    byDate.set(p.date, { date: p.date, value: p.value, stale: p.stale === 1, overridden: false });
  }
  for (const o of (overrides?.results ?? []) as { date: string; value: number }[]) {
    byDate.set(o.date, { date: o.date, value: o.value, stale: false, overridden: true });
  }
  const sorted = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  return { series: def, from, to, points: sorted };
}

interface RunRow {
  id: number;
  source: string;
  trigger: string | null;
  started_at: string;
  finished_at: string | null;
  ok: number | null;
  error: string | null;
  points_written: number;
}

/** Last run, last success, 24h failure count and stale series for every source. */
export async function buildStatus(db: D1Database): Promise<StatusResponse> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [lastRuns, lastOk, failures, stale] = await db.batch([
    db.prepare(
      `SELECT r.* FROM runs r JOIN (SELECT source, MAX(id) AS id FROM runs GROUP BY source) m ON m.id = r.id`,
    ),
    db.prepare('SELECT source, MAX(finished_at) AS at FROM runs WHERE ok = 1 GROUP BY source'),
    db.prepare('SELECT source, COUNT(*) AS n FROM runs WHERE ok = 0 AND started_at >= ?1 GROUP BY source').bind(since),
    db.prepare(
      `SELECT p.series_key, s.source_key FROM points p JOIN series s ON s.key = p.series_key
       WHERE p.stale = 1 AND p.date = (SELECT MAX(q.date) FROM points q WHERE q.series_key = p.series_key)
       ORDER BY p.series_key`,
    ),
  ]);

  const runBySource = new Map(((lastRuns?.results ?? []) as RunRow[]).map((r) => [r.source, r]));
  const okBySource = new Map(((lastOk?.results ?? []) as { source: string; at: string }[]).map((r) => [r.source, r.at]));
  const failBySource = new Map(((failures?.results ?? []) as { source: string; n: number }[]).map((r) => [r.source, r.n]));
  const staleBySource = new Map<string, string[]>();
  for (const row of (stale?.results ?? []) as { series_key: string; source_key: string }[]) {
    staleBySource.set(row.source_key, [...(staleBySource.get(row.source_key) ?? []), row.series_key]);
  }

  const names = [...new Set([...SOURCES.map((s) => s.key), ...runBySource.keys()])];
  const sources: SourceStatus[] = names.map((source) => {
    const run = runBySource.get(source);
    return {
      source,
      last_run: run ? toRunSummary(run) : null,
      last_ok_at: okBySource.get(source) ?? null,
      failures_24h: failBySource.get(source) ?? 0,
      stale_series: staleBySource.get(source) ?? [],
    };
  });
  return { generated_at: new Date().toISOString(), sources };
}

function toRunSummary(r: RunRow): RunSummary {
  return {
    id: r.id,
    source: r.source,
    trigger: r.trigger,
    started_at: r.started_at,
    finished_at: r.finished_at,
    ok: r.ok === 1,
    error: r.error,
    points_written: r.points_written,
  };
}

/**
 * Series whose latest value was fetched on Dhaka-local `today` and differs from the point before it.
 * Only each series' latest point counts, so a backfill of older days fetched today isn't a "change".
 */
export async function buildChanges(db: D1Database, today: string): Promise<ChangesResponse> {
  const { results } = await db
    .prepare(
      `SELECT p.series_key, p.date, p.value, p.fetched_at,
         (SELECT q.value FROM points q WHERE q.series_key = p.series_key AND q.date < p.date
          ORDER BY q.date DESC LIMIT 1) AS previous
       FROM points p
       WHERE p.fetched_at >= ?1
         AND p.date = (SELECT MAX(q.date) FROM points q WHERE q.series_key = p.series_key)
       ORDER BY p.fetched_at DESC`,
    )
    .bind(dhakaDayStartUtc(today))
    .all<{ series_key: string; date: string; value: number; fetched_at: string; previous: number | null }>();

  const seen = new Set<string>();
  const changes: ChangeEntry[] = [];
  for (const r of results) {
    if (seen.has(r.series_key)) continue;
    seen.add(r.series_key);
    if (r.previous !== null && r.previous === r.value) continue;
    const def = getSeriesDef(r.series_key);
    if (!def) continue;
    changes.push({
      key: def.key,
      name_bn: def.name_bn,
      name_en: def.name_en,
      unit: def.unit,
      date: r.date,
      value: r.value,
      previous: r.previous,
      fetched_at: r.fetched_at,
    });
  }
  changes.sort((a, b) => (ORDER.get(a.key) ?? Infinity) - (ORDER.get(b.key) ?? Infinity));
  return { date: today, changes };
}
