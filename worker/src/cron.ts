import { checkAlerts, type AlertOutcome } from './alerts';
import { refreshCaches } from './cache';
import { pruneRuns } from './db';
import { triggerPagesDeploy, type DeployOutcome } from './deploy';
import { refreshDistrictWeather, type DistrictWeatherOutcome } from './districtWeather';
import { sendDigest, type DigestOutcome } from './digest';
import type { Env } from './env';
import { errorMessage } from './lib/errors';
import { batchChanges, sendPushes, type PushOutcome } from './notify';
import { failSource, runSource, type RunResult } from './run';
import { sourcesFor } from './sources';
import type { Batch, Source } from './sources/types';

/** Must match [triggers] crons in wrangler.toml. */
export const DAILY_CRON = '0 1,7 * * *';
export const HOURLY_CRON = '15 * * * *';

export function batchForCron(cron: string): Batch | null {
  if (cron === DAILY_CRON) return 'daily';
  if (cron === HOURLY_CRON) return 'hourly';
  return null;
}

export type Invoker = (source: Source, trigger: string) => Promise<RunResult>;

/** Runs the source inside the current invocation. */
export function inlineInvoker(env: Env): Invoker {
  return (source, trigger) => runSource(env, source, trigger);
}

/** Runs the source in its own invocation via the SELF binding, so it gets its own CPU budget. */
export function fanoutInvoker(env: Env): Invoker {
  return async (source, trigger) => {
    try {
      const res = await env.SELF.fetch(
        `https://self/internal/run/${source.key}?trigger=${encodeURIComponent(trigger)}`,
        { method: 'POST', headers: { authorization: `Bearer ${env.INTERNAL_TOKEN}` } },
      );
      if (res.ok) return await res.json<RunResult>();
      throw new Error(`internal run returned HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    } catch (err) {
      // The sub-invocation died (e.g. exceeded CPU) before it could record its own result.
      const message = errorMessage(err);
      console.error(`[${source.key}] fan-out failed: ${message}`);
      await failSource(env, source.key, message, null);
      return { source: source.key, ok: false, error: message, written: 0, run_id: null };
    }
  };
}

export function invokerFor(env: Env): Invoker {
  if (env.RUN_MODE === 'inline') return inlineInvoker(env);
  if (!env.INTERNAL_TOKEN) {
    console.warn('INTERNAL_TOKEN is not set; running sources inline');
    return inlineInvoker(env);
  }
  return fanoutInvoker(env);
}

export interface BatchResult {
  batch: Batch;
  trigger: string;
  results: RunResult[];
  written: number;
  deploy: DeployOutcome;
  push: PushOutcome | 'skipped';
  digest: DigestOutcome | 'skipped';
  alerts: AlertOutcome;
  /** Hourly batches also refresh the district weather snapshot for the map. */
  districtWeather: DistrictWeatherOutcome | 'skipped';
}

/**
 * Run every source in a batch concurrently. One source failing never stops the others. Afterwards the
 * KV caches are rebuilt (which also invalidates edge-cached /api responses). After a daily batch that
 * wrote anything, the Pages site is rebuilt and web pushes go out for the numbers that moved; the
 * afternoon daily batch also sends the email digest. `now` only decides whether the digest is due.
 * Every batch ends by emailing the owner about sources that started failing or recovered.
 */
export async function runBatch(
  env: Env,
  batch: Batch,
  trigger: string,
  invoke: Invoker = invokerFor(env),
  now: Date = new Date(),
): Promise<BatchResult> {
  const startedAt = new Date().toISOString();
  const sources = sourcesFor(batch);
  // The district snapshot is stored before the caches are rebuilt, so the cache-version bump covers it.
  const [results, districtWeather] = await Promise.all([
    Promise.all(
      sources.map((source) =>
        invoke(source, trigger).catch(
          (err): RunResult => ({ source: source.key, ok: false, error: errorMessage(err), written: 0, run_id: null }),
        ),
      ),
    ),
    batch === 'hourly'
      ? refreshDistrictWeather(env).catch((err): 'skipped' => {
          console.error(`district weather failed: ${errorMessage(err)}`);
          return 'skipped';
        })
      : ('skipped' as const),
  ]);
  const written = results.reduce((sum, r) => sum + r.written, 0);

  let deploy: DeployOutcome = 'skipped';
  let push: BatchResult['push'] = 'skipped';
  let digest: BatchResult['digest'] = 'skipped';
  if (sources.length > 0) {
    await refreshCaches(env);
    if (batch === 'daily') {
      await pruneRuns(env.DB);
      if (written > 0) {
        deploy = await triggerPagesDeploy(env);
        push = (await sendPushes(env, await batchChanges(env, startedAt))).outcome;
      }
      digest = await sendDigest(env, now);
    }
  }

  const alerts = await checkAlerts(env, results, now);

  const summary: BatchResult = { batch, trigger, results, written, deploy, push, digest, alerts, districtWeather };
  console.log(JSON.stringify(summary));
  return summary;
}
