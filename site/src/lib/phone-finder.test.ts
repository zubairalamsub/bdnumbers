import { describe, expect, it } from 'vitest';
import { DEFAULT_FINDER, findPhones, finderPrice, finderRow, matchesName, type FinderPhone } from './phone-finder';

const phones: FinderPhone[] = [
  ['Samsung Galaxy A57 5G', '/mobile-price/samsung-galaxy-a57-5g', 'samsung', 75999, 46999, 6],
  ['Samsung Galaxy A07', '/mobile-price/samsung-galaxy-a07', 'samsung', 19499, 16999, 5],
  ['Redmi Note 15 5G', '/mobile-price/redmi-note-15-5g', 'xiaomi', null, 23990, 4],
  ['Samsung Galaxy S26 Ultra 5G', '/mobile-price/samsung-galaxy-s26-ultra-5g', 'samsung', 179999, null, 2],
  ['Samsung Galaxy A52', '/mobile-price/samsung-galaxy-a52', 'samsung', null, null, 0],
];
const names = (list: FinderPhone[]) => list.map((p) => p[0]);

describe('phone finder', () => {
  it('lists by the lowest price, or the lowest official one', () => {
    expect(finderPrice(phones[0]!, false)).toBe(46999);
    expect(finderPrice(phones[0]!, true)).toBe(75999);
    expect(finderPrice(phones[2]!, true)).toBeNull();
  });

  it('finds names from the start of a word', () => {
    expect(matchesName('Samsung Galaxy A57 5G', 'a57')).toBe(true);
    expect(matchesName('Samsung Galaxy A57 5G', 'galaxya57')).toBe(true);
    // "a5" must not match "Ultra 5G".
    expect(matchesName('Samsung Galaxy S26 Ultra 5G', 'galaxy a5')).toBe(false);
  });

  it('puts the phones most shops carry first, and those out of stock everywhere last', () => {
    expect(names(findPhones(phones, DEFAULT_FINDER))).toEqual([
      'Samsung Galaxy A57 5G',
      'Samsung Galaxy A07',
      'Redmi Note 15 5G',
      'Samsung Galaxy S26 Ultra 5G',
      'Samsung Galaxy A52',
    ]);
  });

  it('filters by budget, brand and official price, and sorts by price', () => {
    expect(names(findPhones(phones, { ...DEFAULT_FINDER, budget: '15-25' }))).toEqual(['Samsung Galaxy A07', 'Redmi Note 15 5G']);
    expect(names(findPhones(phones, { ...DEFAULT_FINDER, brand: 'samsung', sort: 'high' }))).toEqual([
      'Samsung Galaxy S26 Ultra 5G',
      'Samsung Galaxy A57 5G',
      'Samsung Galaxy A07',
      'Samsung Galaxy A52',
    ]);
    // Official only: phones without an official price drop out; the A57 now counts at its official price.
    expect(names(findPhones(phones, { ...DEFAULT_FINDER, official: true, sort: 'low' }))).toEqual([
      'Samsung Galaxy A07',
      'Samsung Galaxy A57 5G',
      'Samsung Galaxy S26 Ultra 5G',
    ]);
    expect(findPhones(phones, { ...DEFAULT_FINDER, query: 'iphone' })).toEqual([]);
  });

  it('draws a row with the price, the official one beside it, and nothing unescaped', () => {
    const text = { official: 'Official', other: 'Unofficial/other', out: 'Out of stock' };
    const row = finderRow(phones[0]!, { lang: 'en', digits: 'latn', brands: { samsung: 'Samsung' }, text, official: false });
    expect(row).toContain('href="/mobile-price/samsung-galaxy-a57-5g"');
    expect(row).toContain('৳<span data-num="46999" data-fd="0">46,999</span>');
    expect(row).toContain('Official ৳<span data-num="75999"');
    expect(row).toContain('<span data-num="6" data-fd="0">6</span> shops');
    const odd = finderRow(['A <b>"phone"</b>', '/x', 'samsung', null, 1000, 1], { lang: 'en', digits: 'latn', brands: {}, text, official: false });
    expect(odd).toContain('A &lt;b&gt;&quot;phone&quot;&lt;/b&gt;');
    expect(odd).toContain('1</span> shop<');
  });
});
