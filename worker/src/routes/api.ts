import { dhakaDate, getSeriesDef, isPointDate } from '@bdnumbers/shared';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { CACHE_CONTROL, edgeCache, getLatest, getStatus } from '../cache';
import type { AppEnv } from '../env';
import { buildChanges, buildHistory } from '../queries';
import { ingest } from './ingest';

export const api = new Hono<AppEnv>();

api.use('*', cors({ origin: '*', allowMethods: ['GET', 'HEAD', 'OPTIONS'], maxAge: 86400 }));
api.use('*', edgeCache);

// ?keys=a,b,c returns only those series, so a page's live refresh downloads what it shows, not all of them.
api.get('/latest.json', async (c) => {
  const latest = await getLatest(c.env);
  const keys = c.req.query('keys');
  if (!keys) return c.json(latest, 200, { 'cache-control': CACHE_CONTROL });
  const wanted = new Set(keys.split(',').slice(0, 500));
  return c.json({ ...latest, series: latest.series.filter((s) => wanted.has(s.key)) }, 200, { 'cache-control': CACHE_CONTROL });
});

api.get('/status.json', async (c) => c.json(await getStatus(c.env), 200, { 'cache-control': CACHE_CONTROL }));

api.get('/changes.json', async (c) =>
  c.json(await buildChanges(c.env.DB, dhakaDate()), 200, { 'cache-control': CACHE_CONTROL }),
);

api.get('/series/:file', async (c) => {
  const key = /^([a-z0-9_]{1,64})\.json$/.exec(c.req.param('file'))?.[1];
  const def = key ? getSeriesDef(key) : undefined;
  if (!def) return c.json({ error: 'unknown series' }, 404);

  const from = c.req.query('from') ?? null;
  const to = c.req.query('to') ?? null;
  for (const [name, value] of [['from', from], ['to', to]] as const) {
    if (value !== null && !isPointDate(value)) {
      return c.json({ error: `${name} must be YYYY-MM-DD or YYYY-MM-DDTHH:MM` }, 400);
    }
  }
  return c.json(await buildHistory(c.env.DB, def, from, to), 200, { 'cache-control': CACHE_CONTROL });
});

api.route('/ingest', ingest);
