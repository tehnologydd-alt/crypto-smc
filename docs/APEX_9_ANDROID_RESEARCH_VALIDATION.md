# APEX 9 Android First — Research Validation Lab

## Purpose
A conservative, device-only retrospective experiment that asks: *does the historical behavior of the frozen APEX range model look similar across three successive periods, and how does it compare with a simple predefined baseline?* It is **not** a trading signal, model optimization, live forward validation, or a claim of future predictive skill.

## Data and fixed methodology
- Uses only **real, previously cached Binance Spot H1** candles from the existing Android Room cache via `getMobileCandles(asset,'1h',500)`. No new market API requests, extra Android permissions, server, wallet features or external credentials.
- Validates each candle's OHLCV values, H1 alignment and actual close timestamp. Future or still-forming bars never enter training or target observations. The calculation is cancelled if the saved historical period contains missing hourly candles.
- Uses **96 H1 candles as a rolling training origin**. Each candidate window evaluates the closing price exactly four *later* completed H1 candles away, then advances the origin by **four full hours** to keep target windows non-overlapping.
- Model A: historical 80th percentile of the absolute 4-hour log changes in the preceding 96 bars (92 historical changes).
- Fixed reference B: **2× the median** absolute 4-hour log change from exactly the same preceding 96 bars. This was selected before inspecting any app results and is not optimized or fitted to holdout outcomes.
- Both models form a symmetric log-price interval around the latest known close. The observed target close is checked only **after** that four-hour horizon.
- Because one model could increase its containment frequency simply by expanding the width, compare *both observed containment and average interval width* and use a **fixed historical interval score**: `2 * width + 10 * max(0, |log(target/anchor)| - width)` on log-price scale (alpha=0.2). Lower mean score means lower retrospective width-plus-miss penalty, not future reliability.
- Minimum **45 non-overlapping** historical target windows, organized chronologically into **three sequential periods**, minimum 15 windows each; otherwise only the reason and available sample count are shown.
- The three periods are sequential historical replay folds, **not statistically independent holdout datasets**. Prior training windows may overlap across folds. No confidence levels, statistical significance, causal analysis, or claim of stable future behavior is issued. A true prospective/externally verified test is a later and distinct task.

## Android implementation
- `apex9-preview/validation-core.mjs`: pure deterministic rolling-origin comparison, strict source/timestamp/gap validation, fixed training and horizon rules, per-period descriptive aggregates.
- `apex9-preview/validation-dashboard.mjs`: interactive phone panel showing three successive periods. Bars plot two **comparative scores** on the same scale. The current Evidence Lab asset selection is used.
- Existing **Прогнозы → Evidence Lab** page gets a separate **Research Validation · исторические периоды** section with one button, `Сравнить исторические периоды`.
- Existing favorites up to ten assets, immutable forecast journal, source audit, liquidity/on-chain research, Android safe-area offsets and local Room v4 remain unchanged. No schema migration is required.

## Scope and interpretation
This experiment uses retrospective closed historical bars. It does **not** replace the app's real forward-published research forecast journal, and its outcomes must not be added to the journal or misrepresented as prospective results. An 80th historical percentile does **not** certify a calibrated 80% forecast probability. Good scores in replay do **not** prove that the method will work in future. This module is for research-quality diagnostics.

## Acceptance
- JS tests: fixed training/horizon/fold rules, disjoint target windows, future-forming candle exclusion, no lookahead in earlier training windows, strict gap rejection, low-variation rejection, and insufficient history.
- Android CI: all current tests pass, web module is present in signed Capacitor package.
- Install over the previous signed APEX, open Прогнозы → Evidence Lab → Research Validation, select an asset with enough cached H1 bars and run comparison. View separate three periods. If insufficient cached history, see an honest reason with no fabricated scores. Disconnect from the network to verify local-only operation.
