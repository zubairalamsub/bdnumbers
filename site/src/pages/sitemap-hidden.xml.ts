import type { APIRoute } from 'astro';
import { DISTRICTS } from '@bdnumbers/shared';
import { SITE_URL } from '../config';
import { localePath } from '../i18n';
import { COMMODITIES, commodityPath } from '../lib/commodities';
import { getPhones } from '../lib/data';
import { INDEX_GENERATED_PAGES } from '../lib/indexing';
import { brandPath, byBrand, isIndexed, phonePath } from '../lib/phones';

/** When these pages turned noindex. */
const HIDDEN_SINCE = '2026-11-05';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

// A temporary sitemap of the pages that were indexable until 5 Nov 2026 and are now noindex (phone, brand,
// district prayer-time and market-item pages). Pages left out of sitemap.xml are recrawled slowly; listing
// them here, submitted on its own in Search Console (not in robots.txt), gets Google to recrawl them, see
// the noindex and drop them. Delete this file and its Search Console entry once they are out of the index.
export const GET: APIRoute = async () => {
  const phones = await getPhones();
  const paths = [
    ...phones.models.filter((m) => !isIndexed(m)).map(phonePath),
    ...byBrand(phones.models)
      .filter((b) => !b.models.some(isIndexed))
      .map((b) => brandPath(b.brand.id)),
    ...(INDEX_GENERATED_PAGES ? [] : [...DISTRICTS.map((d) => `/prayer-times/${d.id}`), ...COMMODITIES.map(commodityPath)]),
  ];
  const urls = paths.flatMap((p) =>
    (['bn', 'en'] as const).map(
      (lang) => `<url><loc>${esc(SITE_URL + localePath(lang, p))}</loc><lastmod>${HIDDEN_SINCE}</lastmod></url>`,
    ),
  );
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
