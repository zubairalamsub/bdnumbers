// Search metadata: titles and descriptions that fit, the keyword map, FAQs and JSON-LD.
// Lengths are counted in grapheme clusters (what a reader sees as one character), so a Bengali conjunct
// such as "ক্ষ" counts once rather than as its three code points.
import {
  BHORI_GRAMS,
  defaultDigits,
  formatNumber,
  formatSeriesValue,
  type Lang,
  type LatestEntry,
  type LatestResponse,
} from '@bdnumbers/shared';
import keywords from '../../seo/keywords.json';
import { API_BASE, SITE_NAME, SITE_URL } from '../config';
import { localePath } from '../i18n';
import { formatPointDate } from './view';

export const TITLE_MAX = 60;
export const DESCRIPTION_MAX = 155;

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const graphemes = (s: string) => Array.from(segmenter.segment(s), (g) => g.segment);
export const textLength = (s: string) => graphemes(s).length;

function truncate(s: string, max: number): string {
  const g = graphemes(s);
  if (g.length <= max) return s;
  let cut = g.slice(0, max - 1).join('');
  const space = cut.lastIndexOf(' ');
  if (space > cut.length * 0.6) cut = cut.slice(0, space);
  return `${cut.replace(/[\s,;:·–—-]+$/u, '')}…`;
}

type Variants = string | readonly string[];
const list = (v: Variants) => (typeof v === 'string' ? [v] : v);

/** The first variant that fits with " | bdrate.fyi", else the first that fits alone, else the last one cut short. */
export function fitTitle(variants: Variants): string {
  const all = list(variants);
  const suffix = ` | ${SITE_NAME}`;
  for (const v of all) if (textLength(v + suffix) <= TITLE_MAX) return v + suffix;
  for (const v of all) if (textLength(v) <= TITLE_MAX) return v;
  return truncate(all.at(-1)!, TITLE_MAX);
}

/** The first variant that fits, else the last one cut at a sentence end (or a word) within the limit. */
export function fitDescription(variants: Variants): string {
  const all = list(variants);
  for (const v of all) if (textLength(v) <= DESCRIPTION_MAX) return v;
  const head = graphemes(all.at(-1)!).slice(0, DESCRIPTION_MAX).join('');
  const end = Math.max(head.lastIndexOf('। '), head.lastIndexOf('. '));
  if (end > 80) return head.slice(0, end + 1);
  return truncate(all.at(-1)!, DESCRIPTION_MAX);
}

// ---------- keywords ----------

export interface PageKeywords {
  bn: string;
  en: string;
  longTail: { bn: string[]; en: string[] };
}

export const KEYWORDS: Readonly<Record<string, PageKeywords>> = keywords;

/** Primary keyword and long-tail variants for a keywords.json key, with {placeholders} filled in. */
export function keywordsFor(page: string, lang: Lang, vars: Record<string, string> = {}): string[] {
  const k = KEYWORDS[page];
  if (!k) throw new Error(`seo: ${page} is missing from seo/keywords.json`);
  return [k[lang], ...k.longTail[lang]].map((s) => s.replace(/\{(\w+)\}/g, (_, name: string) => vars[name] ?? `{${name}}`));
}

// ---------- FAQs ----------

export interface Faq {
  q: string;
  a: string;
}

const FAQ_FILES = import.meta.glob<Record<Lang, Faq[]>>('../../seo/faqs/*.json', { eager: true, import: 'default' });

/** Resolves {placeholder} names in FAQ text; undefined means the name is unknown. */
export type Vars = (name: string) => string | undefined;

/**
 * Values for FAQ placeholders: {key} is a series' latest value, {key:date} its date, {key:gram} a per-bhori
 * price per gram; anything in `extra` is used as is.
 */
export function seriesVars(latest: LatestResponse, lang: Lang, extra: Record<string, string> = {}): Vars {
  const digits = defaultDigits(lang);
  const byKey = new Map(latest.series.map((e) => [e.key, e]));
  return (name) => {
    if (name in extra) return extra[name];
    const [key, mod] = name.split(':') as [string, string | undefined];
    const e = byKey.get(key);
    if (!e) return undefined;
    if (mod === undefined) return formatSeriesValue(e.value, e.category, digits);
    if (mod === 'date') return formatPointDate(e.date, lang, digits);
    if (mod === 'gram') return formatNumber(e.value / BHORI_GRAMS, digits, 0);
    return undefined;
  };
}

