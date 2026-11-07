# APEX 9.0 — Global Intelligence / Deep Market Research

Status: **new product direction approved**, implementation in isolated `apex-9-evolution` branch. Source baseline: **APEX 8.6** (user-selected). Do not restore APEX 8.7 or replay missing legacy patches.

## Product vision
APEX is an explainable, multi-source *research and forecasting* platform, **not** an assistant, brokerage terminal, demo portfolio, or order execution service.

Every forecast should answer:
1. What is happening around this asset now?
2. Which independent sources support or contradict the hypothesis?
3. What causal mechanisms are plausible, versus merely correlated?
4. Which conditions would invalidate the hypothesis?
5. How did the forecast perform after its published timestamp?

Forecasts must remain probabilistic and clearly labeled. They cannot promise certainty or profit.

## Remove from APEX 9 UI and active services
- AI assistant/chat, assistant-only schedules and services.
- Demo wallets, simulated account balances, demo trading engines and execution screens.
- Exchange account connections, order entry and testnet order-lifecycle panels.
Do not delete historical localStorage keys/data on upgrade. Introduce an explicit, user-initiated export/cleanup path after migration review. Removing a UI must not quietly erase user data.

## Preserve and improve
- Radar, symbol catalog/search including TON, watchlists.
- Existing forecasting engine, lifecycle tracking (preliminary, published, active, TP1-3 reached, invalidated, expired), horizon segmentation, verification and retrospective statistics.
- Real public price feeds, quality diagnostics, stale-data warnings, Android background collection and notification controls.
- Evidence provenance, backtesting with no future-data leakage.

## Deep intelligence layers
1. **Market microstructure:** order-book snapshots/depth, spreads, volume and order-flow imbalances. Publicly visible liquidity only; do not claim to know hidden orders.
2. **Liquidity:** venue-by-venue liquidity heatmaps, derivatives funding, open interest, liquidation aggregates where sourced and licensed; timestamp and market coverage attached.
3. **Large participants/on-chain:** public on-chain transfers, exchange inflow/outflow estimates, known wallet clusters with uncertainty labels. Never portray all transfers as buys/sells.
4. **News & macro:** reputable reporting, scheduled macroeconomic events, rates/regulatory developments and time-stamped market impact context.
5. **Social sentiment:** lawful public X/Reddit/other available feeds, multilingual sentiment, spam/bot defenses and provenance; no private-account scraping or pretending inaccessible feeds are covered.
6. **Cross-asset context:** BTC/ETH dominance, equities, rates, FX, risk-on/off correlations and regime shifts when measurable.
7. **Forecast evaluation:** calibrated probabilistic scenarios per time horizon with confidence intervals, missing-data penalties, contradictions and immutable before/after evaluation.

## Proposed app navigation (no assistant or demo tab)
- **Обзор** — radar, search and source freshness.
- **Актив** — one asset with chart, market structure and layered evidence.
- **Прогнозы** — scenario timelines, invalidation, horizon and notifications.
- **Исследования** — source matrix, cause/effect hypotheses, model quality, experiments.
- **Настройки** — privacy, data connections, background checks and alert preferences.

## Analysis pipeline
Public/API-sourced event -> schema normalization -> source timestamp, freshness, rights and quality checks -> entity/symbol reconciliation -> event deduplication -> feature extraction -> evidence/contradiction graph -> time-aware ensemble/ML forecast -> publication snapshot -> monitoring -> outcome evaluation -> calibration/retraining review.

Every source adapter supports status: OK, LATE, OFFLINE, RATE_LIMITED, UNSUPPORTED. No fabricated or silently substituted observations.

## Data and model safeguards
- Separate event-time from ingestion-time; prevent look-ahead leakage.
- Collect only publicly available or authorized data, respecting terms/rate limits.
- Compare forecasts against simple baselines; stratify by asset, regime, horizon and source availability.
- Track Brier score, reliability calibration, directional accuracy, coverage, precision/recall for events, and false alerts; keep failed hypotheses visible.
- Consider source latency, bot manipulation, coincident correlated evidence and regime shifts.
- ML retraining uses chronological walk-forward splits, never random mixing of past/future.
- Do not label correlation as demonstrated causation without corroboration.

## Build baseline audit — 2026-11-07
Repo: `tehnologydd-alt/crypto-smc`, branch `apex-9-evolution`.

- The legacy repository stores early source in `source/APEX_Intelligence_V2.b64.txt` and version-specific update scripts, but no authenticated *full* APEX 8.6 source snapshot has yet been located.
- **New policy:** APEX 9.0 is forked directly from an approved **8.6 source snapshot**, not reconstructed from 2.x patches. The old 2.7 gap is no longer a task to restore.
- `updates/require-v86-source.cjs` validates the extracted version marker and essential 8.6 source/tests, without accepting a partial 2.x source as 8.6. `apex-9-android.yml` builds only from `source/APEX_Intelligence_V86.b64.txt` when that file is provided; it currently does not exist.
- `.github/workflows/apex-v2-android.yml` has been isolated back to the legacy branch; `apex-9-evolution` uses separate CI.
- The existing `updates/configure-release.cjs` uses legacy versionName `6.3.RUN`. Experimental 9.0 workflow builds an **unsigned-for-release debug APK** and does not call this versioning script. A future signed 9.0 release requires an independent migration/signing plan.
- The new standalone modules `updates/v90-evidence.mjs` and `updates/v90-market-depth.mjs` can be tested independently of the Android baseline; they are not yet wired into the app. No full APEX 9 APK is claimed to exist.

## Implementation stages
0. Obtain a trustworthy complete APEX 8.6 source snapshot and run existing tests + experimental Android build without replaying 2.7 or 8.7.
1. Preserve a read-only snapshot/export of pre-migration user data and map all persistence keys.
2. Build new research-only shell with source health, charts, and forecast timelines.
3. Separate all assistant/demo code into inactive legacy modules; only remove after preserving records and testing migrations.
4. Integrate verified public market/liquidity/macro adapters with visible coverage/latency.
5. Add on-chain, news and public social adapters, with source access and rate-limit gates.
6. Build evidence fusion and calibrated ML baseline; publish chronological validation reports.
7. Android performance/notification, offline mode, accessibility and release validation.

## Release gates
No 9.0 release unless: 8.6 source verified and tested, migration/export validated, no assistant/demo screens active, no order execution path, forecast journal intact, source provenance and data freshness visible, no fake confidence metric, and notifications tested on-device.
