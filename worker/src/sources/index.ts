import { bajusGold } from './bajusGold';
import { bangladeshBank } from './bangladeshBank';
import type { Batch, Source } from './types';

/** Every registered source. Add new ones here. */
export const SOURCES: readonly Source[] = [bangladeshBank, bajusGold];

export function getSource(key: string): Source | undefined {
  return SOURCES.find((s) => s.key === key);
}

export function sourcesFor(batch: Batch): Source[] {
  return SOURCES.filter((s) => (batch === 'hourly' ? s.cadence === 'hourly' : s.cadence !== 'hourly'));
}
