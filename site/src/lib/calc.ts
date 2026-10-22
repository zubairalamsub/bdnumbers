// Pure calculator math, shared by the calculator pages and their tests. Money in taka, rates in % a year.
import { BHORI_GRAMS } from '@bdnumbers/shared';

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Equal monthly instalment for a loan. */
export function emi(principal: number, annualRatePct: number, months: number) {
  if (!(principal > 0) || !(months > 0) || !(annualRatePct >= 0)) return null;
  const r = annualRatePct / 12 / 100;
  const instalment = r === 0 ? principal / months : (principal * r * (1 + r) ** months) / ((1 + r) ** months - 1);
  const total = instalment * months;
  return { instalment: round2(instalment), total: round2(total), interest: round2(total - principal) };
}

/**
 * DPS (monthly savings scheme) maturity: a deposit at the start of every month, interest accruing monthly
 * and credited `creditsPerYear` times a year (12 = monthly, 4 = quarterly). Bank products vary; this is the
 * usual reducing-balance arithmetic, not any one bank's rule.
 */
export function dpsMaturity(monthlyDeposit: number, annualRatePct: number, years: number, creditsPerYear: 12 | 4 = 12) {
  if (!(monthlyDeposit > 0) || !(years > 0) || !(annualRatePct >= 0)) return null;
  const months = Math.round(years * 12);
  const monthlyRate = annualRatePct / 100 / 12;
  const creditEvery = 12 / creditsPerYear;
  let balance = 0;
  let pending = 0;
  for (let m = 1; m <= months; m++) {
    balance += monthlyDeposit;
    pending += balance * monthlyRate;
    if (m % creditEvery === 0) {
      balance += pending;
      pending = 0;
    }
  }
  balance += pending;
  const deposited = monthlyDeposit * months;
  return { deposited: round2(deposited), maturity: round2(balance), profit: round2(balance - deposited) };
}

/**
 * Savings-certificate (Sanchayapatra) return as simple profit at the rate for the holding period, less
 * source tax on the profit. Actual payout schedules differ by scheme (monthly, quarterly, at maturity).
 */
export function savingsReturn(principal: number, ratePct: number, years: number, taxPct: number) {
  if (!(principal > 0) || !(years > 0) || !(ratePct >= 0) || !(taxPct >= 0)) return null;
  const gross = principal * (ratePct / 100) * years;
  const tax = gross * (taxPct / 100);
  return { gross: round2(gross), tax: round2(tax), net: round2(gross - tax), total: round2(principal + gross - tax) };
}

/** Traditional Bangladeshi gold weights: 1 bhori (tola) = 16 ana = 96 rati = 11.664 g. */
export const ANA_PER_BHORI = 16;
export const RATI_PER_ANA = 6;

export function toGrams(bhori: number, ana: number, rati: number): number {
  return (bhori + ana / ANA_PER_BHORI + rati / (ANA_PER_BHORI * RATI_PER_ANA)) * BHORI_GRAMS;
}

export function fromGrams(grams: number): { bhori: number; ana: number; rati: number } {
  const totalRati = (grams / BHORI_GRAMS) * ANA_PER_BHORI * RATI_PER_ANA;
  const bhori = Math.floor(totalRati / (ANA_PER_BHORI * RATI_PER_ANA));
  const rest = totalRati - bhori * ANA_PER_BHORI * RATI_PER_ANA;
  const ana = Math.floor(rest / RATI_PER_ANA);
  return { bhori, ana, rati: round2(rest - ana * RATI_PER_ANA) };
}

/** Fineness of a karat as a fraction of pure (24K) gold. */
export const purity = (karat: number) => karat / 24;

/** Value of `grams` of gold at a per-bhori price. */
export function goldValue(grams: number, pricePerBhori: number): number {
  return round2((grams / BHORI_GRAMS) * pricePerBhori);
}

/** Nisab thresholds in bhori (tola): 7.5 of gold or 52.5 of silver. */
export const NISAB_GOLD_BHORI = 7.5;
export const NISAB_SILVER_BHORI = 52.5;

/** Zakat at 2.5% of net zakatable wealth, if it reaches the nisab. */
export function zakat(assets: number, liabilities: number, nisab: number) {
  const net = Math.max(0, assets - liabilities);
  const due = net >= nisab && nisab > 0;
  return { net: round2(net), due, zakat: due ? round2(net * 0.025) : 0 };
}
