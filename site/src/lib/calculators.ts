// Calculator registry: drives /calculators and its dynamic route. See site/CALCULATORS.md to add your own.

export interface CalculatorInfo {
  slug: string;
  bn: string;
  en: string;
  descBn: string;
  descEn: string;
}

/** Built in: rendered by src/pages/calculators/[slug].astro. */
export const CALCULATORS: readonly CalculatorInfo[] = [
  { slug: 'currency-converter', bn: 'মুদ্রা রূপান্তর', en: 'Currency converter', descBn: 'বাংলাদেশ ব্যাংকের রেটে টাকা ও বিদেশি মুদ্রা', descEn: 'Taka and foreign currencies at Bangladesh Bank rates' },
  { slug: 'gold', bn: 'সোনা-রুপার ওজন ও দাম', en: 'Gold & silver weight and value', descBn: 'ভরি-আনা-রতি ↔ গ্রাম, আজকের দামে মূল্য', descEn: 'Bhori/ana/rati ↔ grams, value at today’s price' },
  { slug: 'zakat', bn: 'যাকাত', en: 'Zakat', descBn: 'আজকের সোনা-রুপার দামে নিসাব ও যাকাত', descEn: 'Nisab and zakat at today’s gold and silver prices' },
  { slug: 'emi', bn: 'ঋণের কিস্তি (EMI)', en: 'Loan EMI', descBn: 'মাসিক কিস্তি, মোট সুদ', descEn: 'Monthly instalment and total interest' },
  { slug: 'dps', bn: 'ডিপিএস মেয়াদপূর্তি', en: 'DPS maturity', descBn: 'মাসিক জমায় মেয়াদ শেষে কত পাবেন', descEn: 'What a monthly savings scheme pays at maturity' },
  { slug: 'sanchayapatra', bn: 'সঞ্চয়পত্রের মুনাফা', en: 'Sanchayapatra return', descBn: 'স্কিম ও মেয়াদ অনুযায়ী মুনাফা', descEn: 'Profit by scheme and holding period' },
  { slug: 'mobile-banking', bn: 'বিকাশ/নগদ/রকেট ক্যাশ-আউট খরচ', en: 'bKash/Nagad/Rocket cash-out fee', descBn: 'ক্যাশ-আউটে কত টাকা কাটবে', descEn: 'What a cash-out costs on each service' },
];

/**
 * Your own calculators. Put the page at src/pages/calculators/<slug>.astro (and the English one at
 * src/pages/en/calculators/<slug>.astro), then set `ready: true` here so the index links to it.
 */
export const CUSTOM_CALCULATORS: ReadonlyArray<CalculatorInfo & { ready: boolean }> = [
  { slug: 'income-tax', bn: 'আয়কর', en: 'Income tax', descBn: 'বার্ষিক আয়কর হিসাব', descEn: 'Annual income tax', ready: false },
  { slug: 'electricity-bill', bn: 'বিদ্যুৎ বিল', en: 'Electricity bill', descBn: 'ইউনিট অনুযায়ী বিল', descEn: 'Bill from units used', ready: false },
  { slug: 'construction-cost', bn: 'নির্মাণ ব্যয়', en: 'Construction cost', descBn: 'বাড়ি নির্মাণের আনুমানিক খরচ', descEn: 'Estimated cost of building a house', ready: false },
];
