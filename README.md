# bdnumbers

Daily numbers for Bangladesh (dollar rate, gold and silver, market prices, air quality and more) at
**[bdrate.fyi](https://bdrate.fyi)**. Everything runs on Cloudflare's free tier: a Worker collects data
and serves the API, D1 stores it, and Pages hosts the site. No servers and no paid services.

> **Status: Stage 1 of 5.** Worker, D1, Bangladesh Bank and BAJUS sources, cron and API are done.
> Next: the Astro site (Stage 2); then TCB, AQI, DSE and weather (3); periodic sources, calculators,
> prayer times and holidays (4); and SEO, PWA and notifications (5).

```
/shared   TypeScript types, series catalog, date and number formatting (used by worker and site)
/worker   Cloudflare Worker: sources, cron, Hono API, D1 migrations, tests
/site     Astro site (Stage 2)
```

## How it works

```
cron ─▶ scheduled() ─▶ one invocation per source via the SELF service binding (own 10 ms CPU budget)
                         └─ fetch → parse → validate → write to D1 → log in `runs`
        after the batch: rebuild latest.json and status.json in KV, bump the cache version
                         daily batch that wrote anything → POST the Pages deploy hook
GET /api/* ─▶ edge cache (keyed by cache version) ─▶ KV ─▶ D1
```

- **Crons:** `0 1,7 * * *` runs the daily sources at 07:00 and 13:00 Dhaka. `15 * * * *` runs the hourly sources (AQI and weather, from Stage 3).
- **Failures are loud but contained.** A failing source is logged in `runs` with its error. It never stops the other sources. Its latest points are flagged `stale`, so the API keeps serving the last good value marked as stale. The next successful run clears the flag.
- **Sanity checks:** every point must belong to a known series and have a real date and a value inside the series bounds. Gold and silver must also keep 22K > 21K > 18K > traditional. A violation fails the run instead of storing bad data.
- **Writes are idempotent:** re-running a source writes nothing unless a value changed.
- **"Purging" `/api/*`:** edge-cache keys include a version stored in KV. Each batch bumps it, which invalidates cached responses in every location without a zone-purge API token.

## Data sources

| Source | Series | Notes |
|---|---|---|
| [Bangladesh Bank: Exchange Rate of Taka](https://www.bb.org.bd/en/index.php/econdata/exchangerate) | `usd_bdt_low` (bid), `usd_bdt_high` (ask), `usd_bdt_avg` (WAR), `{ccy}_bdt_bid/ask` for every listed currency | Dated from the page header ("Oct 19, 2026"), which lags by business days. New currencies are picked up automatically. |
| [BAJUS: Gold Price](https://www.bajus.org/gold-price) | `gold_22k/21k/18k/traditional`, `silver_…` in BDT per bhori | BAJUS quotes per gram; stored as per gram × 11.664 (raw per-gram value in `meta`). Dated from the effective-date PDF link. Written only on change. |
| [UNB news](https://unb.com.bd/search?q=gold+price) (mirror) | same as BAJUS | Used only when BAJUS fails. Values carry `meta.source = "mirror"`, and a metal whose figures break the karat ladder is skipped. |

Each parser has tests against pages saved from the live sites (`worker/test/fixtures`). When a site changes its layout, the parser throws a clear error and `/api/status.json` shows it.

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
   `PAGES_DEPLOY_HOOK` comes in step 7. `ONESIGNAL_KEY` arrives in Stage 5; until then the code skips it.
4. **Deploy.** This also attaches the `api.bdrate.fyi` custom domain.
   ```bash
   npx wrangler deploy
   ```
5. **Load data now** instead of waiting for the next cron:
   ```bash
   curl -X POST https://api.bdrate.fyi/internal/batch/daily -H "authorization: Bearer <INTERNAL_TOKEN>"
   ```
6. **Set up CI deploys.** In the GitHub repo, add the secrets `CLOUDFLARE_API_TOKEN` (create it from the "Edit Cloudflare Workers" template and add *D1: Edit*) and `CLOUDFLARE_ACCOUNT_ID`. After that, every push to `main` that touches `worker/` or `shared/` runs the tests, applies migrations and deploys. Without the secrets, the workflow skips the deploy with a warning.
7. **Connect Pages (Stage 2).** Create a Pages project from the repo (root `site`). Then add a deploy hook under *Settings → Builds → Deploy hooks* and store it with `npx wrangler secret put PAGES_DEPLOY_HOOK`.

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
npm test                 # vitest inside workerd: real D1, KV and HTMLRewriter
npm run typecheck
npm run dev -w worker    # wrangler dev --test-scheduled (copy worker/.dev.vars.example to .dev.vars)
curl "http://localhost:8787/__scheduled?cron=0+1,7+*+*+*"   # trigger the daily batch locally
```

To add a source, create `worker/src/sources/<name>.ts` exporting a `Source` (`key`, `cadence`, `writeMode`, `fetch(env, ctx)`). Register it in `sources/index.ts` and add its series to `shared/src/series.ts`. Save the live page under `worker/test/fixtures/` and write the parser against it.

## Operations

- **Health:** `/api/status.json` shows each source's last run, error, 24 h failures and stale series. For live logs, run `npx wrangler tail` (observability is on).
- **Wrong value from a source:** post an override, either through `/manual` with *Override* ticked or with `"override": true` to `/api/ingest`. The override wins for that series and date and shows `overridden: true`.
- **A site changed its layout:** the run fails and the data goes stale. Save the new page as a fixture, update the parser and its test, and push; CI deploys it.
- **Blocked from Cloudflare's network:** move that source to a GitHub Actions job that POSTs to `/api/ingest`, the same pattern TCB will use in Stage 3.

## Free-tier limits

| Resource | Free limit | Estimated use (Stage 1) | If the limit is hit |
|---|---|---|---|
| Workers requests | 100,000/day | ~30/day for cron and fan-out, plus 1 per API call. The site's refresh island adds 1 per visible page view every ≥5 min (Stage 2). | Make the island poll less often or serve `latest.json` from Pages. Workers Paid is $5/mo for 10M requests. |
| Workers CPU | 10 ms per invocation (HTTP and cron) | Each source runs in its own invocation; HTMLRewriter parsing is native | `runs` shows "exceeded CPU". Move that parser to a GitHub Actions job that posts to `/api/ingest`. |
| Workers subrequests | 50 per invocation (1,000 via service bindings) | ≤3 per source | Already spread across invocations |
| Cron triggers | 5 per account | 2 | — |
| D1 rows written | 100,000/day | <100/day now; ~3,000/day once hourly AQI and weather run | Drop hourly series or cities, or store AQI every 3 h |
| D1 rows read | 5,000,000/day | ~1,000 per batch plus API cache misses | Cache misses are rare thanks to KV and the edge cache; lengthen `max-age` |
| D1 storage | 500 MB per database | <50 MB/year | Prune old hourly points |
| KV writes | 1,000/day | 3 per batch with sources (~6/day now, ~80/day with hourly sources) | Rebuild KV only when a batch wrote something |
| KV reads | 100,000/day | ≤2 per API request (cache version memoized per isolate) | Same as Workers requests |
| Pages builds | 500/month | ≤2/day (only when the daily batch wrote data) ≈ 60/month, plus pushes | Rebuild once a day |
| GitHub Actions | Unlimited minutes for public repos | test, deploy, Lighthouse (Stage 5), TCB fallback (Stage 3) | — |
