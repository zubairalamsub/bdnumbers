import { DISTRICTS, MET_API_URL, type DistrictWeatherResponse } from '@bdnumbers/shared';
import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DISTRICT_WEATHER_KEY, DIVISION_IDS, refreshDistrictWeather, snapshotDistricts } from '../src/districtWeather';
import { FIXTURES, calledUrls, httpStatus, mockFetch, request, resetStorage } from './helpers';

const met = () => new Response(FIXTURES.met, { headers: { 'content-type': 'application/json' } });
const stored = () => env.CACHE.get<DistrictWeatherResponse>(DISTRICT_WEATHER_KEY, 'json');
const NOW = new Date('2026-10-22T11:20:00Z');

beforeEach(resetStorage);
afterEach(() => vi.restoreAllMocks());

describe('snapshotDistricts', () => {
  it('covers every district except the eight division cities', () => {
    const ids = DIVISION_IDS.flatMap((d) => snapshotDistricts(d).map((x) => x.id));
    expect(ids).toHaveLength(DISTRICTS.length - 8);
    expect(ids).not.toContain('dhaka');
    expect(ids).toContain('narayanganj');
    // At most 12 per division, so one invocation stays well under 50 subrequests even with retries.
    expect(Math.max(...DIVISION_IDS.map((d) => snapshotDistricts(d).length))).toBeLessThanOrEqual(12);
  });
});

describe('refreshDistrictWeather', () => {
  it('stores one reading per district', async () => {
    const spy = mockFetch({ [MET_API_URL]: met });
    expect(await refreshDistrictWeather(env, undefined, NOW)).toEqual({ fresh: 56, stale: 0 });
    expect(calledUrls(spy).filter((u) => u.startsWith(MET_API_URL))).toHaveLength(56);
    const snapshot = await stored();
    expect(snapshot?.generated_at).toBe(NOW.toISOString());
    expect(Object.keys(snapshot!.districts)).toHaveLength(56);
    expect(snapshot!.districts.narayanganj).toMatchObject({ temp: expect.any(Number), humidity: expect.any(Number), stale: false });
  });

  it('keeps the last reading, marked stale, for a division that failed', async () => {
    mockFetch({ [MET_API_URL]: met });
    await refreshDistrictWeather(env, undefined, NOW);
    const before = (await stored())!.districts.narayanganj!;

    const outcome = await refreshDistrictWeather(
      env,
      async (division) => {
        if (division === 'dhaka') throw new Error('boom');
        return { bogura: { ...before, temp: 20 } };
      },
      new Date('2026-10-22T12:20:00Z'),
    );
    expect(outcome).toEqual({ fresh: 1, stale: 55 });
    const after = (await stored())!;
    expect(after.districts.narayanganj).toEqual({ ...before, stale: true });
    expect(after.districts.bogura).toMatchObject({ temp: 20, stale: false });
  });

  it('leaves the snapshot alone when nothing new came in', async () => {
    mockFetch({ [MET_API_URL]: met });
    await refreshDistrictWeather(env, undefined, NOW);
    vi.restoreAllMocks();
    mockFetch({ [MET_API_URL]: httpStatus(500) });
    expect(await refreshDistrictWeather(env, undefined, new Date('2026-10-22T12:20:00Z'))).toEqual({ fresh: 0, stale: 56 });
    expect((await stored())!.generated_at).toBe(NOW.toISOString());
  });
});

describe('GET /api/weather/districts.json', () => {
  it('is 404 before the first hourly run', async () => {
    expect((await request('/api/weather/districts.json')).status).toBe(404);
  });

  it('serves the snapshot', async () => {
    mockFetch({ [MET_API_URL]: met });
    await refreshDistrictWeather(env, undefined, NOW);
    const res = await request('/api/weather/districts.json');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=300');
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    const body = await res.json<DistrictWeatherResponse>();
    expect(Object.keys(body.districts)).toHaveLength(56);
  });
});

describe('POST /internal/district-weather/:division', () => {
  const auth = { authorization: 'Bearer test-internal-token' };
  it('needs the internal token', async () => {
    expect((await request('/internal/district-weather/sylhet', { method: 'POST' })).status).toBe(401);
  });
  it('rejects an unknown division', async () => {
    expect((await request('/internal/district-weather/atlantis', { method: 'POST', headers: auth })).status).toBe(404);
  });
  it("returns the division's districts", async () => {
    mockFetch({ [MET_API_URL]: met });
    const res = await request('/internal/district-weather/sylhet', { method: 'POST', headers: auth });
    expect(Object.keys(await res.json()).sort()).toEqual(['habiganj', 'moulvibazar', 'sunamganj']);
  });
});
