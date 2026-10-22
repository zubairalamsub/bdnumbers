import type { Point } from '@bdnumbers/shared';
import { describe, expect, it } from 'vitest';
import { excelSerialToDate, readFirstSheet } from '../src/lib/xlsx';
import { parseTcbList, parseTcbSheet } from '../src/sources/tcbMarketPrices';
import { validatePoints } from '../src/validate';
import { FIXTURES, tcbXlsx } from './helpers';

const values = (points: Point[]) => Object.fromEntries(points.map((p) => [p.series_key, p.value]));

describe('readFirstSheet', () => {
  it('reads cells from a real TCB XLSX, resolving shared strings', async () => {
    const sheet = await readFirstSheet(tcbXlsx());
    // TCB's file uses a different (but canonically equal) encoding of some Bengali letters.
    expect(sheet.get(9)?.get('A')?.normalize('NFC')).toBe('চাল সুগন্ধী (পোলাও)'.normalize('NFC'));
    expect(sheet.get(9)?.get('C')).toBe('170');
    expect(sheet.get(7)?.get('C')).toBe('46314');
  });

  it('converts Excel serial dates', () => {
    expect(excelSerialToDate(46314)).toBe('2026-10-19');
    expect(excelSerialToDate(45949)).toBe('2025-10-19');
  });

  it('rejects a file that is not a zip', async () => {
    const html = new TextEncoder().encode('<html>error</html>');
    await expect(readFirstSheet(html.buffer as ArrayBuffer)).rejects.toThrow(/not a zip/);
  });
});

describe('parseTcbList', () => {
  it('lists the daily XLSX files, newest first', () => {
    const files = parseTcbList(FIXTURES.tcbList);
    expect(files).toHaveLength(10);
    expect(files[0]).toEqual({
      url: expect.stringMatching(/^https:\/\/objectstorage\..*\.xlsx$/),
      date: '2026-10-19',
    });
    expect(files.map((f) => f.date)).toEqual([...files.map((f) => f.date)].sort().reverse());
  });
});

describe('parseTcbSheet', () => {
  it('maps every item row to a series, min and max', async () => {
    const result = parseTcbSheet(await readFirstSheet(tcbXlsx()));
    const v = values(result.points);

    expect(result.date).toBe('2026-10-19');
    expect(result.unmatched).toEqual([]);
    expect(v).toMatchObject({
      tcb_rice_coarse_min: 50,
      tcb_rice_coarse_max: 55,
      tcb_soybean_oil_loose_max: 200,
      tcb_soybean_oil_2l_min: 410, // the sheet writes this unit with a Latin "2"
      tcb_egg_min: 47,
      tcb_egg_max: 50,
      tcb_sugar_max: 115,
      tcb_ms_rod_60_max: 94_500,
    });
    // 0 means not in the market that day (hilsa during the ban, no imported onion): no point is written.
    expect(v.tcb_hilsa_min).toBeUndefined();
    expect(v.tcb_onion_imported_max).toBeUndefined();
    // The "what changed" table after the market list repeats items; it must not be read as prices.
    expect(result.points.filter((p) => p.series_key === 'tcb_chickpeas_max')).toHaveLength(1);
    expect(() => validatePoints(result.points, '2026-10-22')).not.toThrow();
  });

  it('reports rows it does not know', async () => {
    const sheet = await readFirstSheet(tcbXlsx());
    sheet.get(76)!.set('A', 'মিষ্টি কুমড়া');
    const result = parseTcbSheet(sheet);
    expect(result.unmatched).toEqual(['মিষ্টি কুমড়া (প্রতি কেজি)']);
    expect(values(result.points).tcb_brinjal_max).toBeUndefined();
  });

  it('fails loudly when the layout changes', async () => {
    const sheet = await readFirstSheet(tcbXlsx());
    for (const cells of sheet.values()) cells.delete('B');
    expect(() => parseTcbSheet(sheet)).toThrow(/only 0 of 60 known items found/);
  });
});
