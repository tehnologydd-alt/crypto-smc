# APEX Android First — Stage 9: On-Chain Core 2.0 (GRAM/TON + historical H1 comparison)

## Features
The phone-first research app now supports three independent public network scopes:
- BTC (mempool.space): pending transaction count, virtual size and indicative fees.
- ETH (Blockscout Ethereum): explorer transaction/block counters, utilization and valid gas estimate.
- **GRAM (native coin of The Open Network, TON)**: TON Center API v2 `GET /getMasterchainInfo`. Only the latest **masterchain block sequence number** is used; the endpoint does not give transaction count, wallets or exchange flows. New network source: `toncenter:ton:masterchain`.

The current name is GRAM while the underlying network is still TON (rename confirmed in July 2026 Blockchain.com support). The app does not map the legacy TONUSDT ticker or arbitrary jettons with a matching name to this network without a verified asset identity.

## Security, network and provenance
- Keyless HTTPS GET only, no wallet signatures, no account APIs, no passwords, no trading or transaction broadcast.
- Public TON Center keyless access is rate limited (roughly 1 request/second). App requests one snapshot at a time and retains existing on-demand refresh throttling.
- TON parser requires `ok:true`, a masterchain workchain ID of `-1`, a safe positive `last.seqno` and plausible block hashes. It marks capture time as **CLIENT_CAPTURE_NO_PROVIDER_TIMESTAMP** rather than presenting provider timestamps that were never supplied.
- Existing native Android Room `research_observations` stores network snapshots, with a strict source/asset/history query. Room stays at **version 4**; no destructive migration. Existing favorites, candles, immutable forecast stages, liquidity history and preferences remain untouched.
- The on-chain dashboard presents BTC, ETH and GRAM with their distinct and clearly labelled metrics. Missing data remain missing, offline caches are historical, and captured points are never backfilled.

## On-chain and Market Core historical comparison
- An explicit button **Сопоставить историю** reads already-saved network observations and H1 candles for the exact same selected asset; if H1 history is missing it fetches authentic Binance Spot H1 once at the user's request and saves only completed bars.
- Every network snapshot is matched to the **latest completed H1 candle at or before collection time** — no future candle leakage.
- Multiple snapshots from the same clock hour are collapsed into **one hour**, chosen as the latest captured snapshot for that hour.
- The module excludes missing intervening H1 bars and skips time gaps longer than six hours; changes are normalized per hour.
- BTC uses hourly change in observed mempool transaction count; ETH uses hourly change in reported network utilization (percentage points); TON uses observed masterchain block sequence growth per hour.
- At least **12 valid contiguous time-interval comparisons** are required before a descriptive Pearson r can be displayed. Sparse observations, invalid sources and a constant series yield explicit insufficient/low-variation results.
- r is **not** forecast probability, profit likelihood, a direction signal, statistical significance, or causality. No p-value, backtested win rate, or automatic price trading is generated.

## Source references
- TON Center API v2 authentication and API reference: https://docs-next.ton.org/api/v2/authentication and https://docs-next.ton.org/api/v2/blocks/get-masterchain-info
- Currency renaming information: https://support.blockchain.com/hc/en-us/articles/28894576327068-Toncoin-TON-renamed-to-GRAM

## Manual Android verification
1. Install the latest signed APK over 9.0.140, retaining all Room and DataStore contents.
2. Open **Актив → On-Chain Core** for **GRAMUSDT**, confirm `GRAM · сеть TON` and real masterchain seqno; refresh after a few minutes and check locally stored history.
3. Switch to BTCUSDT and ETHUSDT; verify original network statistics remain visible and source-specific.
4. Choose an unsupported symbol and verify there are no inherited network measurements.
5. Tap **Сопоставить историю**. Initially the app may report insufficient paired hours; that is an expected, correct result. After sufficient independent real observations, inspect Pearson r as retrospective statistical context only.
6. Switch assets during a fetch: old results must not appear for the new asset.
7. Disconnect network: previous snapshots remain local and are marked historical.
8. Check the phone's status bar, gesture inset, favorites and four-stage forecast journal after upgrading.

## Explicit limits
TON Center API may not be reachable from every network or Android WebView. Current source is one publicly hosted provider per network, so independent confirmation of chain data has not yet been implemented. Analyses use collected observations, not a full blockchain index and not wallet/account tracking. Correlation is not validated predictive power.
