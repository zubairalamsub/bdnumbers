import { BAJUS_GOLD_URL, BB_EXCHANGE_URL } from '@bdnumbers/shared';
import { createScheduledController } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getLatest } from '../src/cache';
import { DAILY_CRON, HOURLY_CRON, fanoutInvoker, runBatch } from '../src/cron';
import worker from '../src/index';
import { UNB_SEARCH_URL } from '../src/sources/bajusMirror';
import { bajusGold } from '../src/sources/bajusGold';
import {
  FIXTURES,
  UNB_ARTICLE_URL,
  calledUrls,
  html,
  httpStatus,
  mockFetch,
  resetStorage,
  seedPoints,
} from './helpers';

const DEPLOY_HOOK = 'https://deploy-hook.test/hook';
const deployOk = () => new Response('{"success":true}', { status: 200 });

interface RunRow {
  source: string;
  ok: number | null;
  error: string | null;
  points_written: number;
  finished_at: string | null;
}

async function runs(): Promise<RunRow[]> {
  const { results } = await env.DB.prepare(
    'SELECT source, ok, error, points_written, finished_at FROM runs ORDER BY id',
  ).all<RunRow>();
  return results;
}

async function latestPoint(key: string) {
  return env.DB.prepare(
    'SELECT date, value, stale, meta FROM points WHERE series_key = ?1 ORDER BY date DESC LIMIT 1',
  )
    .bind(key)
    .first<{ date: string; value: number; stale: number; meta: string | null }>();
}

