// Atom and RSS feeds of daily changes: one entry per data date listing every number that moved that day.
import {
  defaultDigits,
  formatDate,
  formatNumber,
  formatSeriesValue,
  getSeriesDef,
  type Category,
  type Lang,
} from '@bdnumbers/shared';
import { SITE_NAME, SITE_URL } from '../config';
import { STRINGS, localePath } from '../i18n';
import { getHistory, getLatest } from './data';

/** Categories whose changes make news; hourly weather and the holiday count are left out. */
const FEED_CATEGORIES: readonly Category[] = ['fx', 'gold', 'silver', 'fuel', 'lpg', 'savings', 'stock', 'market'];
/** How many dates the feed keeps. */
const FEED_DAYS = 30;

export interface FeedChange {
  name: string;
  from: number;
  to: number;
  category: Category;
}

export interface FeedEntry {
  date: string;
  title: string;
  link: string;
  html: string;
  changes: FeedChange[];
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function feedEntries(lang: Lang): Promise<FeedEntry[]> {
  const latest = await getLatest();
  const digits = defaultDigits(lang);
  // Backup series (a bank's rate while BB is down) would repeat the dollar's move; leave them out.
  const series = latest.series.filter((e) => FEED_CATEGORIES.includes(e.category) && !getSeriesDef(e.key)?.backupFor);
  const histories = await Promise.all(series.map((e) => getHistory(e.key)));

  const byDate = new Map<string, FeedChange[]>();
  histories.forEach((h, i) => {
    const e = series[i]!;
    for (let j = 1; j < h.points.length; j++) {
      const prev = h.points[j - 1]!;
      const point = h.points[j]!;
      if (point.value === prev.value) continue;
      const list = byDate.get(point.date) ?? [];
      list.push({ name: lang === 'bn' ? e.name_bn : e.name_en, from: prev.value, to: point.value, category: e.category });
      byDate.set(point.date, list);
    }
  });

  const order = new Map(FEED_CATEGORIES.map((c, i) => [c, i]));
  const s = STRINGS[lang];
  return [...byDate.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, FEED_DAYS)
    .map(([date, changes]) => {
      changes.sort((a, b) => order.get(a.category)! - order.get(b.category)!);
      const day = formatDate(date, lang, digits);
      const count = formatNumber(changes.length, digits, 0);
      const title =
        lang === 'bn' ? `${day}: ${count}টি সংখ্যা বদলেছে` : `${day}: ${changes.length} number${changes.length === 1 ? '' : 's'} changed`;
      const items = changes
        .map((c) => {
          const v = (n: number) => formatSeriesValue(n, c.category, digits);
          const arrow = c.to > c.from ? '▲' : '▼';
          return `<li>${esc(c.name)}: ${v(c.from)} → <strong>${v(c.to)}</strong> ${arrow}</li>`;
        })
        .join('');
      const link = `${SITE_URL}${localePath(lang, '/')}`;
      return { date, title, link, changes, html: `<ul>${items}</ul><p><a href="${esc(link)}">${esc(s.tagline)}</a></p>` };
    });
}

/** Midnight in Dhaka (UTC+6) on a data date, as an ISO timestamp. */
const dayStart = (date: string) => `${date}T00:00:00+06:00`;

export async function atomFeed(lang: Lang): Promise<string> {
  const latest = await getLatest();
  const entries = await feedEntries(lang);
  const self = `${SITE_URL}${localePath(lang, '/feed.xml')}`;
  const home = `${SITE_URL}${localePath(lang, '/')}`;
  const title = lang === 'bn' ? `${SITE_NAME}: আজ যা বদলেছে` : `${SITE_NAME}: what changed today`;
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="${lang}">
<title>${esc(title)}</title>
<subtitle>${esc(STRINGS[lang].tagline)}</subtitle>
<link rel="self" href="${esc(self)}"/>
<link rel="alternate" type="text/html" href="${esc(home)}"/>
<id>${esc(self)}</id>
<updated>${latest.generated_at}</updated>
<author><name>${SITE_NAME}</name><uri>${SITE_URL}</uri></author>
${entries
  .map(
    (e) => `<entry>
<title>${esc(e.title)}</title>
<link rel="alternate" type="text/html" href="${esc(e.link)}"/>
<id>tag:bdrate.fyi,${e.date}:changes/${lang}/${e.date}</id>
<updated>${dayStart(e.date)}</updated>
<content type="html">${esc(e.html)}</content>
</entry>`,
  )
  .join('\n')}
</feed>
`;
}

export async function rssFeed(lang: Lang): Promise<string> {
  const latest = await getLatest();
  const entries = await feedEntries(lang);
  const self = `${SITE_URL}${localePath(lang, '/rss.xml')}`;
  const home = `${SITE_URL}${localePath(lang, '/')}`;
  const rfc822 = (iso: string) => new Date(iso).toUTCString();
  const title = lang === 'bn' ? `${SITE_NAME}: আজ যা বদলেছে` : `${SITE_NAME}: what changed today`;
  return `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>${esc(title)}</title>
<link>${esc(home)}</link>
<description>${esc(STRINGS[lang].tagline)}</description>
<language>${lang}</language>
<lastBuildDate>${rfc822(latest.generated_at)}</lastBuildDate>
<atom:link href="${esc(self)}" rel="self" type="application/rss+xml"/>
${entries
  .map(
    (e) => `<item>
<title>${esc(e.title)}</title>
<link>${esc(e.link)}</link>
<guid isPermaLink="false">tag:bdrate.fyi,${e.date}:changes/${lang}/${e.date}</guid>
<pubDate>${rfc822(dayStart(e.date))}</pubDate>
<description>${esc(e.html)}</description>
</item>`,
  )
  .join('\n')}
</channel>
</rss>
`;
}
