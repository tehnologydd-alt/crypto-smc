# APEX 9.0 — research-only web preview

This is a **separate working prototype** of the new asset research experience, not a production Android update and not a drop-in replacement for APEX 8.6.

## What is implemented

- Mobile-first dark UI: **Обзор / Актив / Прогнозы / Источники**, with no assistant, demo wallets or order controls.
- Symbol input and real Binance Spot USDT catalog search; entering **TON** resolves to **TONUSDT**. Manual entry remains possible if the catalog request is blocked.
- Live public **Binance 24h ticker** and bounded **Binance/Bybit Spot order-book snapshots**.
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
node --test updates/test-v90-evidence.mjs updates/test-v90-market-depth.mjs apex9-preview/test-research.mjs
```

## Important limitations

- Public exchange APIs can fail with geo-restrictions, CORS, rate limits or temporary outages. Failures do not trigger simulated fallback values.
- 24h price changes are *historical context*. Visible order-book depth may change immediately and can contain spoofed/cancelled orders. Neither is a directional forecast.
- News, social feeds, on-chain, derivatives, liquidation maps and macroeconomic evidence are **not connected yet**.
- Existing 8.6 scenarios/history are not ported yet; no claim of active tracking is made.
- No machine-learning model, calibrated probabilities, backtesting or 9.0 Android APK is available from this prototype.
- The Android pipeline awaits an authenticated full APEX 8.6 source snapshot. Do not upload proprietary signing keys or API secrets.
- A browser tab cannot guarantee background updates or Android push delivery.

## Source and data model

`research.mjs` produces one atomic collection result with:
`symbol`, `collectedAt`, `ticker`, `depth`, `sources`, `evidence`, `assessment`.

Every source is individually marked `OK`, `RATE_LIMITED`, `OFFLINE`, `INVALID` or `STALE`. Evidence is deduplicated and freshness-checked by the shared engine. Heuristic intensity/reliability weights are *not* trained or calibrated, and must not be interpreted as probabilities.

No data gets written to the existing APEX 8.6 local database. The preview stores only the last selected symbol under a **new** browser localStorage key, `apex9_preview_asset`.

## Next implementation work

1. Review and improve source freshness and event provenance under real market conditions.
2. Add lawful public news, macro and on-chain adapters with independent source statuses and licenses.
3. Recover a verified APEX 8.6 source snapshot and connect its forecast journal into a read-only research timeline without deleting old data.
4. Develop chronological walk-forward evaluation before assigning any probability or predictive strength.
5. Package the research interface as Android 9.0 only after the 8.6 data migration passes tests.
