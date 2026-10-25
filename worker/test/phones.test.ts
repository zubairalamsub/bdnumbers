import { PHONE_SHOPS, parsePhoneName, type PhoneHistoryResponse, type PhonesResponse } from '@bdnumbers/shared';
import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runBatch } from '../src/cron';
import type { Env } from '../src/env';
import { PAGES_PER_RUN, runShop } from '../src/phones/crawl';
import { listingLinks, productData, productOutcome, sitemapLinks } from '../src/phones/parse';
import { PHONES_HISTORY_KEY, PHONES_KEY, groupOffers, publishPhones, snapshotPhones, withoutOutliers, type OfferRow } from '../src/phones/publish';
import { SHOP_CRAWLS, shopCrawl } from '../src/phones/shops';
import agA57 from './fixtures/applegadgets-galaxy-a57-5g-2026-10-25.html?raw';
import dazzleX6e from './fixtures/dazzle-honor-x6e-official-2026-10-25.html?raw';
import dazzleList from './fixtures/dazzle-phones-page-1-2026-10-25.html?raw';
import ggA57 from './fixtures/gadgetandgear-galaxy-a57-5g-12gb-256gb-2026-10-25.html?raw';
import kryNothing from './fixtures/kry-nothing-phone-4a-2026-10-25.html?raw';
import krySitemap from './fixtures/kry-sitemap-2026-10-25.xml?raw';
import rioHonor from './fixtures/rio-honor-200-5g-2026-10-25.html?raw';
import rioList from './fixtures/rio-mobile-page-1-2026-10-25.html?raw';
import sumashA08 from './fixtures/sumash-galaxy-a08-official-2026-10-25.html?raw';
import sumashIqoo from './fixtures/sumash-iqoo-16-2026-10-25.html?raw';
import sumashList from './fixtures/sumash-smartphone-page-1-2026-10-25.html?raw';
import { DEPLOY_HOOK, allSourceRoutes, calledUrls, html, httpStatus, mockFetch, request, resetStorage } from './helpers';

beforeEach(resetStorage);
afterEach(() => vi.restoreAllMocks());

const shop = (id: string) => shopCrawl(id)!;

describe('parsePhoneName', () => {
  const cases: Array<[string, string | null, string, string | null, string | null, string | null]> = [
    // raw name, brand field → key, network, variant, kind
    ['Samsung Galaxy A57 5G (12/256GB)', 'Samsung', 'samsunggalaxya57', '5g', '12/256GB', null],
    ['Galaxy A57 5G', 'SAMSUNG', 'samsunggalaxya57', '5g', null, null],
    ['Samsung Galaxy A57 5G Price in Bangladesh', null, 'samsunggalaxya57', '5g', null, null],
    ['samsung s25 plus official', null, 'samsunggalaxys25plus', null, null, 'official'],
    ['Galaxy A08 (Official)', 'Samsung', 'samsunggalaxya08', null, null, 'official'],
    ['Honor X6e Official', 'Honor', 'honorx6e', null, null, 'official'],
    ['Nothing Phone 4a', 'Kry International', 'nothingphone4a', null, null, null],
    ['NOTHING PHONE (2a) PLUS', null, 'nothingphone2aplus', null, null, null],
    ['iPhone 17 Pro Max 256GB', null, 'iphone17promax', null, '256GB', null],
    ['Apple iPhone 16 128GB', null, 'iphone16', null, '128GB', null],
    ['Xiaomi Redmi Note 15 Pro+ 5G 8GB RAM 256GB ROM', null, 'redminote15proplus', '5g', '8/256GB', null],
    ['Redmi Note 15 Pro Plus 5G', null, 'redminote15proplus', '5g', null, null],
    ['Vivo iQOO Z10 5G Unofficial', null, 'iqooz10', '5g', null, 'unofficial'],
    ['Oppo Reno12 F 5G', null, 'opporeno12f', '5g', null, null],
    ['OPPO Reno 12F 5G', null, 'opporeno12f', '5g', null, null],
    ['Motorola Moto G85 5G', null, 'motog85', '5g', null, null],
    ['Moto G85', null, 'motog85', null, null, null],
    ['Motorola Edge 60 Stylus', null, 'motorolaedge60stylus', null, null, null],
    ['ZTE nubia A36', null, 'nubiaa36', null, null, null],
    ['Pixel 10a', 'Google', 'googlepixel10a', null, null, null],
    ['Samsung Galaxy S24 (Snapdragon)', null, 'samsunggalaxys24', null, null, null],
    ['Nokia 3.4 Official', null, 'nokia3.4', null, null, 'official'],
    ['Galaxy S26 Ultra 12GB 1TB', null, 'samsunggalaxys26ultra', null, '12/1TB', null],
  ];
  it.each(cases)('%s', (raw, brand, key, network, variant, kind) => {
    expect(parsePhoneName(raw, brand)).toMatchObject({ key, network, variant, kind });
  });

  it('writes the model the way people do', () => {
    expect(parsePhoneName('HONOR X6b OFFICIAL')?.name).toBe('Honor X6b');
    expect(parsePhoneName('Google Pixel 10a 5G')?.name).toBe('Google Pixel 10a 5G');
    expect(parsePhoneName('Galaxy A57 5G')?.name).toBe('Samsung Galaxy A57 5G');
    expect(parsePhoneName('ZTE nubia RedMagic 11S Pro')?.name).toBe('Nubia RedMagic 11S Pro');
    expect(parsePhoneName('Nokia 3.4 Official')?.name).toBe('Nokia 3.4');
  });

  it('turns away accessories, tablets, watches and other gadgets', () => {
    for (const name of [
      'Spigen Nano Pop MagFit Case for iPhone 18 Pro',
      'iPhone 17 Pro Max Silicone Case',
      'Samsung Galaxy Tab S10 FE',
      'Galaxy Watch 8 Classic',
      'Galaxy Buds 3 Pro',
      'Redmi Pad 2',
      'OnePlus Pad 4 Official',
      'Xiaomi Smart Band 9',
      'Xiaomi Mijia T300 Sonic Electric Toothbrush',
      'Xiaomi Solove F5 5W USB Desktop Fan',
      'Sony WH-1000XM5',
      'Samsung 25W Travel Adapter',
      'Huawei FreeBuds 6i',
      'Apple Watch Series 11',
      'Anker PowerCore 10000',
    ]) {
      expect(parsePhoneName(name), name).toBeNull();
    }
  });
});

