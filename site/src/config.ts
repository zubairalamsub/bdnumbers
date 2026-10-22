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
/**
 * Google AdSense publisher ID (ca-pub-…) and ad slot. The ID alone adds the site-ownership meta tag,
 * the ads.txt line and the ads section of /privacy (what AdSense review needs); with the slot as well,
 * each number page gets one lazily loaded ad.
 */
export const ADSENSE_CLIENT = env('ADSENSE_CLIENT');
export const ADSENSE_SLOT = env('ADSENSE_SLOT');
/** The contact address on /about, /privacy and security.txt (forwarded by Cloudflare Email Routing). */
export const CONTACT_EMAIL = env('CONTACT_EMAIL') || 'contact@bdrate.fyi';
