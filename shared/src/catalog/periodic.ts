// Sources that change rarely (fuel, LPG, savings rates, holidays): fetched daily, written only on change.

export const BPC_FUEL_URL = 'https://bpc.gov.bd/pages/static-pages/6922ddb6933eb65569e15fbc';
export const UNB_LPG_SEARCH_URL = 'https://unb.com.bd/search?q=LPG+price';
export const NSD_SCHEMES_URL = 'https://nationalsavings.gov.bd/pages/static-pages/6922e111933eb65569e29fed';
/** The directorate's "প্রজ্ঞাপন/পরিপত্র" page, where each rate notice (including "rates stay the same") is posted. */
export const NSD_NOTICES_URL = 'https://nationalsavings.gov.bd/pages/static-pages/6922de17933eb65569e182f5';
export const HOLIDAYS_ICS_URL =
  'https://calendar.google.com/calendar/ical/en.bd%23holiday%40group.v.calendar.google.com/public/basic.ics';

/** BPC's fuel table rows we track, by the product name as BPC writes it. */
export const FUEL_ITEMS = [
  { id: 'diesel', sheet: 'ডিজেল', bn: 'ডিজেল', en: 'Diesel', ref: 135 },
  { id: 'kerosene', sheet: 'কেরোসিন', bn: 'কেরোসিন', en: 'Kerosene', ref: 155 },
  { id: 'octane', sheet: 'অকটেন', bn: 'অকটেন', en: 'Octane', ref: 165 },
  { id: 'petrol', sheet: 'পেট্রোল', bn: 'পেট্রোল', en: 'Petrol', ref: 160 },
  { id: 'furnace_oil', sheet: 'ফার্নেস অয়েল', bn: 'ফার্নেস অয়েল', en: 'Furnace oil', ref: 109 },
] as const;

/** Private LPG prices BERC sets each month (as reported by UNB; BERC itself publishes an image). */
export const LPG_SERIES = [
  { key: 'lpg_12kg', bn: 'এলপিজি (১২ কেজি সিলিন্ডার)', en: 'LPG (12 kg cylinder)', unit: 'BDT/cylinder', bounds: [300, 6000] },
  { key: 'lpg_per_kg', bn: 'এলপিজি (প্রতি কেজি)', en: 'LPG (per kg)', unit: 'BDT/kg', bounds: [25, 500] },
] as const;

/** Bengali names for the public holidays Google's Bangladesh calendar lists (English name → Bengali). */
export const HOLIDAY_NAMES_BN: Record<string, string> = {
  'Shab e-Barat': 'শবে বরাত',
  "Language Martyrs' Day": 'শহীদ দিবস ও আন্তর্জাতিক মাতৃভাষা দিবস',
  'Independence Day': 'স্বাধীনতা ও জাতীয় দিবস',
  'Shab-e-qadr': 'শবে কদর',
  'Jumatul Bidah': 'জুমাতুল বিদা',
  'Eid ul-Fitr': 'ঈদুল ফিতর',
  'Eid ul-Fitr Holiday': 'ঈদুল ফিতরের ছুটি',
  'Chaitra Sankranti': 'চৈত্র সংক্রান্তি',
  'Bengali New Year': 'পহেলা বৈশাখ',
  'May Day': 'মে দিবস',
  'Buddha Purnima/Vesak': 'বুদ্ধ পূর্ণিমা',
  'Eid al-Adha': 'ঈদুল আজহা',
  'Eid al-Adha Holiday': 'ঈদুল আজহার ছুটি',
  Muharram: 'মহররম',
  Ashura: 'আশুরা',
  'Student-People Uprising Day': 'জুলাই গণঅভ্যুত্থান দিবস',
  Janmashtami: 'জন্মাষ্টমী',
  'Eid e-Milad-un Nabi': 'ঈদে মিলাদুন্নবী',
  Mahanabami: 'মহানবমী',
  'Durga Puja': 'দুর্গাপূজা (বিজয়া দশমী)',
  'Durga Puja Holiday': 'দুর্গাপূজার ছুটি',
  'National Revolution and Solidarity Day': 'জাতীয় বিপ্লব ও সংহতি দিবস',
  'Victory Day': 'বিজয় দিবস',
  'Christmas Day': 'বড়দিন',
  'Election Day': 'নির্বাচনের দিন',
  'Election Day Holiday': 'নির্বাচনের ছুটি',
};