describe('shop pages', () => {
  it('match the shops on the site', () => {
    expect(SHOP_CRAWLS.map((s) => s.id)).toEqual(PHONE_SHOPS.map((s) => s.id));
  });

  it('read listing pages', () => {
    const rio = listingLinks(shop('rio'), rioList);
    expect(rio).toHaveLength(16);
    expect(rio[0]).toBe('https://riointernational.com.bd/product/honor-200-5g');
    expect(rio).toContain('https://riointernational.com.bd/product/samsung-galaxy-a57-5g');

    const sumash = listingLinks(shop('sumash'), sumashList);
    expect(sumash).toHaveLength(12);
    expect(sumash[0]).toBe('https://www.sumashtech.com/product/meizu-note-21-pro');

    const dazzle = listingLinks(shop('dazzle'), dazzleList);
    expect(dazzle).toHaveLength(12);
    expect(dazzle).toContain('https://dazzle.com.bd/product/honor-x6e-official-price-in-bangladesh');

    expect(listingLinks(shop('rio'), '<html><body>No products</body></html>')).toEqual([]);
  });

  it('reads a sitemap, keeping phones only', () => {
    const links = sitemapLinks(shop('kry'), krySitemap);
    expect(links.length).toBeGreaterThan(300);
    expect(links).toContain('https://kryinternational.com/products/nothing-phone-4a');
    expect(links).toContain('https://kryinternational.com/products/honor-x9d-official');
    expect(links).not.toContain('https://kryinternational.com/products/honor-pad-10-official');
    expect(links.some((u) => u.includes('/products/category/'))).toBe(false);
    expect(() => sitemapLinks(shop('kry'), '<html>Just a moment...</html>')).toThrow(/not a <urlset>/);
  });

  it('read product pages', () => {
    expect(productOutcome(productData(rioHonor))).toEqual({
      status: 'ok',
      offer: expect.objectContaining({ key: 'honor200', network: '5g', display: 'Honor 200 5G', price: 31499, stock: 'in', kind: null }),
    });
    expect(productOutcome(productData(sumashA08))).toEqual({
      status: 'ok',
      offer: expect.objectContaining({ key: 'samsunggalaxya08', price: 24999, kind: 'official', display: 'Samsung Galaxy A08' }),
    });
    expect(productOutcome(productData(dazzleX6e))).toEqual({
      status: 'ok',
      offer: expect.objectContaining({ key: 'honorx6e', price: 23990, kind: 'official' }),
    });
    expect(productOutcome(productData(agA57))).toEqual({
      status: 'ok',
      offer: expect.objectContaining({ key: 'samsunggalaxya57', network: '5g', price: 47500, stock: 'in' }),
    });
    expect(productOutcome(productData(ggA57))).toEqual({
      status: 'ok',
      offer: expect.objectContaining({ key: 'samsunggalaxya57', variant: '12/256GB', price: 88199, stock: 'in' }),
    });
    // KRY gives a range over the variants (AggregateOffer) and its own name as the brand.
    expect(productOutcome(productData(kryNothing))).toEqual({
      status: 'ok',
      offer: expect.objectContaining({ key: 'nothingphone4a', brand: 'nothing', price: 48499, high: 54999 }),
    });
    // Announced but not priced yet.
    expect(productOutcome(productData(sumashIqoo))).toEqual({ status: 'no_price', name: 'iQOO 16' });
  });

  it('fail loudly on a page without product data', () => {
    expect(() => productData('<html><title>Just a moment...</title></html>')).toThrow(/no Product JSON-LD/);
  });
});

