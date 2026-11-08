# APEX Android First — Scenario Replay: five factual H1 observations

## Overview
The Android Asset passport extends its original **Scenario Map** with **Scenario Replay**: a step-by-step, on-device view of what *actually* happened to the asset's completed hourly closing price during an immutable, previously published four-hour research horizon.

This is an observational historical review. It is not trading, a live execution assistant, profit-target management, a forward promise or a fabricated simulation.

## How it works
1. Open **Актив → Сценарии наблюдения на графике**, choose **Все** or **★ Отмеченные**, then choose a source-backed scenario.
2. Beneath the cards, tap the five steps **0–1–2–3–4**, corresponding to the original source anchor close and four subsequent closed H1 candles. No future price is projected.
3. Each step presents its **actual H1 closing time**, actual recorded close, percentage difference from the source anchor and whether it lies within the published research range.
4. The chosen real candle is highlighted with an amber vertical cursor on the H1 chart; the chart pans to its exact source close time when available.
5. An H1 close at index 3 is only an **intermediate observation**. It is not misreported as a third official stage confirmation.
6. A saved research stage is marked verified only when its **original event** exists in the Room journal and the source bar's timestamp matches. The published stage is associated with the original known closed anchor and its later publication timestamp remains separately visible.
7. The final H1 outcome is counted as cross-verified only when its **real closed price** agrees with the separately stored research journal result and original band. A price alone never creates a saved journal evaluation.
8. Missing/corrupted/duplicate OHLCV source bars, not-yet-closed candles and discrepancies are displayed explicitly and no price or confirmed stage is invented. An unreliable original anchor price prevents a clean replay.
9. The panel uses the same cached Room candles as the H1 chart, without additional network requests, account APIs or background polling. On other chart intervals Replay explains that original H1 observations are needed.

## Implementation
- `scenario-replay.mjs`: pure source validation and deterministic five-step reconstruction from closed OHLCV; consistency of the immutable research anchor and final evaluation; separation of recorded research stages from observed prices.
- `app.mjs`: replay navigation, step selection, summary and warning rendering, source-asset/timeframe isolation; user-marked scenarios remain separate.
- `candle-chart.mjs`: amber inspection cursor shown only when exact source time and actual closed bar price agree. No synthetic line or future cursor.
- `scenario-map.mjs`: carries the original verified anchor close alongside the immutable research envelope.
- `index.html` / `styles.css`: responsive 5-step on-device review UI.
- Regression file `test-scenario-replay.mjs` covers complete source evidence, price/time gaps, future candle exclusion, conflicting results, duplicate bars, anchor discrepancies and unlogged stages.
- Signed Android APK workflow includes the new module and tests. No Room migration, new native permission, wallet integration or changes to the published research model.

## Manual Android acceptance
1. Install the signed update over the previous APEX 9.0.226, preserving application storage.
2. Open **Прогнозы → Паспорт** for one historical scenario. Select **H1**, choose the original scenario card and move through 0–4.
3. Confirm each available H1 step shows an actual closed source candle and the chart highlights that candle, never a blank future time.
4. Check that the percentage relative to the original anchor reflects only the observed close (it is **not profit** or a prediction).
5. An incomplete study or a missing candle must show an explicit missing/not-yet-closed state without a replacement price.
6. Confirm that a candle with a valid saved close but no matching journal event is marked as price observation **without** an official research stage confirmation.
7. Offline: existing cached candles still show the historical replay; freshly fabricated updates must not appear.
8. Switch asset or timeframe to confirm old replay observations are not carried into another asset's chart.

## Known limits
The existing Android Room research journal query returns at most 75 recent scenarios. A scenario can be absent from Replay despite existing in older Room history; the UI warns when the returned journal is partial. The locally stored candle cache is bounded and might no longer contain a historical anchor/H1 horizon. This is missing evidence, not proof that a scenario had no outcome. The replay verifies consistency of stored data; it is not independent external price-source verification.
