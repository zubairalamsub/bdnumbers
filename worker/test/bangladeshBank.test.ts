import { getSeriesDef, type Point } from '@bdnumbers/shared';
import { describe, expect, it } from 'vitest';
import { parseBangladeshBank } from '../src/sources/bangladeshBank';
import { parseEblRates } from '../src/sources/eblRates';
import { validatePoints } from '../src/validate';
import { FIXTURES } from './helpers';

const byKey = (points: Point[]) => Object.fromEntries(points.map((p) => [p.series_key, p.value]));

describe('parseBangladeshBank', () => {
  it('reads USD bid/ask/WAR and every cross rate, dated from the page header', async () => {
    const points = await parseBangladeshBank(FIXTURES.bb);
    const v = byKey(points);

    expect(new Set(points.map((p) => p.date))).toEqual(new Set(['2026-10-19']));
    expect(v.usd_bdt_low).toBe(123.6);
    expect(v.usd_bdt_high).toBe(123.72);
    expect(v.usd_bdt_avg).toBe(123.65);
    expect(v).toMatchObject({
      eur_bdt_bid: 138.914,
      eur_bdt_ask: 139.0613,
      gbp_bdt_bid: 164.7341,
      jpy_bdt_ask: 0.7831,
      cnh_bdt_bid: 18.4836,
      inr_bdt_bid: 1.3015,
      lkr_bdt_ask: 2.6808,
    });
    expect(points).toHaveLength(3 + 10 * 2);
  });

  it('produces points that pass validation', async () => {
    const points = await parseBangladeshBank(FIXTURES.bb);
    expect(() => validatePoints(points, '2026-10-22')).not.toThrow();
  });

  it('picks up a currency BB adds later', async () => {
    const page = FIXTURES.bb.replace('<tr><td>LKR</td>', '<tr><td>CHF</td><td>150.1000</td><td>150.3000</td></tr><tr><td>LKR</td>');
    const v = byKey(await parseBangladeshBank(page));
    expect(v.chf_bdt_bid).toBe(150.1);
    expect(v.chf_bdt_ask).toBe(150.3);
  });

  it('fails loudly on a page without the rate header, e.g. a bot challenge', async () => {
    await expect(parseBangladeshBank('<html><head><title>Request Rejected</title></head></html>')).rejects.toThrow(
      /"Exchange Rate of Taka" header not found .*Request Rejected/,
    );
  });

  it('fails loudly when the USD table is missing', async () => {
    const page = FIXTURES.bb.replace('A. USD/BDT Exchange Rate', 'A. Something else');
    await expect(parseBangladeshBank(page)).rejects.toThrow(/USD\/BDT table not found/);
  });

  it('fails loudly when column headers change', async () => {
    const page = FIXTURES.bb.replace('<th>WAR</th>', '<th>Weighted Average</th>');
    await expect(parseBangladeshBank(page)).rejects.toThrow(/no header row with columns Bid Rate, Ask Rate, WAR/);
  });
});

describe('parseEblRates (backup while bb.org.bd is down)', () => {
  it('reads USD buying and selling, dated by the "As on" row', async () => {
    const points = await parseEblRates(FIXTURES.ebl);
    expect(points).toEqual([
      { series_key: 'usd_bdt_ebl_buy', date: '2026-10-19', value: 122.9, meta: { kind: 'TT clean buying' } },
      { series_key: 'usd_bdt_ebl_sell', date: '2026-10-19', value: 123.9, meta: { kind: 'BC selling' } },
    ]);
    expect(() => validatePoints(points, '2026-10-23')).not.toThrow();
  });

  it('marks its series as the backup for the BB average', () => {
    expect(getSeriesDef('usd_bdt_ebl_buy')?.backupFor).toBe('usd_bdt_avg');
    expect(getSeriesDef('usd_bdt_ebl_sell')?.backupFor).toBe('usd_bdt_avg');
  });

  it('fails loudly without the rate box', async () => {
    await expect(parseEblRates('<html><head><title>Maintenance</title></head></html>')).rejects.toThrow(/EBL rate table not found .*Maintenance/);
  });

  it('fails loudly without the date row', async () => {
    const page = FIXTURES.ebl.replace('As on 19 October, 2026', 'Updated daily');
    await expect(parseEblRates(page)).rejects.toThrow(/no "As on <date>" row/);
  });

  it('fails loudly when selling is below buying (columns swapped)', async () => {
    const page = FIXTURES.ebl.replace(/<td>122\.90<\/td>(\s*)<td>123\.90<\/td>/, '<td>123.90</td>$1<td>122.90</td>');
    expect(page).not.toBe(FIXTURES.ebl);
    await expect(parseEblRates(page)).rejects.toThrow(/selling 122.9 is below buying 123.9/);
  });
});
