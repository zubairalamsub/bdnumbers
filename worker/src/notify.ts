import {
  PUSH_TOPICS,
  dhakaDate,
  formatNumber,
  formatSeriesValue,
  getSeriesDef,
  pushTagKey,
  type ChangeEntry,
  type Lang,
  type PushTopic,
} from '@bdnumbers/shared';
import type { Env } from './env';
import { errorMessage } from './lib/errors';
import { buildChanges } from './queries';

export const ONESIGNAL_API = 'https://api.onesignal.com/notifications?c=push';

export type PushOutcome = 'not-configured' | 'none' | 'sent' | 'failed';

/** Real moves (not first values) among the points this batch wrote, i.e. fetched at or after `since`. */
export async function batchChanges(env: Env, since: string): Promise<ChangeEntry[]> {
  const { changes } = await buildChanges(env.DB, dhakaDate());
  return changes.filter((c) => c.previous !== null && c.fetched_at >= since);
}

/** "Diesel: 135 → 140 ▲" in the given language. */
export function changeLine(c: ChangeEntry, lang: Lang): string {
  const category = getSeriesDef(c.key)?.category ?? 'fx';
  const digits = lang === 'bn' ? 'beng' : 'latn';
  const v = (n: number) => formatSeriesValue(n, category, digits);
  const arrow = c.value > c.previous! ? '▲' : '▼';
  return `${lang === 'bn' ? c.name_bn : c.name_en}: ${v(c.previous!)} → ${v(c.value)} ${arrow}`;
}

/**
 * One OneSignal web push per topic and language for the topics whose numbers changed. Without
 * ONESIGNAL_APP_ID and ONESIGNAL_KEY this does nothing (the site hides its "notify me" buttons too).
 */
export async function sendPushes(env: Env, changes: readonly ChangeEntry[]): Promise<{ outcome: PushOutcome; sent: string[] }> {
  if (!env.ONESIGNAL_APP_ID || !env.ONESIGNAL_KEY) return { outcome: 'not-configured', sent: [] };
  const sent: string[] = [];
  let failed = false;
  for (const topic of Object.keys(PUSH_TOPICS) as PushTopic[]) {
    const t = PUSH_TOPICS[topic];
    const hits = changes.filter((c) => (t.keys as readonly string[]).includes(c.key));
    if (hits.length === 0) continue;
    for (const lang of ['bn', 'en'] as const) {
      const lines = hits.slice(0, 3).map((c) => changeLine(c, lang));
      const more = hits.length - 3;
      if (more > 0) lines.push(lang === 'bn' ? `আরও ${formatNumber(more, 'beng', 0)}টি` : `and ${more} more`);
      // OneSignal has no "bn" language code, so each language goes out as its own message under "en",
      // filtered to the subscribers who signed up from a page in that language.
      const body = {
        app_id: env.ONESIGNAL_APP_ID,
        target_channel: 'push',
        filters: [{ field: 'tag', key: pushTagKey(topic), relation: '=', value: lang }],
        headings: { en: lang === 'bn' ? `${t.bn} বদলেছে` : `${t.en} changed` },
        contents: { en: lines.join('\n') },
        url: `${env.SITE_URL}${lang === 'bn' ? '' : '/en'}${t.path}`,
      };
      try {
        const res = await fetch(ONESIGNAL_API, {
          method: 'POST',
          headers: { authorization: `Key ${env.ONESIGNAL_KEY}`, 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (res.ok) sent.push(`${topic}:${lang}`);
        else {
          failed = true;
          console.error(`OneSignal ${topic}/${lang}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
        }
      } catch (err) {
        failed = true;
        console.error(`OneSignal ${topic}/${lang}: ${errorMessage(err)}`);
      }
    }
  }
  return { outcome: failed ? 'failed' : sent.length > 0 ? 'sent' : 'none', sent };
}