const offer = (o: Partial<OfferRow> & Pick<OfferRow, 'url' | 'shop' | 'model_key' | 'display' | 'price'>): OfferRow => ({
  name: o.display,
  network: null,
  brand: 'samsung',
  variant: null,
  kind: null,
  high_price: null,
  stock: 'in',
  first_seen: '2026-10-25',
  changed_at: '2026-10-25T00:00:00.000Z',
  seen_at: '2026-10-25T00:00:00.000Z',
  ...o,
});

describe('groupOffers', () => {
  it('puts one phone from different shops together, with or without "5G"', () => {
    const groups = groupOffers([
      offer({ url: 'a', shop: 'applegadgets', model_key: 'samsunggalaxya57', network: '5g', display: 'Samsung Galaxy A57 5G', price: 47500 }),
      offer({ url: 'b', shop: 'gadgetandgear', model_key: 'samsunggalaxya57', network: '5g', display: 'Samsung Galaxy A57 5G', price: 88199 }),
      offer({ url: 'c', shop: 'sumash', model_key: 'samsunggalaxya57', display: 'Samsung Galaxy A57', price: 46999 }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ key: 'samsunggalaxya575g', name: 'Samsung Galaxy A57 5G' });
    expect(groups[0]!.offers).toHaveLength(3);
  });

  it('leaves out a "price" that is really a booking deposit', () => {
    const rows = [
      offer({ url: 'a', shop: 'dazzle', model_key: 'iphoneduo', display: 'iPhone Duo', price: 389990, brand: 'apple' }),
      offer({ url: 'b', shop: 'kry', model_key: 'iphoneduo', display: 'iPhone Duo', price: 419999, brand: 'apple' }),
      offer({ url: 'c', shop: 'applegadgets', model_key: 'iphoneduo', display: 'iPhone Duo', price: 10000, brand: 'apple', stock: 'pre' }),
    ];
    expect(withoutOutliers(rows).map((o) => o.shop)).toEqual(['dazzle', 'kry']);
    // An unofficial phone a third cheaper than the official one is a real price.
    expect(withoutOutliers([rows[0]!, { ...rows[1]!, price: 260000 }])).toHaveLength(2);
  });

  it('keeps 4G and 5G versions apart when shops sell both', () => {
    const groups = groupOffers([
      offer({ url: 'a', shop: 'rio', model_key: 'redminote15', network: '4g', display: 'Redmi Note 15 4G', price: 21000, brand: 'xiaomi' }),
      offer({ url: 'b', shop: 'rio', model_key: 'redminote15', network: '5g', display: 'Redmi Note 15 5G', price: 25000, brand: 'xiaomi' }),
      offer({ url: 'c', shop: 'sumash', model_key: 'redminote15', display: 'Redmi Note 15', price: 22000, brand: 'xiaomi' }),
    ]);
    expect(groups.map((g) => g.key).sort()).toEqual(['redminote15', 'redminote154g', 'redminote155g']);
  });
});

describe('runShop', () => {
  const RIO_PAGE = (n: number) => `https://riointernational.com.bd/category/mobile/?page=${n}`;
  const HONOR = 'https://riointernational.com.bd/product/honor-200-5g';
  const T0 = new Date('2026-10-25T03:15:00Z');
  const hours = (h: number) => new Date(T0.getTime() + h * 3_600_000);

  const pages = async () =>
    (await env.DB.prepare('SELECT url, kind, status, fails FROM phone_pages ORDER BY url').all<{ url: string; kind: string; status: string; fails: number }>())
      .results;

  it('finds phones on the listing, then reads their pages and keeps a price history', async () => {
    mockFetch({
      [RIO_PAGE(1)]: html(rioList),
      [RIO_PAGE(2)]: html('<html><body>No more products</body></html>'),
      [HONOR]: html(rioHonor),
      'https://riointernational.com.bd/product/': httpStatus(404),
    });

    // First run: the listing (page 1 has 16 phones; page 2 is past the end). No product pages yet.
    const first = await runShop(env, 'rio', 'test', undefined, T0);
    expect(first).toMatchObject({ source: 'phones:rio', ok: true, error: null, written: 0 });
    const queue = await pages();
    expect(queue.filter((p) => p.kind === 'listing').map((p) => p.status)).toEqual(['ok', 'ok']);
    expect(queue.filter((p) => p.kind === 'product')).toHaveLength(16);

    // An hour later: the product pages. Honor 200 has a price; the rest 404 once (not yet given up on).
    const second = await runShop(env, 'rio', 'test', undefined, hours(1));
    expect(second).toMatchObject({ ok: true, error: null, written: 1 });
    const stored = await env.DB.prepare('SELECT * FROM phone_offers').all();
    expect(stored.results).toEqual([
      expect.objectContaining({ url: HONOR, shop: 'rio', model_key: 'honor200', network: '5g', display: 'Honor 200 5G', price: 31499, stock: 'in' }),
    ]);
    expect((await pages()).filter((p) => p.status === 'error' && p.fails === 1)).toHaveLength(15);

    // Next day the price drops: one new price-log row, dated in Dhaka time.
    vi.restoreAllMocks();
    mockFetch({
      [RIO_PAGE(1)]: html(rioList),
      [RIO_PAGE(2)]: html('<html></html>'),
      [HONOR]: html(rioHonor.replace('"price": 31499.00', '"price": 30999.00')),
      'https://riointernational.com.bd/product/': httpStatus(404),
    });
    const third = await runShop(env, 'rio', 'test', undefined, hours(27));
    expect(third.written).toBe(1);
    const log = await env.DB.prepare('SELECT date, price, stock FROM phone_price_log WHERE url = ?1 ORDER BY date').bind(HONOR).all();
    expect(log.results).toEqual([
      { date: '2026-10-25', price: 31499, stock: 'in' },
      { date: '2026-10-26', price: 30999, stock: 'in' },
    ]);
    // The other pages 404ed twice: given up on.
    expect((await pages()).filter((p) => p.status === 'gone')).toHaveLength(15);
  });

  it(`reads at most ${PAGES_PER_RUN} pages a run (each is one of the invocation's 50 subrequests)`, async () => {
    // Every listing page "has phones", so the listing would go on for ever.
    const spy = mockFetch({ 'https://riointernational.com.bd/category/mobile/': html(rioList) });
    expect(await runShop(env, 'rio', 'test', undefined, T0)).toMatchObject({ ok: true });
    expect(calledUrls(spy)).toHaveLength(PAGES_PER_RUN);
    expect(calledUrls(spy).at(-1)).toBe(RIO_PAGE(PAGES_PER_RUN));
  });

  it('passes over old product pages without product data, but fails when no page has any', async () => {
    mockFetch({
      [RIO_PAGE(1)]: html(rioList),
      [RIO_PAGE(2)]: html('<html></html>'),
      [HONOR]: html(rioHonor),
      'https://riointernational.com.bd/product/': html('<html><title>Discontinued phone</title></html>'),
    });
    await runShop(env, 'rio', 'test', undefined, T0);
    // One price among sixteen pages: the other fifteen are set aside for a few days, not errors.
    expect(await runShop(env, 'rio', 'test', undefined, hours(1))).toMatchObject({ ok: true, error: null, written: 1 });
    expect((await pages()).filter((p) => p.status === 'no_price')).toHaveLength(15);

    await resetStorage();
    vi.restoreAllMocks();
    mockFetch({
      [RIO_PAGE(1)]: html(rioList),
      [RIO_PAGE(2)]: html('<html></html>'),
      'https://riointernational.com.bd/product/': html('<html><title>Redesigned</title></html>'),
    });
    await runShop(env, 'rio', 'test', undefined, T0);
    expect(await runShop(env, 'rio', 'test', undefined, hours(1))).toMatchObject({ ok: false, error: expect.stringMatching(/^no prices on 16 product pages/) });
  });

  it('stops after three blocked answers in a row instead of reading on', async () => {
    mockFetch({ [RIO_PAGE(1)]: html(rioList), [RIO_PAGE(2)]: html('<html></html>') });
    await runShop(env, 'rio', 'test', undefined, T0);
    vi.restoreAllMocks();
    const spy = mockFetch({ 'https://riointernational.com.bd/': httpStatus(403) });
    const result = await runShop(env, 'rio', 'test', undefined, hours(1));
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/^all 3 pages failed; .*HTTP 403/) });
    // Three pages, each fetched twice (one retry).
    expect(calledUrls(spy)).toHaveLength(6);
  });

  it('leaves a shop alone while its previous run is still going', async () => {
    await env.DB.prepare("INSERT INTO runs (source, started_at, trigger) VALUES ('phones:rio', ?1, 'cron')").bind(T0.toISOString()).run();
    const spy = mockFetch({});
    expect(await runShop(env, 'rio', 'test', undefined, new Date(T0.getTime() + 60_000))).toMatchObject({ ok: true, run_id: null, written: 0 });
    expect(calledUrls(spy)).toHaveLength(0);
    // A run left open for over half an hour died (CPU limit, deploy); the next one goes ahead.
    mockFetch({ [RIO_PAGE(1)]: html(rioList), [RIO_PAGE(2)]: html('<html></html>') });
    expect(await runShop(env, 'rio', 'test', undefined, hours(1))).toMatchObject({ ok: true, run_id: expect.any(Number) });
  });

  it('fails when the shop cannot be read at all', async () => {
    mockFetch({ [RIO_PAGE(1)]: httpStatus(403) });
    const result = await runShop(env, 'rio', 'test', undefined, T0);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/HTTP 403/);
    const run = await env.DB.prepare("SELECT ok, error FROM runs WHERE source = 'phones:rio'").first<{ ok: number; error: string }>();
    expect(run).toMatchObject({ ok: 0 });
  });

  it('fails when the listing has no phones (the page changed)', async () => {
    mockFetch({ [RIO_PAGE(1)]: html('<html><body>Redesigned</body></html>') });
    expect(await runShop(env, 'rio', 'test', undefined, T0)).toMatchObject({ ok: false, error: `no phones found on ${RIO_PAGE(1)}` });
  });
});

