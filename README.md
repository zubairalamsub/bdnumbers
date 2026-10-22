# bdnumbers

Daily numbers for Bangladesh (dollar rate, gold and silver, market prices, air quality and more) at
**[bdrate.fyi](https://bdrate.fyi)**. Everything runs on Cloudflare's free tier: a Worker collects data
and serves the API, D1 stores it, and Pages hosts the site. No servers and no paid services.

> **Status: all 5 stages built.** Bangladesh Bank and BAJUS (Stage 1); the Astro site with dashboard, dollar,
> gold, silver, history and status pages (Stage 2); TCB market prices, DSE indices and weather (Stage 3, AQI left
> out by choice); fuel, LPG, savings rates, holidays, prayer times and calculators (Stage 4); SEO, social cards,
> offline support, and web push / email digest ready to switch on (Stage 5).

```
/shared   TypeScript types, series catalog, date and number formatting (used by worker and site)
/worker   Cloudflare Worker: sources, cron, Hono API, D1 migrations, tests
/site     Astro 7 + Tailwind 4 static site on Cloudflare Pages
```

## How it works

```
cron ─▶ scheduled() ─▶ one invocation per source via the SELF service binding (own 10 ms CPU budget)
                         └─ fetch → parse → validate → write to D1 → log in `runs`
        after the batch: rebuild latest.json and status.json in KV, bump the cache version
                         daily batch that wrote anything → POST the Pages deploy hook
GET /api/* ─▶ edge cache (keyed by cache version) ─▶ KV ─▶ D1
```

- **Crons:** `0 1,7 * * *` runs the daily and periodic sources (Bangladesh Bank, EBL, BAJUS, TCB, DSE, fuel, LPG, savings rates, holidays) at 07:00 and 13:00 Dhaka. `15 * * * *` runs weather every hour. Periodic sources change a few times a year, so they are checked daily but write only when a value or its details change.
- **Failures are loud but contained.** A failing source is logged in `runs` with its error. It never stops the other sources. Its latest points are flagged `stale`, so the API keeps serving the last good value marked as stale. The next successful run clears the flag.
- **Sanity checks:** every point must belong to a known series and have a real date and a value inside the series bounds. Gold and silver must also keep 22K > 21K > 18K > traditional. A violation fails the run instead of storing bad data.
- **Writes are idempotent:** re-running a source writes nothing unless a value changed.
- **"Purging" `/api/*`:** edge-cache keys include a version stored in KV. Each batch bumps it, which invalidates cached responses in every location without a zone-purge API token.

## Data sources

| Source | Series | Notes |
|---|---|---|
| [Bangladesh Bank: Exchange Rate of Taka](https://www.bb.org.bd/en/index.php/econdata/exchangerate) | `usd_bdt_low` (bid), `usd_bdt_high` (ask), `usd_bdt_avg` (WAR), `{ccy}_bdt_bid/ask` for every listed currency | Dated from the page header ("Oct 19, 2026"), which lags by business days. New currencies are picked up automatically. |
| [Eastern Bank (EBL): Currency Exchange Rate](https://www.ebl.com.bd/forexrate) (backup) | `usd_bdt_ebl_buy` (TT clean buying), `usd_bdt_ebl_sell` (BC selling) | The box on every ebl.com.bd page, dated by its "As on 19 October, 2026" row. Collected daily, but these are a bank's customer rates, not BB's interbank rate, so they are separate series marked `backupFor: 'usd_bdt_avg'` and left out of changes, feeds, pushes and digests. The dollar page and home card show them only while BB's rate is stale and EBL has a rate for a later day. |
| [BAJUS: Gold Price](https://www.bajus.org/gold-price) | `gold_22k/21k/18k/traditional`, `silver_…` in BDT per bhori | BAJUS quotes per gram; stored as per gram × 11.664 (raw per-gram value in `meta`). Dated from the effective-date PDF link. Written only on change. |
| [UNB news](https://unb.com.bd/search?q=gold+price) (mirror) | same as BAJUS | Used only when BAJUS fails. Values carry `meta.source = "mirror"`, and a metal whose figures break the karat ladder is skipped. |
| [TCB: daily retail market prices](https://tcb.gov.bd/pages/daily-rmps) | `tcb_<item>_min` / `tcb_<item>_max` for 60 items (rice, flour, oil, pulses, vegetables, spices, fish/meat/eggs, milk powder, sugar, rods…) | TCB publishes an XLSX per day. The Worker reads it directly (small zip reader + native `DecompressionStream`), so no PDF/GitHub Actions fallback is needed. Items are matched to [`shared/src/catalog/tcb.ts`](shared/src/catalog/tcb.ts) by name and unit after Unicode normalisation; unknown rows show up as a warning on `/status`. A price of 0 (item not in the market) is skipped. |
| [DSE: recent market information](https://www.dse.com.bd/recent-market-information) | `dse_dsex`, `dse_dses`, `dse_ds30`, `dse_turnover` (Tk crore) | One row per trading day, so DSE holidays simply have no data. Each run upserts the ~6 weeks listed. |
| [MET Norway Locationforecast](https://api.met.no/) | `weather_<city>_temp` / `_humidity` / `_wind` (km/h) / `_rain` (mm, next hour) for Dhaka and the 7 other division HQs | Hourly. CC BY 4.0, which allows commercial use with attribution (Open-Meteo's free tier is non-commercial, which an ad slot would break). Coordinates are GeoNames places. The temperature point's meta carries the sky symbol and the next 24 hours' high/low. |

| [BPC: local sale prices](https://bpc.gov.bd/pages/static-pages/6922ddb6933eb65569e15fbc) | `fuel_diesel`, `fuel_kerosene`, `fuel_octane`, `fuel_petrol`, `fuel_furnace_oil` (Tk/litre), `lpg_govt_12_5kg` | Each row carries its own effective date, which becomes the point date. |
| [UNB news](https://unb.com.bd/search?q=LPG+price) for BERC's LPG price | `lpg_12kg` (Tk/cylinder), `lpg_per_kg` | BERC announces the monthly price as an image only, so the Worker reads the newest UNB report of it. It takes the first of the 3 newest articles where the 12 kg price is about 12 × the per-kg price (within Tk 3), and warns on `/status` about any it skipped. `meta.source = "mirror"`. |
| [National Savings Directorate](https://nationalsavings.gov.bd/pages/static-pages/6922e111933eb65569e29fed) | `savings_rates` (top rate; the full table is in `meta.notice`) | The rates in force are the table in the notice of 30 June 2025. A cut announced on 30 Dec 2025 was cancelled on 4 Jan 2026, and notices of 4 Jan and 2 Jul 2026 kept the table unchanged until 31 Dec 2026 (all checked against the notices on 2026-10-22). The table and the notices that extend it are in [`shared/src/catalog/periodic.ts`](shared/src/catalog/periodic.ts). The page states which notices confirm the rates, and turns back into a "may have changed" warning once the last one lapses. The Worker watches the directorate's schemes page and its [notices page](https://nationalsavings.gov.bd/pages/static-pages/6922de17933eb65569e182f5), and warns on `/status` when a newer rate notice appears (the next review is expected around January 2027). |
| [Google Calendar: Holidays in Bangladesh](https://calendar.google.com/calendar/ical/en.bd%23holiday%40group.v.calendar.google.com/public/basic.ics) (ICS) | `holidays_public` (count this year; the list is in `meta.holidays`) | Public holidays for this year and next. Bengali names come from a map in `periodic.ts`; a holiday without one shows a warning. Lunar holidays can move by a day after moon sighting. |

**Not yet collected:** Bangladesh Bank policy rates (repo, SDF, SLF). bb.org.bd has returned "403 Service Temporarily Unavailable" to every request since this stage started, so the page can't be inspected to write a parser. Add it once BB is back, following the BB exchange-rate source.

Each parser has tests against pages saved from the live sites (`worker/test/fixtures`). When a site changes its layout, the parser throws a clear error and `/api/status.json` shows it.

## Site

Every page is static HTML in Bengali (`/`) and English (`/en/…`), with Bengali or Latin digits remembered per language. Besides the number pages:

- **Prayer times** (`/prayer-times/<district>`, all 64 districts): computed with [adhan](https://github.com/batoulapps/adhan-js) using the Karachi method and Hanafi Asr, the convention in Bangladesh. They are computed at build time and again in the browser, so they stay right between builds. Each page has today's times, the month's timetable and a Ramadan sehri/iftar table. Ramadan dates come from the Umm al-Qura calendar, shifted by `RAMADAN_OFFSET_DAYS` in `site/src/views/PrayerDistrict.astro` if the local moon sighting differs. District coordinates are GeoNames places, listed in `shared/src/catalog/districts.ts`.
- **Calculators** (`/calculators`): currency converter, gold/silver weight and value, zakat, loan EMI, DPS maturity, Sanchayapatra return, and bKash/Nagad/Rocket cash-out fees. All run in the browser and take today's rates from the build. The math is in `site/src/lib/calc.ts` with tests. Cash-out fees are in `site/src/lib/mfs-fees.ts`, with the date they were checked; Rocket's newest published rates are from March 2025. To add your own calculator (income tax, electricity bill and construction cost already have slots), see [site/CALCULATORS.md](site/CALCULATORS.md).

### Search, sharing and offline

- **Titles and descriptions** are built from today's numbers and fitted to 60 and 155 characters. Characters are counted as a reader sees them, so a Bengali conjunct counts once. Each page offers a few title variants, best first ([`site/src/lib/seo.ts`](site/src/lib/seo.ts)).
- **[`site/seo/keywords.json`](site/seo/keywords.json)** maps every indexable page to a primary Bengali keyword, an English keyword and long-tail variants. The primary keyword must appear in the page title, and the long-tail ones become the Dataset's `keywords`.
- **[`site/seo/faqs/`](site/seo/faqs)** holds 5 Bengali and 5 English questions per number page (plus a template for the 64 prayer-time pages). `{series_key}`, `{series_key:date}` and `{series_key:gram}` fill in from today's data, and an unknown placeholder fails the build. The questions appear on the page and as FAQPage JSON-LD.
- **JSON-LD:** WebSite and Organization on the home page, Dataset and FAQPage on number pages, and BreadcrumbList on every page.
- **Build check:** `npm run build -w site` ends with [`site/scripts/check-seo.mjs`](site/scripts/check-seo.mjs). It fails the build if any page breaks the rules above, lacks hreflang, canonical or its social card, or falls out of `sitemap.xml`. When the build fails, Pages keeps the previous deployment live.
- **`/sitemap.xml`** lists both language versions of every indexable page with hreflang alternates. `lastmod` is when the data behind the page last changed. History pages are `noindex` and left out, so each number has one evergreen URL.
- **Feeds:** `/feed.xml` (Atom) and `/rss.xml`, plus `/en/…` versions, have one entry per day listing every number that moved.
- **`_redirects`** maps short aliases such as `/dollar`, `/gold`, `/namaz` and `/zakat` to the evergreen pages.
- **One indexed host:** `_headers` sends `X-Robots-Tag: noindex` on `bdnumbers.pages.dev`, and the Worker sends it on every `api.bdrate.fyi` response (JSON, embeds, the manual form), so only `bdrate.fyi` pages appear in search. Indexable pages carry `robots: max-image-preview:large`, which lets Google show large previews and use them in Discover.
- **Trust pages:** `/about` lists every source (from the series catalog) and how updates work; `/privacy` describes what the browser keeps and each outside service, with sections for ads, push and email that appear only when that service is configured. Bump `PRIVACY_UPDATED` in [`site/src/lib/site-pages.ts`](site/src/lib/site-pages.ts) when the policy changes.
- **Search Console:** verify the domain property `bdrate.fyi` (DNS, through Cloudflare) and submit `https://bdrate.fyi/sitemap.xml`. Bing Webmaster Tools can import the property from Search Console.
- **Social cards** (`/og/<lang>/<page>.png`, 1200×630) show the page's current number and are rebuilt with every deploy. Bengali text is shaped with HarfBuzz ([harfbuzzjs](https://github.com/harfbuzz/harfbuzzjs)) and rasterised with resvg, because no SVG renderer available here shapes Bengali correctly on its own. The font is Hind Siliguri (SIL OFL, licence in `site/src/og/fonts`).
- **PWA:** a web app manifest (Bengali and English), app icons, and a service worker (`/sw.js`). Pages load network-first, so a page you opened before still works offline with the data it last showed. Hashed assets are cache-first, and pages never opened before show `/offline`.
- **Performance:** CSS is inlined, the Bengali webfont is preloaded with `font-display: swap`, and the only scripts are the site's own. OneSignal, Buttondown and AdSense load only when switched on and used. The [Lighthouse CI workflow](.github/workflows/lighthouse.yml) fails if any of 7 key pages scores under 95 on mobile in performance, accessibility, best practices or SEO. Local runs on 2026-10-22 scored 98–100 everywhere.

### Notifications and ads (optional, all free plans)

These stay off until you add the keys, and nothing breaks without them.

| Feature | Service (free plan) | Turn it on |
|---|---|---|
| "Notify me when this changes" buttons on the dollar, gold, silver, fuel/LPG and savings pages | [OneSignal](https://onesignal.com): web push, up to 10,000 subscribers per send, 6 data tags per subscriber (this site uses 5) | Create a Web app with **Custom Code** setup for `https://bdrate.fyi`. Add `ONESIGNAL_APP_ID` as a Pages environment variable, then add `ONESIGNAL_APP_ID` and `ONESIGNAL_KEY` (the REST API key) as Worker secrets. |
| Daily email digest: one bilingual email at about 13:00 on days something changed | [Buttondown](https://buttondown.com): free up to 100 subscribers, one email a day | Add `BUTTONDOWN_USERNAME` as a Pages environment variable (this shows the sign-up form in the footer) and `BUTTONDOWN_API_KEY` as a Worker secret. |
| One ad slot per number page, loaded only when scrolled near | Google AdSense | Add `ADSENSE_CLIENT` (`ca-pub-…`) as a Pages environment variable and rebuild: this adds the `google-adsense-account` meta tag, the Google line in `/ads.txt` and the ads section of `/privacy`, which is what AdSense checks before approving the site. Once approved, create a display ad unit and add its ID as `ADSENSE_SLOT`. |
| Contact email on `/about` and `/privacy` (next to the GitHub issues link) | — | Add `CONTACT_EMAIL` as a Pages environment variable. |

The Worker sends pushes after any daily batch that changed a subscribed number. Subscribers are tagged `n_<topic>` with their page language, and each language gets its own message ([`shared/src/catalog/notify.ts`](shared/src/catalog/notify.ts)). The digest goes out once a day after the 13:00 batch, which a KV flag guarantees. Each batch's log line reports `push` and `digest` outcomes such as `not-configured`, `sent` or `failed`.

## API

Base URL: `https://api.bdrate.fyi`. GET responses allow CORS and carry `Cache-Control: public, max-age=300`.

| Endpoint | Returns |
|---|---|
| `GET /api/latest.json` | Every series: latest value and date, `stale`, `overridden`, source, and `change.prev` / `d7` / `d30` / `y1` (`from`, `date`, `abs`, `pct`) |
| `GET /api/series/:key.json?from=YYYY-MM-DD&to=YYYY-MM-DD` | History of one series (both bounds optional) |
| `GET /api/changes.json` | Values fetched today (Dhaka) that differ from the previous point |
| `GET /api/status.json` | Per source: last run, last success, failures in the last 24 h, stale series |
| `POST /api/ingest` | Bearer `INGEST_TOKEN`; rate limited to 10/min per IP. Body: `{"source":"manual","points":[{"series_key":"gold_22k","date":"2026-10-22","value":226340}],"mode":"upsert","override":false}` |
| `GET /embed/:key?lang=bn\|en` | A small iframe-able widget with an attribution link |
| `GET /manual` | Form for entering or correcting a value (uses your ingest token) |
| `POST /internal/run/:source`, `POST /internal/batch/daily\|hourly` | Bearer `INTERNAL_TOKEN`; run a source or a whole batch now |

Types for every response are in [`shared/src/types.ts`](shared/src/types.ts).

## Setup

You need **Node 22 or newer** (`.nvmrc` pins 24), a Cloudflare account with the `bdrate.fyi` zone, and `npx wrangler login`.

```bash
npm ci
cd worker
```

1. **Create D1 and KV**, then paste the printed IDs into `worker/wrangler.toml` (`database_id`, and `id` under `kv_namespaces`).
   ```bash
   npx wrangler d1 create bdnumbers
   npx wrangler kv namespace create CACHE
   ```
2. **Apply migrations:**
   ```bash
   npx wrangler d1 migrations apply bdnumbers --remote
   ```
3. **Set secrets.** Generate tokens with `node -e "console.log(crypto.randomBytes(32).toString('base64url'))"`.
   ```bash
   npx wrangler secret put INGEST_TOKEN
   npx wrangler secret put INTERNAL_TOKEN
   ```
   `PAGES_DEPLOY_HOOK` comes in step 8. The optional `ONESIGNAL_APP_ID`, `ONESIGNAL_KEY` and `BUTTONDOWN_API_KEY` are covered under *Notifications and ads*; the code skips anything unset.
4. **Deploy.** This also attaches the `api.bdrate.fyi` custom domain.
   ```bash
   npx wrangler deploy
   ```
5. **Load data now** instead of waiting for the next cron:
   ```bash
   curl -X POST https://api.bdrate.fyi/internal/batch/daily -H "authorization: Bearer <INTERNAL_TOKEN>"
   ```
6. **Set up CI deploys.** In the GitHub repo, add the secrets `CLOUDFLARE_API_TOKEN` (create it from the "Edit Cloudflare Workers" template and add *D1: Edit*) and `CLOUDFLARE_ACCOUNT_ID`. After that, every push to `main` that touches `worker/` or `shared/` runs the tests, applies migrations and deploys. Without the secrets, the workflow skips the deploy with a warning.
7. **Connect Pages.** In the dashboard, go to *Workers & Pages → Create → Pages → Connect to Git* and pick this repo. Use these settings:

   | Setting | Value |
   |---|---|
   | Production branch | `main` |
   | Framework preset | None |
   | Build command | `npm run build -w site` |
   | Build output directory | `site/dist` |
   | Root directory | *(leave empty: the repo root, so the npm workspace resolves `shared`)* |
   | Build watch paths, include | `site/*`, `shared/*`, `package-lock.json` (worker-only pushes then skip a build) |

   No environment variables are needed: Node comes from `.nvmrc`, and `API_BASE` defaults to `https://api.bdrate.fyi`. The optional ones (`ONESIGNAL_APP_ID`, `BUTTONDOWN_USERNAME`, `ADSENSE_CLIENT`, `ADSENSE_SLOT`, `CONTACT_EMAIL`) are covered under *Notifications and ads*. Then add `bdrate.fyi` under *Custom domains*.
8. **Add the deploy hook.** Under *Settings → Builds → Deploy hooks*, add one for `main` and store its URL as a Worker secret. After that, every daily batch that writes new data rebuilds the site.
   ```bash
   npx wrangler secret put PAGES_DEPLOY_HOOK
   ```

### TCB backfill

TCB's list page keeps recent files, so 50 days of market history can be loaded once (already done for 30 Aug – 19 Oct 2026):

```bash
cd worker && npx tsx scripts/backfill-tcb.ts 50   # uses INGEST_TOKEN from worker/.dev.vars; safe to re-run
```

### Gold and silver backfill

BAJUS keeps only the current price file, so past prices come from UNB's reports of each BAJUS change. These reports are found through UNB's search API and parsed with the same prose parser and karat checks as the Worker's UNB fallback. Each change is dated to the day it took effect ("effective from Thursday" → that date). Points carry `meta.source = "mirror"` and the article URL, and are written only before the first stored BAJUS date. Coverage before 2025 (gold) and 2026 (silver) is too sparse to chart, so it is skipped. The backfill ran on 2026-10-22: 50 gold changes since January 2025 and 23 silver changes since January 2026.

```bash
cd worker && npx tsx scripts/backfill-gold.ts            # dry run: what it would write
cd worker && npx tsx scripts/backfill-gold.ts --ingest   # write (safe to re-run)
```

### Seeding history

So charts aren't empty at launch, load history from CSVs. Name each file `<series_key>.csv` (for example `usd_bdt_avg.csv` or `gold_22k.csv`) and give it a `date,value` header row:

```bash
npm run seed -w worker -- ../data/seed               # writes worker/seed.sql
npm run seed -w worker -- ../data/seed --per-gram    # if gold/silver files are per gram
cd worker && npx wrangler d1 execute bdnumbers --remote --file=seed.sql
```

The script accepts `YYYY-MM-DD`, `DD/MM/YYYY` and `DD-MM-YYYY` dates, plus quoted values with thousands separators or Bengali digits. It never overwrites existing points, and it writes nothing if any row fails validation. `data/seed/*.csv` is gitignored.

## Development

```bash
npm test                 # worker tests in workerd (real D1, KV, HTMLRewriter), then site tests (calculators, prayer times, SEO)
npm run typecheck        # tsc for shared/worker, astro check for the site
npm run dev -w worker    # wrangler dev --test-scheduled (copy worker/.dev.vars.example to .dev.vars)
curl "http://localhost:8787/__scheduled?cron=0+1,7+*+*+*"   # trigger the daily batch locally
npm run dev -w site      # Astro dev server; reads the live API (set API_BASE to point elsewhere)
npm run build -w site    # what Pages runs: astro build, then the SEO check
cd site && npx @lhci/cli@0.15.1 autorun   # Lighthouse CI locally (needs Chrome; set CHROME_PATH if it isn't found)
```

### How the site stays fresh

Pages builds from the API at build time, so every page is complete static HTML with today's numbers. The Worker calls the deploy hook after a daily batch that wrote data, which keeps rebuilds to about 2 a day. In the browser, one small script (`site/src/scripts/live.ts`) re-reads `/api/latest.json` once the page's data is more than 5 minutes old, so visitors never see older numbers than that. The same script ticks "updated X ago", switches between Bengali and English digits (remembered per language), and drives the charts. Charts are inline SVG with no chart library, in a single blue validated for both light and dark mode.

To add a source, create `worker/src/sources/<name>.ts` exporting a `Source` (`key`, `cadence`, `writeMode`, `fetch(env, ctx)`). Register it in `sources/index.ts` and add its series to `shared/src/series.ts`. Save the live page under `worker/test/fixtures/` and write the parser against it.

## Security

Everything here is on free plans. Report problems as described in [SECURITY.md](SECURITY.md).

- **Site headers** ([`site/public/_headers`](site/public/_headers)): HSTS (1 year, subdomains), `nosniff`, a strict referrer policy, `Permissions-Policy` turning off camera, microphone, location, payment and device APIs, `COOP: same-origin-allow-popups`, and a CSP with `frame-ancestors 'self'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self' https://buttondown.com` and `upgrade-insecure-requests`. Script sources stay open because AdSense loads from many Google hosts and does not support allowlists; the site is static, renders upstream text escaped, and only inserts JSON (with `<` escaped) as raw HTML.
- **API headers** ([`worker/src/index.ts`](worker/src/index.ts)): every response gets HSTS, `nosniff`, `noindex` and a referrer policy. Embeds may be framed anywhere but load and run nothing (`default-src 'none'`); `/manual` can't be framed and may only call its own origin. The Worker is served only on `api.bdrate.fyi` (`workers_dev` and preview URLs are off).
- **Secrets** live only in Worker secrets, Pages variables, GitHub Actions secrets and the git-ignored `worker/.dev.vars`; none are in the repository or its history. Write endpoints need a bearer token compared in constant time, and `/api/ingest` is rate-limited.
- **Repository:** Dependabot ([`.github/dependabot.yml`](.github/dependabot.yml)) and CodeQL code scanning ([`codeql.yml`](.github/workflows/codeql.yml)); every workflow's `GITHUB_TOKEN` is read-only.
- **`/.well-known/security.txt`** is generated on each build, so its `Expires` date stays a year ahead.
- **Account-level steps** (Cloudflare dashboard, done by hand): DNSSEC, DMARC `p=reject` (the domain sends no mail), and two-factor authentication on the Cloudflare, GitHub and Google accounts.

## Operations

- **Health:** `/api/status.json` shows each source's last run, error, 24 h failures and stale series. For live logs, run `npx wrangler tail` (observability is on).
- **Wrong value from a source:** post an override, either through `/manual` with *Override* ticked or with `"override": true` to `/api/ingest`. The override wins for that series and date and shows `overridden: true`.
- **A site changed its layout:** the run fails and the data goes stale. Save the new page as a fixture, update the parser and its test, and push; CI deploys it.
- **Blocked from Cloudflare's network:** move that source to a GitHub Actions job that POSTs to `/api/ingest`.
- **Savings rates changed:** when `/status` warns that the directorate links a new notice, transcribe its table into `SAVINGS_NOTICE` in `shared/src/catalog/periodic.ts` and push. Do the same for `site/src/lib/mfs-fees.ts` when an operator changes its charges.

## Free-tier limits

Everything runs at $0. The Cloudflare account is on the **Workers Free** plan and the `bdrate.fyi` zone on the **Free** plan (both checked in the dashboard on 2026-10-22). Pages is on its free plan, and the repo is public, so GitHub Actions minutes are free. On the Free plan nothing can bill: a request over a limit fails instead. Failure degrades gracefully. The site is static HTML served by Pages (unmetered), so even if the Worker hit its daily request limit, every page would still load with the last built numbers; only the 5-minute live refresh would pause until midnight UTC.

| Resource | Free limit | Estimated use (Stage 5) | If the limit is hit |
|---|---|---|---|
| Workers requests | 100,000/day | ~80/day for cron and fan-out (24 hourly + 2 daily batches), plus 1 per visible page view whose data is ≥5 min old (the live refresh, which asks only for the page's series) | Make the island poll less often or serve `latest.json` from Pages. Workers Paid is $5/mo for 10M requests. |
| Workers CPU | 10 ms per invocation (HTTP and cron) | Each source runs in its own invocation; HTMLRewriter parsing is native | `runs` shows "exceeded CPU". Move that parser to a GitHub Actions job that posts to `/api/ingest`. |
| Workers subrequests | 50 per invocation (1,000 via service bindings) | ≤3 per source | Already spread across invocations |
| Cron triggers | 5 per account | 2 | — |
| D1 rows written | 100,000/day | ~2,500/day: 32 weather points an hour, ~120 TCB and 4 DSE points a day, each also updating indexes (the one-off TCB backfill was ~17,000) | Fewer weather cities or metrics, or fetch weather every 3 h |
| D1 rows read | 5,000,000/day | ~1,000 per batch plus API cache misses | Cache misses are rare thanks to KV and the edge cache; lengthen `max-age` |
| D1 storage | 500 MB per database, 5 GB per account | <50 MB/year | Prune old hourly points |
| KV writes | 1,000/day | 3 per batch: ~80/day (24 hourly + 2 daily) | Rebuild KV only when a batch wrote something |
| KV reads | 100,000/day | ≤2 per API request (cache version memoized per isolate) | Same as Workers requests |
| Pages builds | 500/month | ≤2/day (only when the daily batch wrote data) ≈ 60/month, plus pushes | Rebuild once a day |
| Pages files | 20,000 per deployment | ~820 files: 563 pages (390 per-series history pages, 128 district prayer times), 28 social cards, icons, feeds, scripts and fonts | Drop the English history pages |
| Workers Logs | 200,000 events/day | a few hundred (one summary line per batch, errors) | Logs stop for the day; the `runs` table still records every run |
| GitHub Actions | Unlimited minutes for public repos | test, deploy, Lighthouse CI (about 4 minutes a run) | — |
| OneSignal (optional) | Web push: 10,000 subscribers per send, 6 data tags per subscriber | 5 tags; at most 10 sends a batch (5 topics × 2 languages), only on change | Past 10,000 subscribers to one topic, a send reaches only 10,000; split by tag or move to a paid plan |
| Buttondown (optional) | 100 subscribers, at most one email a day to the list | 1 email a day, only on days something changed | Past 100 subscribers, Buttondown's paid plan |
