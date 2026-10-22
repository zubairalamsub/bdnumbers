import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { INDEXABLE_PAGES } from './site-pages';
import { DESCRIPTION_MAX, KEYWORDS, TITLE_MAX, faqsFor, fitDescription, fitTitle, textLength } from './seo';

describe('textLength', () => {
  it('counts what a reader sees as one character', () => {
    expect(textLength('ক্ষ')).toBe(1);
    expect(textLength('সঞ্চয়পত্র')).toBe(5);
    expect(textLength('Tk 123')).toBe(6);
  });
});

describe('fitTitle', () => {
  it('adds the site name when it fits', () => {
    expect(fitTitle('Dollar rate today: Tk 123.65')).toBe('Dollar rate today: Tk 123.65 | bdrate.fyi');
  });
  it('drops the site name, then falls back to a shorter variant', () => {
    const long = 'x'.repeat(55);
    expect(fitTitle([long, 'short'])).toBe('short | bdrate.fyi');
    expect(fitTitle(long)).toBe(long);
  });
  it('cuts the last variant at a word when nothing fits', () => {
    const t = fitTitle(['word '.repeat(20)]);
    expect(textLength(t)).toBeLessThanOrEqual(TITLE_MAX);
    expect(t.endsWith('word…')).toBe(true);
  });
});

describe('fitDescription', () => {
  it('cuts at the last full sentence that fits', () => {
    const first = `${'ক'.repeat(100)}।`;
    const d = fitDescription(`${first} ${'খ'.repeat(100)}।`);
    expect(d).toBe(first);
    expect(textLength(d)).toBeLessThanOrEqual(DESCRIPTION_MAX);
  });
});

describe('FAQs', () => {
  const files = fs.readdirSync('seo/faqs').filter((f) => f.endsWith('.json'));

  it('have five questions per language on every page', () => {
    expect(files.length).toBeGreaterThanOrEqual(11);
    for (const f of files) {
      const faq = JSON.parse(fs.readFileSync(`seo/faqs/${f}`, 'utf8'));
      expect(faq.bn, f).toHaveLength(5);
      expect(faq.en, f).toHaveLength(5);
    }
  });

  it('fill placeholders and refuse unknown ones', () => {
    const vars = (name: string) => ({ fuel_diesel: '135', 'fuel_diesel:date': '21 Sep 2026' })[name];
    expect(() => faqsFor('fuel', 'en', vars)).toThrow(/\{fuel_octane\}/);
    const all = (name: string) => vars(name) ?? 'X';
    expect(faqsFor('fuel', 'en', all)[0]!.a).toContain('Tk 135 a litre');
  });
});

describe('keywords.json', () => {
  it('has an entry for every indexable page', () => {
    for (const { path } of INDEXABLE_PAGES) {
      const key = path.startsWith('/prayer-times/') ? '/prayer-times/{district}' : path;
      expect(KEYWORDS[key], path).toBeDefined();
    }
  });
});