describe('hourly batch', () => {
  it('runs every shop, each logged as a run of its own', async () => {
    // Shops unreachable: every shop run fails, and the other hourly work carries on.
    mockFetch({ ...allSourceRoutes(), 'https://': httpStatus(503) });
    const batch = await runBatch({ ...env, PHONE_CRAWL: 'on' } as Env, 'hourly', 'test');
    expect(batch.phones).toBe('crawled');
    const shops = batch.results.filter((r) => r.source.startsWith('phones:'));
    expect(shops.map((r) => r.source).sort()).toEqual(PHONE_SHOPS.map((s) => `phones:${s.id}`));
    expect(shops.every((r) => !r.ok && /HTTP 503/.test(r.error ?? ''))).toBe(true);
    expect(batch.results.filter((r) => !r.source.startsWith('phones:')).every((r) => r.ok)).toBe(true);
  });

  it('leaves the shops alone when the crawl is switched off', async () => {
    const spy = mockFetch(allSourceRoutes());
    const batch = await runBatch(env, 'hourly', 'test');
    expect(batch.phones).toBe('skipped');
    expect(calledUrls(spy).some((u) => PHONE_SHOPS.some((s) => u.startsWith(s.url)))).toBe(false);
  });
});

describe('publishing', () => {
  async function seed() {
    const rows = [
      ['https://www.applegadgetsbd.com/product/galaxy-a57-5g', 'applegadgets', 'Galaxy A57 5G', 'samsunggalaxya57', '5g', 'Samsung Galaxy A57 5G', null, null, 47500, 'in'],
      ['https://gadgetandgear.com/product/galaxy-a57-5g-12gb-256gb', 'gadgetandgear', 'Samsung Galaxy A57 5G (12/256GB)', 'samsunggalaxya57', '5g', 'Samsung Galaxy A57 5G', '12/256GB', null, 88199, 'in'],
      ['https://www.sumashtech.com/product/galaxy-a57-official', 'sumash', 'Galaxy A57 (Official)', 'samsunggalaxya57', null, 'Samsung Galaxy A57', null, 'official', 52999, 'in'],
      ['https://dazzle.com.bd/product/galaxy-a57', 'dazzle', 'Samsung Galaxy A57', 'samsunggalaxya57', null, 'Samsung Galaxy A57', null, null, 45000, 'out'],
    ] as const;
    const stmt = env.DB.prepare(
      `INSERT INTO phone_offers (url, shop, name, model_key, network, brand, display, variant, kind, price, stock, first_seen, changed_at, seen_at)
       VALUES (?1, ?2, ?3, ?4, ?5, 'samsung', ?6, ?7, ?8, ?9, ?10, '2026-10-25', ?11, ?11)`,
    );
    const now = new Date().toISOString();
    await env.DB.batch(rows.map((r) => stmt.bind(...r, now)));
  }

  it('builds phones.json: one model, every shop, lowest prices by kind', async () => {
    await seed();
    const outcome = await publishPhones(env, new Date());
    expect(outcome).toMatchObject({ models: 1, offers: 4 });
    const phones = await env.CACHE.get<PhonesResponse>(PHONES_KEY, 'json');
    const a57 = phones!.models[0]!;
    expect(a57).toMatchObject({ slug: 'samsung-galaxy-a57-5g', name: 'Samsung Galaxy A57 5G', brand: 'samsung', official: 52999, other: 47500, shops: 3 });
    // In stock first, cheapest first; Dazzle's out-of-stock offer last.
    expect(a57.offers.map((o) => o.shop)).toEqual(['applegadgets', 'sumash', 'gadgetandgear', 'dazzle']);

    const res = await request('/api/phones.json');
    expect(res.status).toBe(200);
    expect(((await res.json()) as PhonesResponse).models).toHaveLength(1);
  });

  it('keeps the slug once given, and records the daily lowest prices', async () => {
    await seed();
    await publishPhones(env, new Date('2026-10-25T02:00:00Z'));
    await snapshotPhones(env, new Date('2026-10-25T02:00:00Z'));
    await env.DB.prepare("UPDATE phone_offers SET price = 44999 WHERE shop = 'applegadgets'").run();
    await publishPhones(env, new Date('2026-10-26T02:00:00Z'));
    await snapshotPhones(env, new Date('2026-10-26T02:00:00Z'));
    await publishPhones(env, new Date('2026-10-27T02:00:00Z'));
    await snapshotPhones(env, new Date('2026-10-27T02:00:00Z'));

    const history = await env.CACHE.get<PhoneHistoryResponse>(PHONES_HISTORY_KEY, 'json');
    // Only the days a lowest price moved.
    expect(history!.daily['samsunggalaxya575g']).toEqual([
      ['2026-10-25', 52999, 47500],
      ['2026-10-26', 52999, 44999],
    ]);
    const models = await env.DB.prepare('SELECT key, slug FROM phone_models').all();
    expect(models.results).toEqual([{ key: 'samsunggalaxya575g', slug: 'samsung-galaxy-a57-5g' }]);
    expect((await request('/api/phones/history.json')).status).toBe(200);
  });

  it('rebuilds the site from the daily batch when only phone prices changed', async () => {
    const on = { ...env, PHONE_CRAWL: 'on' } as Env;
    await seed();
    const spy = mockFetch(allSourceRoutes());
    // The series are already stored, so the morning batch writes nothing new for them.
    await runBatch(on, 'daily', 'test');
    spy.mockClear();
    const quiet = await runBatch(on, 'daily', 'test');
    expect(quiet).toMatchObject({ written: 0, deploy: 'skipped', phones: { models: 1, changed: false } });

    await env.DB.prepare("UPDATE phone_offers SET price = 44999 WHERE shop = 'applegadgets'").run();
    const moved = await runBatch(on, 'daily', 'test');
    expect(moved).toMatchObject({ written: 0, deploy: 'triggered', phones: { models: 1, changed: true } });
    expect(calledUrls(spy)).toContain(DEPLOY_HOOK);
  });

  it('answers 404 before the first crawl', async () => {
    // (A query of its own: the edge cache may hold an earlier test's 200 under the same cache version.)
    expect((await request('/api/phones.json?before-crawl')).status).toBe(404);
  });
});
