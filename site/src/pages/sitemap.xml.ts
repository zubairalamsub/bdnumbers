import type { APIRoute } from 'astro';
import { SITE_URL } from '../config';
import { localePath } from '../i18n';
import { getLatest, getPhones } from '../lib/data';
import { GUIDES_PATH, guidePath, guides } from '../lib/guides';
import { INDEXABLE_PAGES, lastModified, phonePages } from '../lib/site-pages';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

// One <url> per language version, each listing both versions as alternates. lastmod is when the data
// behind the page last changed (a value was written), not when the site was built.
export const GET: APIRoute = async () => {
  const latest = await getLatest();
  const phones = await getPhones();
  // Published guides (drafts are never built), dated by their last update.
  const published = guides('bn').filter((g) => !g.meta.draft);
  const guidePages = published.length === 0 ? [] : [
    { path: GUIDES_PATH, lastmod: { date: published.map((g) => g.meta.updated ?? g.meta.published).sort().at(-1)! } },
    ...published.map((g) => ({ path: guidePath(g.slug), lastmod: { date: g.meta.updated ?? g.meta.published } })),
  ];
  const urls = [...INDEXABLE_PAGES, ...phonePages(phones), ...guidePages].flatMap(({ path, lastmod }) => {
    const modified = lastModified(lastmod, latest, phones);
    const alternates = [
      ['bn', localePath('bn', path)],
      ['en', localePath('en', path)],
      ['x-default', localePath('bn', path)],
    ]
      .map(([hreflang, href]) => `<xhtml:link rel="alternate" hreflang="${hreflang}" href="${esc(SITE_URL + href)}"/>`)
      .join('');
    return (['bn', 'en'] as const).map(
      (lang) =>
        `<url><loc>${esc(SITE_URL + localePath(lang, path))}</loc>${modified ? `<lastmod>${modified}</lastmod>` : ''}${alternates}</url>`,
    );
  });
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join('\n')}
</urlset>
`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
