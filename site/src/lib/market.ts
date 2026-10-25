// Helpers for TCB's min–max retail prices, shared by the market page and the commodity pages.
import type { Change, LatestEntry } from '@bdnumbers/shared';

/** Change in the midpoint of a min–max range over a period, as the ChangeText component wants it. */
export function midChange(min: LatestEntry, max: LatestEntry, period: keyof LatestEntry['change']): Change | null {
  const a = min.change[period];
  const b = max.change[period];
  if (!a || !b) return null;
  const now = (min.value + max.value) / 2;
  const then = (a.from + b.from) / 2;
  return { from: then, date: b.date, abs: now - then, pct: then ? ((now - then) / then) * 100 : null };
}
