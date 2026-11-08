# APEX Android First — Evidence Lab: Data Integrity & Forward Research Audit

## What changed
Evidence Lab is an on-device, explicitly triggered quality-audit panel **under the Forecasts tab**. It reads existing, source-linked Android Room observations and does **not** place any orders, fetch market prices, send data to a new server, or invent missing history.

For the chosen asset, it summarizes:
- Exact number of saved finished H1 candles, missing hourly periods between first and last saved bar, the actual historical coverage ratio, and age of the latest closed bar.
- Number of locally captured visible order-book observations by *separate* Binance Spot and Bybit Spot venues.
- Number of recorded public BTC, ETH, or GRAM/TON network observations where a verified native adapter exists. Unsupported assets are marked unsupported, not assigned another chain.
- Immutable published research scenarios from the existing Android Room forecast journal: evaluated, due but awaiting actual data, still before deadline, and invalid/duplicate/future-dated or contradictory records.

## Methodology: no cherry-picked "accuracy"
- The baseline remains empirical **4-bar H1 close range V1**; its 80th historical-percentile envelope is **not** a calibrated probability.
- Audit accepts a record only when asset, method, original band, anchor time, actual publication timestamp, future 4-hour deadline and evaluation state are coherent.
- Evaluation must occur **after the target close**, and the original observed close must agree with the stored outcome. An overdue unobserved result is *missing data*, **not a miss or a win**.
- Within any given asset, intervals overlapping the four-hour observation horizon are excluded. Different assets are never pooled as independent evidence.
- **Minimum 30 non-overlapping evaluated outcomes for a single asset**, and complete, internally consistent available journal history, before displaying observed historical containment rate and a descriptive Wilson 95% interval. The interval describes uncertainty about historical containment frequency under sampling assumptions, **not** future trade success, independent calibration, or predictive probability.
- Current native journal API exposes at most **75 most recent records**. If the true Room total exceeds the returned records, the archive is flagged incomplete and observed containment percentage is hidden.
- Pending overdue results, integrity failures and future-dated records also prevent display of outcome percentages, rather than being silently omitted.
- Audit is strictly local. It uses Binance Spot evidence and has **no external price-source validation**; Evidence Lab does not claim to provide independent verification across exchanges.
- Results displayed in the UI are not stored as a new mutable "AI confidence" field, and the audit cannot alter any forecast.

## Android implementation
- `evidence-lab.mjs` — pure, deterministic data-quality and forward-evaluation integrity rules.
- `evidence-dashboard.mjs` — lightweight, touchscreen-friendly manual audit and readable reasons for insufficient evidence.
- Existing `mobile-bridge.mjs` native calls are reused: `getMobileCandles`, `getMobileLiquidityHistory`, `getMobileOnChainHistory`, and `getMobileResearchForecasts`. No new native plugin methods and no Room schema migration.
- Works in read-only mode with up to ten favorites. The selected asset is initially drawn from the current asset plus favorites; no background polling is added for this audit.

## Verification gates
- Pure Node tests cover malformed and duplicated forecasts, future-published and future-evaluated results, incomplete 75-row journals, due-but-unresolved outcomes, per-asset overlapping horizons, fewer than 30 samples, and a Wilson interval from 30 valid independent windows.
- Source tests cover out-of-order or missing H1 candles, stale local cache, unsupported networks and empty depth observations.
- Android GitHub Actions workflow must run all JS tests and assemble a **signed release APK**, matching the previous APEX signing certificate for in-place installation.
- Phone test: install over APEX 9.0.154, open **Прогнозы → Evidence Lab**, choose a favorite, tap **Проверить качество данных**. Confirm historical records remain after offline/relaunch and that an empty or incomplete journal never displays fabricated percentages. Verify existing forecast stages, favorites, on-chain and liquidity charts remain untouched.

## Known limits
This module is an integrity-audit foundation, not a guarantee of data origin beyond the source validation already performed. Missing records can occur because Android suspended background work or a provider was unavailable. One exchange's candle feed and a user's limited voluntary sampling cannot establish independent source confirmation or predictive skill.
