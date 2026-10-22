import type { APIRoute } from 'astro';
import { ADSENSE_CLIENT } from '../config';

// Authorised ad sellers (IAB ads.txt). Lists Google as the only seller once ADSENSE_CLIENT is set;
// until then it says there are none, so the file exists for crawlers either way.
// f08c47fec0942fa0 is Google's certification authority ID, the same for every AdSense publisher.
export const GET: APIRoute = () => {
  const pub = ADSENSE_CLIENT.replace(/^ca-/, '');
  const body = pub ? `google.com, ${pub}, DIRECT, f08c47fec0942fa0\n` : '# No authorised ad sellers yet.\n';
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
};
