# APEX 9 — Research Regimes (historical, no look-ahead)

## Intent
A new manual "Research Regimes" panel under Quality Research uses **only** the same real closed Binance Spot H1 candles already persisted in Android Room. It categorizes market behaviour and retrospectively describes what occurred over the next four complete hours. This is research, not a price predictor, simulated trading or an order signal.

## Predeclared methods
- Anchor regimes require 40 already-completed hourly candles: the older 20 are the volatility reference; the newest 20 describe price path efficiency and recent volatility.
- Price path efficiency = absolute log-close displacement divided by total absolute hourly log-close path across the most recent 20 observations. >=0.57 = DIRECTIONAL; <=0.28 = RANGE; otherwise TRANSITION. These are fixed existing APEX market-core thresholds, not fitted to sample outcomes.
- Volatility state compares RMS H1 returns over the newest 20 completed bars with the previous 20 bars; >=1.25 = EXPANDING, <=0.80 = CONTRACTING, else STABLE. If baseline is effectively zero, nonzero volatility is EXPANDING, and two zero intervals are STABLE. Values are descriptive and not independently calibrated.
- Outcomes are observed exactly four hours AFTER each previously fixed anchor. Windows step in four-hour increments, so four-hour target outcomes never overlap. The next 4H close is checked against the original 20-H1 high/low corridor and the absolute four-hour log change is summarized by median.
- Split chronological windows into three consecutive equal-count periods. Minimum 45 windows overall and 15 per period; per-mode fractions and medians remain hidden unless each of the three periods contains >=5 cases for that mode. Counts can be shown even when per-mode rates are withheld.

## Trust and limitations
- Strictly source-verified and asset-scoped local archive (up to 4,800 bars) with accurate completeness metadata. Source rows must be all closed and strictly chronological. Any OHLCV invalidity, unknown archive completeness or missing historical hour blocks empirical fractions; no interpolation, cherry-picking or fallback.
- H1 label sees only candles at or before the anchor, never future outcomes or future reports. Older training windows do overlap despite non-overlapping four-hour targets. There is no independent validation of source prices, no causal identification and no claim of future forecast reliability.
- There is no new network request, trading account, order interface or generated historical record. Existing saved forecasts and their immutable outcomes are unchanged.
- Automated tests verify trend/range regimes, time isolation, disjoint 4H outcomes, three chronological periods, source gaps/future candles, zero volatility, missing source completeness, and all cohort sample gating.

## Manual verification
On a phone with a populated Room H1 archive, open Quality Research → Research Regimes and run a selected asset. Confirm that switching the selected asset clears previous results, that all displayed counts refer to that asset and that an incomplete or gapped archive shows no empirical rates. Validate the Android device/OS performance with 4,000+ real H1 bars.
