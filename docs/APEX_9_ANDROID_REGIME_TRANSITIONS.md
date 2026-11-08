# APEX 9 — Regime Transition Lab

## Method and boundaries
The manual Research Regimes audit uses real, completed H1 bars saved for the selected asset in Android Room. A source-validation gate checks every regime label, timestamp, fold boundary, count and fully loaded candle history. A new label can be observed only after its own 4H anchor and is not known at the preceding anchor.

Within each of three chronological folds, k already classified regimes produce k-1 adjacent transition pairs. Two cross-period pairs are excluded, preventing contamination of the early/late comparison. Counts form a 3×3 origin-to-later-mode matrix. The diagonal describes unchanged regimes, never a live prediction.

## Statistical gates
All factual counts are displayed. To publish fractions, approximate Wilson intervals or early-to-late shifts for an originating regime, it must have at least 12 outgoing transitions in EACH period. Rates for changing regime grouped by the prior volatility label require at least 12 qualifying observations in each period. Missing timestamps, incomplete archive or inconsistencies block all results. Three folds keep separate denominators.

## Interpretation
Historical transition fractions are not calibrated predictive probabilities. Classification windows overlap for 40 H1 bars, so independence is doubtful. Interval overlap or non-overlap cannot alone establish historical stationarity or future performance. No trade controls, exchange credentials, synthetic source candles, database migrations or modification of archived forecasts.

## Implementation
Pure deterministic module: apex9-preview/regime-transitions.mjs. Tests verify exact 3-fold pairing, 3×3 matrix conservation, no cross-fold transitions, minimum denominators, source integrity and future-label isolation. Rendered underneath Research Regime Stability on the existing manually initiated quality screen.
