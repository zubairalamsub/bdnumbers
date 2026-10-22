// What each page's social card says, from today's data. Rendering lives in og.ts (build-time only).
import {
  SAVINGS_NOTICE,
  defaultDigits,
  dhakaDate,
  formatDate,
  formatNumber,
  formatSeriesValue,
  weatherCondition,
  type Holiday,
  type Lang,
  type LatestResponse,
  type SavingsNotice,
} from '@bdnumbers/shared';
import { STRINGS } from '../i18n';
import { formatPointDate } from './view';
import type { OgCard } from './og';

/** Pages with a card of their own; every other page uses its section's card or "default". */
export const OG_CARDS = [
  'index',
  'dollar-rate-today',
  'gold-price-today',
  'silver-price-today',
  'market-price-today',
  'share-market-today',
  'weather',
  'fuel-price',
  'lpg-price',
  'savings-rates',
  'holidays',
  'prayer-times',
  'calculators',
  'default',
] as const;
export type OgCardName = (typeof OG_CARDS)[number];

/** The card for a page path (without the /en prefix). */
export function ogCardFor(path: string): OgCardName {
  if (path === '/') return 'index';
  const first = path.split('/')[1] ?? '';
  return (OG_CARDS as readonly string[]).includes(first) ? (first as OgCardName) : 'default';
}

/** Absolute path of the card image; `v` changes with the data so shares pick up new numbers. */
export const ogImagePath = (lang: Lang, path: string, version: string) => `/og/${lang}/${ogCardFor(path)}.png?v=${version}`;

