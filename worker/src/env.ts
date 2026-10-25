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
  /** "off" stops the hourly phone shop crawl (and the daily phone snapshot); anything else leaves it on. */
  PHONE_CRAWL?: string;

  INGEST_TOKEN?: string;
  INTERNAL_TOKEN?: string;
  PAGES_DEPLOY_HOOK?: string;
  /** OneSignal app ID and REST API key: web push on changes (free plan). Unset: pushes are skipped. */
  ONESIGNAL_APP_ID?: string;
  ONESIGNAL_KEY?: string;
  /** Buttondown API key: the daily email digest (free plan). Unset: the digest is skipped. */
  BUTTONDOWN_API_KEY?: string;
  /**
   * Failure alerts by email: the send_email binding, the recipient (a verified Email Routing destination,
   * kept as a secret so it stays out of the public repo) and the sender on this domain. Unset: no alerts.
   */
  ALERT_EMAIL?: SendEmail;
  ALERT_TO?: string;
  ALERT_FROM?: string;
}

export type AppEnv = { Bindings: Env };
