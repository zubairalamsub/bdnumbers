import { describe, expect, it } from 'vitest';
import { dpsMaturity, emi, fromGrams, goldValue, savingsReturn, toGrams, zakat } from './calc';

describe('emi', () => {
  it('matches the standard amortisation formula', () => {
    // Tk 10 lakh at 12% for 5 years: the textbook answer is Tk 22,244.45 a month.
    expect(emi(1_000_000, 12, 60)).toEqual({ instalment: 22244.45, total: 1334666.86, interest: 334666.86 });
  });
  it('handles a zero rate and rejects bad input', () => {
    expect(emi(120_000, 0, 12)?.instalment).toBe(10_000);
    expect(emi(0, 10, 12)).toBeNull();
  });
});

describe('dpsMaturity', () => {
  it('compounds monthly deposits', () => {
    const r = dpsMaturity(1000, 0, 2)!;
    expect(r).toEqual({ deposited: 24_000, maturity: 24_000, profit: 0 });
    const m = dpsMaturity(1000, 12, 1)!;
    // Annuity-due with 1% a month for 12 months: 1000 × ((1.01^12 − 1) / 0.01) × 1.01 = 12,809.33
    expect(m.maturity).toBeCloseTo(12_809.33, 2);
  });
  it('earns a little less when interest is credited quarterly', () => {
    expect(dpsMaturity(1000, 12, 3, 4)!.maturity).toBeLessThan(dpsMaturity(1000, 12, 3, 12)!.maturity);
  });
});

describe('savingsReturn', () => {
  it('is simple profit less source tax', () => {
    expect(savingsReturn(500_000, 11.83, 5, 10)).toEqual({ gross: 295_750, tax: 29_575, net: 266_175, total: 766_175 });
  });
});

describe('gold weights', () => {
  it('converts bhori/ana/rati to grams and back', () => {
    expect(toGrams(1, 0, 0)).toBeCloseTo(11.664, 6);
    expect(toGrams(0, 8, 0)).toBeCloseTo(5.832, 6);
    expect(fromGrams(11.664 * 1.5)).toEqual({ bhori: 1, ana: 8, rati: 0 });
  });
  it('values gold by the per-bhori price', () => {
    expect(goldValue(11.664, 226_340)).toBe(226_340);
  });
});

describe('zakat', () => {
  it('is 2.5% of net wealth at or above the nisab', () => {
    expect(zakat(1_000_000, 200_000, 150_000)).toEqual({ net: 800_000, due: true, zakat: 20_000 });
    expect(zakat(100_000, 0, 150_000)).toEqual({ net: 100_000, due: false, zakat: 0 });
  });
});
