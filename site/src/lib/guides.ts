// The guides (/guides): written articles that explain the numbers the site shows. Each guide is a folder
// in src/content/guides with bn.md and en.md. A guide with `draft: true` is left out of the build, so it
// never reaches the live site; SHOW_DRAFTS=1 at build time includes drafts (marked, and noindex) to
// review them in a local preview.
import type { Lang } from '@bdnumbers/shared';
import type { MarkdownInstance } from 'astro';

export interface GuideMeta {
  title: string;
  description: string;
  /** YYYY-MM-DD */
  published: string;
  updated?: string;
  draft?: boolean;
  /** Position in the list (lower first). */
  order?: number;
  /** Site pages the guide goes with (paths without the /en prefix). */
  related?: Array<{ label: string; path: string }>;
}

export interface Guide {
  slug: string;
  lang: Lang;
  meta: GuideMeta;
  /** The body as HTML. */
  html: MarkdownInstance<GuideMeta>['compiledContent'];
  /** At about 200 words a minute. */
  minutes: number;
}

const FILES = import.meta.glob<MarkdownInstance<GuideMeta>>('../content/guides/*/*.md', { eager: true });

export const SHOW_DRAFTS = process.env.SHOW_DRAFTS === '1';
export const GUIDES_PATH = '/guides';
export const guidePath = (slug: string) => `${GUIDES_PATH}/${slug}`;

/** The guides in one language, in their set order; drafts only when SHOW_DRAFTS is on. */
export function guides(lang: Lang): Guide[] {
  return Object.entries(FILES)
    .map(([file, md]) => {
      const [, slug, fileLang] = /guides\/([a-z0-9-]+)\/(bn|en)\.md$/.exec(file) ?? [];
      if (!slug || fileLang !== lang) return null;
      const words = md.rawContent().split(/\s+/).filter(Boolean).length;
      return { slug, lang, meta: md.frontmatter, html: md.compiledContent, minutes: Math.max(1, Math.round(words / 200)) };
    })
    .filter((g): g is Guide => g !== null && (SHOW_DRAFTS || !g.meta.draft))
    .sort((a, b) => (a.meta.order ?? 99) - (b.meta.order ?? 99) || a.slug.localeCompare(b.slug));
}

export const guide = (lang: Lang, slug: string) => guides(lang).find((g) => g.slug === slug);
