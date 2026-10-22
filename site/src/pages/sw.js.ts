import type { APIRoute } from 'astro';
import { getLatest } from '../lib/data';
import { serviceWorker } from '../lib/pwa';

// A new build changes the version line, so browsers pick up the new worker.
export const GET: APIRoute = async () => {
  const latest = await getLatest();
  return new Response(serviceWorker(latest.generated_at), { headers: { 'Content-Type': 'text/javascript; charset=utf-8' } });
};
