import type { Point } from '@bdnumbers/shared';
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { vi } from 'vitest';
import { ensureSeries, writePoints } from '../src/db';
import worker from '../src/index';
import {
  BAJUS_GOLD_URL,
  BB_EXCHANGE_URL,
  BPC_FUEL_URL,
  DSE_URL,
  HOLIDAYS_ICS_URL,
  MET_API_URL,
  NSD_NOTICES_URL,
  NSD_SCHEMES_URL,
  TCB_LIST_URL,
  UNB_LPG_SEARCH_URL,
} from '@bdnumbers/shared';
import bajus from './fixtures/bajus-gold-price-2026-10-22.html?raw';
import bb from './fixtures/bb-exchangerate-2026-10-19.html?raw';
import bpcFuel from './fixtures/bpc-fuel-prices-2026-10-22.html?raw';
import holidaysIcs from './fixtures/google-bd-holidays-2026-10-22.ics?raw';
import nsdNotices from './fixtures/nsd-notices-2026-10-22.html?raw';
import nsdSchemes from './fixtures/nsd-schemes-2026-10-22.html?raw';
import unbLpgArticle from './fixtures/unb-lpg-article-2026-10.html?raw';
import unbLpgSearch from './fixtures/unb-search-lpg-2026-10-22.html?raw';
import dse from './fixtures/dse-recent-market-information-2026-10-22.html?raw';
import met from './fixtures/met-dhaka-2026-10-22.json?raw';
import tcbList from './fixtures/tcb-daily-rmps-2026-10-22.html?raw';
import tcbXlsxBase64 from './fixtures/tcb-2026-10-19.xlsx.b64?raw';
import unbArticle from './fixtures/unb-gold-2026-10-13.html?raw';
import unbSearch from './fixtures/unb-search-gold-2026-10-22.html?raw';

/** Live pages saved on 2026-10-22. File names carry the data date shown on each page. */
export const FIXTURES = {
  bb,
  bajus,
  unbSearch,
  unbArticle,
  tcbList,
  dse,
  met,
  bpcFuel,
  unbLpgSearch,
  unbLpgArticle,
  nsdSchemes,
  nsdNotices,
  holidaysIcs,
};

export const UNB_LPG_ARTICLE_URL =
  'https://unb.com.bd/category/Bangladesh/lpg-price-rises-by-tk21-per-kg-12kg-cylinder-now-tk1837/196983';

/** TCB's XLSX for 2026-10-19 (stored base64 because fixtures load as text). */
export function tcbXlsx(): ArrayBuffer {
  return Uint8Array.from(atob(tcbXlsxBase64.replace(/\s+/g, '')), (c) => c.charCodeAt(0)).buffer;
}

/** TCB serves its XLSX files from Oracle object storage. */
export const TCB_FILE_HOST = 'https://objectstorage.';

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

export const DEPLOY_HOOK = 'https://deploy-hook.test/hook';

/** Working responses for every source plus the deploy hook; override entries to break one. */
export function allSourceRoutes(): Record<string, Responder> {
  return {
    [BB_EXCHANGE_URL]: html(FIXTURES.bb),
    [BAJUS_GOLD_URL]: html(FIXTURES.bajus),
    [TCB_LIST_URL]: html(FIXTURES.tcbList),
    [TCB_FILE_HOST]: () => new Response(tcbXlsx(), { headers: { 'content-type': 'application/octet-stream' } }),
    [DSE_URL]: html(FIXTURES.dse),
    [MET_API_URL]: () => new Response(FIXTURES.met, { headers: { 'content-type': 'application/json' } }),
    [BPC_FUEL_URL]: html(FIXTURES.bpcFuel),
    [UNB_LPG_SEARCH_URL]: html(FIXTURES.unbLpgSearch),
    [UNB_LPG_ARTICLE_URL]: html(FIXTURES.unbLpgArticle),
    [NSD_SCHEMES_URL]: html(FIXTURES.nsdSchemes),
    [NSD_NOTICES_URL]: html(FIXTURES.nsdNotices),
    [HOLIDAYS_ICS_URL]: () => new Response(FIXTURES.holidaysIcs, { headers: { 'content-type': 'text/calendar' } }),
    [DEPLOY_HOOK]: () => new Response('{"success":true}', { status: 200 }),
  };
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
