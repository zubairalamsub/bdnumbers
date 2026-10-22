import { formatDate, formatNumber, pageUrl, unitLabel, type Lang, type LatestEntry } from '@bdnumbers/shared';
import { Hono } from 'hono';
import { CACHE_CONTROL, edgeCache, getLatest } from '../cache';
import type { AppEnv } from '../env';
import { escapeHtml } from '../lib/escape';

export const embed = new Hono<AppEnv>();

embed.use('*', edgeCache);

embed.get('/:key', async (c) => {
  const lang: Lang = c.req.query('lang') === 'en' ? 'en' : 'bn';
  const entry = (await getLatest(c.env)).series.find((s) => s.key === c.req.param('key'));
  if (!entry) return c.html('<!doctype html><title>Not found</title><p>Unknown series.</p>', 404);
  return c.html(renderEmbed(entry, lang, c.env.SITE_URL), 200, { 'cache-control': CACHE_CONTROL });
});

const TEXT: Record<Lang, { asOf: string; stale: string; source: string }> = {
  bn: { asOf: 'তারিখ', stale: 'পুরোনো তথ্য', source: 'উৎস' },
  en: { asOf: 'As of', stale: 'stale', source: 'Source' },
};

/** A self-contained widget for <iframe> embedding, with an attribution link back to the site. */
export function renderEmbed(entry: LatestEntry, lang: Lang, siteUrl: string): string {
  const t = TEXT[lang];
  const name = lang === 'bn' ? entry.name_bn : entry.name_en;
  const prev = entry.change.prev;
  let delta = '';
  if (prev) {
    const arrow = prev.abs > 0 ? '▲' : prev.abs < 0 ? '▼' : '■';
    const dir = prev.abs > 0 ? 'up' : prev.abs < 0 ? 'down' : 'flat';
    const pct = prev.pct === null ? '' : ` (${formatNumber(Math.abs(prev.pct), lang, 2)}%)`;
    delta = `<span class="d ${dir}">${arrow} ${formatNumber(Math.abs(prev.abs), lang)}${pct}</span>`;
  }
  const site = new URL(siteUrl).host;
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(name)}</title>
<style>
:root{--bg:#fff;--fg:#16181d;--muted:#5b6170;--line:#e3e5ea;--up:#0a7a3d;--down:#b42318;--warn:#9a6700}
@media (prefers-color-scheme:dark){:root{--bg:#16181d;--fg:#f1f2f4;--muted:#a3a9b6;--line:#2c3039;--up:#4ad08a;--down:#ff8a80;--warn:#e3b341}}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.4 system-ui,"Noto Sans Bengali","Hind Siliguri",sans-serif}
.w{padding:12px 14px;border:1px solid var(--line);border-radius:10px}
.n{color:var(--muted);font-size:13px}
.v{font-size:26px;font-weight:700;margin:2px 0;font-variant-numeric:tabular-nums}
.u{font-size:14px;font-weight:500;color:var(--muted);margin-left:4px}
.m{font-size:12px;color:var(--muted);display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.d.up{color:var(--up)}.d.down{color:var(--down)}
.s{color:var(--warn);border:1px solid currentColor;border-radius:4px;padding:0 4px}
a{color:inherit}
</style>
</head>
<body>
<div class="w">
<div class="n">${escapeHtml(name)}</div>
<div class="v">${formatNumber(entry.value, lang)}<span class="u">${escapeHtml(unitLabel(entry.unit, lang))}</span></div>
<div class="m">${delta}<span>${t.asOf}: ${formatDate(entry.date, lang)}</span>${entry.stale ? `<span class="s">${t.stale}</span>` : ''}</div>
<div class="m"><a href="${escapeHtml(pageUrl(siteUrl, entry.category, lang))}" target="_blank" rel="noopener">${escapeHtml(site)}</a><span>·</span><span>${t.source}: <a href="${escapeHtml(entry.source_url)}" target="_blank" rel="noopener nofollow">${escapeHtml(entry.source_name)}</a></span></div>
</div>
</body>
</html>`;
}
