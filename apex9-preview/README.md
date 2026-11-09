# APEX 9.0 — research-only web preview

This is a **separate working prototype** of the new asset research experience, not a production Android update and not a drop-in replacement for APEX 8.6.

## What is implemented

- Mobile-first dark UI: **Обзор / Актив / Прогнозы / Источники**, with no assistant, demo wallets or order controls.
- Symbol input and real Binance Spot USDT catalog search; entering **TON** resolves to **TONUSDT**. Manual entry remains possible if the catalog request is blocked.
- Live public **Binance 24h ticker** and bounded **Binance/Bybit Spot order-book snapshots**.
- Independent research context from **CoinGecko global cryptocurrency market aggregates**, **mempool.space BTC mempool counts** (Bitcoin only), and **GDELT news search results** for a small, explicitly named set of crypto assets.
- A source status panel shows errors, unsupported asset coverage, rate limits and empty search results distinctly. News links are displayed as plain text with HTTPS-only destinations.
- Public GET requests only, with no API keys, sessions, private account data or order placement.
- Independent source error states, timestamps, and missing-data reporting.
- Shared evidence normalization using `updates/v90-evidence.mjs`; visible-depth data uses `updates/v90-market-depth.mjs`.
- Underfilled evidence remains **INSUFFICIENT**: two source layers do not produce a fake ML confidence score or a forecast.
- Forecast view explicitly states that authentic APEX 8.6 history/forecast engine has not yet been integrated.

## Run locally

From the **repository root** on a computer with a browser and Python installed:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000/apex9-preview/`.

Do not open `index.html` directly via a `file://` URL: the preview uses JavaScript modules and browser import paths.

Run the offline unit tests with Node 22+:

```bash
node --test updates/test-v90-evidence.mjs updates/test-v90-market-depth.mjs apex9-preview/test-research.mjs apex9-preview/test-context-sources.mjs
```

## Important limitations

- Public exchange APIs can fail with geo-restrictions, CORS, rate limits or temporary outages. Failures do not trigger simulated fallback values.
- 24h price changes are *historical context*. Visible order-book depth may change immediately and can contain spoofed/cancelled orders. Neither is a directional forecast.
- The new CoinGecko, mempool.space and GDELT adapters are **basic contextual observations only**, not trained inputs to the forecasting engine. Neither GDELT search matches nor Bitcoin mempool activity is validated trading sentiment, causation, large-wallet tracking or a price predictor.
- **Not connected:** social feeds, tracked large-wallet/transfer clusters, derivatives/liquidation maps, and scheduled macroeconomic events. General crypto-market capitalization is not a complete macroeconomic model.
- GDELT's article timestamp is the **time observed by GDELT**, not necessarily the publisher's original publication time. Source coverage can be incomplete. Public CORS, country restrictions and provider rate limits remain possible.
- Existing 8.6 scenarios/history are not ported yet; no claim of active tracking is made.
- No machine-learning model, calibrated probabilities, backtesting or 9.0 Android APK is available from this prototype.
- The Android pipeline awaits an authenticated full APEX 8.6 source snapshot. Do not upload proprietary signing keys or API secrets.
- A browser tab cannot guarantee background updates or Android push delivery.

## Source and data model

`research.mjs` produces one atomic collection result with:
`symbol`, `collectedAt`, `ticker`, `depth`, `sources`, `evidence`, `assessment`.

Every source is individually marked `OK`, `RATE_LIMITED`, `OFFLINE`, `INVALID`, `STALE`, `UNSUPPORTED` or `EMPTY` as appropriate. Evidence is deduplicated and freshness-checked by the shared engine. Heuristic intensity/reliability weights are *not* trained or calibrated, and must not be interpreted as probabilities.

No data gets written to the existing APEX 8.6 local database. The preview stores only the last selected symbol under a **new** browser localStorage key, `apex9_preview_asset`.

## Next implementation work

1. Review and improve source freshness and event provenance under real market conditions.
2. Verify the new public market-context/news/BTC-chain adapters against live responses, licensing, browser limitations and data freshness. Build scoped sources for actual large-wallet tracking, social signals and scheduled macro events only when accessible.
3. Recover a verified APEX 8.6 source snapshot and connect its forecast journal into a read-only research timeline without deleting old data.
4. Develop chronological walk-forward evaluation before assigning any probability or predictive strength.
5. Package the research interface as Android 9.0 only after the 8.6 data migration passes tests.

## External source references and query scope

- CoinGecko public API: `https://api.coingecko.com/api/v3/global`; attribution: CoinGecko. API quotas fluctuate; avoid aggressive polling.
- Bitcoin mempool API: `https://mempool.space/api/mempool` (network activity counts, **not** cryptocurrency market transfers).
- GDELT DOC 2.0 API: `https://api.gdeltproject.org/api/v2/doc/doc` article-list matching a fixed, nonambiguous name (such as Bitcoin, Ethereum, Toncoin), with HTTPS-only news links.

All adapters use unauthenticated GET, no HTML insertion and **no order-placement functionality**. Context remains separate from the predictive evidence fusion so that new data never artificially boosts directional confidence without chronological validation.

## APEX 9.1 — source budgets and on-demand calendar

