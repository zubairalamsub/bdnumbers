export interface Env {
  DB: D1Database;
  CACHE: KVNamespace;
  /** Service binding to this Worker; used to run each source in its own invocation. */
  SELF: Fetcher;
  /** Workers rate-limit binding; absent if the account doesn't support it. */
  INGEST_LIMITER?: RateLimit;

  SITE_URL: string;
  USER_AGENT: string;
  /** "fanout" (production) or "inline" (tests, local debugging). */
  RUN_MODE: string;
  /** Wait before the single retry of a failed source fetch; default 3000. Tests set 0. */
  RETRY_DELAY_MS?: string;

  INGEST_TOKEN?: string;
  INTERNAL_TOKEN?: string;
  PAGES_DEPLOY_HOOK?: string;
  ONESIGNAL_KEY?: string;
}

export type AppEnv = { Bindings: Env };
