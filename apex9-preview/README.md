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
