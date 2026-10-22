import { describe, expect, it } from 'vitest';
import { effectiveDate, extractBhoriPrices, parseUnbArticle, parseUnbSearch } from '../src/sources/bajusMirror';
import { FIXTURES, UNB_ARTICLE_URL } from './helpers';

describe('parseUnbSearch', () => {
  it('picks the newest gold price article', async () => {
    expect(await parseUnbSearch(FIXTURES.unbSearch)).toBe(UNB_ARTICLE_URL);
  });

  it('fails loudly when there are no gold price articles', async () => {
    await expect(parseUnbSearch('<html><body><a href="/x/1">Cricket</a></body></html>')).rejects.toThrow(
      /no gold price article/,
    );
  });
});

describe('parseUnbArticle', () => {
  it('reads per-bhori gold prices and skips silver whose karat ladder is broken', async () => {
    const { points, warnings } = await parseUnbArticle(FIXTURES.unbArticle, UNB_ARTICLE_URL);
    const v = Object.fromEntries(points.map((p) => [p.series_key, p.value]));

    expect(v).toEqual({
      gold_22k: 228_031,
      gold_21k: 217_767,
      gold_18k: 187_032,
      gold_traditional: 152_798,
    });
    expect(new Set(points.map((p) => p.date))).toEqual(new Set(['2026-10-13']));
    expect(points[0]!.meta).toMatchObject({ source: 'mirror', mirror: 'unb', url: UNB_ARTICLE_URL });
    // The article says 21K silver is Tk 4,966 while 22K is Tk 4,199: a typo, so silver is not trusted.
    expect(warnings).toEqual([expect.stringMatching(/UNB silver skipped: .*silver 21k \(4966\) is not below 22k \(4199\)/)]);
  });

  it('rejects an article that is not about BAJUS prices', async () => {
    const page = '<div class="news-article-text-block"><p>World gold prices rose.</p></div>';
    await expect(parseUnbArticle(page, 'https://unb.com.bd/x/1')).rejects.toThrow(/does not mention BAJUS/);
  });
});

describe('extractBhoriPrices', () => {
  it('takes the first mention of each karat and the largest amount near it', () => {
    const text =
      'BAJUS raised 22-carat gold by Tk 1,050 to Tk 200,000 per bhori. 21-carat gold will cost Tk 190,000, ' +
      'up Tk 900. The price of 18-carat gold is Tk 160,000, while gold of the traditional method costs Tk 130,000. ' +
      'Earlier, 22-carat gold was Tk 198,950.';
    expect(Object.fromEntries(extractBhoriPrices(text).gold)).toEqual({
      '22k': 200_000,
      '21k': 190_000,
      '18k': 160_000,
      traditional: 130_000,
    });
  });
});

describe('effectiveDate', () => {
  // 2026-10-13 was a Tuesday.
  it('resolves the weekday named in the article around the publish date', () => {
    expect(effectiveDate('The new prices took effect from 10am Tuesday.', '2026-10-13')).toBe('2026-10-13');
    expect(effectiveDate('The new prices will be effective across the country from Thursday.', '2026-10-13')).toBe('2026-10-15');
    expect(effectiveDate('The prices took effect from Monday.', '2026-10-13')).toBe('2026-10-12');
  });
  it('handles today, tomorrow and no mention', () => {
    expect(effectiveDate('effective from tomorrow', '2026-10-13')).toBe('2026-10-14');
    expect(effectiveDate('effective from today', '2026-10-13')).toBe('2026-10-13');
    expect(effectiveDate('BAJUS cut prices.', '2026-10-13')).toBe('2026-10-13');
  });
});
