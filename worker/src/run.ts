import type { IngestPayload, IngestResult } from '@bdnumbers/shared';
import { closeOpenRuns, ensureSeries, finishRun, markStale, startRun, writeOverrides, writePoints } from './db';
import type { Env } from './env';
import { errorMessage } from './lib/errors';
import type { Source } from './sources/types';
import { validatePoints } from './validate';

export interface RunResult {
  source: string;
  ok: boolean;
  /** Failure reason, or warnings on a successful run (e.g. "used mirror"). */
  error: string | null;
  written: number;
  run_id: number | null;
}

/**
 * Run one source: log a run, fetch, validate, write. Never throws for a source failure; on failure the
 * source's latest points are flagged stale so the API keeps serving the last good value, marked as such.
 */
export async function runSource(env: Env, source: Source, trigger: string): Promise<RunResult> {
  const runId = await startRun(env.DB, source.key, trigger, new Date().toISOString());
  const warnings: string[] = [];
  try {
    const points = await source.fetch(env, {
      warn: (message) => {
        warnings.push(message);
        console.warn(`[${source.key}] ${message}`);
      },
    });
    const fetchedAt = new Date().toISOString();
    validatePoints(points);
    await ensureSeries(env.DB, points.map((p) => p.series_key));
    const written = await writePoints(env.DB, points, source.writeMode, fetchedAt);
    const note = warnings.length > 0 ? warnings.join('; ') : null;
    await finishRun(env.DB, runId, true, note, written);
    return { source: source.key, ok: true, error: note, written, run_id: runId };
  } catch (err) {
    const message = [...warnings, errorMessage(err)].join('; ');
    console.error(`[${source.key}] failed: ${message}`);
    await failSource(env, source.key, message, runId);
    return { source: source.key, ok: false, error: message, written: 0, run_id: runId };
  }
}

/** Record a failure and flag the source's latest points stale. Without a run id, closes any run left open. */
export async function failSource(env: Env, sourceKey: string, message: string, runId: number | null): Promise<void> {
  await markStale(env.DB, sourceKey);
  if (runId === null) await closeOpenRuns(env.DB, sourceKey, message);
  else await finishRun(env.DB, runId, false, message, 0);
}

/** Write points sent to POST /api/ingest, logged as an `ingest:<source>` run. */
export async function ingestPoints(env: Env, payload: IngestPayload): Promise<IngestResult> {
  const source = `ingest:${payload.source}`;
  const runId = await startRun(env.DB, source, 'ingest', new Date().toISOString());
  try {
    validatePoints(payload.points);
    let written: number;
    if (payload.override) {
      written = await writeOverrides(env.DB, payload.points);
    } else {
      await ensureSeries(env.DB, payload.points.map((p) => p.series_key));
      written = await writePoints(env.DB, payload.points, payload.mode ?? 'upsert', new Date().toISOString());
    }
    await finishRun(env.DB, runId, true, null, written);
    return { ok: true, run_id: runId, written, error: null };
  } catch (err) {
    const message = errorMessage(err);
    await finishRun(env.DB, runId, false, message, 0);
    return { ok: false, run_id: runId, written: 0, error: message };
  }
}
