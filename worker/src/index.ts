import { Hono } from 'hono';
import { batchForCron, runBatch } from './cron';
import type { AppEnv, Env } from './env';
import { api } from './routes/api';
import { embed } from './routes/embed';
import { internal } from './routes/internal';
import { manual } from './routes/manual';

const app = new Hono<AppEnv>();

/** For HTML pages that set no policy of their own: nothing loads, nothing frames them. */
const LOCKED_HTML_CSP = "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

// Headers on every response. The API, embeds and forms are for the site and other apps, not for search results.
app.use('*', async (c, next) => {
  await next();
  const h = c.res.headers;
  h.set('x-robots-tag', 'noindex');
  h.set('x-content-type-options', 'nosniff');
  h.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
  h.set('referrer-policy', 'strict-origin-when-cross-origin');
  if (h.get('content-type')?.startsWith('text/html') && !h.has('content-security-policy')) {
    h.set('content-security-policy', LOCKED_HTML_CSP);
  }
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
