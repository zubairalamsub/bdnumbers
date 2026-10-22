import type { Env } from '../env';

const TIMEOUT_MS = 20_000;
/** Statuses worth one polite retry: rate limits, transient bot challenges, server errors. */
const RETRY_STATUSES = new Set([403, 429, 500, 502, 503, 504]);

/**
 * GET a page as text. Retries once after RETRY_DELAY_MS on a transient failure. Throws with the URL,
 * status and any Cloudflare mitigation/page title, so a block is easy to tell from an outage.
 */
export async function fetchText(env: Env, url: string): Promise<string> {
  try {
    return await fetchOnce(env, url);
  } catch (err) {
    if (!(err instanceof FetchError) || !err.retryable) throw err;
    await new Promise((resolve) => setTimeout(resolve, Number(env.RETRY_DELAY_MS ?? 3000)));
    return fetchOnce(env, url);
  }
}

// Keeps the default name "Error": the message already starts with "GET <url>".
class FetchError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

async function fetchOnce(env: Env, url: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        'user-agent': env.USER_AGENT,
        accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9,bn;q=0.8',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new FetchError(`GET ${url} failed: ${err instanceof Error ? err.message : String(err)}`, true);
  }
  if (res.ok) return res.text();

  const details: string[] = [];
  const mitigated = res.headers.get('cf-mitigated');
  if (mitigated) details.push(`cf-mitigated: ${mitigated}`);
  const title = /<title[^>]*>([^<]{0,80})/i.exec(await res.text().catch(() => ''))?.[1]?.trim();
  if (title) details.push(`title "${title}"`);
  throw new FetchError(
    `GET ${url} returned HTTP ${res.status}${details.length ? ` (${details.join(', ')})` : ''}`,
    RETRY_STATUSES.has(res.status),
  );
}
