# APEX 9 — Research Holdout: purged historical validation

## Aim
Compare the frequencies of predeclared historical regime transitions in early and later, temporally separate segments. Do not treat historical differences or approximate confidence intervals as price predictions, calibrated probabilities, evidence of causality, or trading performance.

## Data, split and integrity
1. User manually starts Research Regimes, reading a completely loaded, closed, source-checked H1 Room candle archive for exactly one asset.
2. The new pure module re-runs analyzeRegimeStability to verify the original 4H labels, timestamp chronology, all three period totals, and allowed modes.
3. First floor(60% of N) 4H labels form the reference. Ten additional 4H windows (40H) are excluded. The remaining labels form a later holdout. There are exactly 44H between the last reference label and first holdout label; this makes their classification windows (40H lookback) nonoverlapping.
4. Each segment contains only its own consecutive 4H transition pairs; no transition pair bridges reference, embargo or holdout.
5. At least 144 original windows are needed before any analysis. Each originating mode needs at least 15 transition pairs in BOTH segments to show conditional historical shares and approximate Wilson bands. Sparse modes show only counts, with no rates.
6. There is no model training or selection on the holdout, and all thresholds/split are specified before comparing.

## Important limitations
Temporal separation does not make market observations statistically independent. Consecutive 40H training windows inside each segment overlap, and broader market regimes are serially correlated. Approximate 95% Wilson intervals rely on simplified independent-event assumptions, and intervals are not adjusted for multiple comparisons. Historical consistency can be described but cannot establish future predictive reliability.

## UI and engineering
The existing manual Research Regimes analysis now includes a collapsible Research Holdout panel with reference and later sample sizes, excluded hours, and per-origin destination comparisons. No new network requests, automatic analysis, exchange credentials, orders, on-device Room migrations, altered source candles or changed immutable research forecasts. CI checks source syntax, genuine and synthetic fixtures, historical completeness, no look-ahead, embargo, count conservation and low-count suppression.

## Phone check
Install the new Android research APK over the matching signing-key version. Keep the previous data intact and verify the selected asset's local H1 archive is complete. Run Research Regimes, expand Research Holdout, and verify that changing the asset does not retain the previous study. Confirm no historical percentages appear for partial or missing source data.
