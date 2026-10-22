// Register the service worker (production builds only, so the dev server never serves cached pages).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err: unknown) => console.warn('service worker:', err));
  });
}
