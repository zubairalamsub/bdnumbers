import { getSeriesDef, type Point, type SeriesDef } from '@bdnumbers/shared';

/** Statements per D1 batch. */
const CHUNK = 100;
const MAX_ERROR_LENGTH = 1000;

/** Insert catalog rows for these series, or update them if the catalog changed. */
export async function ensureSeries(db: D1Database, keys: readonly string[]): Promise<void> {
  const defs = [...new Set(keys)]
    .map((key) => getSeriesDef(key))
    .filter((def): def is SeriesDef => def !== undefined);
  if (defs.length === 0) return;
  const stmt = db.prepare(
    `INSERT INTO series (key, name_bn, name_en, unit, source_name, source_url, cadence, source_key)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
     ON CONFLICT (key) DO UPDATE SET
       name_bn = excluded.name_bn, name_en = excluded.name_en, unit = excluded.unit,
       source_name = excluded.source_name, source_url = excluded.source_url,
       cadence = excluded.cadence, source_key = excluded.source_key
     WHERE series.name_bn IS NOT excluded.name_bn OR series.name_en IS NOT excluded.name_en
        OR series.unit IS NOT excluded.unit OR series.source_name IS NOT excluded.source_name
        OR series.source_url IS NOT excluded.source_url OR series.cadence IS NOT excluded.cadence
        OR series.source_key IS NOT excluded.source_key`,
  );
  await runBatched(
    db,
    defs.map((d) => stmt.bind(d.key, d.name_bn, d.name_en, d.unit, d.source_name, d.source_url, d.cadence, d.source_key)),
  );
}

interface StoredLatest {
  series_key: string;
  date: string;
  value: number;
  meta: string | null;
  stale: number;
}

/** Latest stored point for each of the given series. */
export async function latestStored(db: D1Database, keys: readonly string[]): Promise<Map<string, StoredLatest>> {
  const { results } = await db
    .prepare(
      `SELECT p.series_key, p.date, p.value, p.meta, p.stale FROM points p
       WHERE p.series_key IN (SELECT value FROM json_each(?1))
         AND p.date = (SELECT MAX(q.date) FROM points q WHERE q.series_key = p.series_key)`,
    )
    .bind(JSON.stringify([...new Set(keys)]))
    .all<StoredLatest>();
  return new Map(results.map((r) => [r.series_key, r]));
}

// Writes only when something changed, so re-running a source is free. fetched_at moves only when the
// value changes, so /api/changes.json isn't fooled by a stale flag being cleared.
const UPSERT_POINT = `
  INSERT INTO points (series_key, date, value, meta, fetched_at, stale)
  VALUES (?1, ?2, ?3, ?4, ?5, 0)
  ON CONFLICT (series_key, date) DO UPDATE SET
    value = excluded.value,
    meta = excluded.meta,
    fetched_at = CASE WHEN points.value IS NOT excluded.value THEN excluded.fetched_at ELSE points.fetched_at END,
    stale = 0
  WHERE points.value IS NOT excluded.value OR points.stale = 1 OR points.meta IS NOT excluded.meta`;

/**
 * Store points and return the number of rows inserted or updated.
 * `upsert` writes every point; `on-change` skips a point whose value and meta equal the latest stored
 * point's (clearing that point's stale flag instead) or whose date is older than the latest stored date.
 * Meta counts because some series carry their data there (the holiday list, the savings rate table).
 */
export async function writePoints(
  db: D1Database,
  points: readonly Point[],
  mode: 'upsert' | 'on-change',
  fetchedAt: string,
): Promise<number> {
  const upsert = db.prepare(UPSERT_POINT);
  const clearStale = db.prepare('UPDATE points SET stale = 0 WHERE series_key = ?1 AND date = ?2 AND stale = 1');
  const latest = mode === 'on-change' ? await latestStored(db, points.map((p) => p.series_key)) : null;
  const statements: D1PreparedStatement[] = [];

  for (const p of points) {
    const prior = latest?.get(p.series_key);
    const meta = p.meta ? JSON.stringify(p.meta) : null;
    if (prior && p.date < prior.date) continue;
    if (prior && p.value === prior.value && meta === prior.meta) {
      if (prior.stale) statements.push(clearStale.bind(p.series_key, prior.date));
      continue;
    }
    statements.push(upsert.bind(p.series_key, p.date, p.value, meta, fetchedAt));
  }
  return runBatched(db, statements);
}

/** Flag the latest point of every series produced by `sourceKey` as stale. Returns rows flagged. */
export async function markStale(db: D1Database, sourceKey: string): Promise<number> {
  const result = await db
    .prepare(
      `UPDATE points SET stale = 1
       WHERE stale = 0 AND (series_key, date) IN (
         SELECT p.series_key, MAX(p.date) FROM points p JOIN series s ON s.key = p.series_key
         WHERE s.source_key = ?1 GROUP BY p.series_key)`,
    )
    .bind(sourceKey)
    .run();
  return result.meta.changes ?? 0;
}

/** Store manual corrections; they replace the point for the same series and date when read. */
export async function writeOverrides(db: D1Database, points: readonly Point[]): Promise<number> {
  const stmt = db.prepare(
    `INSERT INTO manual_overrides (series_key, date, value, note) VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT (series_key, date) DO UPDATE SET value = excluded.value, note = excluded.note`,
  );
  return runBatched(
    db,
    points.map((p) => stmt.bind(p.series_key, p.date, p.value, typeof p.meta?.note === 'string' ? p.meta.note : null)),
  );
}

export async function startRun(db: D1Database, source: string, trigger: string, startedAt: string): Promise<number> {
  const row = await db
    .prepare('INSERT INTO runs (source, started_at, trigger) VALUES (?1, ?2, ?3) RETURNING id')
    .bind(source, startedAt, trigger)
    .first<{ id: number }>();
  if (!row) throw new Error(`could not record the start of a ${source} run`);
  return row.id;
}

export async function finishRun(
  db: D1Database,
  id: number,
  ok: boolean,
  error: string | null,
  written: number,
): Promise<void> {
  await db
    .prepare('UPDATE runs SET finished_at = ?1, ok = ?2, error = ?3, points_written = ?4 WHERE id = ?5')
    .bind(new Date().toISOString(), ok ? 1 : 0, error?.slice(0, MAX_ERROR_LENGTH) ?? null, written, id)
    .run();
}

/** Close runs a crashed invocation left open (e.g. one killed by the CPU limit). */
export async function closeOpenRuns(db: D1Database, source: string, error: string): Promise<void> {
  await db
    .prepare('UPDATE runs SET finished_at = ?1, ok = 0, error = ?2 WHERE source = ?3 AND finished_at IS NULL')
    .bind(new Date().toISOString(), error.slice(0, MAX_ERROR_LENGTH), source)
    .run();
}

/** Drop run logs older than `keepDays` so status queries stay cheap. */
export async function pruneRuns(db: D1Database, keepDays = 90): Promise<void> {
  const cutoff = new Date(Date.now() - keepDays * 24 * 60 * 60 * 1000).toISOString();
  await db.prepare('DELETE FROM runs WHERE started_at < ?1').bind(cutoff).run();
}

/** Run statements in D1 batches of CHUNK; returns the rows changed. */
export async function runBatched(db: D1Database, statements: readonly D1PreparedStatement[]): Promise<number> {
  let changes = 0;
  for (let i = 0; i < statements.length; i += CHUNK) {
    const results = await db.batch(statements.slice(i, i + CHUNK));
    for (const r of results) changes += r.meta.changes ?? 0;
  }
  return changes;
}
