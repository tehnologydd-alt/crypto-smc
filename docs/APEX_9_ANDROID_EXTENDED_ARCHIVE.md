# APEX 9.0.249 — Extended Research Archive

## Changes
- Android Room now retains up to 4,320 completed intervals per asset/timeframe instead of 500 (H1: approximately 180 days). This applies as source data are collected; previously deleted bars remain absent.
- Native getResearchForecasts supports an optional offset only for asset-scoped queries. ORDER BY publishedAt DESC, id DESC gives deterministic pages. Counts are per asset.
- Native getCandles supports an optional offset and returns a real stored-bar count per asset and interval; there is no synthetic interpolation. Source write batches stay bounded to 600 OHLCV bars.
- Read-only JS bridge assembles up to 1,500 research records and 4,800 candle records per manual audit, checking native offset acknowledgments, source identity, unique IDs/timestamps, page ordering and stable counts.
- The existing one-page API remains available to the original callers. Older APKs that ignore offsets cannot accidentally pass the new archive gate.
- Evidence Lab, Research Patterns and Research Stability inspect full bounded per-asset archives. When still truncated, missing source bars or overdue outcomes are found, historical rates and Wilson intervals stay hidden. The Evidence Lab displays saved-vs-loaded counts.

## Data integrity
- No new Room migration or destructive cleanup. Published forecasts and first verified results remain immutable.
- Existing Binance Spot H1 collection downloads only the latest 180 hourly bars per pass. Increasing retention protects accumulation over time; it does NOT backfill already missing hours.
- Background capture and foreground audit can occur together. A change in per-asset total or evaluated count between pages causes a fail-closed error.
- Reported retention describes an upper window, not a verified number of continuous days of history.
- No live trading, accounts, orders or fabricated scenario probabilities.

## Checks
Automated JS tests cover multi-page assembly, bounded partial archives, old APKs, mutation during pagination, repeated candles, real timeline gaps and refusal to report percentages on incomplete candle archives. Android Gradle compiles the new Room queries. Manual on-device update tests are needed to confirm local data survives install over the previously signed preview.
