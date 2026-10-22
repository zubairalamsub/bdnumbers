const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** Decode the HTML entities HTMLRewriter leaves in text chunks and attribute values. */
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

export interface Anchor {
  href: string;
  text: string;
}

/**
 * Collects table cells, element text and attributes in a single HTMLRewriter pass.
 * HTMLRewriter is native, so a parse costs almost no JavaScript CPU time.
 *
 * Register what you need, then `await run(html)`; the returned arrays fill in during the run.
 */
export class Extractor {
  private readonly rewriter = new HTMLRewriter();
  private readonly finalizers: Array<() => void> = [];

  /** Every table matching `selector`, as rows of cell text (th and td, in document order). */
  tables(selector: string): string[][][] {
    const tables: string[][][] = [];
    const startCell = () => {
      tables.at(-1)?.at(-1)?.push('');
    };
    const appendText = (chunk: Text) => {
      const row = tables.at(-1)?.at(-1);
      if (row && row.length > 0) row[row.length - 1] += chunk.text;
    };
    this.rewriter
      .on(selector, { element: () => void tables.push([]) })
      .on(`${selector} tr`, { element: () => void tables.at(-1)?.push([]) })
      .on(`${selector} th`, { element: startCell, text: appendText })
      .on(`${selector} td`, { element: startCell, text: appendText });
    this.finalizers.push(() => {
      for (const table of tables) for (const row of table) row.forEach((cell, i) => (row[i] = cleanText(cell)));
    });
    return tables;
  }

  /** Text content of every element matching `selector`. */
  text(selector: string): string[] {
    const out: string[] = [];
    this.rewriter.on(selector, {
      element: () => void out.push(''),
      text: (chunk) => {
        if (out.length > 0) out[out.length - 1] += chunk.text;
      },
    });
    this.finalizers.push(() => out.forEach((t, i) => (out[i] = cleanText(t))));
    return out;
  }

  /** Value of attribute `name` on every element matching `selector` that has it. */
  attrs(selector: string, name: string): string[] {
    const out: string[] = [];
    this.rewriter.on(selector, {
      element: (el) => {
        const value = el.getAttribute(name);
        if (value !== null) out.push(decodeEntities(value).trim());
      },
    });
    return out;
  }

  /** href and text of every anchor matching `selector`. */
  anchors(selector: string): Anchor[] {
    const out: Anchor[] = [];
    this.rewriter.on(selector, {
      element: (el) => void out.push({ href: decodeEntities(el.getAttribute('href') ?? '').trim(), text: '' }),
      text: (chunk) => {
        const last = out.at(-1);
        if (last) last.text += chunk.text;
      },
    });
    this.finalizers.push(() => out.forEach((a) => (a.text = cleanText(a.text))));
    return out;
  }

  async run(html: string): Promise<void> {
    await this.rewriter.transform(new Response(html)).arrayBuffer();
    for (const finalize of this.finalizers) finalize();
  }
}

/** Short description of a page for error messages, e.g. when a site serves a bot challenge instead of content. */
export function describePage(html: string): string {
  const title = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1];
  return `${html.length} bytes, title "${cleanText(title ?? '').slice(0, 80)}"`;
}
