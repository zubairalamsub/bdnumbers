import type { APIRoute } from 'astro';
import { rssFeed } from '../../lib/feed';

export const GET: APIRoute = async () =>
  new Response(await rssFeed('en'), { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
