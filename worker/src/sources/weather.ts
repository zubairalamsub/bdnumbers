import { MET_API_URL, WEATHER_CITIES, type Point, type WeatherCity } from '@bdnumbers/shared';
import { ParseError } from '../lib/errors';
import { fetchJson } from '../lib/http';
import type { Source } from './types';

const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;

interface MetStep {
  time: string;
  data: {
    instant: { details: Record<string, number | undefined> };
    next_1_hours?: { summary?: { symbol_code?: string }; details?: { precipitation_amount?: number } };
    next_6_hours?: { summary?: { symbol_code?: string } };
  };
}

export interface MetForecast {
  properties: { meta: { updated_at: string }; timeseries: MetStep[] };
}

/**
 * The current hour from a MET Norway Locationforecast response → temperature (°C), humidity (%),
 * wind (km/h) and rain over the next hour (mm), dated by Dhaka hour. The temperature point's meta
 * carries the sky symbol and the next 24 hours' high/low.
 */
export function parseMetForecast(json: MetForecast, city: WeatherCity, now = Date.now()): Point[] {
  const steps = json?.properties?.timeseries;
  if (!Array.isArray(steps) || steps.length === 0) throw new ParseError(`MET ${city.id}: no timeseries`);
  // The latest step at or before now; the first step when the forecast starts in the future.
  const current = steps.filter((s) => Date.parse(s.time) <= now).at(-1) ?? steps[0]!;
  const t = Date.parse(current.time);
  const d = current.data.instant.details;
  const number = (v: number | undefined, what: string) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new ParseError(`MET ${city.id}: no ${what}`);
    return v;
  };
  const temps = steps
    .filter((s) => Date.parse(s.time) >= t && Date.parse(s.time) < t + 24 * 60 * 60 * 1000)
    .map((s) => s.data.instant.details.air_temperature)
    .filter((v): v is number => typeof v === 'number');
  const date = new Date(t + DHAKA_OFFSET_MS).toISOString().slice(0, 16);
  const key = (metric: string) => `weather_${city.id}_${metric}`;

  return [
    {
      series_key: key('temp'),
      date,
      value: number(d.air_temperature, 'temperature'),
      meta: {
        symbol: current.data.next_1_hours?.summary?.symbol_code ?? current.data.next_6_hours?.summary?.symbol_code ?? null,
        max24: temps.length ? Math.max(...temps) : null,
        min24: temps.length ? Math.min(...temps) : null,
        updated_at: json.properties.meta?.updated_at ?? null,
      },
    },
    { series_key: key('humidity'), date, value: number(d.relative_humidity, 'humidity') },
    { series_key: key('wind'), date, value: Math.round(number(d.wind_speed, 'wind speed') * 36) / 10 },
    { series_key: key('rain'), date, value: current.data.next_1_hours?.details?.precipitation_amount ?? 0 },
  ];
}

export const weather: Source = {
  key: 'weather',
  cadence: 'hourly',
  writeMode: 'upsert',
  async fetch(env) {
    // MET asks for at most 20 requests/second and to respect Expires (~30 min); 8 calls an hour is far below.
    const forecasts = await Promise.all(
      WEATHER_CITIES.map((c) => fetchJson<MetForecast>(env, `${MET_API_URL}?lat=${c.lat}&lon=${c.lon}`)),
    );
    return forecasts.flatMap((json, i) => parseMetForecast(json, WEATHER_CITIES[i]!));
  },
};