GDELT news, macro news, and per-asset mentions now have separate per-device UTC-day request limits and minimum spacing. The official BLS no-key .ics schedule is parsed into planned release events (not actual values or directional signals) with a separate allowance. Results are cached, stale content is labelled, and unavailable sources show their actual state. These budgets apply to the APEX 9.1 flows; they do not constitute provider-wide quotas across devices. Paid API reservation has a generic, disabled-by-default local guard with explicit cost settings and no paid vendor wired into this preview.

## Research news sharing between pages (2026-11-09)

The asset **Data → Events and discussions** panel now reuses the news collection
already requested by **Overview** or **News**. Per-asset GDELT items and shared
RSS / CryptoPanic / NewsData.io headlines are joined locally by
`asset-news-context.mjs`, without adding a news API request.

- Only an explicit supported-asset headline mention is included; generic crypto
  headlines are not silently attributed to BTC, ETH, SOL, TON or another coin.
- Article URL, indexer names, publication versus index date and staleness
  indicators are preserved where supplied by adapters. Duplicate indexers
  are never counted as independent factual confirmation.
- Actual provider states are displayed alongside the asset news summary:
  unavailable, empty, missing credentials and rate limits are not converted
  into a green connected status.
- `news-research-analysis.mjs` provides descriptive counts of topics, article
  recency and publisher domains; it does not claim causality, market sentiment,
  or price prediction.
- Native personal-provider access still depends on an Android build with the
  configured Keystore plugin and valid permitted API credentials. This web
  preview alone does not prove a working Android news connection.

Run the independent source regression checks using Node 22+:

```bash
node --test apex9-preview/test-asset-news-context.mjs apex9-preview/test-news-research-analysis.mjs apex9-preview/test-news-evidence.mjs apex9-preview/test-news-source-fusion.mjs
```

`.github/workflows/apex-9-news-checks.yml` also defines an independent
GitHub Actions test job. That workflow does not build an Android APK; the
separate Android workflow remains blocked without its verified source snapshot.

## APEX 9 — source-attributed news versus historical M5 (2026-11-09)

On **Asset → Data → Events**, a user can explicitly select `Сопоставить M5`
for a news headline with an attributed `PUBLISHED` timestamp. A GDELT
`INDEXED` timestamp alone is *not* eligible; it would be misleading to
treat an index time as the actual publication time.

One bounded, read-only Binance Spot `/api/v3/klines?interval=5m` request
collects contiguous, fully closed candles for a local observation:

- One hour prior to the publication timestamp.
- Price change at approximate 15, 60 and 240-minute horizons, with the
  **actual elapsed minutes** also shown; partial horizons stay unreported.
- Observed price extremes and average M5 trading volume versus the prior
  12 fully closed M5 bars. A mixed candle containing a mid-bar publication
  is excluded from the post-publication volume/extreme sample.
- Missing or repeated bars, malformed OHLCV, unfinished intervals, invalid
  source URL or an old publication fail closed with a visible reason.

The on-device `news-m5-budget.mjs` permits at most **8 manually triggered
checks per UTC day** on that installation, spaced by at least two minutes,
with a 10-minute cache for successful observations. This is an app budget,
not an official Binance API quota or a promise of network availability.

**Important limitation:** a publication timestamp does not verify the
reported event's actual time, its truth, its influence on price, or future
market direction. A historical price change following a headline is not
causal proof or a trading recommendation. No order or forecast code consumes
these results.

Test these new modules in Node 22+:

```bash
node --test apex9-preview/test-news-m5-reaction.mjs apex9-preview/test-news-m5-budget.mjs
```

The extended `.github/workflows/apex-9-news-checks.yml` defines additional
syntax and regression checks for news, source attribution and M5 research.
A GitHub Actions pass and an Android APK/device run must be verified
separately; this commit alone does not prove either.

## APEX 9 — M5 publication references from two prior days

The news M5 panel offers an optional second **manual** action, “Сравнить с 2
днями”, once the full 240-minute observation window is closed. The client
fetches a single continuous Binance Spot M5 series (637 or 638 candles,
depending on the exact publication minute) covering the same UTC clock
time on the preceding 24 and 48 hours, including the one-hour pre-window.
The module refuses partial/gapped data, duplicate bars, malformed OHLCV,
unclosed candles, indexed-only news timestamps and unsupported symbols.

Each elapsed 15/60/240-minute result shows: the observed percentage move,
the moves from those two earlier days, their mean absolute magnitude, and
the difference in percentage points. These **two examples do not form a
statistical baseline**. The comparison cannot tell whether the published
headline was true, whether an event occurred at publication time, or
whether the price movement was caused by it.

The original M5 observation and this prior-days comparison share one
device-local limit of 8 requests per UTC day, but have **separate cached
results** keyed by study type. No new background polling is enabled.
Source status and errors remain visible.

Run the added offline tests with Node.js 22+:

```bash
node --test apex9-preview/test-news-m5-reaction.mjs apex9-preview/test-news-m5-baseline.mjs apex9-preview/test-news-m5-budget.mjs
```

GitHub Actions is configured to run these automatically, but the status
of CI and the separate Android APK/device validation must be confirmed
before declaring the release ready.