export interface Holiday {
  date: string;
  name: string;
  name_bn: string | null;
  type: 'public' | 'observance';
}

export interface SavingsScheme {
  id: string;
  bn: string;
  en: string;
  /** Rate (%) for year 1, 2, … of the term, for investments up to Tk 7.5 lakh and above it. */
  upTo7_5Lakh: number[];
  above7_5Lakh: number[];
}

export interface SavingsNotice {
  issued: string;
  effectiveFrom: string;
  /** The period these rates are confirmed for (by the latest notice, which may only extend them). */
  periodBn: string;
  periodEn: string;
  /** The official document the table was read from. */
  documentUrl: string;
  schemes: SavingsScheme[];
  /** Later notices that kept these rates in force unchanged, oldest first. */
  extendedBy?: Array<{ issued: string; until: string; url: string }>;
}

/**
 * The rates in force, verified against the official notices (as published by the National Savings
 * Directorate). The table is the Internal Resources Division notice of 30 June 2025 (memo ...২০.৮৫). A
 * notice of 30 Dec 2025 cut the rates from January 2026, but the notice of 4 Jan 2026 (...২০.৩) cancelled
 * it and kept these rates to 30 June 2026, and the notice of 2 July 2026 (...২০.৯৩) kept them to
 * 31 December 2026. Checked against the notices themselves on 2026-10-22. Rates are reviewed every six
 * months; the savingsRates source warns on /status when a newer notice appears.
 */
export const SAVINGS_NOTICE: SavingsNotice = {
  issued: '2025-06-30',
  effectiveFrom: '2025-07-01',
  periodBn: 'জুলাই–ডিসেম্বর ২০২৬',
  periodEn: 'July–December 2026',
  extendedBy: [
    { issued: '2026-01-04', until: '2026-06-30', url: 'https://objectstorage.ap-dcc-gazipur-1.oraclecloud15.com/n/axvjbnqprylg/b/V2Ministry/o/office-nationalsavings/2024/12/1aebfb2a642a46e1ae45c4dbf3e4351d.pdf' },
    { issued: '2026-07-02', until: '2026-12-31', url: 'https://objectstorage.ap-dcc-gazipur-1.oraclecloud15.com/n/axvjbnqprylg/b/V2Ministry/o/office-nationalsavings/2026/6/6d1a451f-6927-4738-ae6b-58d1f2ea5046.pdf' },
  ],
  documentUrl:
    'https://objectstorage.ap-dcc-gazipur-1.oraclecloud15.com/n/axvjbnqprylg/b/V2Ministry/o/office-nationalsavings/2024/12/5123d60a893e49c2923d35d7e0c1b833.pdf',
  schemes: [
    {
      id: 'bsp_5y',
      bn: '৫ বছর মেয়াদি বাংলাদেশ সঞ্চয়পত্র',
      en: '5-year Bangladesh Sanchayapatra',
      upTo7_5Lakh: [9.74, 10.21, 10.72, 11.26, 11.83],
      above7_5Lakh: [9.72, 10.19, 10.7, 11.23, 11.8],
    },
    {
      id: 'quarterly_3y',
      bn: '৩ মাস অন্তর মুনাফাভিত্তিক সঞ্চয়পত্র',
      en: '3-monthly profit-bearing Sanchayapatra',
      upTo7_5Lakh: [10.65, 11.22, 11.82],
      above7_5Lakh: [10.6, 11.16, 11.77],
    },
    {
      id: 'pensioner_5y',
      bn: 'পেনশনার সঞ্চয়পত্র',
      en: 'Pensioner Sanchayapatra',
      upTo7_5Lakh: [9.84, 10.32, 10.84, 11.39, 11.98],
      above7_5Lakh: [9.72, 10.19, 10.7, 11.23, 11.8],
    },
    {
      id: 'paribar_5y',
      bn: 'পরিবার সঞ্চয়পত্র',
      en: 'Paribar (family) Sanchayapatra',
      upTo7_5Lakh: [9.81, 10.29, 10.8, 11.35, 11.93],
      above7_5Lakh: [9.72, 10.19, 10.7, 11.23, 11.8],
    },
    {
      id: 'post_office_3y',
      bn: 'ডাকঘর সঞ্চয় ব্যাংক মেয়াদি হিসাব',
      en: 'Post office savings bank (term deposit)',
      upTo7_5Lakh: [10.65, 11.22, 11.82],
      above7_5Lakh: [10.6, 11.16, 11.77],
    },
  ],
};
