// Turn the crawled offers into what the site shows: phones.json (every model with each shop's price),
// rebuilt whenever a crawl changed something, and once a day the price history (phone_daily) and
// phones-history.json. Models get a fixed slug the first time they are seen (phone_models).
import {
  dhakaDate,
  phoneSlug,
  type PhoneChange,
  type PhoneHistoryResponse,
  type PhoneKind,
  type PhoneModel,
  type PhoneOffer,
  type PhonesResponse,
  type PhoneStock,
} from '@bdnumbers/shared';
import { runBatched } from '../db';
import type { Env } from '../env';

export const PHONES_KEY = 'phones.json';
export const PHONES_HISTORY_KEY = 'phones-history.json';
/** Offers not confirmed for this long drop out of the comparison (the page stopped loading, say). */
const STALE_AFTER_DAYS = 7;
const CHANGES_DAYS = 90;
const CHANGES_PER_MODEL = 20;

export interface OfferRow {
  url: string;
  shop: string;
  name: string;
  model_key: string;
  network: string | null;
  brand: string;
  display: string;
  variant: string | null;
  kind: PhoneKind | null;
  price: number;
  high_price: number | null;
  stock: PhoneStock;
  first_seen: string;
  changed_at: string;
  seen_at: string;
}

export interface OfferGroup {
  key: string;
  name: string;
  brand: string;
  offers: OfferRow[];
}

/** The most common value; ties go to the shorter, then the alphabetically first. */
function vote(values: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length || a[0].localeCompare(b[0]))[0]![0];
}

/**
 * Group offers into models. Offers share a model when their keys match; "5G"/"4G" only splits a model
 * when shops list both a 4G and a 5G version of it (then offers that don't say stay apart, unplaced).
 */
export function groupOffers(rows: readonly OfferRow[]): OfferGroup[] {
  const byKey = new Map<string, OfferRow[]>();
  for (const r of rows) byKey.set(r.model_key, [...(byKey.get(r.model_key) ?? []), r]);
  const groups: OfferGroup[] = [];
  for (const [key, offers] of byKey) {
    const networks = [...new Set(offers.map((o) => o.network).filter((n): n is string => n !== null))];
    const parts =
      networks.length <= 1
        ? [{ key: key + (networks[0] ?? ''), offers }]
        : [null, ...networks].map((n) => ({ key: key + (n ?? ''), offers: offers.filter((o) => o.network === n) })).filter((p) => p.offers.length > 0);
    for (const part of parts) {
      const named = networks.length === 1 ? part.offers.filter((o) => o.network !== null) : part.offers;
      groups.push({ key: part.key, name: vote(named.map((o) => o.display)), brand: vote(part.offers.map((o) => o.brand)), offers: part.offers });
    }
  }
  return groups;
}

const toOffer = (r: OfferRow): PhoneOffer => ({
  shop: r.shop,
  url: r.url,
  name: r.name,
  variant: r.variant,
  kind: r.kind,
  price: r.price,
  high: r.high_price,
  stock: r.stock,
  seen_at: r.seen_at,
  changed_at: r.changed_at,
});

const lowest = (offers: readonly OfferRow[]) => (offers.length > 0 ? Math.min(...offers.map((o) => o.price)) : null);

export interface PublishOutcome {
  models: number;
  offers: number;
  /** Changes whenever any shop's price or stock does (not when a price is merely re-confirmed). */
  hash: string;
}

