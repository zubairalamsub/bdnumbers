import { EmailMessage } from 'cloudflare:email';
import type { Env } from './env';
import { errorMessage } from './lib/errors';
import type { RunResult } from './run';

export type AlertOutcome = 'not-configured' | 'none' | 'sent' | 'failed';

/** An outage we have already emailed about, kept until the source recovers. */
interface OpenAlert {
  since: string;
  error: string;
}

const alertKey = (source: string) => `alert:${source}`;

/** "2026-10-25 13:00" in Dhaka time. */
const dhakaTime = (iso: string) => new Date(Date.parse(iso) + 6 * 3_600_000).toISOString().slice(0, 16).replace('T', ' ');

/**
 * Email the owner (Cloudflare Email Routing, free) when a source has failed twice in a row, and again
 * when it next succeeds. Each outage sends one "failing" and one "recovered" email however many runs it
 * spans; open outages live in KV under alert:<source>, so KV is written only when the state changes.
 * One email covers every source that changed state in the batch.
 */
export async function checkAlerts(env: Env, results: readonly RunResult[], now = new Date()): Promise<AlertOutcome> {
  if (!env.ALERT_EMAIL || !env.ALERT_TO) return 'not-configured';
  const failing: Array<{ source: string; error: string }> = [];
  const recovered: Array<{ source: string; open: OpenAlert }> = [];
  for (const r of results) {
    const open = await env.CACHE.get<OpenAlert>(alertKey(r.source), 'json');
    if (r.ok) {
      if (open) recovered.push({ source: r.source, open });
      continue;
    }
    if (open || r.run_id === null) continue;
    const previous = await env.DB.prepare(
      'SELECT ok FROM runs WHERE source = ?1 AND id < ?2 AND finished_at IS NOT NULL ORDER BY id DESC LIMIT 1',
    )
      .bind(r.source, r.run_id)
      .first<{ ok: number | null }>();
    if (previous?.ok === 0) failing.push({ source: r.source, error: r.error ?? 'unknown error' });
  }
  if (failing.length === 0 && recovered.length === 0) return 'none';

  const subject =
    failing.length > 0
      ? `bdrate.fyi: ${failing.map((f) => f.source).join(', ')} failing`
      : `bdrate.fyi: ${recovered.map((r) => r.source).join(', ')} recovered`;
  const lines = [
    ...(failing.length > 0 ? ['Failing (the last two runs in a row):', ...failing.map((f) => `- ${f.source}: ${f.error}`), ''] : []),
    ...(recovered.length > 0
      ? ['Working again:', ...recovered.map((r) => `- ${r.source} (failing since ${dhakaTime(r.open.since)} Dhaka time)`), '']
      : []),
    `Status of every source: ${env.SITE_URL}/status`,
    'You get one email when a source starts failing and one when it recovers.',
  ];
  try {
    await sendEmail(env, env.ALERT_TO, subject, lines.join('\n'), now);
  } catch (err) {
    console.error(`alert email failed: ${errorMessage(err)}`);
    return 'failed';
  }
  await Promise.all([
    ...failing.map((f) => env.CACHE.put(alertKey(f.source), JSON.stringify({ since: now.toISOString(), error: f.error } satisfies OpenAlert))),
    ...recovered.map((r) => env.CACHE.delete(alertKey(r.source))),
  ]);
  return 'sent';
}

/** One email saying alerts work (POST /internal/alerts/test). */
export async function sendTestAlert(env: Env, now = new Date()): Promise<AlertOutcome> {
  if (!env.ALERT_EMAIL || !env.ALERT_TO) return 'not-configured';
  const text = [
    'This is a test of the bdrate.fyi failure alerts.',
    '',
    'From now on you get one email when a data source fails twice in a row, and one when it works again.',
    `Status of every source: ${env.SITE_URL}/status`,
  ].join('\n');
  try {
    await sendEmail(env, env.ALERT_TO, 'bdrate.fyi: test alert', text, now);
    return 'sent';
  } catch (err) {
    console.error(`test alert failed: ${errorMessage(err)}`);
    return 'failed';
  }
}

/** A plain-text email as raw MIME (what the send_email binding takes). */
export function buildMime(from: string, to: string, subject: string, text: string, now: Date): string {
  return [
    `From: bdrate.fyi alerts <${from}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `Date: ${now.toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@${from.split('@')[1]}>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    text,
  ].join('\r\n');
}

async function sendEmail(env: Env, to: string, subject: string, text: string, now: Date): Promise<void> {
  const from = env.ALERT_FROM ?? 'alerts@bdrate.fyi';
  await env.ALERT_EMAIL!.send(new EmailMessage(from, to, buildMime(from, to, subject, text, now)));
}
