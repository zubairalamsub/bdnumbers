// Parsers for the phone shops' pages: listing pages and sitemaps (which product URLs to read) and product
// pages (name, price, stock from schema.org Product JSON-LD, which every one of the shops publishes).
// Plain string scanning rather than HTMLRewriter: the pages are 130–700 KB of mostly script, and all we
// need is the JSON-LD blocks and a link pattern, which a regex finds in well under a millisecond.
import {
  PHONE_MAX_PRICE,
  PHONE_MIN_PRICE,
  looksLikePhoneSlug,
  parsePhoneName,
  type PhoneKind,
  type PhoneStock,
} from '@bdnumbers/shared';
import { ParseError } from '../lib/errors';
import { cleanText, describePage } from '../lib/text';
import type { ShopCrawl } from './shops';

/** Product links on a listing page: absolute, in page order, without repeats. Empty past the last page. */
export function listingLinks(shop: ShopCrawl, html: string): string[] {
  if (shop.discovery.type !== 'listing') throw new Error(`${shop.id} has no listing pages`);
  const links = [...html.matchAll(shop.discovery.product)].map((m) => new URL(m[1]!, shop.origin).href);
  return [...new Set(links)];
}

/** Product URLs in a sitemap whose slug looks like a phone (sitemaps list every product a shop sells). */
export function sitemapLinks(shop: ShopCrawl, xml: string): string[] {
  if (shop.discovery.type !== 'sitemap') throw new Error(`${shop.id} has no sitemap`);
  if (!/<urlset\b/.test(xml)) throw new ParseError(`${shop.id} sitemap is not a <urlset>: ${describePage(xml)}`);
  const product = shop.discovery.product;
  const urls = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => cleanText(m[1]!));
  return [...new Set(urls.filter((u) => product.test(u) && looksLikePhoneSlug(u.slice(u.lastIndexOf('/') + 1))))];
}

/** What a product page says about itself. */
export interface ProductData {
  name: string;
  /** The brand field, which some shops fill with their own name. */
  brand: string | null;
  /** Lowest price on the page (the cheapest variant), or null when there is none yet. */
  price: number | null;
  /** Highest price, when the page gives a range of variants. */
  high: number | null;
  stock: PhoneStock;
  /** The shop's category, when the JSON-LD gives one ("Mobile Phone > Samsung"). */
  category: string | null;
  /** The page's <title>. */
  title: string | null;
}

type Json = Record<string, unknown>;

const asRecord = (v: unknown): Json | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : null);
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? cleanText(v) : null);

function amount(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/[^\d.]/g, '')) : Number.NaN;
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function stockOf(availability: unknown): PhoneStock {
  const a = typeof availability === 'string' ? availability.toLowerCase().replace(/\s+/g, '') : '';
  if (!a || /instock|limitedavailability|onlineonly|instoreonly/.test(a)) return 'in';
  if (/preorder|presale/.test(a)) return 'pre';
  return 'out';
}

/** Every JSON-LD object on the page, including those inside arrays and @graph. */
function jsonLd(html: string): Json[] {
  const out: Json[] = [];
  for (const m of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    let data: unknown;
    try {
      data = JSON.parse(m[1]!);
    } catch {
      continue; // one broken block shouldn't hide the others
    }
    const queue = Array.isArray(data) ? data : [data];
    while (queue.length > 0) {
      const item = asRecord(queue.shift());
      if (!item) continue;
      out.push(item);
      if (Array.isArray(item['@graph'])) queue.push(...item['@graph']);
    }
  }
  return out;
}

