import type { ChangesResponse, IngestResult, LatestResponse, SeriesHistory, StatusResponse } from '@bdnumbers/shared';
import { dhakaDate } from '@bdnumbers/shared';
import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { refreshCaches } from '../src/cache';
import { request, resetStorage, seedPoints } from './helpers';

const INGEST_AUTH = { authorization: 'Bearer test-ingest-token', 'content-type': 'application/json' };

let ip = 0;
/** A fresh client address per request, so the ingest rate limit only applies where a test wants it. */
const freshIp = () => `198.51.100.${++ip % 250}`;

async function ingest(body: unknown, headers: Record<string, string> = INGEST_AUTH, client = freshIp()) {
  return request('/api/ingest', {
    method: 'POST',
    headers: { ...headers, 'cf-connecting-ip': client },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(async () => {
  await resetStorage();
  await seedPoints([
    { series_key: 'usd_bdt_avg', date: '2025-10-19', value: 100 },
    { series_key: 'usd_bdt_avg', date: '2026-09-19', value: 120 },
    { series_key: 'usd_bdt_avg', date: '2026-10-12', value: 122 },
    { series_key: 'usd_bdt_avg', date: '2026-10-16', value: 123 },
    { series_key: 'usd_bdt_avg', date: '2026-10-19', value: 123.65 },
    { series_key: 'gold_22k', date: '2026-10-22', value: 226_340 },
  ]);
  await refreshCaches(env);
});

describe('GET /api/latest.json', () => {
  it('returns the latest value with change vs previous, 7d, 30d and 1y', async () => {
    const res = await request('/api/latest.json');
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('cache-control')).toBe('public, max-age=300');

    const body = await res.json<LatestResponse>();
    const usd = body.series.find((s) => s.key === 'usd_bdt_avg')!;
    expect(usd).toMatchObject({ value: 123.65, date: '2026-10-19', unit: 'BDT', category: 'fx', stale: false });
    expect(usd.change.prev).toEqual({ from: 123, date: '2026-10-16', abs: 0.65, pct: 0.5285 });
    expect(usd.change.d7).toMatchObject({ from: 122, date: '2026-10-12' });
    expect(usd.change.d30).toMatchObject({ from: 120, date: '2026-09-19' });
    expect(usd.change.y1).toMatchObject({ from: 100, date: '2025-10-19', abs: 23.65, pct: 23.65 });

    const gold = body.series.find((s) => s.key === 'gold_22k')!;
    expect(gold.change).toEqual({ prev: null, d7: null, d30: null, y1: null });
    // catalog order: USD before gold
    expect(body.series.findIndex((s) => s.key === 'usd_bdt_avg')).toBeLessThan(
      body.series.findIndex((s) => s.key === 'gold_22k'),
    );
  });

  it("reports when each value was last confirmed by its source", async () => {
    await env.DB.prepare(
      "INSERT INTO runs (source, started_at, finished_at, ok, points_written) VALUES ('bangladeshBank', '2026-10-22T01:00:00.000Z', '2026-10-22T01:00:03.000Z', 1, 0)",
    ).run();
    await refreshCaches(env);
    const body = await (await request('/api/latest.json')).json<LatestResponse>();
    // BB confirmed the unchanged value today; gold has no successful run, so it falls back to fetched_at.
    expect(body.series.find((s) => s.key === 'usd_bdt_avg')!.checked_at).toBe('2026-10-22T01:00:03.000Z');
    expect(body.series.find((s) => s.key === 'gold_22k')!.checked_at).toBe('2026-01-01T00:00:00.000Z');
  });

  it('applies manual overrides', async () => {
    await env.DB.prepare("INSERT INTO manual_overrides VALUES ('usd_bdt_avg', '2026-10-19', 124, 'typo on BB site')").run();
    await refreshCaches(env);
    const body = await (await request('/api/latest.json')).json<LatestResponse>();
    expect(body.series.find((s) => s.key === 'usd_bdt_avg')).toMatchObject({ value: 124, overridden: true });
  });
});

describe('GET /api/series/:key.json', () => {
  it('returns history within the range', async () => {
    const res = await request('/api/series/usd_bdt_avg.json?from=2026-10-01&to=2026-10-19');
    const body = await res.json<SeriesHistory>();
    expect(body.series.key).toBe('usd_bdt_avg');
    expect(body.points.map((p) => [p.date, p.value])).toEqual([
      ['2026-10-12', 122],
      ['2026-10-16', 123],
      ['2026-10-19', 123.65],
    ]);
  });

  it('returns all history without a range', async () => {
    const body = await (await request('/api/series/usd_bdt_avg.json')).json<SeriesHistory>();
    expect(body.points).toHaveLength(5);
  });

  it('rejects bad dates and unknown series', async () => {
    expect((await request('/api/series/usd_bdt_avg.json?from=yesterday')).status).toBe(400);
    expect((await request('/api/series/nope.json')).status).toBe(404);
    expect((await request('/api/series/usd_bdt_avg')).status).toBe(404);
  });
});

describe('GET /api/changes.json', () => {
  it("lists values fetched today that differ from the previous point", async () => {
    await seedPoints([{ series_key: 'usd_bdt_avg', date: '2026-10-20', value: 123.7 }], new Date().toISOString());
    await seedPoints([{ series_key: 'usd_bdt_low', date: '2026-10-20', value: 123.6 }], new Date().toISOString());
    // A backfilled older day fetched today is not a change: gold's latest point is from 2026-10-22.
    await seedPoints([{ series_key: 'gold_22k', date: '2026-10-01', value: 200_000 }], new Date().toISOString());
    await refreshCaches(env);
    const body = await (await request('/api/changes.json')).json<ChangesResponse>();
    expect(body.date).toBe(dhakaDate());
    expect(body.changes).toEqual([
      expect.objectContaining({ key: 'usd_bdt_low', value: 123.6, previous: null }),
      expect.objectContaining({ key: 'usd_bdt_avg', value: 123.7, previous: 123.65 }),
    ]);
  });
});

describe('GET /api/status.json', () => {
  it('reports every source, with failures and stale series', async () => {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO runs (source, started_at, finished_at, ok, error, points_written, trigger) VALUES ('bajusGold', ?1, ?1, 0, 'HTTP 503', 0, 'test')",
      ).bind(new Date().toISOString()),
      env.DB.prepare("UPDATE points SET stale = 1 WHERE series_key = 'gold_22k'"),
    ]);
    await refreshCaches(env);
    const body = await (await request('/api/status.json')).json<StatusResponse>();
    expect(body.sources.map((s) => s.source)).toEqual(expect.arrayContaining(['bangladeshBank', 'bajusGold']));
    expect(body.sources.find((s) => s.source === 'bajusGold')).toMatchObject({
      failures_24h: 1,
      last_ok_at: null,
      stale_series: ['gold_22k'],
      last_run: { ok: false, error: 'HTTP 503' },
    });
  });
});

