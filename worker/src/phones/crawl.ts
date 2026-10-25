// The phone price crawl. Each hour every shop gets a run (its own invocation through SELF) that reads the
// pages due in its queue (phone_pages): listing pages and sitemaps find product URLs, product pages give
// prices. Each page is fetched and parsed in an invocation of its own, so no single invocation comes near
// the free plan's 10 ms CPU limit, and a shop gets at most PRODUCTS_PER_RUN product pages an hour: every
// phone is re-read about once a day without the shops ever seeing more than a request a minute or two.
import { dhakaDate } from '@bdnumbers/shared';
import { finishRun, runBatched, startRun } from '../db';
import type { Env } from '../env';
import { errorMessage } from '../lib/errors';
import { fetchText, httpStatusOf } from '../lib/http';
import type { RunResult } from '../run';
import { listingLinks, productData, productOutcome, sitemapLinks, type PhoneOfferData } from './parse';
import { SHOP_CRAWLS, listingPage, seedUrl, shopCrawl, type ShopCrawl } from './shops';

export type PageKind = 'listing' | 'sitemap' | 'product';

/** Product pages each shop run reads (an hour apart): ~860 a day per shop, more than any shop lists. */
export const PRODUCTS_PER_RUN = 36;
/** Listing and sitemap pages each run may read: enough for a shop's whole listing on the first run. */
const DISCOVERY_PER_RUN = 80;
/** Pages fetched at once within a shop. */
const CONCURRENCY = 2;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export type PageResult =
  | { status: 'ok'; links: string[] }
  | { status: 'ok'; offer: PhoneOfferData }
  | { status: 'no_price' | 'not_phone' | 'gone' | 'error'; detail: string };

/** Fetch and parse one page. Never throws: failures come back as results. */
export async function processPage(env: Env, shopId: string, url: string, kind: PageKind): Promise<PageResult> {
  const shop = shopCrawl(shopId);
  if (!shop) return { status: 'error', detail: `unknown shop ${shopId}` };
  let body: string;
  try {
    body = await fetchText(env, url);
  } catch (err) {
    const status = httpStatusOf(err);
    return { status: status === 404 || status === 410 ? 'gone' : 'error', detail: errorMessage(err) };
  }
  try {
    if (kind === 'listing') return { status: 'ok', links: listingLinks(shop, body) };
    if (kind === 'sitemap') return { status: 'ok', links: sitemapLinks(shop, body) };
    const outcome = productOutcome(productData(body));
    if (outcome.status === 'ok') return { status: 'ok', offer: outcome.offer };
    return { status: outcome.status, detail: outcome.status === 'not_phone' ? `${outcome.name}: ${outcome.reason}` : outcome.name };
  } catch (err) {
    return { status: 'error', detail: errorMessage(err) };
  }
}

export type PageInvoker = (shopId: string, url: string, kind: PageKind) => Promise<PageResult>;

/** Each page in its own invocation via SELF (inline in tests or without a token). */
export function pageInvokerFor(env: Env): PageInvoker {
  if (env.RUN_MODE === 'inline' || !env.INTERNAL_TOKEN) return (shop, url, kind) => processPage(env, shop, url, kind);
  return async (shop, url, kind) => {
    try {
      const res = await env.SELF.fetch('https://self/internal/phones/page', {
        method: 'POST',
        headers: { authorization: `Bearer ${env.INTERNAL_TOKEN}`, 'content-type': 'application/json' },
        body: JSON.stringify({ shop, url, kind }),
      });
      if (!res.ok) return { status: 'error', detail: `page invocation returned HTTP ${res.status}` };
      return await res.json<PageResult>();
    } catch (err) {
      return { status: 'error', detail: `page invocation failed: ${errorMessage(err)}` };
    }
  };
}

interface QueuedPage {
  url: string;
  kind: PageKind;
  fails: number;
  /** Already in phone_pages (false for a listing page found during this run). */
  known: boolean;
}

interface Checked {
  page: QueuedPage;
  result: PageResult;
}

const iso = (ms: number) => new Date(ms).toISOString();

