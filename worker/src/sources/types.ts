import type { Cadence, Point } from '@bdnumbers/shared';
import type { Env } from '../env';

/** `daily` runs at 07:00 and 13:00 Dhaka (daily + periodic sources); `hourly` at :15 every hour. */
export type Batch = 'daily' | 'hourly';

export interface SourceContext {
  /** Record a non-fatal problem. It is stored on the run even when the run succeeds. */
  warn(message: string): void;
}

export interface Source {
  key: string;
  cadence: Cadence;
  /**
   * `upsert`: one point per source date, always written (idempotent).
   * `on-change`: written only when the value differs from the latest stored one.
   */
  writeMode: 'upsert' | 'on-change';
  /** Fetch and parse. Throws on any failure; never returns partial garbage. */
  fetch(env: Env, ctx: SourceContext): Promise<Point[]>;
}
