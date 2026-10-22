/** How often a source is fetched. `periodic` sources are fetched daily but change rarely. */
export type Cadence = 'daily' | 'hourly' | 'periodic';

export type Category = 'fx' | 'gold' | 'silver';

/** Static description of a series. Mirrors the D1 `series` table plus catalog-only fields. */
export interface SeriesDef {
  key: string;
  name_bn: string;
  name_en: string;
  unit: string;
  source_name: string;
  source_url: string;
  cadence: Cadence;
  category: Category;
  /** Key of the source module that produces this series (used to flag stale points on failure). */
  source_key: string;
  /** Plausible [min, max]. A value outside fails the run instead of being stored. */
  bounds?: readonly [number, number];
}

export type PointMeta = Record<string, unknown>;

/** A value produced by a source or sent to /api/ingest. `date` is a Dhaka-local YYYY-MM-DD (or YYYY-MM-DDTHH:MM for hourly series). */
export interface Point {
  series_key: string;
  date: string;
  value: number;
  meta?: PointMeta;
}

export interface Change {
  /** The earlier value the change is measured from. */
  from: number;
  /** Date of that earlier value. */
  date: string;
  abs: number;
  /** Percentage change, or null when `from` is 0. */
  pct: number | null;
}

export interface LatestEntry {
  key: string;
  name_bn: string;
  name_en: string;
  unit: string;
  category: Category;
  source_name: string;
  source_url: string;
  value: number;
  date: string;
  /** ISO timestamp of when the value was fetched; null for manual overrides without a fetched point. */
  fetched_at: string | null;
  stale: boolean;
  overridden: boolean;
  meta: PointMeta | null;
  change: {
    prev: Change | null;
    d7: Change | null;
    d30: Change | null;
    y1: Change | null;
  };
}

export interface LatestResponse {
  generated_at: string;
  series: LatestEntry[];
}

export interface HistoryPoint {
  date: string;
  value: number;
  stale: boolean;
  overridden: boolean;
}

export interface SeriesHistory {
  series: SeriesDef;
  from: string | null;
  to: string | null;
  points: HistoryPoint[];
}

export interface ChangeEntry {
  key: string;
  name_bn: string;
  name_en: string;
  unit: string;
  date: string;
  value: number;
  previous: number | null;
  fetched_at: string;
}

export interface ChangesResponse {
  /** Dhaka-local date the changes were fetched on. */
  date: string;
  changes: ChangeEntry[];
}

export interface RunSummary {
  id: number;
  source: string;
  trigger: string | null;
  started_at: string;
  finished_at: string | null;
  ok: boolean;
  error: string | null;
  points_written: number;
}

export interface SourceStatus {
  source: string;
  last_run: RunSummary | null;
  last_ok_at: string | null;
  failures_24h: number;
  stale_series: string[];
}

export interface StatusResponse {
  generated_at: string;
  sources: SourceStatus[];
}

/** Body of POST /api/ingest. */
export interface IngestPayload {
  /** Who is sending, e.g. "tcb-fallback" or "manual". Logged in `runs` as `ingest:<source>`. */
  source: string;
  points: Point[];
  /** `upsert` (default) writes every point; `on-change` skips values equal to the latest stored one. */
  mode?: 'upsert' | 'on-change';
  /** Write to manual_overrides instead of points; `meta.note` becomes the override note. */
  override?: boolean;
}

export interface IngestResult {
  ok: boolean;
  run_id: number;
  written: number;
  error: string | null;
}
