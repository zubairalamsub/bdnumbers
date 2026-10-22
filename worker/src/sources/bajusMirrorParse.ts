// Text-only parsing for UNB's reports of BAJUS price changes, shared by the Worker's UNB fallback
// (bajusMirror.ts) and the Node history backfill (scripts/backfill-gold.ts), so it must not depend on
// Worker-only APIs such as HTMLRewriter.
import { addDays, type Karat } from '@bdnumbers/shared';
import type { Metal } from './metals';

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const EFFECT = /\b(?:effective|effect)\b[^.]*?\b(today|tomorrow|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i;

/**
 * The day BAJUS's new prices took effect, from article prose such as "effective from 10am Thursday" or
 * "took effect from Tuesday": the named weekday within three days of publication (so both "will take
 * effect" and "took effect" resolve), "today"/"tomorrow" relative to it, else the publish date itself.
 */
export function effectiveDate(text: string, published: string): string {
  const word = EFFECT.exec(text)?.[1]?.toLowerCase();
  if (!word || word === 'today') return published;
  if (word === 'tomorrow') return addDays(published, 1);
  const target = WEEKDAYS.indexOf(word);
  for (const offset of [0, 1, -1, 2, -2, 3, -3]) {
    const day = addDays(published, offset);
    if (new Date(`${day}T00:00:00Z`).getUTCDay() === target) return day;
  }
  return published;
}

const MENTION =
  /\b(22|21|18)[- ]?(?:carat|karat)\s+(gold|silver)\b|\b(gold|silver)\s+of\s+the\s+traditional\s+method\b|\btraditional(?:[- ]method)?\s+(gold|silver)\b/gi;
const AMOUNT = /(?:Tk\.?|BDT)\s*(\d[\d,]*(?:\.\d+)?)/gi;

/**
 * Pull per-bhori prices out of news prose such as "cutting the price of 22-carat gold by Tk 3,266 per
 * bhori to Tk 228,031". For each karat the first mention wins (later ones are usually past prices), and
 * the price is the largest amount between that mention and the next mention or the end of the sentence
 * (the other amounts are the size of the change).
 */
export function extractBhoriPrices(text: string): Record<Metal, Map<Karat, number>> {
  const out: Record<Metal, Map<Karat, number>> = { gold: new Map(), silver: new Map() };
  const mentions = [...text.matchAll(MENTION)].map((m) => ({
    start: m.index,
    end: m.index + m[0].length,
    metal: (m[2] ?? m[3] ?? m[4])!.toLowerCase() as Metal,
    karat: (m[1] ? `${m[1]}k` : 'traditional') as Karat,
  }));

  mentions.forEach((mention, i) => {
    if (out[mention.metal].has(mention.karat)) return;
    let segment = text.slice(mention.end, mentions[i + 1]?.start ?? text.length);
    const sentenceEnd = segment.search(/\.\s+[A-Z]/);
    if (sentenceEnd >= 0) segment = segment.slice(0, sentenceEnd + 1);
    const amounts = [...segment.matchAll(AMOUNT)].map((a) => Number(a[1]!.replace(/,/g, ''))).filter(Number.isFinite);
    if (amounts.length > 0) out[mention.metal].set(mention.karat, Math.max(...amounts));
  });
  return out;
}
