// Web push topics. A subscriber who taps "notify me" on a page gets the OneSignal data tag n_<topic> set
// to their page language ("bn" or "en"); the Worker sends each change to the matching tag and language.
// OneSignal's free plan allows 6 data tags per subscriber, so keep this list at 6 or fewer.

export const PUSH_TOPICS = {
  dollar: { keys: ['usd_bdt_avg'], path: '/dollar-rate-today', bn: 'ডলার রেট', en: 'Dollar rate' },
  gold: { keys: ['gold_22k', 'gold_21k', 'gold_18k', 'gold_traditional'], path: '/gold-price-today', bn: 'সোনার দাম', en: 'Gold price' },
  silver: { keys: ['silver_22k', 'silver_21k', 'silver_18k', 'silver_traditional'], path: '/silver-price-today', bn: 'রুপার দাম', en: 'Silver price' },
  fuel: {
    keys: ['fuel_diesel', 'fuel_octane', 'fuel_petrol', 'fuel_kerosene', 'lpg_12kg'],
    path: '/fuel-price',
    bn: 'জ্বালানি তেল ও এলপিজির দাম',
    en: 'Fuel and LPG prices',
  },
  savings: { keys: ['savings_rates'], path: '/savings-rates', bn: 'সঞ্চয়পত্রের হার', en: 'Savings certificate rates' },
} as const;

export type PushTopic = keyof typeof PUSH_TOPICS;

export const pushTagKey = (topic: PushTopic) => `n_${topic}`;
