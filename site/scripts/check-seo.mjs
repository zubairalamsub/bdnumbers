// Build-time SEO check, run after `astro build`: fails the build (so Pages keeps the last good
// deployment) if any page breaks the rules below. Lengths count grapheme clusters, as lib/seo.ts does.
//
// Every page: a title of at most 60 characters, a description of at most 155, an absolute canonical,
// an OG image that exists, and JSON-LD that parses and has the fields its type needs.
// Indexable pages: hreflang bn/en/x-default, a BreadcrumbList (except home), an entry in
// seo/keywords.json whose primary keyword appears in the title, and a <url> in sitemap.xml.
// Number pages: Dataset and FAQPage JSON-LD with 5 questions that are also visible on the page.
// Home: WebSite and Organization.
import fs from 'node:fs';
import path from 'node:path';

const SITE = 'https://bdrate.fyi';
const DIST = path.resolve('dist');
const NUMBER_PAGES = new Set([
  '/dollar-rate-today',
  '/gold-price-today',
  '/silver-price-today',
  '/market-price-today',
  '/share-market-today',
  '/weather',
  '/fuel-price',
  '/lpg-price',
  '/savings-rates',
  '/holidays',
]);

const keywords = JSON.parse(fs.readFileSync('seo/keywords.json', 'utf8'));
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const length = (s) => Array.from(segmenter.segment(s)).length;
const decode = (s) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));

const errors = [];
const fail = (page, message) => errors.push(`${page}: ${message}`);
const attr = (html, re) => {
  const m = re.exec(html);
  return m ? decode(m[1]) : null;
};

/** Page URL path for a dist file: dist/en/weather.html → /en/weather, dist/index.html → /. */
function urlPath(file) {
  const rel = path.relative(DIST, file).split(path.sep).join('/').replace(/\.html$/, '');
  if (rel === 'index') return '/';
  return `/${rel}`;
}

function keywordEntry(pagePath) {
  if (keywords[pagePath]) return keywords[pagePath];
  if (/^\/prayer-times\/[a-z-]+$/.test(pagePath)) return keywords['/prayer-times/{district}'];
  return null;
}

function checkJsonLd(page, data, canonical) {
  const need = (cond, what) => cond || fail(page, `${data['@type']} JSON-LD: ${what}`);
  need(data['@context'] === 'https://schema.org', '@context must be https://schema.org');
  switch (data['@type']) {
    case 'WebSite':
      need(data.name && data.url?.startsWith(SITE), 'needs name and an absolute url');
      break;
    case 'Organization':
      need(data.name && data.url && data.logo, 'needs name, url and logo');
      break;
    case 'BreadcrumbList': {
      const items = data.itemListElement ?? [];
      need(items.length >= 2, 'needs at least two items');
      items.forEach((item, i) => {
        need(item['@type'] === 'ListItem' && item.position === i + 1, `item ${i + 1} must be a ListItem at position ${i + 1}`);
        need(item.name && item.item?.startsWith(SITE), `item ${i + 1} needs a name and an absolute URL`);
      });
      need(items.at(-1)?.item === canonical, 'last item must be the page itself');
      break;
    }
    case 'FAQPage': {
      const qs = data.mainEntity ?? [];
      need(qs.length > 0, 'needs questions');
      for (const q of qs) {
        need(q['@type'] === 'Question' && q.name?.trim(), 'every question needs a name');
        need(q.acceptedAnswer?.['@type'] === 'Answer' && q.acceptedAnswer.text?.trim(), `"${q.name}" needs an answer`);
        need(!/\{[\w:]+\}/.test(q.name + q.acceptedAnswer?.text), `"${q.name}" has an unfilled {placeholder}`);
      }
      break;
    }
    case 'Dataset':
      need(data.name, 'needs a name');
      need(typeof data.description === 'string' && length(data.description) >= 50, 'needs a description of at least 50 characters');
      need(data.url === canonical, 'url must be the canonical URL');
      need(data.creator?.name, 'needs a creator');
      need(typeof data.license === 'string' && data.license.startsWith('https://'), 'needs a license URL (Search Console flags its absence)');
      need(/^\d{4}-\d{2}-\d{2}\/\d{4}-\d{2}-\d{2}$/.test(data.temporalCoverage ?? ''), 'temporalCoverage must be a date range');
      need(data.variableMeasured?.length > 0, 'needs variableMeasured');
      need(
        data.distribution?.length > 0 && data.distribution.every((d) => d.contentUrl?.startsWith('https://') && d.encodingFormat),
        'every distribution needs an https contentUrl and an encodingFormat',
      );
      break;
    default:
      fail(page, `unexpected JSON-LD type ${data['@type']}`);
  }
}