/** When to read a page again, from what happened this time. */
function nextCheck(page: QueuedPage, result: PageResult, now: number): { status: string; at: number; fails: number } {
  const retry = (fails: number) => now + Math.min(3 * HOUR * fails, 2 * DAY);
  switch (result.status) {
    case 'ok':
      // Stagger re-reads a little so a shop's pages don't all fall due in the same hour tomorrow.
      if ('offer' in result) {
        return { status: 'ok', at: now + (result.offer.stock === 'in' ? DAY : 2 * DAY) + Math.floor(Math.random() * HOUR), fails: 0 };
      }
      return { status: 'ok', at: now + DAY, fails: 0 };
    case 'no_price':
      return { status: 'no_price', at: now + 3 * DAY, fails: 0 };
    case 'not_phone':
      return { status: 'not_phone', at: now + 30 * DAY, fails: 0 };
    case 'gone':
      // Twice in a row before giving up on a page: a shop mid-deploy can 404 for a minute.
      return page.fails >= 1 ? { status: 'gone', at: now + 30 * DAY, fails: page.fails + 1 } : { status: 'error', at: now + 6 * HOUR, fails: 1 };
    case 'error':
      return { status: 'error', at: retry(page.fails + 1), fails: page.fails + 1 };
  }
}

/** Read one shop's due pages and store what they say. Logged as a `phones:<shop>` run. */
export async function runShop(
  env: Env,
  shopId: string,
  trigger: string,
  invoke: PageInvoker = pageInvokerFor(env),
  now: Date = new Date(),
): Promise<RunResult> {
  const source = `phones:${shopId}`;
  const shop = shopCrawl(shopId);
  if (!shop) return { source, ok: false, error: `unknown shop ${shopId}`, written: 0, run_id: null };
  const runId = await startRun(env.DB, source, trigger, now.toISOString());
  try {
    const checked = await crawl(env, shop, invoke, now.getTime());
    const written = await save(env, shop, checked, now.getTime());
    const { ok, note } = verdict(shop, checked);
    await finishRun(env.DB, runId, ok, note, written);
    if (!ok) console.error(`[${source}] failed: ${note}`);
    return { source, ok, error: note, written, run_id: runId };
  } catch (err) {
    const message = errorMessage(err);
    console.error(`[${source}] failed: ${message}`);
    await finishRun(env.DB, runId, false, message, 0);
    return { source, ok: false, error: message, written: 0, run_id: runId };
  }
}

async function crawl(env: Env, shop: ShopCrawl, invoke: PageInvoker, now: number): Promise<Checked[]> {
  const seed = seedUrl(shop);
  const [, discovery, products, listings] = await env.DB.batch([
    env.DB.prepare(
      `INSERT OR IGNORE INTO phone_pages (url, shop, kind, next_check, found_at) VALUES (?1, ?2, ?3, ?4, ?4)`,
    ).bind(seed, shop.id, shop.discovery.type, iso(now)),
    env.DB.prepare(
      `SELECT url, kind, fails FROM phone_pages WHERE shop = ?1 AND kind != 'product' AND next_check <= ?2
       ORDER BY next_check LIMIT ?3`,
    ).bind(shop.id, iso(now), DISCOVERY_PER_RUN),
    env.DB.prepare(
      `SELECT url, kind, fails FROM phone_pages WHERE shop = ?1 AND kind = 'product' AND next_check <= ?2
       AND status != 'gone' ORDER BY next_check LIMIT ?3`,
    ).bind(shop.id, iso(now), PRODUCTS_PER_RUN),
    env.DB.prepare(`SELECT url, next_check FROM phone_pages WHERE shop = ?1 AND kind = 'listing'`).bind(shop.id),
  ]);
  type Row = { url: string; kind: PageKind; fails: number };
  const queue: QueuedPage[] = [...(discovery!.results as Row[]), ...(products!.results as Row[])].map((r) => ({ ...r, known: true }));
  // Listing pages (in page order) and the sitemap first, then products. Finding products on listing page n
  // puts page n+1 in this run if it is new or due.
  const order = (p: QueuedPage) => (p.kind === 'product' ? Number.MAX_SAFE_INTEGER : (listingPage(shop, p.url) ?? 0));
  queue.sort((a, b) => order(a) - order(b));
  const listingDue = new Map((listings!.results as Array<{ url: string; next_check: string }>).map((r) => [r.url, r.next_check]));
  const queued = new Set(queue.map((p) => p.url));

  const checked: Checked[] = [];
  while (queue.length > 0) {
    const batch = queue.splice(0, CONCURRENCY);
    const results = await Promise.all(batch.map((page) => invoke(shop.id, page.url, page.kind)));
    batch.forEach((page, i) => {
      const result = results[i]!;
      checked.push({ page, result });
      const n = listingPage(shop, page.url);
      if (n === null || result.status !== 'ok' || !('links' in result) || result.links.length === 0) return;
      const next = shop.discovery.type === 'listing' ? shop.discovery.page(n + 1) : null;
      const due = next ? listingDue.get(next) : undefined;
      if (next && !queued.has(next) && (due === undefined || due <= iso(now)) && queued.size < DISCOVERY_PER_RUN + PRODUCTS_PER_RUN) {
        queued.add(next);
        queue.push({ url: next, kind: 'listing', fails: 0, known: due !== undefined });
      }
    });
  }
  return checked;
}

