// Weather for every district headquarters, for the zoomed-in weather map. Unlike the eight division
// cities (D1 series with history, in latest.json), this is a single KV snapshot rewritten each hour:
// no history, no extra series, no extra pages. Each division is fetched in its own invocation (at most
// 12 MET calls, well inside the 50-subrequest and 10 ms CPU limits) and the hourly cron merges them. A
// district whose fetch fails keeps its previous reading, marked stale.
import {
  DISTRICTS,
  DIVISIONS,
  MET_API_URL,
  WEATHER_CITIES,
  type DistrictWeather,
  type DistrictWeatherResponse,
  type DivisionId,
} from '@bdnumbers/shared';
import type { Env } from './env';
import { errorMessage } from './lib/errors';
import { fetchJson } from './lib/http';
import { currentWeather, type MetForecast } from './sources/weather';

export const DISTRICT_WEATHER_KEY = 'weather-districts.json';
export const DIVISION_IDS = Object.keys(DIVISIONS) as DivisionId[];

/** A division's districts, except its headquarters city, which has series of its own. */
export function snapshotDistricts(division: DivisionId) {
  return DISTRICTS.filter((d) => d.division === division && !WEATHER_CITIES.some((c) => c.id === d.id));
}

/** One division's districts now. Districts whose fetch or parse fails are left out (and logged). */
export async function fetchDivisionWeather(env: Env, division: DivisionId, now = Date.now()): Promise<Record<string, DistrictWeather>> {
  const districts = snapshotDistricts(division);
  const results = await Promise.allSettled(
    districts.map(async (d) => {
      const json = await fetchJson<MetForecast>(env, `${MET_API_URL}?lat=${d.lat}&lon=${d.lon}`);
      const w = currentWeather(json, d.id, now);
      const reading: DistrictWeather = {
        time: w.date,
        temp: w.temp,
        humidity: w.humidity,
        wind: w.wind,
        rain: w.rain,
        symbol: w.symbol,
        max24: w.max24,
        min24: w.min24,
        stale: false,
      };
      return [d.id, reading] as const;
    }),
  );
  const out: Record<string, DistrictWeather> = {};
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') out[r.value[0]] = r.value[1];
    else console.error(`[districtWeather] ${districts[i]!.id}: ${errorMessage(r.reason)}`);
  });
  return out;
}

export type DivisionInvoker = (division: DivisionId) => Promise<Record<string, DistrictWeather>>;

/** Each division in its own invocation via the SELF binding (inline in tests or without a token). */
export function divisionInvokerFor(env: Env): DivisionInvoker {
  if (env.RUN_MODE === 'inline' || !env.INTERNAL_TOKEN) return (division) => fetchDivisionWeather(env, division);
  return async (division) => {
    const res = await env.SELF.fetch(`https://self/internal/district-weather/${division}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${env.INTERNAL_TOKEN}` },
    });
    if (!res.ok) throw new Error(`district weather ${division}: HTTP ${res.status}`);
    return res.json<Record<string, DistrictWeather>>();
  };
}

export interface DistrictWeatherOutcome {
  fresh: number;
  stale: number;
}

/** Fetch every division, merge with the previous snapshot for anything missing, and store it. */
export async function refreshDistrictWeather(
  env: Env,
  invoke: DivisionInvoker = divisionInvokerFor(env),
  now = new Date(),
): Promise<DistrictWeatherOutcome> {
  const [previous, parts] = await Promise.all([
    env.CACHE.get<DistrictWeatherResponse>(DISTRICT_WEATHER_KEY, 'json'),
    Promise.all(
      DIVISION_IDS.map((division) =>
        invoke(division).catch((err) => {
          console.error(`[districtWeather] ${division}: ${errorMessage(err)}`);
          return {};
        }),
      ),
    ),
  ]);
  const fresh: Record<string, DistrictWeather> = Object.assign({}, ...parts);
  const districts: Record<string, DistrictWeather> = {};
  let stale = 0;
  for (const division of DIVISION_IDS) {
    for (const { id } of snapshotDistricts(division)) {
      const reading = fresh[id] ?? (previous?.districts[id] ? { ...previous.districts[id], stale: true } : undefined);
      if (!reading) continue;
      districts[id] = reading;
      if (!fresh[id]) stale++;
    }
  }
  const outcome = { fresh: Object.keys(fresh).length, stale };
  if (outcome.fresh === 0) return outcome; // nothing new: leave the previous snapshot as it is
  const snapshot: DistrictWeatherResponse = { generated_at: now.toISOString(), districts };
  await env.CACHE.put(DISTRICT_WEATHER_KEY, JSON.stringify(snapshot));
  return outcome;
}
