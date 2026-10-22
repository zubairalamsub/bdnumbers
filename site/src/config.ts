export const SITE_URL = 'https://bdrate.fyi';
export const SITE_NAME = 'bdrate.fyi';

/** The Worker API the build reads from and the browser refreshes against. Override with API_BASE at build time. */
// Build-time only (reads process.env): never import this file from browser scripts.
export const API_BASE = (process.env.API_BASE ?? 'https://api.bdrate.fyi').replace(/\/+$/, '');