interface StoredOffer {
  url: string;
  price: number;
  stock: string;
  removed: number;
}

/** Write a run's results: the queue, offers, and a price-log row for every new or changed price. */
async function save(env: Env, shop: ShopCrawl, checked: readonly Checked[], now: number): Promise<number> {
  const db = env.DB;
  const at = iso(now);
  const today = dhakaDate(new Date(now));
  const productUrls = checked.filter((c) => c.page.kind === 'product').map((c) => c.page.url);
  const { results: stored } = await db
    .prepare('SELECT url, price, stock, removed FROM phone_offers WHERE url IN (SELECT value FROM json_each(?1))')
    .bind(JSON.stringify(productUrls))
    .all<StoredOffer>();
  const before = new Map(stored.map((o) => [o.url, o]));

  const pageStmt = db.prepare(
    `INSERT INTO phone_pages (url, shop, kind, status, next_check, checked_at, fails, error, found_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?6)
     ON CONFLICT (url) DO UPDATE SET status = excluded.status, next_check = excluded.next_check,
       checked_at = excluded.checked_at, fails = excluded.fails, error = excluded.error`,
  );
  const linksStmt = db.prepare(
    `INSERT OR IGNORE INTO phone_pages (url, shop, kind, next_check, found_at)
     SELECT value, ?2, 'product', ?3, ?3 FROM json_each(?1)`,
  );
  const offerStmt = db.prepare(
    `INSERT INTO phone_offers (url, shop, name, model_key, network, brand, display, variant, kind, price, high_price,
       stock, first_seen, changed_at, seen_at, removed)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?14, 0)
     ON CONFLICT (url) DO UPDATE SET name = excluded.name, model_key = excluded.model_key, network = excluded.network,
       brand = excluded.brand, display = excluded.display, variant = excluded.variant, kind = excluded.kind,
       price = excluded.price, high_price = excluded.high_price, stock = excluded.stock, seen_at = excluded.seen_at,
       changed_at = CASE WHEN phone_offers.price IS NOT excluded.price OR phone_offers.stock IS NOT excluded.stock
         OR phone_offers.removed THEN excluded.changed_at ELSE phone_offers.changed_at END,
       removed = 0`,
  );
  const logStmt = db.prepare(
    `INSERT INTO phone_price_log (url, date, price, stock) VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT (url, date) DO UPDATE SET price = excluded.price, stock = excluded.stock`,
  );
  // An offer whose page now has no price, or is gone, stays on record as out of stock (or removed).
  const outStmt = db.prepare(
    `UPDATE phone_offers SET stock = 'out', removed = ?2, changed_at = ?3, seen_at = ?3 WHERE url = ?1`,
  );
  const outLogStmt = db.prepare(
    `INSERT INTO phone_price_log (url, date, price, stock) SELECT url, ?2, price, 'out' FROM phone_offers WHERE url = ?1
     ON CONFLICT (url, date) DO UPDATE SET price = excluded.price, stock = excluded.stock`,
  );

  const statements: D1PreparedStatement[] = [];
  let written = 0;
  for (const { page, result } of checked) {
    const next = nextCheck(page, result, now);
    const error = result.status === 'ok' ? null : result.detail.slice(0, 500);
    statements.push(pageStmt.bind(page.url, shop.id, page.kind, next.status, iso(next.at), at, next.fails, error));
    const old = before.get(page.url);
    if (result.status === 'ok' && 'links' in result) {
      if (result.links.length > 0) statements.push(linksStmt.bind(JSON.stringify(result.links), shop.id, at));
    } else if (result.status === 'ok') {
      const o = result.offer;
      statements.push(
        offerStmt.bind(page.url, shop.id, o.name, o.key, o.network, o.brand, o.display, o.variant, o.kind, o.price, o.high, o.stock, today, at),
      );
      if (!old || old.removed || old.price !== o.price || old.stock !== o.stock) {
        statements.push(logStmt.bind(page.url, today, o.price, o.stock));
        written++;
      }
    } else if (old && !old.removed && (next.status === 'gone' || next.status === 'not_phone' || (next.status === 'no_price' && old.stock !== 'out'))) {
      // No longer sold here (gone), not a phone after all, or the price was taken down: out of the comparison.
      const removed = next.status === 'no_price' ? 0 : 1;
      statements.push(outStmt.bind(page.url, removed, at), outLogStmt.bind(page.url, today));
      written++;
    }
  }
  await runBatched(db, statements);
  return written;
}

