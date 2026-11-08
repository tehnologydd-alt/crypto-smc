# APEX 9 Android First — Stage 4: Forecast Foundation

## Purpose
Introduce a **genuine local research hypothesis lifecycle** on Android, rather than filling the Forecasts page with fabricated signals or historical demonstrations. The feature is not a trading product and does not submit orders or manage accounts.

## Baseline V1 (experiment, not validated predictive skill)
- Read-only public source: `Binance Spot /api/v3/klines`, H1.
- Requires at least **96 consecutive, finished H1 candles**, a recent source timestamp and valid OHLCV.
- For each of 92 historical overlapping 4-hour windows, measure the **absolute log close-to-close change**. Use the sample's 80th percentile as a *descriptive historical magnitude*, **not an 80% probability**.
- Publish one hypothesis per asset + last completed H1 candle: whether the exact close **four subsequent completed H1 candles** later will be inside `anchorClose * exp(± historicalMagnitude)`.
- No direction, orders, TP, SL, nominal money, probability calibration, simulated portfolio or claims of accuracy.
- The user manually requests publication. Nothing is retroactively published on previously known prices.

## Immutable lifecycle
1. Obtain valid, fresh public H1 candles and compute a proposal using ONLY closed candles available now.
2. Persist the real input candles in **Room**.
3. Native Kotlin plugin checks the selected anchor close against its actual locally stored source candle, validates source/time/method, and **inserts original scenario with IGNORE conflict mode**. Duplicates do not overwrite.
4. User opens Forecasts: original timestamp, asset, baseline range, source and future close time are shown from Room.
5. When the target time has passed, user taps **Проверить опубликованные**. APEX fetches actual H1 candle history, saves it in Room, and attempts evaluation.
6. Kotlin verifies **all four exact subsequent H1 close timestamps** and computes the outcome from the source candle inside Room. No outcome from the JS UI is accepted.
7. Evaluation is persisted to a **separate append-once table** with `IGNORE` on duplicate, leaving the original hypothesis untouched.
8. Missing data -> `NEEDS_DATA`, target not reached -> `NOT_DUE`, observed close inside band -> `WITHIN_RANGE`, otherwise `OUTSIDE_RANGE`. Missing data is **not** counted as a miss.

## Android database
- Room v3 adds `research_forecast_results`: the original `research_forecasts` table from v1 stays unchanged.
- Explicit `2 -> 3` schema migration, plus existing `1 -> 2` migration; no destructive fallback.
- Previous APEX 9.0.71 settings, candles and observations must survive APK update on device.
- `getResearchForecasts` exposes the original scenario and first recorded result with a clear `LOCAL_ROOM_JOURNAL` provenance.
- Browser preview shows that native storage is unsupported; it does not invent forecast history.

## UX
- Forecast tab has 3 deliberate controls: **Создать исследовательский сценарий**, **Проверить опубликованные**, **Обновить журнал**.
- Count **published / evaluated / still pending**, not a deceptive "win rate".
- Read-only historical cards show first-published range and later independently observed close.
- Checks run by user action to limit mobile network usage. No 24/7 inference, no closed-app scheduling promise.

## Verification
- JS tests cover stale/missing source bars, gap detection, no lookahead, current forming-bar exclusion, requiring all four future closed bars, repeatable deterministic baseline and method validation.
- Android Gradle must compile Room schema v3 and native plugin.
- Real-device test: update signed v9.0.71 without uninstall; verify Room observations/candles still present; create hypothesis, restart app, observe original unchanged; check before/after deadline; ensure network-offline cannot be marked a miss; later inspect recorded outcome; repeated taps must not duplicate or rewrite.
- Evaluate historical predictive usefulness only after enough truly forward-recorded hypotheses; do not report model confidence until independently calibrated.

## Future scope (not implemented)
- Multi-horizon forecasts, richer feature-driven trained hypotheses, automatic notifications, incremental evaluation scheduler, independent external evidence, cohort statistics and proof of improvement over simple baselines.
