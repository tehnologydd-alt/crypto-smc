# APEX Android First — Stage 2: OHLCV research and local market structure

**Source branch:** `apex-9-evolution`. Previous signed APK: 9.0.45. No order or wallet functionality.

## Features implemented
- Independent, read-only Binance Spot `/api/v3/klines` adapter: authenticated by exact endpoint, source/interval, timestamp coherence and OHLCV constraints. Does not invent bars on network failures.
- Timeframes **M15, H1, H4, D1**. Last forming bar is rendered as unfinished but excluded from analytical labels and Room persistence.
- Touch-friendly Canvas 2D plot: candles, wick, volume, price and date axes; drag history, pinch zoom, wheel zoom, reset and tap-to-inspect exact OHLCV.
- Retrospective **BREAK / BOS / CHoCH** via locally confirmed pivots (two completed bars on each side). Labels require completed source bars; no look-ahead, no trading recommendations, no claim of predictive accuracy.
- Local **Room schema v2** introduces `market_candles` with composite primary key (asset, interval, openTime), source/capture timestamps and limited per-asset/timeframe retention.
- Explicit SQL **migration v1 -> v2** for APEX 9.0.45 databases, preserving existing `research_observations` and `research_forecasts`. No destructive fallback migration.
- Native Capacitor plugin `saveCandles` / `getCandles` exposes only validated closed candles and returns offline history with `LOCAL_ROOM_CACHE` source marker.
- On opening **Актив**, phone loads cached bars first then tries the public API. If API fails, a visible **historical local cache** warning stays on screen.
- `Источники → Локальный Android-центр` adds a count of locally stored candles.

## UI / interaction contract
1. Navigate to **Актив**. 1h OHLCV is fetched from Binance or marked as unavailable.
2. Switch **M15 / H1 / H4 / D1**; the app cancels superseded requests and loads the chosen interval.
3. Pinch/drag the canvas, tap an individual bar for OHLCV values.
4. See source age in a dedicated status. An unfinished bar is visually identified.
5. Scroll to **Рыночная структура** for confirmed historical break markers, not future signals.
6. Disable internet, reopen: previously saved finished bars still display with the correct cached badge.

## Verification gates
- JS fixtures: chronological timestamps, OHLC and volume consistency, stale sources, developing candles and pivot confirmation.
- Kotlin/Room Gradle release compilation.
- Upgrade tests on an actual device: **9.0.45 -> new signed APK** preserving local observations and preferences; new table appears.
- Chart touch gestures and screen rotations on at least a low-memory and midrange Android handset.
- Network offline/slow, unlisted symbols, stale API timestamps and source error UI.

## Known limits
- Data currently comes from Binance Spot only. Regional/API restrictions may block it; other providers are a later task.
- Historical chart is not a cross-venue merged price feed.
- API provides the latest bounded sample, and Room stores a bounded offline history; it is not indefinite tick-level archival.
- BOS/CHoCH labels describe historical events and aren't calibrated predictions or entry signals.
- Fallback history is only available for asset/timeframe pairs previously saved on that device.
- Forecast engine, push notifications and on-chain/source fusion into trained ML models remain future phases.
