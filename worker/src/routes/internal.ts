import { Hono } from 'hono';
import { sendTestAlert } from '../alerts';
import { DIVISIONS, type DivisionId } from '@bdnumbers/shared';
import { runBatch } from '../cron';
import { fetchDivisionWeather } from '../districtWeather';
import type { AppEnv } from '../env';
import { bearerMatches } from '../lib/auth';
import { processPage, runShop, type PageKind } from '../phones/crawl';
import { publishPhones, snapshotPhones } from '../phones/publish';
import { shopCrawl } from '../phones/shops';
import { runSource } from '../run';
import { getSource } from '../sources';

/** Token-protected endpoints: per-source runs (the cron fan-out target) and manually triggered batches. */
export const internal = new Hono<AppEnv>();

internal.use('*', async (c, next) => {
  if (!(await bearerMatches(c.req.header('authorization'), c.env.INTERNAL_TOKEN))) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  await next();
});

internal.post('/run/:key', async (c) => {
  const source = getSource(c.req.param('key'));
  if (!source) return c.json({ error: 'unknown source' }, 404);
  return c.json(await runSource(c.env, source, c.req.query('trigger') ?? 'manual'));
});

/** One division's district weather (the hourly cron's fan-out target for the map snapshot). */
internal.post('/district-weather/:division', async (c) => {
  const division = c.req.param('division');
  if (!(division in DIVISIONS)) return c.json({ error: 'unknown division' }, 404);
  return c.json(await fetchDivisionWeather(c.env, division as DivisionId));
});

/** One shop's phone crawl run (the hourly cron's fan-out target). */
internal.post('/phones/shop/:shop', async (c) => {
  const shop = c.req.param('shop');
  if (!shopCrawl(shop)) return c.json({ error: 'unknown shop' }, 404);
  return c.json(await runShop(c.env, shop, c.req.query('trigger') ?? 'manual'));
});

/** One page of a shop: fetched and parsed in its own invocation (a shop run's fan-out target). */
internal.post('/phones/page', async (c) => {
  const body = await c.req.json<{ shop?: string; url?: string; kind?: string }>().catch(() => null);
  const kinds: readonly string[] = ['listing', 'sitemap', 'product'];
  if (!body?.shop || !shopCrawl(body.shop) || !body.url || !kinds.includes(body.kind ?? '')) {
    return c.json({ error: 'needs shop, url and kind' }, 400);
  }
  const origin = shopCrawl(body.shop)!.origin;
  if (!body.url.startsWith(`${origin}/`)) return c.json({ error: `url must be on ${origin}` }, 400);
  return c.json(await processPage(c.env, body.shop, body.url, body.kind as PageKind));
});

internal.post('/phones/publish', async (c) => c.json(await publishPhones(c.env)));
internal.post('/phones/snapshot', async (c) => c.json(await snapshotPhones(c.env)));

internal.post('/batch/:batch', async (c) => {
  const batch = c.req.param('batch');
  if (batch !== 'daily' && batch !== 'hourly') return c.json({ error: 'batch must be daily or hourly' }, 404);
  return c.json(await runBatch(c.env, batch, 'manual'));
});

/** Send one test email through the alert path, to check the binding, sender and ALERT_TO end to end. */
internal.post('/alerts/test', async (c) => {
  const outcome = await sendTestAlert(c.env);
  return c.json({ outcome }, outcome === 'sent' ? 200 : outcome === 'not-configured' ? 503 : 502);
});
