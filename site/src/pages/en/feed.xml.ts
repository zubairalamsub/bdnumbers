import type { APIRoute } from 'astro';
import { atomFeed } from '../../lib/feed';

export const GET: APIRoute = async () =>
  new Response(await atomFeed('en'), { headers: { 'Content-Type': 'application/atom+xml; charset=utf-8' } });