/**
 * A run fails when the shop can't be read at all: every page errored, or the first listing page or the
 * sitemap (the way into the shop) errored or listed no phones, which usually means the site changed.
 */
function verdict(shop: ShopCrawl, checked: readonly Checked[]): { ok: boolean; note: string | null } {
  const errors = checked.filter((c) => c.result.status === 'error');
  const seed = checked.find((c) => c.page.url === seedUrl(shop));
  const detail = (c: Checked) => (c.result.status === 'ok' ? '' : c.result.detail);
  if (seed && (seed.result.status !== 'ok' || ('links' in seed.result && seed.result.links.length === 0))) {
    return { ok: false, note: seed.result.status === 'ok' ? `no phones found on ${seed.page.url}` : detail(seed) };
  }
  if (checked.length > 0 && errors.length === checked.length) {
    return { ok: false, note: `all ${checked.length} pages failed; first: ${detail(errors[0]!)}` };
  }
  if (errors.length > 0) return { ok: true, note: `${errors.length} of ${checked.length} pages failed; first: ${detail(errors[0]!)}` };
  return { ok: true, note: null };
}

export type ShopInvoker = (shopId: string, trigger: string) => Promise<RunResult>;

/** Each shop's run in its own invocation via SELF (inline in tests or without a token). */
export function shopInvokerFor(env: Env): ShopInvoker {
  if (env.RUN_MODE === 'inline' || !env.INTERNAL_TOKEN) return (shop, trigger) => runShop(env, shop, trigger);
  return async (shop, trigger) => {
    try {
      const res = await env.SELF.fetch(`https://self/internal/phones/shop/${shop}?trigger=${encodeURIComponent(trigger)}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${env.INTERNAL_TOKEN}` },
      });
      if (res.ok) return await res.json<RunResult>();
      throw new Error(`shop run returned HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    } catch (err) {
      const message = errorMessage(err);
      console.error(`[phones:${shop}] fan-out failed: ${message}`);
      return { source: `phones:${shop}`, ok: false, error: message, written: 0, run_id: null };
    }
  };
}

/** Every shop's hourly run, at the same time (they are different sites). */
export async function crawlPhones(env: Env, trigger: string, invoke: ShopInvoker = shopInvokerFor(env)): Promise<RunResult[]> {
  return Promise.all(SHOP_CRAWLS.map((shop) => invoke(shop.id, trigger)));
}