export function ogCard(name: OgCardName, lang: Lang, latest: LatestResponse): OgCard {
  const bn = lang === 'bn';
  const digits = defaultDigits(lang);
  const s = STRINGS[lang];
  const e = (key: string) => latest.series.find((x) => x.key === key);
  const v = (key: string) => {
    const x = e(key);
    return x ? formatSeriesValue(x.value, x.category, digits) : '—';
  };
  const day = (key: string) => {
    const x = e(key);
    return x ? formatPointDate(x.date, lang, digits) : '';
  };
  const taka = (n: string) => (bn ? `${n} টাকা` : `Tk ${n}`);
  const footer = bn ? 'আজকের রেট ও দাম · bdrate.fyi' : 'Daily numbers for Bangladesh · bdrate.fyi';

  switch (name) {
    case 'index':
      return {
        title: bn ? 'আজকের ডলার রেট ও সোনার দাম' : 'Dollar rate and gold price today',
        value: bn ? `ডলার ${taka(v('usd_bdt_avg'))}` : `Dollar ${taka(v('usd_bdt_avg'))}`,
        note: bn ? `২২ ক্যারেট সোনা ${taka(v('gold_22k'))}/ভরি` : `22K gold ${taka(v('gold_22k'))}/bhori`,
        footer,
      };
    case 'dollar-rate-today':
      return {
        title: bn ? 'আজকের ডলার রেট' : 'Dollar rate today',
        value: taka(v('usd_bdt_avg')),
        note: bn ? `বাংলাদেশ ব্যাংক · ${day('usd_bdt_avg')}` : `Bangladesh Bank · ${day('usd_bdt_avg')}`,
        footer,
      };
    case 'gold-price-today':
    case 'silver-price-today': {
      const metal = name === 'gold-price-today' ? 'gold' : 'silver';
      return {
        title: bn ? `আজকের ${metal === 'gold' ? 'সোনার' : 'রুপার'} দাম · ২২ ক্যারেট` : `${metal === 'gold' ? 'Gold' : 'Silver'} price today · 22 carat`,
        value: taka(v(`${metal}_22k`)),
        note: bn ? `প্রতি ভরি · বাজুস · ${day(`${metal}_22k`)}` : `Per bhori · BAJUS · ${day(`${metal}_22k`)}`,
        footer,
      };
    }
    case 'market-price-today': {
      const lo = v('tcb_rice_coarse_min');
      const hi = v('tcb_rice_coarse_max');
      return {
        title: bn ? 'আজকের বাজারদর · ঢাকা' : 'Market prices today · Dhaka',
        value: bn ? `মোটা চাল ${lo}–${hi} টাকা` : `Coarse rice Tk ${lo}–${hi}`,
        note: bn ? `প্রতি কেজি · টিসিবি · ${day('tcb_rice_coarse_max')}` : `Per kg · TCB · ${day('tcb_rice_coarse_max')}`,
        footer,
      };
    }
    case 'share-market-today':
      return {
        title: bn ? 'আজকের শেয়ারবাজার' : 'Share market today',
        value: `${bn ? 'ডিএসইএক্স' : 'DSEX'} ${v('dse_dsex')}`,
        note: bn
          ? `লেনদেন ${v('dse_turnover')} কোটি টাকা · ${day('dse_dsex')}`
          : `Turnover Tk ${v('dse_turnover')} crore · ${day('dse_dsex')}`,
        footer,
      };
    case 'weather': {
      const temp = e('weather_dhaka_temp');
      const sky = temp ? weatherCondition(temp.meta?.symbol, lang)?.text : undefined;
      return {
        title: bn ? 'ঢাকার আবহাওয়া' : 'Weather in Dhaka',
        value: temp ? `${formatNumber(temp.value, digits, 1, 1)}°${bn ? 'সে' : 'C'}` : '—',
        note: [sky, day('weather_dhaka_temp')].filter(Boolean).join(' · '),
        footer,
      };
    }
    case 'fuel-price':
      return {
        title: bn ? 'জ্বালানি তেলের দাম' : 'Fuel prices',
        value: bn ? `ডিজেল ${v('fuel_diesel')} টাকা` : `Diesel Tk ${v('fuel_diesel')}`,
        note: bn
          ? `অকটেন ${v('fuel_octane')} · পেট্রোল ${v('fuel_petrol')} টাকা/লিটার`
          : `Octane Tk ${v('fuel_octane')} · petrol Tk ${v('fuel_petrol')} a litre`,
        footer,
      };
    case 'lpg-price':
      return {
        title: bn ? 'এলপিজির দাম · ১২ কেজি সিলিন্ডার' : 'LPG price · 12 kg cylinder',
        value: taka(v('lpg_12kg')),
        note: bn ? `বিইআরসি · ${day('lpg_12kg')}` : `BERC · ${day('lpg_12kg')}`,
        footer,
      };
    case 'savings-rates': {
      const notice = (e('savings_rates')?.meta?.notice as SavingsNotice | undefined) ?? SAVINGS_NOTICE;
      const top = Math.max(...notice.schemes.flatMap((x) => x.upTo7_5Lakh));
      return {
        title: bn ? 'সঞ্চয়পত্রের মুনাফার হার' : 'Savings certificate rates',
        value: `${bn ? 'সর্বোচ্চ' : 'Up to'} ${formatNumber(top, digits, 2, 2)}%`,
        note: bn ? notice.periodBn : notice.periodEn,
        footer,
      };
    }
    case 'holidays': {
      const holidays = (e('holidays_public')?.meta?.holidays as Holiday[] | undefined) ?? [];
      const next = holidays.find((h) => h.type === 'public' && h.date >= dhakaDate());
      return {
        title: bn ? 'পরের সরকারি ছুটি' : 'Next public holiday',
        value: next ? (bn ? (next.name_bn ?? next.name) : next.name) : '—',
        note: next ? formatDate(next.date, lang, digits) : '',
        footer,
      };
    }
    case 'prayer-times':
      return {
        title: bn ? 'নামাজের সময়সূচি' : 'Prayer times',
        value: bn ? '৬৪ জেলা' : 'All 64 districts',
        note: bn ? 'আজকের সময়, মাসিক সূচি, সাহরি ও ইফতার' : "Today's times, the month, sehri and iftar",
        footer,
      };
    case 'calculators':
      return {
        title: s.nav.calculators,
        value: bn ? 'যাকাত · ইএমআই · সোনা' : 'Zakat · EMI · gold',
        note: bn ? 'আজকের রেট ও দামে, আপনার ব্রাউজারেই' : "At today's rates, right in your browser",
        footer,
      };
    case 'default':
      return {
        title: 'bdrate.fyi',
        value: bn ? 'আজকের রেট ও দাম' : 'Bangladesh, by the numbers',
        note: s.tagline,
        footer: 'bdrate.fyi',
      };
  }
}
