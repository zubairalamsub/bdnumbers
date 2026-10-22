// Web app manifest and service worker source (both generated at build time).
import type { Lang } from '@bdnumbers/shared';
import { API_BASE, ONESIGNAL_APP_ID, SITE_NAME } from '../config';
import { STRINGS, localePath } from '../i18n';

export function manifest(lang: Lang) {
  const s = STRINGS[lang];
  const bn = lang === 'bn';
  return {
    name: bn ? `${SITE_NAME}: আজকের রেট ও দাম` : `${SITE_NAME}: Bangladesh daily numbers`,
    short_name: 'bdrate',
    description: s.tagline,
    lang,
    dir: 'ltr',
    id: localePath(lang, '/'),
    start_url: localePath(lang, '/'),
    scope: '/',
    display: 'standalone',
    background_color: '#f9f9f7',
    theme_color: '#006a4e',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
    ],
    shortcuts: [
      { name: s.nav.dollar, url: localePath(lang, '/dollar-rate-today') },
      { name: s.nav.gold, url: localePath(lang, '/gold-price-today') },
      { name: s.nav.prayer, url: localePath(lang, '/prayer-times') },
      { name: s.nav.calculators, url: localePath(lang, '/calculators') },
    ],
  };
}

/**
 * The service worker. Pages: network first, falling back to the cached copy and then to /offline, so a
 * page visited before still opens offline. Hashed assets: cache first. latest.json: network first, so
 * the live refresh shows the last data it saw when offline. When OneSignal is configured, its worker
 * is imported here so both share the one scope.
 */
export function serviceWorker(version: string): string {
  const api = new URL(API_BASE).origin;
  return `// bdrate.fyi service worker, build ${version}
${ONESIGNAL_APP_ID ? "importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');\n" : ''}const PAGES = 'pages-v1';
const ASSETS = 'assets-v1';
const DATA = 'data-v1';
const API = ${JSON.stringify(api)};
const OFFLINE = { bn: '/offline', en: '/en/offline' };
const LIMITS = { [PAGES]: 40, [ASSETS]: 80, [DATA]: 20 };

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(PAGES)
      .then((cache) => cache.addAll([OFFLINE.bn, OFFLINE.en, '/', '/en']))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (!(key in LIMITS)) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

async function put(cacheName, request, response) {
  const cache = await caches.open(cacheName);
  await cache.put(request, response);
  const keys = await cache.keys();
  for (const old of keys.slice(0, Math.max(0, keys.length - LIMITS[cacheName]))) await cache.delete(old);
}

async function networkFirst(request, cacheName, fallback) {
  try {
    const response = await fetch(request);
    if (response.ok) await put(cacheName, request, response.clone());
    return response;
  } catch (err) {
    const cached = (await caches.match(request)) ?? (await caches.match(request, { ignoreSearch: true }));
    if (cached) return cached;
    if (fallback) {
      const page = await caches.match(fallback);
      if (page) return page;
    }
    throw err;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await put(ASSETS, request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin === self.location.origin) {
    if (request.mode === 'navigate') {
      const offline = url.pathname === '/en' || url.pathname.startsWith('/en/') ? OFFLINE.en : OFFLINE.bn;
      event.respondWith(networkFirst(request, PAGES, offline));
    } else if (url.pathname.startsWith('/_astro/') || url.pathname.startsWith('/icons/')) {
      event.respondWith(cacheFirst(request));
    }
  } else if (url.origin === API && url.pathname === '/api/latest.json') {
    event.respondWith(networkFirst(request, DATA));
  }
});
`;
}
