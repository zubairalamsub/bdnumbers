import { bajusGold } from './bajusGold';
import { bangladeshBank } from './bangladeshBank';
import { dseIndex } from './dseIndex';
import { eblRates } from './eblRates';
import { fuelPrices } from './fuelPrices';
import { holidays } from './holidays';
import { lpgPrice } from './lpgPrice';
import { savingsRates } from './savingsRates';
import { tcbMarketPrices } from './tcbMarketPrices';
import type { Batch, Source } from './types';
import { weather } from './weather';

/** Every registered source. Add new ones here. */
export const SOURCES: readonly Source[] = [
  bangladeshBank,
  eblRates,
  bajusGold,
  tcbMarketPrices,
  dseIndex,
  fuelPrices,
  lpgPrice,
  savingsRates,
  holidays,
  weather,
];

export function getSource(key: string): Source | undefined {
  return SOURCES.find((s) => s.key === key);
}

export function sourcesFor(batch: Batch): Source[] {
  return SOURCES.filter((s) => (batch === 'hourly' ? s.cadence === 'hourly' : s.cadence !== 'hourly'));
}