const pages = walk(DIST).filter((f) => f.endsWith('.html'));
const indexable = new Set();
for (const file of pages) {
  const page = urlPath(file);
  if (page === '/404') continue;
  const html = fs.readFileSync(file, 'utf8');
  const lang = page === '/en' || page.startsWith('/en/') ? 'en' : 'bn';
  const pagePath = lang === 'en' ? page.slice(3) || '/' : page;
  const noindex = /<meta name="robots" content="noindex"/.test(html);

  const title = attr(html, /<title>([^<]*)<\/title>/);
  const description = attr(html, /<meta name="description" content="([^"]*)"/);
  const canonical = attr(html, /<link rel="canonical" href="([^"]*)"/);
  if (!title) fail(page, 'no <title>');
  else if (length(title) > 60) fail(page, `title is ${length(title)} characters (max 60): ${title}`);
  if (!description) fail(page, 'no meta description');
  else if (length(description) > 155) fail(page, `description is ${length(description)} characters (max 155)`);
  if (canonical !== SITE + page) fail(page, `canonical is ${canonical}, expected ${SITE + page}`);

  const ogImage = attr(html, /<meta property="og:image" content="([^"]*)"/);
  if (!ogImage?.startsWith(`${SITE}/og/`)) fail(page, 'no og:image card');
  else if (!fs.existsSync(path.join(DIST, new URL(ogImage).pathname))) fail(page, `og:image ${ogImage} was not built`);

  const ld = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].flatMap((m) => {
    try {
      return [JSON.parse(m[1])];
    } catch (err) {
      fail(page, `JSON-LD does not parse: ${err.message}`);
      return [];
    }
  });
  for (const data of ld) checkJsonLd(page, data, canonical);
  const types = new Set(ld.map((d) => d['@type']));

  if (noindex) continue;
  indexable.add(SITE + page);
  for (const hreflang of ['bn', 'en', 'x-default']) {
    if (!html.includes(`hreflang="${hreflang}"`)) fail(page, `no hreflang="${hreflang}" link`);
  }
  if (pagePath === '/') {
    for (const t of ['WebSite', 'Organization']) if (!types.has(t)) fail(page, `home page needs ${t} JSON-LD`);
  } else if (!types.has('BreadcrumbList')) fail(page, 'no BreadcrumbList JSON-LD');

  const kw = keywordEntry(pagePath);
  if (!kw) fail(page, `missing from seo/keywords.json`);
  else if (title) {
    const parts = kw[lang].split(/\{\w+\}/).map((p) => p.trim().toLowerCase()).filter(Boolean);
    if (!parts.every((p) => title.toLowerCase().includes(p))) fail(page, `title "${title}" lacks the keyword "${kw[lang]}"`);
  }

  if (NUMBER_PAGES.has(pagePath) || pagePath.startsWith('/prayer-times/')) {
    const faq = ld.find((d) => d['@type'] === 'FAQPage');
    if (!faq) fail(page, 'no FAQPage JSON-LD');
    else {
      if (faq.mainEntity.length !== 5) fail(page, `has ${faq.mainEntity.length} FAQs, expected 5`);
      const visible = decode(html.replace(/<script[\s\S]*?<\/script>/g, ''));
      for (const q of faq.mainEntity) if (!visible.includes(q.name)) fail(page, `FAQ "${q.name}" is not visible on the page`);
    }
  }
  if (NUMBER_PAGES.has(pagePath) && !types.has('Dataset')) fail(page, 'no Dataset JSON-LD');
}

// The sitemap lists exactly the indexable pages, with valid lastmod dates.
const sitemap = fs.readFileSync(path.join(DIST, 'sitemap.xml'), 'utf8');
const locs = new Set([...sitemap.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => decode(m[1])));
for (const url of indexable) if (!locs.has(url)) fail('sitemap.xml', `missing ${url}`);
for (const url of locs) if (!indexable.has(url)) fail('sitemap.xml', `lists ${url}, which is not an indexable page`);
for (const [, lastmod] of sitemap.matchAll(/<lastmod>([^<]*)<\/lastmod>/g)) {
  if (Number.isNaN(Date.parse(lastmod))) fail('sitemap.xml', `bad lastmod ${lastmod}`);
}
if (!fs.readFileSync(path.join(DIST, 'robots.txt'), 'utf8').includes(`Sitemap: ${SITE}/sitemap.xml`)) fail('robots.txt', 'no Sitemap line');

// Feeds and manifests exist and point at real files.
for (const feed of ['feed.xml', 'en/feed.xml', 'rss.xml', 'en/rss.xml']) {
  const xml = fs.readFileSync(path.join(DIST, feed), 'utf8');
  if (!/<(feed|rss)\b/.test(xml)) fail(feed, 'is not an Atom or RSS document');
}
for (const file of ['manifest.webmanifest', 'en/manifest.webmanifest']) {
  const manifest = JSON.parse(fs.readFileSync(path.join(DIST, file), 'utf8'));
  for (const icon of manifest.icons) if (!fs.existsSync(path.join(DIST, icon.src))) fail(file, `icon ${icon.src} was not built`);
}

if (errors.length > 0) {
  console.error(`SEO check failed (${errors.length}):\n${errors.map((e) => `  - ${e}`).join('\n')}`);
  process.exit(1);
}
console.log(`SEO check passed: ${pages.length} pages, ${indexable.size} indexable, all in sitemap.xml.`);
