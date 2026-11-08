# APEX Android First — Stage 7: Sampled Visible Price-Level Observer

## User-visible feature
**Актив → История видимой ликвидности → Крупные видимые уровни** now describes how unusually large **visible** bid/ask price buckets appear in successive public spot order-book snapshots from Binance and Bybit.

The system never identifies order owners, infers order cancellation, claims that levels were continuously present between snapshots, extrapolates hidden liquidity, or triggers a trade.

## Source scope and calculations
- Existing public, unauthenticated Binance spot depth (up to 100 bid and 100 ask levels) and Bybit spot depth (up to 50 levels per side) continue to be collected only when the existing market update runs.
- After validating source timestamps, depth crossing, nonzero quantities and finite notional, the adapter selects at most **eight highest-notional levels per side and venue**.
- Stores side, price, quantity, visible notional and a **ratio to the median visible notional on the same side of the same venue snapshot**, plus a scope marker `TOP_8_NOTIONAL_PER_SIDE`.
- Uses existing native Room `research_observations` payload (16 KB maximum) and bounded local `getLiquidityHistory` method. No destructive Room schema migration is required.
- Descriptive "large" threshold is **2× the side median**, with no inference of market support or resistance.
- A quoted price bucket is **repeatedly observed** only after at least three separate snapshot appearances across at least two minutes. Matching is strictly by venue, side and same quoted price; different venues do not form one price level.
- If a previously observed level is outside the latest saved TOP 8, it can be labelled **"not in latest sampled TOP 8"**. This is **not evidence of order cancellation or relocation**; sampling scope and volume ranking can change.
- Snapshot history is filtered to the last six hours before the latest saved snapshot for this interpretation. Missing or stale observations never become live data.
- When an older APEX installation is upgraded, its previous aggregate liquidity data stay intact; only newer snapshots contain individual sampled levels.

## UI and performance
- Phone-friendly single-column level cards below the existing liquidity timeline (two-column on wider screens), separately for Binance and Bybit.
- Each card includes BID/ASK, quoted price, size relative to its source median, observed notional and time last seen.
- View is read-only and recalculates locally from the already queried Room history. No extra exchange requests, permissions, or background services are introduced.
- User-selected 10-asset watchlist, Android safe-area insets and forecast lifecycle remain unchanged.

## Validation and honest limitations
Tests verify public source parsing, bounded level count per side, absence of invented time metadata, rejection of impossible prices/notional, old aggregate-only snapshot treatment, separate venues, three-observation threshold and non-cancellation statuses.

**Important:** A public depth snapshot does not prove that a particular order existed continuously between observations; also several orders can share one displayed price. This module does not establish transaction intent, manipulative conduct, liquidation risk, or forecast skill.

After installing the signed APK over the previous signed version, open **Актив**, allow real market snapshots to accumulate, and inspect the separate Binance and Bybit level cards. When offline, prior observations remain strictly historical.
