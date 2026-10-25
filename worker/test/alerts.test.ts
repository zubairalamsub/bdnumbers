import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildMime, checkAlerts, sendTestAlert } from '../src/alerts';
import type { Env } from '../src/env';
import type { RunResult } from '../src/run';
import { resetStorage } from './helpers';

const NOW = new Date('2026-10-25T07:00:00Z');

function alertEnv() {
  const send = vi.fn(async (_message: unknown) => ({ messageId: 'test' }));
  return { env: { ...env, ALERT_TO: 'owner@example.com', ALERT_EMAIL: { send } as unknown as SendEmail } as Env, send };
}

/** Log a finished run and return its result as runSource would. */
async function run(source: string, ok: boolean, error: string | null = ok ? null : 'HTTP 403'): Promise<RunResult> {
  const at = new Date().toISOString();
  const row = await env.DB.prepare(
    'INSERT INTO runs (source, started_at, finished_at, ok, error, points_written, trigger) VALUES (?1, ?2, ?2, ?3, ?4, 0, ?5) RETURNING id',
  )
    .bind(source, at, ok ? 1 : 0, error, 'test')
    .first<{ id: number }>();
  return { source, ok, error, written: 0, run_id: row!.id };
}

beforeEach(resetStorage);

describe('failure alerts', () => {
  it('stay off without a recipient', async () => {
    expect(await checkAlerts(env as Env, [await run('bajusGold', false)], NOW)).toBe('not-configured');
  });

  it('wait for a second failure in a row', async () => {
    const { env: e, send } = alertEnv();
    await run('bajusGold', true);
    expect(await checkAlerts(e, [await run('bajusGold', false)], NOW)).toBe('none');
    expect(send).not.toHaveBeenCalled();
  });

  it('email once when a source fails twice, not again while it stays down, and once when it recovers', async () => {
    const { env: e, send } = alertEnv();
    await run('bajusGold', false);
    expect(await checkAlerts(e, [await run('bajusGold', false), await run('tcbMarketPrices', true)], NOW)).toBe('sent');
    expect(send).toHaveBeenCalledTimes(1);
    const message = send.mock.calls[0]![0] as { from: string; to: string };
    expect(message).toMatchObject({ from: 'alerts@bdrate.fyi', to: 'owner@example.com' });
    expect(await env.CACHE.get('alert:bajusGold', 'json')).toMatchObject({ since: NOW.toISOString(), error: 'HTTP 403' });

    expect(await checkAlerts(e, [await run('bajusGold', false)], NOW)).toBe('none');
    expect(send).toHaveBeenCalledTimes(1);

    expect(await checkAlerts(e, [await run('bajusGold', true)], NOW)).toBe('sent');
    expect(send).toHaveBeenCalledTimes(2);
    expect(await env.CACHE.get('alert:bajusGold')).toBeNull();
  });

  it('keep the outage open if the email could not be sent, so the next batch tries again', async () => {
    const { env: e, send } = alertEnv();
    send.mockRejectedValueOnce(new Error('destination not verified'));
    await run('bangladeshBank', false);
    expect(await checkAlerts(e, [await run('bangladeshBank', false)], NOW)).toBe('failed');
    expect(await env.CACHE.get('alert:bangladeshBank')).toBeNull();
  });
});

describe('sendTestAlert', () => {
  it('sends one test email, or reports that alerts are off', async () => {
    expect(await sendTestAlert(env as Env, NOW)).toBe('not-configured');
    const { env: e, send } = alertEnv();
    expect(await sendTestAlert(e, NOW)).toBe('sent');
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe('buildMime', () => {
  it('writes a plain-text message with the headers Email Routing requires', () => {
    const mime = buildMime('alerts@bdrate.fyi', 'owner@example.com', 'bdrate.fyi: bajusGold failing', 'Failing:\n- bajusGold: HTTP 403', NOW);
    expect(mime).toContain('From: bdrate.fyi alerts <alerts@bdrate.fyi>\r\n');
    expect(mime).toContain('To: owner@example.com\r\n');
    expect(mime).toContain('Subject: bdrate.fyi: bajusGold failing\r\n');
    expect(mime).toMatch(/Message-ID: <[0-9a-f-]{36}@bdrate\.fyi>\r\n/);
    expect(mime).toContain('Date: Sun, 25 Oct 2026 07:00:00 GMT\r\n');
    expect(mime.endsWith('\r\n\r\nFailing:\n- bajusGold: HTTP 403')).toBe(true);
  });
});
