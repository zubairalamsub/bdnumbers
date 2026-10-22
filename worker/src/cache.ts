import type { LatestResponse, StatusResponse } from '@bdnumbers/shared';
import type { MiddlewareHandler } from 'hono';
import type { AppEnv, Env } from './env';
import { buildLatest, buildStatus } from './queries';

export const CACHE_CONTROL = 'public, max-age=300';

const VERSION_KEY = 'cache_version';
const LATEST_KEY = 'latest.json';
const STATUS_KEY = 'status.json';
/** How long an isolate trusts its copy of the cache version before re-reading KV. */
const VERSION_MEMO_MS = 30_000;

let memo: { version: string; at: number } | null = null;

export async function cacheVersion(env: Env): Promise<string> {
  if (memo && Date.now() - memo.at < VERSION_MEMO_MS) return memo.version;
  const version = (await env.CACHE.get(VERSION_KEY)) ?? '0';
  memo = { version, at: Date.now() };
  return version;
}

/**
 * Rebuild latest.json and status.json in KV and bump the cache version. Edge cache keys include the
 * version, so bumping it effectively purges every cached /api and /embed response in all locations.
 */
export async function refreshCaches(env: Env): Promise<void> {
  const [latest, status] = await Promise.all([buildLatest(env.DB), buildStatus(env.DB)]);
  await Promise.all([
    env.CACHE.put(LATEST_KEY, JSON.stringify(latest)),
    env.CACHE.put(STATUS_KEY, JSON.stringify(status)),
  ]);
  const version = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  await env.CACHE.put(VERSION_KEY, version);
  memo = { version, at: Date.now() };
}

export async function getLatest(env: Env): Promise<LatestResponse> {
  return (await env.CACHE.get<LatestResponse>(LATEST_KEY, 'json')) ?? buildLatest(env.DB);
}

export async function getStatus(env: Env): Promise<StatusResponse> {
  return (await env.CACHE.get<StatusResponse>(STATUS_KEY, 'json')) ?? buildStatus(env.DB);
}

/**
 * Serve GET responses from the Workers Cache API, keyed by path + query + cache version. Only responses
 * that carry a max-age are stored. (A no-op on workers.dev; works on the api.bdrate.fyi custom domain.)
 */
export const edgeCache: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.req.method !== 'GET') return next();
  const url = new URL(c.req.url);
  const version = await cacheVersion(c.env);
  const key = new Request(`https://edge-cache.internal/${version}${url.pathname}${url.search}`);
  const cache = caches.default;

  const hit = await cache.match(key);
  if (hit) {
    const res = new Response(hit.body, hit);
    res.headers.set('x-edge-cache', 'HIT');
    return res;
  }

  await next();
  if (c.res.status === 200 && c.res.headers.get('cache-control')?.includes('max-age')) {
    c.executionCtx.waitUntil(cache.put(key, c.res.clone()));
  }
};
