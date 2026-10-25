// Where each phone shop lists its phones. Three shops have plain paged category listings; the other
// three render their listings in the browser, so their product URLs come from the sitemap each one
// publishes (and names in robots.txt). Product pages all carry schema.org Product JSON-LD with the price.
// Every URL and pattern here was checked against the live sites on 2026-10-25 (robots.txt allows them).

export type ShopDiscovery =
  /** A paged category listing: page n's URL, and product links on it (group 1, absolute or root-relative). */
  | { type: 'listing'; page: (n: number) => string; product: RegExp }
  /** A sitemap: its URL, and which of its URLs are product pages (the slug is the last path segment). */
  | { type: 'sitemap'; url: string; product: RegExp };

export interface ShopCrawl {
  id: string;
  origin: string;
  discovery: ShopDiscovery;
  /** The shop marks official phones in the page title rather than the product name. */
  kindInTitle?: boolean;
}

export const SHOP_CRAWLS: readonly ShopCrawl[] = [
  {
    id: 'applegadgets',
    origin: 'https://www.applegadgetsbd.com',
    // Its listings paginate in the browser, and robots.txt asks crawlers to skip URLs with a query.
    discovery: { type: 'sitemap', url: 'https://www.applegadgetsbd.com/product/sitemap.xml', product: /^https:\/\/www\.applegadgetsbd\.com\/product\/[^/?#]+$/ },
  },
  {
    id: 'dazzle',
    origin: 'https://dazzle.com.bd',
    discovery: { type: 'listing', page: (n) => `https://dazzle.com.bd/categories/phones?page=${n}`, product: /href="(\/product\/[^"?#]+)"/g },
  },
  {
    id: 'gadgetandgear',
    origin: 'https://gadgetandgear.com',
    // One product per RAM/storage variant ("…-12gb-256gb").
    discovery: { type: 'sitemap', url: 'https://gadgetandgear.com/sitemap.xml', product: /^https:\/\/gadgetandgear\.com\/product\/[^/?#]+$/ },
    // "iPhone 17 Price in Bangladesh | Official | Gadget & Gear"
    kindInTitle: true,
  },
  {
    id: 'kry',
    origin: 'https://kryinternational.com',
    discovery: { type: 'sitemap', url: 'https://kryinternational.com/sitemap.xml', product: /^https:\/\/kryinternational\.com\/products\/(?!category\/)[^/?#]+$/ },
  },
  {
    id: 'rio',
    origin: 'https://riointernational.com.bd',
    discovery: {
      type: 'listing',
      page: (n) => `https://riointernational.com.bd/category/mobile/?page=${n}`,
      product: /class="product-name">\s*<a href="(https:\/\/riointernational\.com\.bd\/product\/[^"?#]+)"/g,
    },
  },
  {
    id: 'sumash',
    origin: 'https://www.sumashtech.com',
    discovery: {
      type: 'listing',
      page: (n) => `https://www.sumashtech.com/category/phone-smartphone?page=${n}`,
      product: /href="(\/product\/[^"?#]+)" class="block"/g,
    },
  },
];

export const shopCrawl = (id: string): ShopCrawl | undefined => SHOP_CRAWLS.find((s) => s.id === id);

/** The first page to read for a shop: listing page 1, or its sitemap. */
export const seedUrl = (shop: ShopCrawl) => (shop.discovery.type === 'listing' ? shop.discovery.page(1) : shop.discovery.url);

/** Page number of a listing URL, if it is one of this shop's listing pages. */
export function listingPage(shop: ShopCrawl, url: string): number | null {
  if (shop.discovery.type !== 'listing') return null;
  const n = Number(/[?&]page=(\d+)$/.exec(url)?.[1]);
  return Number.isInteger(n) && n > 0 && shop.discovery.page(n) === url ? n : null;
}
