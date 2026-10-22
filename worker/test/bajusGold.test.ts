import type { Point } from '@bdnumbers/shared';
import { describe, expect, it } from 'vitest';
import { karatOf, parseBajus } from '../src/sources/bajusGold';
import { validatePoints } from '../src/validate';
import { FIXTURES } from './helpers';

const byKey = (points: Point[]) => Object.fromEntries(points.map((p) => [p.series_key, p]));

describe('parseBajus', () => {
  it('converts per-gram prices to per-bhori, dated from the PDF link', async () => {
    const points = await parseBajus(FIXTURES.bajus, '2026-10-22');
    const p = byKey(points);

    expect(points).toHaveLength(8);
    expect(new Set(points.map((x) => x.date))).toEqual(new Set(['2026-10-22']));
    // 19,405 Tk/g × 11.664 g/bhori = 226,339.92 → 226,340
    expect(p.gold_22k!.value).toBe(226_340);
    expect(p.gold_21k!.value).toBe(216_192);
    expect(p.gold_18k!.value).toBe(185_691);
    expect(p.gold_traditional!.value).toBe(151_690);
    expect(p.silver_22k!.value).toBe(4_024);
    expect(p.silver_21k!.value).toBe(3_849);
    expect(p.silver_18k!.value).toBe(3_324);
    expect(p.silver_traditional!.value).toBe(2_508);
    expect(p.gold_22k!.meta).toMatchObject({
      source: 'bajus',
      per_gram: 19_405,
      effective_date: '2026-10-22',
      pdf_url: expect.stringContaining('22-Oct-2026.pdf'),
    });
    expect(() => validatePoints(points, '2026-10-22')).not.toThrow();
  });

  it("falls back to today's date when the PDF link is missing", async () => {
    const page = FIXTURES.bajus.replace(/<a href="[^"]*\.pdf"/, '<a href="#"');
    const points = await parseBajus(page, '2026-10-23');
    expect(points[0]!.date).toBe('2026-10-23');
    expect(points[0]!.meta).toMatchObject({ effective_date: null, pdf_url: null });
  });

  it('fails loudly when the gold table is missing', async () => {
    const page = FIXTURES.bajus.replace('gold-table', 'renamed-table');
    await expect(parseBajus(page)).rejects.toThrow(/table\.gold-table not found/);
  });

  it('fails loudly when the unit changes', async () => {
    const page = FIXTURES.bajus.replace('19,405 BDT/GRAM', '2,26,340 BDT/VORI');
    await expect(parseBajus(page)).rejects.toThrow(/gold 22k: expected a BDT\/GRAM price/);
  });

  it('rejects prices that break the karat ladder', async () => {
    const page = FIXTURES.bajus.replace('18,535 BDT/GRAM', '19,535 BDT/GRAM');
    await expect(parseBajus(page)).rejects.toThrow(/gold 21k \(19535\) is not below 22k \(19405\)/);
  });
});

describe('karatOf', () => {
  it.each([
    ['22 KARAT Gold', 'gold', '22k'],
    ['21 KARAT Gold', 'gold', '21k'],
    ['18 KARAT Silver', 'silver', '18k'],
    ['TRADITIONAL Gold', 'gold', 'traditional'],
    ['22 KARAT Silver', 'gold', null],
    ['Product', 'gold', null],
  ] as const)('%s (%s) → %s', (label, metal, expected) => {
    expect(karatOf(label, metal)).toBe(expected);
  });
});
