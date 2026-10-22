import type { ChangesResponse, LatestEntry, LatestResponse, SeriesHistory, StatusResponse } from '@bdnumbers/shared';
import { API_BASE } from '../config';

// Build-time data. Each URL is fetched once per build and shared by every page. Any failure fails the
// build, so a broken API never publishes an empty site (the previous deployment stays live).
const cache = new Map<string, Promise<unknown>>();

function getJson<T>(path: string): Promise<T> {
  let pending = cache.get(path);
  if (!pending) {
    pending = (async () => {
      const res = await fetch(`${API_BASE}${path}`, { headers: { 'user-agent': 'bdrate-site-build' } });
      if (!res.ok) throw new Error(`build: GET ${API_BASE}${path} returned HTTP ${res.status}`);
      return res.json();
    })();
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