/** Name, price and stock from the page's Product JSON-LD. Throws when there is none. */
export function productData(html: string): ProductData {
  const product = jsonLd(html).find((o) => o['@type'] === 'Product' || (Array.isArray(o['@type']) && o['@type'].includes('Product')));
  const name = product ? text(product.name) : null;
  if (!product || !name) throw new ParseError(`no Product JSON-LD: ${describePage(html)}`);

  const offers = (Array.isArray(product.offers) ? product.offers : [product.offers]).map(asRecord).filter((o): o is Json => o !== null);
  const prices: number[] = [];
  let high: number | null = null;
  for (const offer of offers) {
    for (const v of [offer.price, offer.lowPrice]) {
      const p = amount(v);
      if (p !== null) prices.push(p);
    }
    const h = amount(offer.highPrice);
    if (h !== null) high = Math.max(high ?? 0, h);
  }
  const price = prices.length > 0 ? Math.min(...prices) : null;
  if (price !== null && offers.length > 1) high = Math.max(high ?? 0, ...prices);
  const brand = asRecord(product.brand)?.name ?? product.brand;
  return {
    name,
    brand: text(brand),
    price,
    high: high !== null && price !== null && high > price ? high : null,
    stock: stockOf(offers[0]?.availability),
    category: text(product.category),
    title: text(/<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]),
  };
}

/** Categories that are plainly not phones. */
const NOT_PHONE_CATEGORY =
  /appliance|audio|accessor|watch|wearable|tablet|ipad|laptop|computer|monitor|\btv\b|television|camera|gaming|console|speaker|headphone|earphone|earbud|neckband|power ?bank|charger|cable|cover|case|refrigerator|washing|oven|kitchen|smart home|router/i;

const kindIn = (s: string): PhoneKind | null => (/\bun-?official\b/i.test(s) ? 'unofficial' : /\bofficial\b/i.test(s) ? 'official' : null);

/** A shop's offer for a phone, ready to store. */
export interface PhoneOfferData {
  name: string;
  key: string;
  network: '5g' | '4g' | null;
  brand: string;
  display: string;
  variant: string | null;
  kind: PhoneKind | null;
  price: number;
  high: number | null;
  stock: PhoneStock;
}

export type ProductOutcome =
  | { status: 'ok'; offer: PhoneOfferData }
  /** An upcoming phone the shop lists without a price yet. */
  | { status: 'no_price'; name: string }
  | { status: 'not_phone'; name: string; reason: string };

/** Turn a product page's data into an offer, or say why it isn't one. */
export function productOutcome(data: ProductData, options: { kindInTitle?: boolean } = {}): ProductOutcome {
  const { name } = data;
  // A shop's category can rule a product out ("Home Appliances > Refrigerator"), but not in: Apple Gadgets
  // files some phones under the brand alone ("Samsung", "POCO > Xiaomi"), and Sumash files them under
  // "Smartphones/Accessories". The name decides the rest.
  const category = data.category;
  if (category && !/phone/i.test(category) && NOT_PHONE_CATEGORY.test(category)) {
    return { status: 'not_phone', name, reason: `category "${category}"` };
  }
  const parsed = parsePhoneName(name, data.brand);
  if (!parsed) return { status: 'not_phone', name, reason: 'name is not a phone we recognise' };
  // Gadget & Gear says "Official" in some page titles ("iPhone 17 Price in Bangladesh | Official | …") but not
  // in the product name. Only a shop's own word counts: a title without it leaves the kind unstated.
  const kind = parsed.kind ?? (options.kindInTitle && data.title ? kindIn(data.title) : null);
  if (data.price === null) return { status: 'no_price', name };
  if (data.price < PHONE_MIN_PRICE || data.price > PHONE_MAX_PRICE) {
    return { status: 'not_phone', name, reason: `price ${data.price} is outside ${PHONE_MIN_PRICE}–${PHONE_MAX_PRICE}` };
  }
  return {
    status: 'ok',
    offer: {
      name,
      key: parsed.key,
      network: parsed.network,
      brand: parsed.brand,
      display: parsed.name,
      variant: parsed.variant,
      kind,
      price: data.price,
      high: data.high,
      stock: data.stock,
    },
  };
}
