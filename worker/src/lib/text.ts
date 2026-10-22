// Runtime-neutral text helpers (no Workers APIs), shared with Node scripts.

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** Decode the HTML/XML entities HTMLRewriter leaves in text chunks and attribute values. */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith('#')) {
      const hex = entity[1] === 'x' || entity[1] === 'X';
      const code = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/** Decode entities and collapse whitespace. */
export function cleanText(s: string): string {
  return decodeEntities(s).replace(/\s+/g, ' ').trim();
}

/** Short description of a page for error messages, e.g. when a site serves a bot challenge instead of content. */
export function describePage(html: string): string {
  const title = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1];
  return `${html.length} bytes, title "${cleanText(title ?? '').slice(0, 80)}"`;
}
