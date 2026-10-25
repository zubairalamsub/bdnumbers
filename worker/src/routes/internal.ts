import { Hono } from 'hono';
import { sendTestAlert } from '../alerts';
import { DIVISIONS, type DivisionId } from '@bdnumbers/shared';
import { runBatch } from '../cron';
import { fetchDivisionWeather } from '../districtWeather';
import type { AppEnv } from '../env';
import { bearerMatches } from '../lib/auth';
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
