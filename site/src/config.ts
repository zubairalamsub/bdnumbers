export const SITE_URL = 'https://bdrate.fyi';
export const SITE_NAME = 'bdrate.fyi';

/** The Worker API the build reads from and the browser refreshes against. Override with API_BASE at build time. */
// Build-time only (reads process.env): never import this file from browser scripts.
export const API_BASE = (process.env.API_BASE ?? 'https://api.bdrate.fyi').replace(/\/+$/, '');

// Optional services, all off unless set as build-time environment variables in Cloudflare Pages
// (Settings → Variables and Secrets). They are public identifiers, not secrets.
const env = (name: string) => (process.env[name] ?? '').trim();
/** OneSignal web push app ID: turns on the "notify me" buttons (free plan). */
export const ONESIGNAL_APP_ID = env('ONESIGNAL_APP_ID');
/** Buttondown newsletter username: turns on the daily-digest sign-up form (free plan). */
export const BUTTONDOWN_USERNAME = env('BUTTONDOWN_USERNAME');
/** Google AdSense publisher ID (ca-pub-…) and ad slot: turns on one lazily loaded ad slot per number page. */
export const ADSENSE_CLIENT = env('ADSENSE_CLIENT');
export const ADSENSE_SLOT = env('ADSENSE_SLOT');
