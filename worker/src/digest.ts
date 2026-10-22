import { dhakaDate, formatDate, formatNumber, formatSeriesValue, getSeriesDef, unitLabel, type ChangeEntry, type Lang, type LatestResponse } from '@bdnumbers/shared';
import { getLatest } from './cache';
import type { Env } from './env';
import { errorMessage } from './lib/errors';
import { changeLine } from './notify';
import { buildChanges } from './queries';

export const BUTTONDOWN_API = 'https://api.buttondown.com/v1/emails';

export type DigestOutcome = 'not-configured' | 'not-due' | 'already-sent' | 'nothing-new' | 'sent' | 'failed';

/** The day's headline numbers, in this order. */
const HEADLINES = ['usd_bdt_avg', 'gold_22k', 'silver_22k', 'fuel_diesel', 'lpg_12kg', 'dse_dsex'];
/** Changes listed in full before "and N more". */
const MAX_LINES = 25;

const dhakaHour = (at: Date) => (at.getUTCHours() + 6) % 24;

function section(lang: Lang, today: string, latest: LatestResponse, changes: readonly ChangeEntry[], siteUrl: string): string {
  const bn = lang === 'bn';
  const digits = bn ? 'beng' : 'latn';
  const headlines = HEADLINES.flatMap((key) => {
    const e = latest.series.find((x) => x.key === key);
    if (!e) return [];
    return [`- ${bn ? e.name_bn : e.name_en}: **${formatSeriesValue(e.value, e.category, digits)} ${unitLabel(e.unit, lang)}**`];
  });
  const lines = changes.slice(0, MAX_LINES).map((c) => `- ${changeLine(c, lang)}`);
  const more = changes.length - MAX_LINES;
  if (more > 0) lines.push(bn ? `- আরও ${formatNumber(more, 'beng', 0)}টি পরিবর্তন সাইটে দেখুন` : `- and ${more} more on the site`);
  const home = `${siteUrl}${bn ? '/' : '/en'}`;
  return [
    `## ${bn ? 'আজকের রেট ও দাম' : 'Bangladesh rates today'}, ${formatDate(today, lang, digits)}`,
    '',
    ...headlines,
    '',
    `### ${bn ? 'আজ যা বদলেছে' : 'What changed today'}`,
    '',
    ...lines,
    '',
    `[${bn ? 'সব সংখ্যা দেখুন' : 'See every number'}](${home})`,
  ].join('\n');
}

/**
 * Email the day's changes through Buttondown, once a day after the 13:00 Dhaka batch (the free plan
 * assumes at most one email a day to the whole list). One bilingual email: Bengali, then English.
 * Skipped on days when nothing changed. Without BUTTONDOWN_API_KEY this does nothing.
 */
export async function sendDigest(env: Env, now: Date): Promise<DigestOutcome> {
  if (!env.BUTTONDOWN_API_KEY) return 'not-configured';
  if (dhakaHour(now) < 12) return 'not-due';
  const today = dhakaDate(now);
  const sentKey = `digest:${today}`;
  if (await env.CACHE.get(sentKey)) return 'already-sent';

  const { changes } = await buildChanges(env.DB, today);
  const news = changes.filter((c) => c.previous !== null && getSeriesDef(c.key)?.category !== 'weather');
  if (news.length === 0) return 'nothing-new';

  const latest = await getLatest(env);
  const body = [section('bn', today, latest, news, env.SITE_URL), '---', section('en', today, latest, news, env.SITE_URL)].join('\n\n');
  const subject = `আজকের রেট ও দাম, ${formatDate(today, 'bn')} | Bangladesh rates, ${formatDate(today, 'en')}`;
  try {
    const res = await fetch(BUTTONDOWN_API, {
      method: 'POST',
      headers: {
        authorization: `Token ${env.BUTTONDOWN_API_KEY}`,
        'content-type': 'application/json',
        'x-api-version': '2026-04-01',
        // Required (since API version 2026-04-01) for an API key to send rather than save a draft.
        'x-buttondown-live-dangerously': 'true',
      },
      body: JSON.stringify({ subject, body, status: 'about_to_send' }),
    });
    if (!res.ok) {
      console.error(`Buttondown: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
      return 'failed';
    }
    await env.CACHE.put(sentKey, now.toISOString(), { expirationTtl: 3 * 86_400 });
    return 'sent';
  } catch (err) {
    console.error(`Buttondown: ${errorMessage(err)}`);
    return 'failed';
  }
}
