-- Mobile phone prices from shops' own pages. Not a series: there are hundreds of phones per shop, found
-- by crawling, so they get tables of their own.

-- The crawl queue: every page we read, when to read it next and what happened last time.
CREATE TABLE phone_pages (
  url        TEXT PRIMARY KEY,
  shop       TEXT NOT NULL,
  -- listing (a page of a shop's phone category), sitemap, or product
  kind       TEXT NOT NULL CHECK (kind IN ('listing', 'sitemap', 'product')),
  -- new, ok, no_price (upcoming, no price yet), not_phone, gone (404 twice) or error
  status     TEXT NOT NULL DEFAULT 'new',
  -- ISO times
  next_check TEXT NOT NULL,
  checked_at TEXT,
  fails      INTEGER NOT NULL DEFAULT 0,
  error      TEXT,
  found_at   TEXT NOT NULL
);

CREATE INDEX phone_pages_due ON phone_pages (shop, next_check);

-- One row per product page: the shop's current price for it.
CREATE TABLE phone_offers (
  url        TEXT PRIMARY KEY,
  shop       TEXT NOT NULL,
  -- the shop's own product name, as published
  name       TEXT NOT NULL,
  -- matching key from shared/src/catalog/phones.ts (without "5G"/"4G"), so the same phone lines up
  -- across shops; network is the "5g"/"4g" the name gave, if any
  model_key  TEXT NOT NULL,
  network    TEXT,
  brand      TEXT NOT NULL,
  -- the cleaned-up model name, e.g. "Samsung Galaxy A57 5G"
  display    TEXT NOT NULL,
  -- RAM/storage when the product is a single variant, e.g. "8/256GB"
  variant    TEXT,
  -- official, unofficial, or NULL when the shop doesn't say
  kind       TEXT,
  -- the shop's price in taka: the cheapest variant on the page
  price      INTEGER NOT NULL,
  -- the dearest variant, when the shop gives a range
  high_price INTEGER,
  -- in (in stock), out (out of stock) or pre (pre-order)
  stock      TEXT NOT NULL,
  first_seen TEXT NOT NULL,
  -- ISO times: when price or stock last changed, and when the page last confirmed them
  changed_at TEXT NOT NULL,
  seen_at    TEXT NOT NULL,
  -- the page is gone (HTTP 404/410 twice)
  removed    INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX phone_offers_model ON phone_offers (model_key);

-- Every change of a product's price or stock, by Dhaka date (one row per product per day at most).
CREATE TABLE phone_price_log (
  url   TEXT NOT NULL,
  date  TEXT NOT NULL,
  price INTEGER NOT NULL,
  stock TEXT NOT NULL,
  PRIMARY KEY (url, date)
);

-- A phone model as the site shows it. The slug is fixed when the model is first seen, so its page URL
-- never changes.
CREATE TABLE phone_models (
  key        TEXT PRIMARY KEY,
  slug       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  brand      TEXT NOT NULL,
  first_seen TEXT NOT NULL
);

-- Each model's lowest in-stock price across the shops, once a day: the price history the pages chart.
CREATE TABLE phone_daily (
  model_key TEXT NOT NULL,
  date      TEXT NOT NULL,
  -- lowest official price, and lowest unofficial or unstated price; NULL when none is in stock
  official  INTEGER,
  other     INTEGER,
  -- shops with the phone in stock
  shops     INTEGER NOT NULL,
  PRIMARY KEY (model_key, date)
);
