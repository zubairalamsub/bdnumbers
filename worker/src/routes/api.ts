import { dhakaDate, getSeriesDef, isPointDate } from '@bdnumbers/shared';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { CACHE_CONTROL, edgeCache, getLatest, getStatus } from '../cache';
import { DISTRICT_WEATHER_KEY } from '../districtWeather';
import type { AppEnv, Env } from '../env';
import { PHONES_HISTORY_KEY, PHONES_KEY } from '../phones/publish';
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

/** A JSON document stored in KV as is, or a 404 saying it isn't there yet. */
async function kvJson(env: Env, key: string, missing: string): Promise<Response> {
  const body = await env.CACHE.get(key);
  if (!body) return Response.json({ error: missing }, { status: 404 });
  return new Response(body, { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': CACHE_CONTROL } });
}

/** Current weather in every district headquarters (the weather map's zoomed-in layer); updated hourly. */
api.get('/weather/districts.json', async (c) => kvJson(c.env, DISTRICT_WEATHER_KEY, 'no district weather yet'));

/** Every phone model with each shop's price (rebuilt when a crawl finds a change); 404 until the first crawl. */
api.get('/phones.json', async (c) => kvJson(c.env, PHONES_KEY, 'no phone prices yet'));

/** Each model's lowest prices by day and recent price changes at each shop (rebuilt daily). */
api.get('/phones/history.json', async (c) => kvJson(c.env, PHONES_HISTORY_KEY, 'no phone price history yet'));

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