beforeEach(async () => {
  await resetStorage();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('scheduled()', () => {
  it('completes with one source failing: the other is stored, the failure is logged and flagged stale', async () => {
    await seedPoints([{ series_key: 'gold_22k', date: '2026-10-20', value: 230_000 }]);
    const fetchSpy = mockFetch({
      [BB_EXCHANGE_URL]: html(FIXTURES.bb),
      [BAJUS_GOLD_URL]: httpStatus(503),
      [UNB_SEARCH_URL]: httpStatus(500),
      [DEPLOY_HOOK]: deployOk,
    });

    await worker.scheduled(createScheduledController({ cron: DAILY_CRON }), env);

    const log = await runs();
    expect(log.map((r) => [r.source, r.ok])).toEqual(
      expect.arrayContaining([
        ['bangladeshBank', 1],
        ['bajusGold', 0],
      ]),
    );
    const bajusRun = log.find((r) => r.source === 'bajusGold')!;
    expect(bajusRun.error).toMatch(/BAJUS: GET https:\/\/www\.bajus\.org\/gold-price returned HTTP 503; UNB mirror: .*HTTP 500/);
    expect(log.every((r) => r.finished_at !== null)).toBe(true);

    expect(await latestPoint('usd_bdt_avg')).toMatchObject({ date: '2026-10-19', value: 123.65, stale: 0 });
    expect(await latestPoint('gold_22k')).toMatchObject({ date: '2026-10-20', value: 230_000, stale: 1 });

    // KV was rebuilt: the API serves the last good gold price, marked stale.
    const latest = await getLatest(env);
    expect(latest.series.find((s) => s.key === 'gold_22k')).toMatchObject({ value: 230_000, stale: true });
    expect(latest.series.find((s) => s.key === 'usd_bdt_avg')).toMatchObject({ value: 123.65, stale: false });

    expect(calledUrls(fetchSpy).filter((u) => u === DEPLOY_HOOK)).toHaveLength(1);
  });

  it('does nothing for the hourly cron until hourly sources exist', async () => {
    const fetchSpy = mockFetch({});
    await worker.scheduled(createScheduledController({ cron: HOURLY_CRON }), env);
    expect(await runs()).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('ignores an unknown cron expression', async () => {
    const fetchSpy = mockFetch({});
    await worker.scheduled(createScheduledController({ cron: '*/5 * * * *' }), env);
    expect(await runs()).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('runBatch', () => {
  it('falls back to the UNB mirror when BAJUS is down', async () => {
    mockFetch({
      [BB_EXCHANGE_URL]: html(FIXTURES.bb),
      [BAJUS_GOLD_URL]: httpStatus(502),
      [UNB_SEARCH_URL]: html(FIXTURES.unbSearch),
      [UNB_ARTICLE_URL]: html(FIXTURES.unbArticle),
      [DEPLOY_HOOK]: deployOk,
    });

    const result = await runBatch(env, 'daily', 'test');
    const bajus = result.results.find((r) => r.source === 'bajusGold')!;
    expect(bajus.ok).toBe(true);
    expect(bajus.error).toMatch(/BAJUS failed .*HTTP 502.*used UNB mirror/);
    expect(bajus.error).toMatch(/UNB silver skipped/);

    const gold = await latestPoint('gold_22k');
    expect(gold).toMatchObject({ date: '2026-10-13', value: 228_031, stale: 0 });
    expect(JSON.parse(gold!.meta!)).toMatchObject({ source: 'mirror', url: UNB_ARTICLE_URL });
    expect(await latestPoint('silver_22k')).toBeNull();
  });

  it('counts the run as failed when BAJUS is down and the mirror has nothing newer', async () => {
    await seedPoints([
      { series_key: 'gold_22k', date: '2026-10-22', value: 226_340 },
      { series_key: 'gold_21k', date: '2026-10-22', value: 216_192 },
      { series_key: 'gold_18k', date: '2026-10-22', value: 185_691 },
      { series_key: 'gold_traditional', date: '2026-10-22', value: 151_690 },
    ]);
    mockFetch({
      [BB_EXCHANGE_URL]: html(FIXTURES.bb),
      [BAJUS_GOLD_URL]: httpStatus(403),
      [UNB_SEARCH_URL]: html(FIXTURES.unbSearch),
      [UNB_ARTICLE_URL]: html(FIXTURES.unbArticle),
      [DEPLOY_HOOK]: deployOk,
    });

    const result = await runBatch(env, 'daily', 'test');
    const bajus = result.results.find((r) => r.source === 'bajusGold')!;
    expect(bajus.ok).toBe(false);
    expect(bajus.error).toMatch(/HTTP 403; UNB mirror has nothing newer \(article 2026-10-13, stored 2026-10-22\)/);
    expect(await latestPoint('gold_22k')).toMatchObject({ date: '2026-10-22', value: 226_340, stale: 1 });
  });

  it('retries a transient failure once', async () => {
    let bajusCalls = 0;
    mockFetch({
      [BB_EXCHANGE_URL]: html(FIXTURES.bb),
      // 520: Cloudflare's "origin returned an unknown error", seen from bb.org.bd during an outage.
      [BAJUS_GOLD_URL]: () => (++bajusCalls === 1 ? new Response('busy', { status: 520 }) : html(FIXTURES.bajus)()),
      [DEPLOY_HOOK]: deployOk,
    });
    const result = await runBatch(env, 'daily', 'test');
    expect(bajusCalls).toBe(2);
    expect(result.results.find((r) => r.source === 'bajusGold')).toMatchObject({ ok: true, error: null, written: 8 });
  });

  it('says why a request was blocked', async () => {
    const challenge = () =>
      new Response('<html><head><title>Just a moment...</title></head></html>', {
        status: 403,
        headers: { 'cf-mitigated': 'challenge' },
      });
    mockFetch({ [BB_EXCHANGE_URL]: challenge, [BAJUS_GOLD_URL]: html(FIXTURES.bajus), [DEPLOY_HOOK]: deployOk });
    const result = await runBatch(env, 'daily', 'test');
    expect(result.results.find((r) => r.source === 'bangladeshBank')!.error).toBe(
      'GET https://www.bb.org.bd/en/index.php/econdata/exchangerate returned HTTP 403 (cf-mitigated: challenge, title "Just a moment...")',
    );
  });

  it('writes BAJUS prices only when they change, and rebuilds the site only when something was written', async () => {
    const fetchSpy = mockFetch({
      [BB_EXCHANGE_URL]: html(FIXTURES.bb),
      [BAJUS_GOLD_URL]: html(FIXTURES.bajus),
      [DEPLOY_HOOK]: deployOk,
    });

    const first = await runBatch(env, 'daily', 'test');
    expect(first.results.every((r) => r.ok)).toBe(true);
    expect(first.written).toBe(23 + 8);
    expect(first.deploy).toBe('triggered');

    const second = await runBatch(env, 'daily', 'test');
    expect(second.written).toBe(0);
    expect(second.deploy).toBe('skipped');
    expect(calledUrls(fetchSpy).filter((u) => u === DEPLOY_HOOK)).toHaveLength(1);
  });

  it('clears the stale flag when a failed source recovers with the same value', async () => {
    mockFetch({ [BB_EXCHANGE_URL]: httpStatus(500), [BAJUS_GOLD_URL]: html(FIXTURES.bajus), [DEPLOY_HOOK]: deployOk });
    await runBatch(env, 'daily', 'test');
    vi.restoreAllMocks();

    mockFetch({ [BB_EXCHANGE_URL]: html(FIXTURES.bb), [BAJUS_GOLD_URL]: httpStatus(500), [UNB_SEARCH_URL]: httpStatus(500), [DEPLOY_HOOK]: deployOk });
    await runBatch(env, 'daily', 'test');
    expect((await latestPoint('gold_22k'))!.stale).toBe(1);
    vi.restoreAllMocks();

    mockFetch({ [BB_EXCHANGE_URL]: html(FIXTURES.bb), [BAJUS_GOLD_URL]: html(FIXTURES.bajus), [DEPLOY_HOOK]: deployOk });
    const recovered = await runBatch(env, 'daily', 'test');
    expect((await latestPoint('gold_22k'))!.stale).toBe(0);
    expect(recovered.deploy).toBe('triggered');
  });
});

describe('fanoutInvoker', () => {
  it('records a failure and flags stale when the sub-invocation dies', async () => {
    await seedPoints([{ series_key: 'gold_22k', date: '2026-10-20', value: 230_000 }]);
    const brokenSelf = { fetch: async () => new Response('Worker exceeded CPU time limit.', { status: 503 }) };
    const invoke = fanoutInvoker({ ...env, SELF: brokenSelf as unknown as Fetcher });

    const result = await invoke(bajusGold, 'test');

    expect(result).toMatchObject({ source: 'bajusGold', ok: false, run_id: null });
    expect(result.error).toMatch(/internal run returned HTTP 503: Worker exceeded CPU time limit/);
    expect((await latestPoint('gold_22k'))!.stale).toBe(1);
  });
});
