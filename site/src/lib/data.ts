import type { ChangesResponse, LatestEntry, LatestResponse, SeriesHistory, StatusResponse } from '@bdnumbers/shared';
import { API_BASE } from '../config';

// Build-time data. Each URL is fetched once per build and shared by every page. A failure is retried a
// few times (a Worker deploy running at the same moment can drop a request); after that it fails the
// build, so a broken API never publishes an empty site (the previous deployment stays live).
const cache = new Map<string, Promise<unknown>>();
const RETRY_DELAYS_MS = [2_000, 5_000, 10_000];

async function fetchJson(url: string): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'bdrate-site-build' } });
      // A 4xx (an unknown series, say) won't fix itself; only server errors and network failures are retried.
      if (res.ok) return await res.json();
      if (res.status < 500 || attempt >= RETRY_DELAYS_MS.length) throw new Error(`build: GET ${url} returned HTTP ${res.status}`);
    } catch (err) {
      if (attempt >= RETRY_DELAYS_MS.length || (err instanceof Error && err.message.startsWith('build:'))) throw err;
    }
    await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
  }
}

function getJson<T>(path: string): Promise<T> {
  let pending = cache.get(path);
  if (!pending) {
    pending = fetchJson(`${API_BASE}${path}`);
    cache.set(path, pending);
  }
  return pending as Promise<T>;
}

export const getLatest = () => getJson<LatestResponse>('/api/latest.json');
export const getStatus = () => getJson<StatusResponse>('/api/status.json');
export const getChanges = () => getJson<ChangesResponse>('/api/changes.json');
export const getHistory = (key: string) => getJson<SeriesHistory>(`/api/series/${key}.json`);

export async function getEntry(key: string): Promise<LatestEntry> {
  const entry = (await getLatest()).series.find((s) => s.key === key);
  if (!entry) throw new Error(`build: series ${key} is missing from latest.json`);
  return entry;
}

export async function getEntries(keys: readonly string[]): Promise<LatestEntry[]> {
  return Promise.all(keys.map(getEntry));
}
