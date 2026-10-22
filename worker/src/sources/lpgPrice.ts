import { UNB_LPG_SEARCH_URL, toIsoDate, type Point } from '@bdnumbers/shared';
import { ParseError, errorMessage } from '../lib/errors';
import { Extractor } from '../lib/html';
import { fetchText } from '../lib/http';
import type { Source } from './types';

/**
 * BERC fixes the private LPG price every month but publishes it only as an image, so this reads UNB's
 * report of each decision. Two independent figures are taken from the article — the 12 kg cylinder price
 * and the per-kg price — and must agree (12 × per kg ≈ cylinder), which guards against misreading prose.
 */

/** LPG article URLs from UNB search results, newest (highest id) first. */
export async function parseUnbLpgSearch(html: string): Promise<string[]> {
  const x = new Extractor();
  const anchors = x.anchors('a[href]');
  await x.run(html);
  const found = new Map<number, string>();
  for (const a of anchors) {
    if (!/\bLPG\b/.test(a.text) || !/price/i.test(a.text)) continue;
    const url = new URL(a.href, 'https://unb.com.bd/').href;
    const id = /^https:\/\/unb\.com\.bd\/category\/[^?#]+\/(\d+)$/.exec(url)?.[1];
    if (id) found.set(Number(id), url);
  }
  if (found.size === 0) throw new ParseError('no LPG price article in UNB search results');
  return [...found.entries()].sort(([a], [b]) => b - a).map(([, url]) => url);
}

const amount = (s: string) => Number(s.replace(/,/g, ''));

export async function parseUnbLpgArticle(html: string, url: string): Promise<Point[]> {
  const x = new Extractor();
  const paragraphs = x.text('.news-article-text-block p');
  const postMeta = x.text('ul.post-meta li');
  await x.run(html);
  const body = paragraphs.join(' ');
  if (!/BERC|Energy Regulatory Commission/.test(body)) throw new ParseError(`article does not cite BERC (${url})`);

  const published = postMeta.map((t) => /Publish-\s*([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/.exec(t)).find((m) => m !== null);
  const date = published ? toIsoDate(published[3]!, published[1]!, published[2]!) : null;
  if (!date) throw new ParseError(`publish date not found (${url})`);

  // "...taking the price of a 12kg cylinder up by Tk252 to Tk1,837" / "12kg cylinder now Tk1,837"
  const cylinder = /12\s?-?kg (?:LPG )?cylinder[^.]*?(?:\bto|\bnow|\bat)\s+Tk\s?([\d,]+)/i.exec(body)?.[1];
  // "...fixed the retail price of private LPG, including VAT, at Tk153.06 per kg for October"
  const perKg = /\b(?:at|to)\s+Tk\s?([\d,]+(?:\.\d+)?)\s+per\s+(?:kg|kilogram|kilogramme)\b/i.exec(body)?.[1];
  if (!cylinder || !perKg) throw new ParseError(`12 kg and per-kg prices not both found (${url})`);
  const twelve = amount(cylinder);
  const kg = amount(perKg);
  if (Math.abs(twelve - kg * 12) > 3) {
    throw new ParseError(`12 kg price Tk ${twelve} doesn't match Tk ${kg}/kg × 12 (${url})`);
  }
  const meta = { source: 'mirror', mirror: 'unb', url };
  return [
    { series_key: 'lpg_12kg', date, value: twelve, meta },
    { series_key: 'lpg_per_kg', date, value: kg, meta },
  ];
}

export const lpgPrice: Source = {
  key: 'lpgPrice',
  cadence: 'periodic',
  writeMode: 'on-change',
  async fetch(env, ctx) {
    // Commentary pieces ("price hike adds to woes") also mention LPG; take the newest article that parses.
    const urls = (await parseUnbLpgSearch(await fetchText(env, UNB_LPG_SEARCH_URL))).slice(0, 3);
    const errors: string[] = [];
    for (const url of urls) {
      try {
        const points = await parseUnbLpgArticle(await fetchText(env, url), url);
        if (errors.length > 0) ctx.warn(`skipped newer LPG articles: ${errors.join('; ')}`);
        return points;
      } catch (err) {
        errors.push(errorMessage(err));
      }
    }
    throw new Error(`no usable LPG article: ${errors.join('; ')}`);
  },
};
