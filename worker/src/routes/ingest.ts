import type { IngestPayload, Point } from '@bdnumbers/shared';
import { Hono } from 'hono';
import { refreshCaches } from '../cache';
import type { AppEnv, Env } from '../env';
import { bearerMatches } from '../lib/auth';
import { ingestPoints } from '../run';

const MAX_POINTS = 2000;
const LIMIT = 10;
const WINDOW_MS = 60_000;

export const ingest = new Hono<AppEnv>();

ingest.post('/', async (c) => {
  const client = c.req.header('cf-connecting-ip') ?? 'unknown';
  if (!(await allowRequest(c.env, client))) {
    return c.json({ error: 'rate limited' }, 429, { 'retry-after': '60' });
  }
  if (!c.env.INGEST_TOKEN) return c.json({ error: 'ingest is disabled (INGEST_TOKEN not set)' }, 503);
  if (!(await bearerMatches(c.req.header('authorization'), c.env.INGEST_TOKEN))) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'body must be JSON' }, 400);
  }
  const parsed = parsePayload(body);
  if ('error' in parsed) return c.json({ error: parsed.error }, 400);

  const result = await ingestPoints(c.env, parsed.payload);
  if (result.ok) c.executionCtx.waitUntil(refreshCaches(c.env));
  return c.json(result, result.ok ? 200 : 422);
});

// Fallback when the INGEST_LIMITER binding is unavailable: a per-isolate sliding window.
const recent = new Map<string, number[]>();

async function allowRequest(env: Env, client: string): Promise<boolean> {
  if (env.INGEST_LIMITER) {
    try {
      return (await env.INGEST_LIMITER.limit({ key: client })).success;
    } catch (err) {
      console.warn('INGEST_LIMITER failed; using in-memory limiter', err);
    }
  }
  const now = Date.now();
  const hits = (recent.get(client) ?? []).filter((t) => now - t < WINDOW_MS);
  hits.push(now);
  recent.set(client, hits);
  return hits.length <= LIMIT;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function parsePayload(body: unknown): { payload: IngestPayload } | { error: string } {
  if (!isRecord(body)) return { error: 'body must be a JSON object' };
  const { source, points, mode, override } = body;
  if (typeof source !== 'string' || !/^[a-z0-9_-]{1,40}$/.test(source)) {
    return { error: 'source must match [a-z0-9_-]{1,40}' };
  }
  if (!Array.isArray(points) || points.length === 0 || points.length > MAX_POINTS) {
    return { error: `points must be an array of 1..${MAX_POINTS} items` };
  }
  if (mode !== undefined && mode !== 'upsert' && mode !== 'on-change') {
    return { error: 'mode must be "upsert" or "on-change"' };
  }
  if (override !== undefined && typeof override !== 'boolean') return { error: 'override must be a boolean' };

  const out: Point[] = [];
  for (const [i, p] of points.entries()) {
    if (!isRecord(p) || typeof p.series_key !== 'string' || typeof p.date !== 'string' || typeof p.value !== 'number') {
      return { error: `points[${i}] needs series_key (string), date (string) and value (number)` };
    }
    if (p.meta !== undefined && !isRecord(p.meta)) return { error: `points[${i}].meta must be an object` };
    out.push({ series_key: p.series_key, date: p.date, value: p.value, ...(p.meta ? { meta: p.meta } : {}) });
  }
  return { payload: { source, points: out, ...(mode ? { mode } : {}), ...(override ? { override } : {}) } };
}
