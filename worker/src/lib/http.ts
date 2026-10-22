import type { Env } from '../env';

const TIMEOUT_MS = 20_000;

/** GET a page as text. Throws with the URL and status on any non-2xx response. */
export async function fetchText(env: Env, url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'user-agent': env.USER_AGENT,
      accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
      'accept-language': 'en-US,en;q=0.9,bn;q=0.8',
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`GET ${url} returned HTTP ${res.status}`);
  }
  return res.text();
}