/** The page's five FAQs with placeholders filled. Unknown placeholders fail the build. */
export function faqsFor(page: string, lang: Lang, vars: Vars): Faq[] {
  const file = FAQ_FILES[`../../seo/faqs/${page}.json`];
  if (!file) throw new Error(`seo: seo/faqs/${page}.json does not exist`);
  const fill = (text: string) =>
    text.replace(/\{([\w:]+)\}/g, (_, name: string) => {
      const value = vars(name);
      if (value === undefined) throw new Error(`seo: seo/faqs/${page}.json uses {${name}}, which has no value`);
      return value;
    });
  return file[lang].map((f) => ({ q: fill(f.q), a: fill(f.a) }));
}

// ---------- JSON-LD ----------

export type JsonLd = Record<string, unknown>;

export const absoluteUrl = (lang: Lang, path: string) => `${SITE_URL}${localePath(lang, path)}`;

const ORGANIZATION = {
  '@type': 'Organization',
  '@id': `${SITE_URL}/#organization`,
  name: SITE_NAME,
  url: SITE_URL,
  logo: `${SITE_URL}/icons/icon-512.png`,
};

/** Script-safe JSON for a <script type="application/ld+json"> body. */
export const ldJson = (data: JsonLd) => JSON.stringify(data).replace(/</g, '\\u003c');

export function homeLd(lang: Lang, description: string): JsonLd[] {
  return [
    { '@context': 'https://schema.org', ...ORGANIZATION },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      name: SITE_NAME,
      url: absoluteUrl(lang, '/'),
      inLanguage: lang,
      description,
      publisher: { '@id': ORGANIZATION['@id'] },
    },
  ];
}

export function breadcrumbLd(lang: Lang, crumbs: ReadonlyArray<{ label: string; path: string }>): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.label, item: absoluteUrl(lang, c.path) })),
  };
}

export function faqLd(faqs: readonly Faq[]): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  };
}

export interface DatasetInput {
  lang: Lang;
  path: string;
  name: string;
  description: string;
  /** The page's series, most important first. */
  entries: readonly LatestEntry[];
  /** First date of the main series' history. */
  since: string;
  keywords: readonly string[];
  /** Where the data covers; Bangladesh unless the source is narrower (e.g. Dhaka markets). */
  place?: string;
}

/** schema.org Dataset for a number page: what is measured, where it comes from, and where to download it. */
export function datasetLd(d: DatasetInput): JsonLd {
  const name = (e: LatestEntry) => (d.lang === 'bn' ? e.name_bn : e.name_en);
  const latestDate = d.entries.map((e) => e.date.slice(0, 10)).sort().at(-1)!;
  const modified = d.entries
    .map((e) => e.checked_at ?? e.fetched_at)
    .filter((t): t is string => t !== null)
    .sort()
    .at(-1);
  const shown = d.entries.slice(0, 20);
  return {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: d.name,
    description: d.description,
    url: absoluteUrl(d.lang, d.path),
    inLanguage: d.lang,
    keywords: d.keywords,
    isAccessibleForFree: true,
    creator: ORGANIZATION,
    isBasedOn: [...new Set(d.entries.map((e) => e.source_url))],
    spatialCoverage: { '@type': 'Place', name: d.place ?? 'Bangladesh' },
    temporalCoverage: `${d.since}/${latestDate}`,
    ...(modified ? { dateModified: modified } : {}),
    variableMeasured: shown.map((e) => ({ '@type': 'PropertyValue', name: name(e), unitText: e.unit, value: e.value })),
    distribution: [
      ...shown.slice(0, 10).map((e) => ({
        '@type': 'DataDownload',
        name: name(e),
        encodingFormat: 'text/csv',
        contentUrl: `${SITE_URL}/history/${e.key}.csv`,
      })),
      {
        '@type': 'DataDownload',
        name: d.lang === 'bn' ? 'সর্বশেষ মান (JSON)' : 'Latest values (JSON)',
        encodingFormat: 'application/json',
        contentUrl: `${API_BASE}/api/latest.json?keys=${shown.map((e) => e.key).join(',')}`,
      },
    ],
  };
}
