# APEX Android First — Stage 6: Visible Liquidity History

## Goal
Help Android users understand how **visible public spot order-book snapshots** changed through time, without mislabeling them as true hidden liquidity, liquidations, a persistent wall map, or predictive signals.

## Implemented
- Reuses the already existing Room v4 `research_observations` table, filtering by exact asset and `kind='liquidity'`. No schema migration is needed and existing observations, forecasts, settings, favorites and outcomes remain intact.
- Adds a bounded read-only Kotlin Capacitor method `getLiquidityHistory(asset,limit)` (up to 200 entries) and a matching JavaScript bridge.
- Future public depth snapshots save **visible bid/ask notional and number of quoted levels**, besides the existing spread, best bid/ask, timestamp and imbalance. Older saved snapshots continue to display valid older metrics; unavailable fields remain missing.
- New pure local `liquidity-core.mjs` validates symbol, venue, timestamps, bid-ask ordering, spread consistency, `[-1,+1]` imbalance and (when present) notional/imbalance consistency.
- Historical analyses are **separate for Binance Spot and Bybit Spot**, because their public sampling depth limits differ. Venue totals are never pooled or interpreted as comparable market-wide supply/demand.
- Shows latest observed imbalance, quoted spread, exact capture time, sample count and sample depth separately per venue.
- The change between the first and latest snapshot is only shown when **three or more saved snapshots span at least two minutes** and no gap exceeds one hour. Fewer samples are marked as insufficient. This is a descriptive heuristic, not evidence of true wall persistence or prediction.
- Canvas history depicts Binance/Bybit separately and **breaks lines across gaps exceeding one hour**. No missing observation is synthesized.
- If a sample is more than three minutes old, it is marked **historical** rather than current liquidity. Offline access is explicitly marked as Room local history.
- Existing foreground market refresh stores public snapshots; no additional rapid-polling background service is introduced for order book depth.
- The existing optional Android WorkManager periodic research is unchanged and **does not guarantee continuous order book capture**.

## Verification
- Pure Node tests for rejecting malformed data, mixed venues, cross-symbol data, inconsistent notional, sparse samples, source freshness and time ordering.
- Android CI builds the signed APK with Kotlin plugin and the new UI. On-device install-over-existing-APEX must preserve local Room observations and favorites.
- On Android: open **Актив**, observe **Стаканы разных площадок** followed by **История видимой ликвидности**. Refresh a few times several minutes apart. Check counts, timeline and timestamps. Switch to another asset; its history must be separate. Disconnect internet to see older snapshots with the historical status.
- For periods without actual observations, do not infer order-book changes.

## Future
Track individual large price levels with real historical bid/ask *level arrays*, robust quote normalization, cancel/repost detection and source-specific persistence criteria before making any statement about level stability. That is **not** part of this stage. Deeper derivatives open interest, public liquidation datasets and blockchain activity are separate modules.

No trading execution, no private keys, no position management, no hidden order claims.
