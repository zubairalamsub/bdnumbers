// The phone price steps the crons run: the hourly crawl (then phones.json, if anything changed) and the
// daily history snapshot. Publishing and the snapshot each get an invocation of their own (SELF), like the
// crawl's pages, so the cron's own invocation only waits.
import type { Env } from '../env';
import { errorMessage } from '../lib/errors';
import type { RunResult } from '../run';
import { crawlPhones, shopInvokerFor, type ShopInvoker } from './crawl';
import { publishPhones, snapshotPhones, type PublishOutcome } from './publish';

/** Last phones.json hash a site build was triggered for (see dailyPhones). */
const DEPLOYED_HASH_KEY = 'phones:deployed-hash';

type Step = 'publish' | 'snapshot';

async function step<T>(env: Env, name: Step): Promise<T> {
  if (env.RUN_MODE === 'inline' || !env.INTERNAL_TOKEN) {
    return (name === 'publish' ? publishPhones(env) : snapshotPhones(env)) as Promise<T>;
  }
  const res = await env.SELF.fetch(`https://self/internal/phones/${name}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.INTERNAL_TOKEN}` },
  });
  if (!res.ok) throw new Error(`phones ${name}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json<T>();
}

/** The hourly crawl of every shop; phones.json is rebuilt when any shop's prices changed. */
export async function refreshPhones(env: Env, trigger: string, invoke: ShopInvoker = shopInvokerFor(env)): Promise<RunResult[]> {
  const results = await crawlPhones(env, trigger, invoke);
  if (results.some((r) => r.written > 0)) {
    await step<PublishOutcome>(env, 'publish').catch((err) => console.error(`phones publish failed: ${errorMessage(err)}`));
  }
  return results;
}

export interface DailyPhonesOutcome {
  models: number;
  /** Prices changed since the last site build this step asked for. */
  changed: boolean;
  hash: string | null;
}

/** Once a day: rebuild phones.json, record the day's lowest prices, and say whether the site needs a build. */
export async function dailyPhones(env: Env): Promise<DailyPhonesOutcome> {
  try {
    const published = await step<PublishOutcome>(env, 'publish');
    await step(env, 'snapshot');
    const deployed = await env.CACHE.get(DEPLOYED_HASH_KEY);
    return { models: published.models, changed: published.models > 0 && published.hash !== deployed, hash: published.hash };
  } catch (err) {
    console.error(`daily phones failed: ${errorMessage(err)}`);
    return { models: 0, changed: false, hash: null };
  }
}

/** Remember the phone prices a site build was triggered for. */
export async function markPhonesDeployed(env: Env, hash: string | null): Promise<void> {
  if (hash) await env.CACHE.put(DEPLOYED_HASH_KEY, hash);
}
