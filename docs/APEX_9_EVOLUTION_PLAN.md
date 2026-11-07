# APEX 9.0 — Global Intelligence / Deep Market Research

Status: **new product direction approved**, implementation in isolated `apex-9-evolution` branch. Source baseline: APEX 8.7.

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

- Runtime `src` is reconstructed from `source/APEX_Intelligence_V2.b64.txt`, then 2.3 overlay and version patches.
- Previous workflow only ran `updates/apply-watch.cjs` (2.5) and a diagnostic `updates/inspect-v63.cjs`, not 8.7.
- New `updates/rebuild-v87.cjs` enumerates and applies staged version patches in numerical order and verifies the final 8.7 marker and files; CI invokes it only on `apex-9-evolution`.
- **Blocker found:** authentic `updates/apply-v27.cjs` is missing although 2.8 requires version 2.7. The chain deliberately fails closed until the exact 2.7 overlay or verified source snapshot is recovered. Do not fabricate version 2.7 by changing a label.
- Existing `updates/configure-release.cjs` sets Android `versionName` to 6.3.RUN even though 8.7 scripts exist. Hold 9.0 signed release until metadata and migration are audited.
- CI for this branch is **not yet confirmed green**, and no APEX 9 APK is claimed to exist.

## Implementation stages
0. Recover/verify 2.7 baseline, run complete 8.7 overlay chain, regressions and Android build.
1. Preserve a read-only snapshot/export of pre-migration user data and map all persistence keys.
2. Build new research-only shell with source health, charts, and forecast timelines.
3. Separate all assistant/demo code into inactive legacy modules; only remove after preserving records and testing migrations.
4. Integrate verified public market/liquidity/macro adapters with visible coverage/latency.
5. Add on-chain, news and public social adapters, with source access and rate-limit gates.
6. Build evidence fusion and calibrated ML baseline; publish chronological validation reports.
7. Android performance/notification, offline mode, accessibility and release validation.

## Release gates
No 9.0 release unless: 8.7 build reproduced, migration/export validated, no assistant/demo screens active, no order execution path, forecast journal intact, source provenance and data freshness visible, no fake confidence metric, and notifications tested on-device.
