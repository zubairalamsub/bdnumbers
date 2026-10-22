import type { APIRoute } from 'astro';
import { manifest } from '../../lib/pwa';

export const GET: APIRoute = () =>
  new Response(JSON.stringify(manifest('en'), null, 2), { headers: { 'Content-Type': 'application/manifest+json' } });
