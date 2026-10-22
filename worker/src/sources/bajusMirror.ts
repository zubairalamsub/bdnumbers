import { KARAT_ORDER, toIsoDate, type Point } from '@bdnumbers/shared';
import { ParseError, errorMessage } from '../lib/errors';
import { Extractor } from '../lib/html';
import { fetchText } from '../lib/http';
import type { Env } from '../env';
import { effectiveDate, extractBhoriPrices } from './bajusMirrorParse';
import { assertKaratLadder } from './metals';

export { effectiveDate, extractBhoriPrices };

/** UNB (United News of Bangladesh) reports every BAJUS price change, quoting per-bhori prices. */
export const UNB_SEARCH_URL = 'https://unb.com.bd/search?q=gold+price';

export interface MirrorResult {
  url: string;
  points: Point[];
  warnings: string[];
}

/** Fallback for BAJUS: newest UNB gold-price article → per-bhori prices, flagged `source: "mirror"`. */
export async function fetchUnbMirror(env: Env): Promise<MirrorResult> {
  const url = await parseUnbSearch(await fetchText(env, UNB_SEARCH_URL));
  return parseUnbArticle(await fetchText(env, url), url);
}

/** URL of the newest (highest article id) "Gold price(s) …" article in UNB search results. */
export async function parseUnbSearch(html: string): Promise<string> {
  const x = new Extractor();
  const anchors = x.anchors('a[href]');
  await x.run(html);

  let best: { id: number; url: string } | null = null;
  for (const a of anchors) {
    if (!/\bgold prices?\b/i.test(a.text)) continue;
    const url = new URL(a.href, 'https://unb.com.bd/').href;
    const m = /^https:\/\/unb\.com\.bd\/category\/[^?#]+\/(\d+)$/.exec(url);
    if (!m) continue;
    const id = Number(m[1]);
    if (!best || id > best.id) best = { id, url };
  }
  if (!best) throw new ParseError('no gold price article in UNB search results');
  return best.url;
}

export async function parseUnbArticle(html: string, url: string): Promise<MirrorResult> {
  const x = new Extractor();
  const paragraphs = x.text('.news-article-text-block p');
  const postMeta = x.text('ul.post-meta li');
  await x.run(html);

  const body = paragraphs.join(' ');
  if (!/BAJUS|Bangladesh Jewellers/i.test(body)) throw new ParseError(`article does not mention BAJUS (${url})`);
  const published = postMeta.map((t) => /Publish-\s*([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/.exec(t)).find((m) => m !== null);
  const publishedOn = published ? toIsoDate(published[3]!, published[1]!, published[2]!) : null;
  if (!publishedOn) throw new ParseError(`publish date not found (${url})`);
  const date = effectiveDate(body, publishedOn);

  const prices = extractBhoriPrices(body);
  const points: Point[] = [];
  const warnings: string[] = [];
  for (const metal of ['gold', 'silver'] as const) {
    try {
      assertKaratLadder(metal, prices[metal], 'UNB');
    } catch (err) {
      warnings.push(`UNB ${metal} skipped: ${errorMessage(err)}`);
      continue;
    }
    for (const k of KARAT_ORDER) {
      points.push({
        series_key: `${metal}_${k}`,
        date,
        value: prices[metal].get(k)!,
        meta: { source: 'mirror', mirror: 'unb', url, article_date: publishedOn },
      });
    }
  }
  if (points.length === 0) throw new ParseError(`no usable prices in ${url}: ${warnings.join('; ')}`);
  return { url, points, warnings };
}
