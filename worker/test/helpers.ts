import type { Point } from '@bdnumbers/shared';
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { vi } from 'vitest';
import { ensureSeries, writePoints } from '../src/db';
import worker from '../src/index';
import bajus from './fixtures/bajus-gold-price-2026-10-22.html?raw';
import bb from './fixtures/bb-exchangerate-2026-10-19.html?raw';
import unbArticle from './fixtures/unb-gold-2026-10-13.html?raw';
import unbSearch from './fixtures/unb-search-gold-2026-10-22.html?raw';

/** Live pages saved on 2026-10-22. File names carry the data date shown on each page. */
export const FIXTURES = { bb, bajus, unbSearch, unbArticle };

export const UNB_ARTICLE_URL =
  'https://unb.com.bd/category/Business/gold-prices-fall-by-tk-3266-per-bhori-in-bangladesh/197733';

type Responder = () => Response;

export const html = (body: string): Responder => () =>
  new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
export const httpStatus = (code: number): Responder => () => new Response(`HTTP ${code}`, { status: code });

/** Stub global fetch: the first URL prefix that matches answers; anything else gets a 599. */
export function mockFetch(routes: Record<string, Responder>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    for (const [prefix, respond] of Object.entries(routes)) {
      if (url.startsWith(prefix)) return respond();
    }
    return new Response(`unmocked ${url}`, { status: 599 });
  });
}

/** URLs the stubbed fetch was called with. */
export function calledUrls(spy: ReturnType<typeof mockFetch>): string[] {
  return spy.mock.calls.map(([input]) =>
    typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
  );
}

/** Empty D1 and KV. Storage persists between tests in a file, so call this in beforeEach. */
export async function resetStorage(): Promise<void> {
  await env.DB.batch(
    ['points', 'runs', 'series', 'manual_overrides'].map((table) => env.DB.prepare(`DELETE FROM ${table}`)),
  );
  const { keys } = await env.CACHE.list();
  await Promise.all(keys.map((k) => env.CACHE.delete(k.name)));
}

export async function seedPoints(points: Point[], fetchedAt = '2026-01-01T00:00:00.000Z'): Promise<void> {
  await ensureSeries(env.DB, points.map((p) => p.series_key));
  await writePoints(env.DB, points, 'upsert', fetchedAt);
}

/** Send a request through the Worker's fetch handler. */
export async function request(path: string, init?: RequestInit): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`https://api.test${path}`, init), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}
