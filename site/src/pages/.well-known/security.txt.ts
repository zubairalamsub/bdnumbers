import type { APIRoute } from 'astro';
import { CONTACT_EMAIL, SITE_URL } from '../../config';

// RFC 9116 security contact. Built with every deploy (at least daily), so Expires always stays about a
// year ahead without anyone having to renew it.
export const GET: APIRoute = () => {
  const expires = new Date(Date.now() + 365 * 86_400_000).toISOString();
  const lines = [
    `Contact: mailto:${CONTACT_EMAIL}`,
    `Expires: ${expires}`,
    'Preferred-Languages: en, bn',
    `Canonical: ${SITE_URL}/.well-known/security.txt`,
  ];
  return new Response(`${lines.join('\n')}\n`, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
};
