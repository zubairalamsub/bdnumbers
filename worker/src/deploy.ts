import type { Env } from './env';
import { errorMessage } from './lib/errors';

export type DeployOutcome = 'triggered' | 'failed' | 'not-configured' | 'skipped';

/** POST the Cloudflare Pages deploy hook so the site rebuilds with fresh data. */
export async function triggerPagesDeploy(env: Env): Promise<DeployOutcome> {
  if (!env.PAGES_DEPLOY_HOOK) return 'not-configured';
  try {
    const res = await fetch(env.PAGES_DEPLOY_HOOK, { method: 'POST' });
    if (res.ok) return 'triggered';
    console.error(`Pages deploy hook returned HTTP ${res.status}`);
  } catch (err) {
    console.error(`Pages deploy hook failed: ${errorMessage(err)}`);
  }
  return 'failed';
}