/** Rebuild phones.json in KV. */
export async function publishPhones(env: Env, now = new Date()): Promise<PublishOutcome> {
  const since = new Date(now.getTime() - STALE_AFTER_DAYS * 86_400_000).toISOString();
  const [offerRows, modelRows] = await env.DB.batch([
    env.DB.prepare(
      `SELECT url, shop, name, model_key, network, brand, display, variant, kind, price, high_price, stock, first_seen,
         changed_at, seen_at
       FROM phone_offers WHERE removed = 0 AND seen_at >= ?1`,
    ).bind(since),
    env.DB.prepare('SELECT key, slug, name, first_seen FROM phone_models'),
  ]);
  const groups = groupOffers(offerRows!.results as OfferRow[]);
  const known = new Map((modelRows!.results as Array<{ key: string; slug: string; name: string; first_seen: string }>).map((m) => [m.key, m]));
  const slugs = new Set([...known.values()].map((m) => m.slug));

  const today = dhakaDate(now);
  const upsertModel = env.DB.prepare(
    `INSERT INTO phone_models (key, slug, name, brand, first_seen) VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT (key) DO UPDATE SET name = excluded.name, brand = excluded.brand`,
  );
  const statements: D1PreparedStatement[] = [];
  const models: PhoneModel[] = groups.map((g) => {
    let model = known.get(g.key);
    if (!model) {
      // A new model's slug is fixed now; a clash (two keys, one name) gets a number.
      let slug = phoneSlug(g.name);
      for (let i = 2; slugs.has(slug); i++) slug = `${phoneSlug(g.name)}-${i}`;
      slugs.add(slug);
      model = { key: g.key, slug, name: g.name, first_seen: today };
      statements.push(upsertModel.bind(g.key, slug, g.name, g.brand, today));
    } else if (model.name !== g.name) {
      statements.push(upsertModel.bind(g.key, model.slug, g.name, g.brand, model.first_seen));
    }
    const inStock = g.offers.filter((o) => o.stock === 'in');
    const offers = [...g.offers].sort(
      (a, b) => Number(a.stock !== 'in') - Number(b.stock !== 'in') || a.price - b.price || a.shop.localeCompare(b.shop),
    );
    return {
      key: g.key,
      slug: model.slug,
      name: g.name,
      brand: g.brand,
      official: lowest(inStock.filter((o) => o.kind === 'official')),
      other: lowest(inStock.filter((o) => o.kind !== 'official')),
      shops: new Set(inStock.map((o) => o.shop)).size,
      offers: offers.map(toOffer),
      first_seen: model.first_seen,
    };
  });
  models.sort((a, b) => a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name));
  await runBatched(env.DB, statements);

  const body: PhonesResponse = { generated_at: now.toISOString(), models };
  await env.CACHE.put(PHONES_KEY, JSON.stringify(body));
  const prices = models.flatMap((m) => m.offers.map((o) => `${m.key} ${o.url} ${o.price} ${o.stock}`)).join('\n');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(prices));
  return {
    models: models.length,
    offers: models.reduce((n, m) => n + m.offers.length, 0),
    hash: [...new Uint8Array(digest).slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join(''),
  };
}

/**
 * Once a day: record each model's lowest prices (phone_daily) from phones.json, then rebuild
 * phones-history.json from phone_daily (only the days a price moved) and the shops' price log.
 */
export async function snapshotPhones(env: Env, now = new Date()): Promise<{ models: number }> {
  const phones = await env.CACHE.get<PhonesResponse>(PHONES_KEY, 'json');
  if (!phones) return { models: 0 };
  const today = dhakaDate(now);
  const day = env.DB.prepare(
    `INSERT INTO phone_daily (model_key, date, official, other, shops) VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT (model_key, date) DO UPDATE SET official = excluded.official, other = excluded.other, shops = excluded.shops`,
  );
  await runBatched(
    env.DB,
    phones.models.map((m) => day.bind(m.key, today, m.official, m.other, m.shops)),
  );

  const cutoff = dhakaDate(new Date(now.getTime() - CHANGES_DAYS * 86_400_000));
  const [steps, log] = await env.DB.batch([
    env.DB.prepare(
      `SELECT model_key, date, official, other FROM (
         SELECT model_key, date, official, other,
           LAG(date) OVER w AS prev_date, LAG(official) OVER w AS prev_official, LAG(other) OVER w AS prev_other
         FROM phone_daily WINDOW w AS (PARTITION BY model_key ORDER BY date))
       WHERE prev_date IS NULL OR prev_official IS NOT official OR prev_other IS NOT other
       ORDER BY model_key, date`,
    ),
    env.DB.prepare(
      `SELECT url, date, price, stock, previous, previous_stock FROM (
         SELECT url, date, price, stock,
           LAG(price) OVER w AS previous, LAG(stock) OVER w AS previous_stock
         FROM phone_price_log WINDOW w AS (PARTITION BY url ORDER BY date))
       WHERE date >= ?1 AND previous IS NOT NULL
       ORDER BY date DESC`,
    ).bind(cutoff),
  ]);

  const daily: PhoneHistoryResponse['daily'] = {};
  for (const r of steps!.results as Array<{ model_key: string; date: string; official: number | null; other: number | null }>) {
    (daily[r.model_key] ??= []).push([r.date, r.official, r.other]);
  }
  const offerOf = new Map(phones.models.flatMap((m) => m.offers.map((o) => [o.url, { model: m.key, offer: o }] as const)));
  const changes: PhoneHistoryResponse['changes'] = {};
  for (const r of log!.results as Array<{ url: string; date: string; price: number; stock: PhoneStock; previous: number; previous_stock: PhoneStock }>) {
    const found = offerOf.get(r.url);
    // A price changed and changed back on the same day leaves a log row equal to the one before it.
    if (!found || (r.price === r.previous && r.stock === r.previous_stock)) continue;
    const list = (changes[found.model] ??= []);
    if (list.length >= CHANGES_PER_MODEL) continue;
    const change: PhoneChange = {
      date: r.date,
      shop: found.offer.shop,
      url: r.url,
      kind: found.offer.kind,
      variant: found.offer.variant,
      price: r.price,
      previous: r.previous,
      stock: r.stock,
      previous_stock: r.previous_stock,
    };
    list.push(change);
  }
  const body: PhoneHistoryResponse = { generated_at: now.toISOString(), daily, changes };
  await env.CACHE.put(PHONES_HISTORY_KEY, JSON.stringify(body));
  return { models: phones.models.length };
}
