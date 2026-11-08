# APEX 9 — Research Regime Stability

## Research question
How different were the observed frequencies and subsequent four-hour outcomes of fixed H1 market-regime categories between three chronological historical periods? The platform does NOT say a past regime predicts the next four hours or proves a stable pattern.

## Data and safety gates
- Research Regimes uses real, completed H1 OHLCV previously saved in Android Room.
- Only the existing single-asset, fully loaded, gap-free, source-validated DESCRIPTIVE report is accepted.
- A second integrity gate verifies every 4H anchor and target are exactly four hours apart, windows are consecutive and non-overlapping, classifications are allowed, and outcomes are finite original measurements.
- All period sizes, boundaries, regime counts and volatility counts are rederived from source-audited windows. Any mismatch hides all percentages.
- Fixed rules: 3 periods with at least 15 non-overlapping 4H outcomes per period. Conditional post-anchor rates require at least 12 observations belonging to the same regime in EACH period; insufficient rates and medians are hidden. Prevalence by period uses its 15+ window denominator.

## Metrics
- Regime prevalence: historic fraction and approximate 95% Wilson interval in each period, with early-to-late percentage-point difference.
- Volatility modes: historical frequency of expanding, stable and contracting observations with a percentage-point change.
- Post-anchor outcomes by regime, only when sufficiently sampled: next 4H close inside the original 20-H1 corridor; approximate Wilson interval; median absolute four-hour log change.

## Statistical interpretation
Wilson intervals assume observation independence which is questionable for financial time series; neighbouring 40-H1 training windows overlap. Crossing or non-crossing 95% intervals does not establish or refute stability. Multiple categories are compared without adjustments. No causal inference, forward-calibrated confidence, trading recommendations or exchange accounts.

## Implementation and verification
Pure function in apex9-preview/regime-stability.mjs reuses the reviewed Wilson method in research-stability.mjs and is rendered below Research Regimes without an additional button or network call. Tests cover real and synthetic cohorts, source-gate rejection, chronology and count tampering, low within-regime case counts, and future outcome isolation. No Room schema changes or destructive data operations.