describe('POST /api/ingest', () => {
  const point = { series_key: 'gold_22k', date: '2026-10-23', value: 227_000 };

  it('requires the bearer token', async () => {
    expect((await ingest({ source: 'manual', points: [point] }, { 'content-type': 'application/json' })).status).toBe(401);
    expect((await ingest({ source: 'manual', points: [point] }, { authorization: 'Bearer wrong' })).status).toBe(401);
  });

  it('writes valid points and logs an ingest run', async () => {
    const res = await ingest({ source: 'tcb-fallback', points: [point] });
    expect(res.status).toBe(200);
    expect(await res.json<IngestResult>()).toMatchObject({ ok: true, written: 1, error: null });
    const run = await env.DB.prepare("SELECT ok FROM runs WHERE source = 'ingest:tcb-fallback'").first<{ ok: number }>();
    expect(run?.ok).toBe(1);
  });

  it('stores overrides separately', async () => {
    const res = await ingest({ source: 'manual', override: true, points: [{ ...point, date: '2026-10-22', meta: { note: 'fix' } }] });
    expect(res.status).toBe(200);
    const row = await env.DB.prepare('SELECT value, note FROM manual_overrides').first();
    expect(row).toEqual({ value: 227_000, note: 'fix' });
  });

  it('rejects malformed bodies and invalid values', async () => {
    expect((await ingest('not json')).status).toBe(400);
    expect((await ingest({ source: 'Bad Source!', points: [point] })).status).toBe(400);
    expect((await ingest({ source: 'manual', points: [{ series_key: 'gold_22k', date: '2026-10-23' }] })).status).toBe(400);

    const unknown = await ingest({ source: 'manual', points: [{ ...point, series_key: 'unicorn_price' }] });
    expect(unknown.status).toBe(422);
    expect((await unknown.json<IngestResult>()).error).toMatch(/unknown series/);

    const outOfBounds = await ingest({ source: 'manual', points: [{ ...point, value: 12 }] });
    expect(outOfBounds.status).toBe(422);
  });

  it('rate-limits a client', async () => {
    const client = '203.0.113.7';
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      statuses.push((await ingest({ source: 'manual', points: [point] }, { authorization: 'Bearer wrong' }, client)).status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });
});

describe('GET /embed/:key', () => {
  it('renders a Bengali widget with an attribution link', async () => {
    const res = await request('/embed/usd_bdt_avg');
    expect(res.status).toBe(200);
    const page = await res.text();
    expect(page).toContain('১২৩.৬৫');
    expect(page).toContain('ডলার রেট (গড়)');
    expect(page).toContain('href="https://bdrate.fyi/dollar-rate-today"');
    expect(page).toContain('href="https://www.bb.org.bd/en/index.php/econdata/exchangerate"');
  });

  it('renders English with ?lang=en', async () => {
    const page = await (await request('/embed/gold_22k?lang=en')).text();
    expect(page).toContain('2,26,340');
    expect(page).toContain('Tk/bhori');
    expect(page).toContain('href="https://bdrate.fyi/en/gold-price-today"');
  });

  it('404s for unknown series', async () => {
    expect((await request('/embed/nope')).status).toBe(404);
  });
});

describe('other routes', () => {
  it('serves the manual entry page, noindexed', async () => {
    const res = await request('/manual');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('noindex');
  });

  it('protects /internal', async () => {
    expect((await request('/internal/run/bangladeshBank', { method: 'POST' })).status).toBe(401);
    expect((await request('/internal/batch/daily', { method: 'POST', headers: { authorization: 'Bearer nope' } })).status).toBe(401);
  });

  it('answers CORS preflight for GET only', async () => {
    const res = await request('/api/latest.json', {
      method: 'OPTIONS',
      headers: { origin: 'https://example.com', 'access-control-request-method': 'GET' },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-methods')).toBe('GET,HEAD,OPTIONS');
  });
});
