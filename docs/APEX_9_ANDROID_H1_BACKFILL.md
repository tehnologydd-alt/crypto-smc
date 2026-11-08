# APEX 9 — Verified, on-demand H1 history restoration

## Goal
Allow the user to explicitly request missing, real, already-closed Binance Spot 1h candles for a selected asset, without silently fabricating data or altering immutable forecasts.

## Controls
Research Quality → Evidence Lab → 'История H1 · восстановление пробелов'. Choose 30, 90 or 180 days, click 'Восстановить H1'. The button never auto-runs at launch, on signal creation, on background refresh, or when opening the audit. User can request stop, which takes effect before the next provider chunk; an already-in-flight chunk may finish.

## Acquisition/validation
- Source: official unauthenticated Binance Spot read-only GET /api/v3/klines on data-api.binance.vision with interval=1h and explicit startTime/endTime. No exchange credentials or order endpoints.
- Exactly 240 or fewer hourly bars per chunk. Source must return each expected OHLCV candle in exact chronological order: one timestamp per hour, closed time open + 1h -1 ms, price/volume finite and OHLCV internally consistent. Any short/invalid/misaligned response is rejected before the chunk can change Room.
- Rate-limit 418/429 errors stop without automatic retry. Requests are sequential and paced. App uses a 180-day bound; it cannot automatically reconstruct longer history.
- Room transaction compares any existing candles against the source, refuses conflicting history, and inserts missing bars with OnConflictStrategy.IGNORE. Existing entries, original research hypotheses, immutable outcomes and stages are not overwritten or deleted. If an entire chunk already exists, it is reported as local cache, not freshly cross-exchange verified.
- A chunk failure can leave *previous* valid chunks saved, but never falsely claims completion. A future manual retry skips fully cached chunks.
- Evidence Lab / Research Patterns continue to operate on stored data and disclose genuine gaps. Historical downloaded bars are not forward-published forecasts; backfill cannot retroactively create published research or improve a live forecast accuracy statistic.

## Validation
JavaScript tests cover request windows, closed-only range, bounded chunks, response identity, progress, cancellation, partial failure and unsupported Android. The Android workflow must compile the native Retrofit-free HttpURLConnection implementation plus Room transaction. Real device/provider tests remain necessary, especially across unavailable symbols and HTTP rate limits.

## Limits
Binance may be blocked or a particular asset may not have existed during the requested dates; that is a legitimate source failure. Missing records are not invented, nor is a missing range silently declared successful. 
