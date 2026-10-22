import { KARAT_ORDER, type Karat } from '@bdnumbers/shared';
import { ValidationError } from '../lib/errors';

export type Metal = 'gold' | 'silver';

/** Require a price for every karat, strictly decreasing 22K > 21K > 18K > traditional. */
export function assertKaratLadder(metal: Metal, prices: ReadonlyMap<Karat, number>, label: string): void {
  const missing = KARAT_ORDER.filter((k) => !prices.has(k));
  if (missing.length > 0) throw new ValidationError(`${label}: missing ${metal} ${missing.join(', ')}`);
  for (let i = 1; i < KARAT_ORDER.length; i++) {
    const higher = prices.get(KARAT_ORDER[i - 1]!)!;
    const lower = prices.get(KARAT_ORDER[i]!)!;
    if (!(lower < higher)) {
      throw new ValidationError(
        `${label}: ${metal} ${KARAT_ORDER[i]} (${lower}) is not below ${KARAT_ORDER[i - 1]} (${higher})`,
      );
    }
  }
}
