import { Hono } from 'hono';
import { batchForCron, runBatch } from './cron';
import type { AppEnv, Env } from './env';
import { api } from './routes/api';
import { embed } from './routes/embed';
import { internal } from './routes/internal';
import { manual } from './routes/manual';

const app = new Hono<AppEnv>();

// The API, embeds and forms are for the site and other apps, not for search results.
app.use('*', async (c, next) => {
  await next();
  c.res.headers.set('x-robots-tag', 'noindex');
});

app.get('/', (c) =>
  c.json({
    name: 'bdnumbers API',
    site: c.env.SITE_URL,
    endpoints: [
      'GET /api/latest.json',
      'GET /api/series/:key.json?from=YYYY-MM-DD&to=YYYY-MM-DD',
      'GET /api/changes.json',
      'GET /api/status.json',
      'POST /api/ingest (bearer token)',
      'GET /embed/:key?lang=bn|en',
    ],
  }),
);
app.route('/api', api);
app.route('/embed', embed);
app.route('/internal', internal);
app.route('/manual', manual);

app.notFound((c) => c.json({ error: 'not found' }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'internal error' }, 500);
});

export default {
  fetch: app.fetch,
  async scheduled(controller, env) {
    const batch = batchForCron(controller.cron);
    if (!batch) {
      console.error(`no batch configured for cron "${controller.cron}"`);
      return;
    }
    await runBatch(env, batch, `cron:${controller.cron}`);
  },
} satisfies ExportedHandler<Env>;
