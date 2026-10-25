import type { Env } from '../env';

const TIMEOUT_MS = 20_000;
/** Statuses worth one polite retry: rate limits, transient bot challenges, server errors, and
 * Cloudflare's 520–524 "origin unreachable" family. */
const RETRY_STATUSES = new Set([403, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524]);

/**
 * GET a page as text. Retries once after RETRY_DELAY_MS on a transient failure. Throws with the URL,
 * status and any Cloudflare mitigation/page title, so a block is easy to tell from an outage.
 */
export async function fetchText(env: Env, url: string): Promise<string> {
  return (await fetchWithRetry(env, url, 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8')).text();
}

/** GET binary content (e.g. an XLSX file), with the same retry and error reporting as fetchText. */
export async function fetchBytes(env: Env, url: string): Promise<ArrayBuffer> {
  return (await fetchWithRetry(env, url, '*/*')).arrayBuffer();
}

/** GET and parse JSON, with the same retry and error reporting as fetchText. */
export async function fetchJson<T>(env: Env, url: string): Promise<T> {
  return (await fetchWithRetry(env, url, 'application/json')).json<T>();
}

async function fetchWithRetry(env: Env, url: string, accept: string): Promise<Response> {
  try {
    return await fetchOnce(env, url, accept);
  } catch (err) {
    if (!(err instanceof FetchError) || !err.retryable) throw err;
    await new Promise((resolve) => setTimeout(resolve, Number(env.RETRY_DELAY_MS ?? 3000)));
    return fetchOnce(env, url, accept);
  }
}

// Keeps the default name "Error": the message already starts with "GET <url>".
class FetchError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    /** The HTTP status, when the server answered. */
    readonly status: number | null = null,
  ) {
    super(message);
  }
}

/** The HTTP status a fetchText/fetchBytes/fetchJson failure came with, or null (network error, timeout). */
export const httpStatusOf = (err: unknown): number | null => (err instanceof FetchError ? err.status : null);

async function fetchOnce(env: Env, url: string, accept: string): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        'user-agent': env.USER_AGENT,
        accept,
        'accept-language': 'en-US,en;q=0.9,bn;q=0.8',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new FetchError(`GET ${url} failed: ${err instanceof Error ? err.message : String(err)}`, true);
  }
  if (res.ok) return res;

  const details: string[] = [];
  const mitigated = res.headers.get('cf-mitigated');
  if (mitigated) details.push(`cf-mitigated: ${mitigated}`);
  const title = /<title[^>]*>([^<]{0,80})/i.exec(await res.text().catch(() => ''))?.[1]?.trim();
  if (title) details.push(`title "${title}"`);
  throw new FetchError(
    `GET ${url} returned HTTP ${res.status}${details.length ? ` (${details.join(', ')})` : ''}`,
    RETRY_STATUSES.has(res.status),
    res.status,
  );
}
