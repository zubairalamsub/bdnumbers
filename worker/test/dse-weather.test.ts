import { WEATHER_CITIES, type Point } from '@bdnumbers/shared';
import { describe, expect, it } from 'vitest';
import { parseDse } from '../src/sources/dseIndex';
import { parseMetForecast, type MetForecast } from '../src/sources/weather';
import { validatePoints } from '../src/validate';
import { FIXTURES } from './helpers';

const on = (points: Point[], date: string) =>
  Object.fromEntries(points.filter((p) => p.date === date).map((p) => [p.series_key, p.value]));

describe('parseDse', () => {
  it('reads index closes and turnover for every trading day listed', async () => {
    const points = await parseDse(FIXTURES.dse);
    const dates = [...new Set(points.map((p) => p.date))];

    expect(dates).toHaveLength(32);
    expect(dates[0]).toBe('2026-10-19');
    // Columns after the two-column market cap header shift right by one.
    expect(on(points, '2026-10-19')).toEqual({
      dse_dsex: 5450.63,
      dse_dses: 1070.4,
      dse_ds30: 2103.4,
      dse_turnover: 502.63, // Tk 5,026.32 mn = 502.63 crore
    });
    expect(() => validatePoints(points, '2026-10-22')).not.toThrow();
  });

  it('fails loudly when the table is gone', async () => {
    await expect(parseDse('<html><title>DSE</title><body>maintenance</body></html>')).rejects.toThrow(
      /recent market information table not found/,
    );
  });
});

describe('parseMetForecast', () => {
  const forecast = JSON.parse(FIXTURES.met) as MetForecast;
  const dhaka = WEATHER_CITIES[0]!;

  it('takes the current hour, dated in Dhaka time, with wind in km/h', () => {
    const points = parseMetForecast(forecast, dhaka, Date.parse('2026-10-22T11:20:00Z'));
    expect(points.map((p) => [p.series_key, p.date, p.value])).toEqual([
      ['weather_dhaka_temp', '2026-10-22T17:00', 31],
      ['weather_dhaka_humidity', '2026-10-22T17:00', 55.9],
      ['weather_dhaka_wind', '2026-10-22T17:00', 8.3],
      ['weather_dhaka_rain', '2026-10-22T17:00', 0],
    ]);
    expect(points[0]!.meta).toMatchObject({ symbol: 'clearsky_night', max24: expect.any(Number), min24: expect.any(Number) });
    expect(() => validatePoints(points, '2026-10-22')).not.toThrow();
  });

  it('uses the first step when the forecast starts in the future', () => {
    const points = parseMetForecast(forecast, dhaka, Date.parse('2026-10-22T09:00:00Z'));
    expect(points[0]!.date).toBe('2026-10-22T17:00');
  });

  it('fails loudly on an empty forecast', () => {
    expect(() => parseMetForecast({ properties: { meta: { updated_at: '' }, timeseries: [] } }, dhaka)).toThrow(/no timeseries/);
  });
});
