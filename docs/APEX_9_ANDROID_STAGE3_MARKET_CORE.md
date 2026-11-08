# APEX Android First — Stage 3: Mathematical Market Core

Current stage builds on signed APEX 9.0.61 with real Binance Spot OHLCV, a Room local cache and historical BREAK/BOS/CHoCH labeling.

## Added, phone-first
- `apex9-preview/market-core.mjs`: deterministic, locally computed statistics from **completed candles only**.
- Close-to-close log-return speed (average of the last 4 closed return periods) and change versus the previous 4 periods, labelled as retrospective **velocity** and **acceleration**.
- Relative volume: last closed bar base-asset volume divided by the median of the previous 20 bars. Missing or zero baseline yields no number, rather than fabricated strength.
- History range: lowest low / highest high across 20 closed bars, along with current close position inside it.
- Historical path efficiency: absolute net log movement divided by cumulative absolute log movement across 20 completed bars; a descriptive heuristic for range / directional / mixed market regimes. Thresholds are heuristic, **not trained**.
- Historical volatility from sample standard deviation of log returns per bar (not a forecast).
- Source validity checks: OHLCV coherence, monotonically increasing timestamps, expected interval continuity in the most recent 30 completed bars; invalid/gapped history cannot generate a valid regime.
- Render on the **Актив** page, directly beneath the candle chart, in the agreed black / teal design with 44dp-capable controls and clear sourcing.
- On-demand **M15 / H1 / H4 / D1** comparison. Fetches at most one interval at a time, uses up to 120 candles per interval, and can display saved Room history if the network is unavailable.
- Multi-frame agreement counts **only current valid source observations**. Cached/stale/failed intervals remain visible, but do not contribute to current alignment.
- Replacing a selected asset or switching the chart period cancels the old comparison, preventing one asset's results from being misattributed to another.
- Source and probability restrictions unchanged: no assistant, no accounts, no demo balances, no orders or simulated forecasts.

## Validation
- Node unit tests for closed-only calculations; monotonic rises and declines; nonzero volume baseline; gaps; source age; conflict across timeframes; stale/cached sources; asset isolation.
- Android CI assembles signed APK only after all source and unit tests pass.
- On-device verification still required for gesture UX, API access, mobile battery impact and signed installation-over-app.

## Known limits
1. Market regime heuristics have not been independently predictive-tested. They do **not** represent a success rate, forecast, or entry instruction.
2. Binance Spot public feed may be unavailable in some locations; error and previous cached observations are shown with provenance.
3. Cross-timeframe comparison is manually triggered to reduce battery/network use and should not be described as always monitoring.
4. Current momentum and volume are computed from base-asset OHLCV and are not full trade-by-trade tape or exchange-wide flow.

## How to inspect
Install the signed next APEX 9 APK over APEX 9.0.61, open **Актив**, select M15/H1/H4/D1 and check Market Core under the real chart. Tap **Сравнить 4 периода** to see fresh historical context and missing/stale source statuses. Try offline after candles are cached. No change is made to older forecast tables.
