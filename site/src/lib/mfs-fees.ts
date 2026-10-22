// Cash-out charges of the three main mobile financial services, read from each operator's own website
// on 2026-10-22 (quotes kept in the research notes). Update when an operator changes its charges.

export interface CashOutOption {
  id: string;
  bn: string;
  en: string;
  /** Taka per Tk 1,000, or a percentage of the amount. */
  per1000?: number;
  percent?: number;
}

export interface MfsService {
  id: 'bkash' | 'nagad' | 'rocket';
  name: string;
  sourceUrl: string;
  /** Set when the operator's newest published figures are old enough to doubt. */
  asOf?: string;
  options: CashOutOption[];
}

export const MFS_RETRIEVED = '2026-10-22';

export const MFS_SERVICES: readonly MfsService[] = [
  {
    id: 'bkash',
    name: 'bKash',
    sourceUrl: 'https://www.bkash.com/en/products-services/cashout/cashout-from-agent',
    options: [
      { id: 'agent', bn: 'এজেন্ট থেকে (অ্যাপ বা *২৪৭#)', en: 'At an agent (app or *247#)', per1000: 18.5 },
      { id: 'priyo', bn: 'প্রিয় এজেন্ট থেকে (মাসে প্রথম ৫০,০০০ টাকা)', en: 'Priyo Agent (first Tk 50,000 a month)', per1000: 13.95 },
      { id: 'atm', bn: 'এটিএম থেকে (ব্র্যাক, সিটি, কিউ-ক্যাশ)', en: 'ATM (BRAC, City, Q-Cash)', per1000: 14.9 },
      { id: 'remittance_atm', bn: 'রেমিট্যান্সের টাকা, এটিএম থেকে', en: 'Remittance money at an ATM', per1000: 7 },
    ],
  },
  {
    id: 'nagad',
    name: 'Nagad',
    sourceUrl: 'https://nagad.com.bd/en/services/?service=cash-out',
    options: [
      { id: 'app', bn: 'উদ্যোক্তা থেকে, অ্যাপে', en: 'At an agent, app', per1000: 12.99 },
      { id: 'ussd', bn: 'উদ্যোক্তা থেকে, *১৬৭#', en: 'At an agent, *167#', per1000: 15 },
      { id: 'islamic', bn: 'নগদ ইসলামিক', en: 'Nagad Islamic', per1000: 15 },
    ],
  },
  {
    id: 'rocket',
    name: 'Rocket',
    sourceUrl: 'https://www.dutchbanglabank.com/CitizensCharter/CitizensCharter.pdf',
    asOf: '2025-03',
    options: [
      { id: 'agent', bn: 'এজেন্ট থেকে', en: 'At an agent', percent: 1.67 },
      { id: 'atm', bn: 'ডাচ্-বাংলা ব্যাংক এটিএম থেকে', en: 'DBBL ATM', percent: 0.9 },
      { id: 'branch', bn: 'ডাচ্-বাংলা ব্যাংক শাখা থেকে', en: 'DBBL branch', percent: 0.9 },
    ],
  },
];

/** Fee for cashing out `amount` taka with an option. */
export function cashOutFee(option: CashOutOption, amount: number): number {
  const fee = option.per1000 !== undefined ? (amount / 1000) * option.per1000 : (amount * (option.percent ?? 0)) / 100;
  return Math.round(fee * 100) / 100;
}
