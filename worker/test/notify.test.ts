import { dhakaDate } from '@bdnumbers/shared';
import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runBatch } from '../src/cron';
import { BUTTONDOWN_API } from '../src/digest';
import type { Env } from '../src/env';
import { ONESIGNAL_API } from '../src/notify';
import { allSourceRoutes, calledUrls, mockFetch, resetStorage, seedPoints } from './helpers';

const keyed = { ...env, ONESIGNAL_APP_ID: 'app-1', ONESIGNAL_KEY: 'os-key', BUTTONDOWN_API_KEY: 'bd-key' } as Env;
/** 13:05 and 07:05 in Dhaka today: after and before the digest is due. */
const afternoon = () => new Date(`${dhakaDate()}T13:05:00+06:00`);
const morning = () => new Date(`${dhakaDate()}T07:05:00+06:00`);

const routes = () =>
  mockFetch({
    ...allSourceRoutes(),
    [ONESIGNAL_API]: () => Response.json({ id: 'notification-1' }),
    [BUTTONDOWN_API]: () => Response.json({ id: 'email-1' }, { status: 201 }),
  });

/** Requests the stubbed fetch received for one URL, with parsed JSON bodies. */
function sentTo(spy: ReturnType<typeof mockFetch>, url: string) {
  return spy.mock.calls
    .filter(([input]) => (typeof input === 'string' ? input : input instanceof URL ? input.href : input.url) === url)
    .map(([, init]) => ({ headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) }));
}

beforeEach(async () => {
  await resetStorage();
  // Earlier values, so today's fixtures are real changes: dollar 122.50 → 123.65, 22K gold 220,000 → 226,340.
  await seedPoints([
    { series_key: 'usd_bdt_avg', date: '2026-10-18', value: 122.5 },
    { series_key: 'gold_22k', date: '2026-10-15', value: 220_000 },
  ]);
});
afterEach(() => vi.restoreAllMocks());

describe('web push and email digest', () => {
  it('stay off without keys', async () => {
    const spy = routes();
    const result = await runBatch(env, 'daily', 'test', undefined, afternoon());
    expect(result.push).toBe('not-configured');
    expect(result.digest).toBe('not-configured');
    expect(calledUrls(spy)).not.toContain(ONESIGNAL_API);
    expect(calledUrls(spy)).not.toContain(BUTTONDOWN_API);
  });

  it('push each changed topic to its subscribers in both languages, and email one digest', async () => {
    const spy = routes();
    const result = await runBatch(keyed, 'daily', 'test', undefined, afternoon());
    expect(result.push).toBe('sent');
    expect(result.digest).toBe('sent');

    const pushes = sentTo(spy, ONESIGNAL_API);
    expect(pushes.map((p) => p.body.filters[0])).toEqual([
      { field: 'tag', key: 'n_dollar', relation: '=', value: 'bn' },
      { field: 'tag', key: 'n_dollar', relation: '=', value: 'en' },
      { field: 'tag', key: 'n_gold', relation: '=', value: 'bn' },
      { field: 'tag', key: 'n_gold', relation: '=', value: 'en' },
    ]);
    const [dollarBn, dollarEn] = pushes;
    expect(dollarBn!.headers.get('authorization')).toBe('Key os-key');
    expect(dollarBn!.body).toMatchObject({
      app_id: 'app-1',
      target_channel: 'push',
      headings: { en: 'ডলার রেট বদলেছে' },
      url: 'https://bdrate.fyi/dollar-rate-today',
    });
    expect(dollarBn!.body.contents.en).toContain('১২২.৫০ → ১২৩.৬৫ ▲');
    expect(dollarEn!.body.contents.en).toContain('122.50 → 123.65 ▲');
    expect(dollarEn!.body.url).toBe('https://bdrate.fyi/en/dollar-rate-today');

    const [email] = sentTo(spy, BUTTONDOWN_API);
    expect(email!.headers.get('authorization')).toBe('Token bd-key');
    expect(email!.headers.get('x-buttondown-live-dangerously')).toBe('true');
    expect(email!.body.status).toBe('about_to_send');
    expect(email!.body.subject).toContain('আজকের রেট ও দাম');
    expect(email!.body.body).toContain('আজ যা বদলেছে');
    expect(email!.body.body).toContain('What changed today');
    expect(email!.body.body).toContain('2,20,000 → 2,26,340 ▲');
  });

  it('send nothing twice: a second run the same afternoon has no new pushes and no second email', async () => {
    routes();
    await runBatch(keyed, 'daily', 'test', undefined, afternoon());
    vi.restoreAllMocks();
    const spy = routes();
    const again = await runBatch(keyed, 'daily', 'test', undefined, afternoon());
    expect(again.push).toBe('skipped');
    expect(again.digest).toBe('already-sent');
    expect(calledUrls(spy)).not.toContain(ONESIGNAL_API);
    expect(calledUrls(spy)).not.toContain(BUTTONDOWN_API);
  });

  it('push in the morning run but keep the email for the afternoon', async () => {
    const spy = routes();
    const result = await runBatch(keyed, 'daily', 'test', undefined, morning());
    expect(result.push).toBe('sent');
    expect(result.digest).toBe('not-due');
    expect(calledUrls(spy)).not.toContain(BUTTONDOWN_API);
  });

  it('report a failed push without failing the batch', async () => {
    mockFetch({ ...allSourceRoutes(), [ONESIGNAL_API]: () => new Response('bad key', { status: 401 }) });
    const result = await runBatch({ ...keyed, BUTTONDOWN_API_KEY: undefined } as Env, 'daily', 'test', undefined, afternoon());
    expect(result.push).toBe('failed');
    expect(result.written).toBeGreaterThan(0);
  });
});
