const encoder = new TextEncoder();

/** Constant-time check of an `Authorization: Bearer <token>` header. False when no token is configured. */
export async function bearerMatches(header: string | undefined, expected: string | undefined): Promise<boolean> {
  if (!expected || !header?.startsWith('Bearer ')) return false;
  // Hash both sides so the comparison is over equal-length buffers regardless of input length.
  const [given, wanted] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(header.slice('Bearer '.length))),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  return crypto.subtle.timingSafeEqual(given, wanted);
}
