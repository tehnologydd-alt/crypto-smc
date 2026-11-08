# APEX Android First — Stage 8: On-Chain Network Core

## Purpose

On-device, research-only Bitcoin and Ethereum **network** statistics, backed by bounded local Room observations. This is not transaction surveillance, wallet identification, exchange flow, "whale" detection or price prediction. The feature is built on public, unauthenticated HTTPS GET endpoints.

### Network sources

| Asset's native network | Public source | Actual metrics | Timestamp interpretation |
| --- | --- | --- | --- |
| BTC | `https://mempool.space/api/mempool`, optional `/api/v1/fees/recommended` | Unconfirmed mempool transaction count, vbytes and aggregate fees, optional indicative fee rate | Time of collection on Android. API does not provide source event time for the aggregate |
| ETH | `https://eth.blockscout.com/api/v2/stats` | Explorer counters for blocks, transactions today, total transactions, network utilization, estimated average block time, optional recent gas estimate | Time of collection on Android; gas has its own provider timestamp, checked for freshness |

A source failure is a separate `OFFLINE`, `INVALID`, or `RATE_LIMITED` state. A failing optional Bitcoin fee request never creates a fabricated fee and does not discard independently valid mempool data.

### Asset mapping

Only native `BTC` and `ETH` pairs receive these network adapters. The application **does not silently substitute Bitcoin/Ethereum network data** for GRAM, TON, wrapped BTC or unrelated altcoins. Those assets are honestly marked unsupported until a direct, verified chain adapter exists.

### Local Android architecture

- `apex9-preview/onchain-core.mjs`: fixed public source URLs, strict numeric/time normalization, explicit source scope and a deterministic local summary of previously captured observations.
- `apex9-preview/onchain-dashboard.mjs`: on-demand network panel on the **Актив** page with metrics, source state, local snapshot counts, cache warnings and a timeline with visible gaps.
- `apex9-preview/mobile-bridge.mjs`: saves only valid `OK` network observations, with source-specific IDs and original capture timestamps; reads historical records through the native plugin.
- `ApexDatabase.kt`: a new read-only DAO query over existing `research_observations` rows for `kind='onchain'`; **Room schema remains v4**.
- `ApexNativePlugin.kt`: `getOnChainHistory` reads at most 120 matching network-level records for the exact asset and source. No access to wallets, keys, orders, funds or private endpoints.

Observations are stored under the exact pair, actual provider, network and capture time. Existing 14-day retention policy for research observations still applies, so network history is intentionally bounded. **No historical data is invented for periods when Android was offline.**

### Phone / power behavior

Network data is fetched when the Asset view is opened (or via its explicit Refresh button) and throttled to roughly once every four minutes while that asset is selected. The graph is calculated from device-local, previously captured points. Long gaps in history are drawn as disconnected line segments. There is no new always-on service, and no required cloud server.

### Preservation and verification

- Existing user favorites (up to 10), active research scenarios, immutable forecast journal, candle cache, liquidity history and Android safe-area handling remain in place.
- Node unit tests cover chain isolation, malformed data, UTC gas timestamps, stale history, fee source failure, no credentials and offline behavior.
- Signed Android APK compilation confirms the JavaScript and Kotlin plug-in methods are packaged.
- On a real phone: open **Актив** with BTCUSDT, inspect mempool/fees, refresh after a few minutes, check that history appears; switch to ETHUSDT and see Ethereum network counters; select GRAMUSDT and verify the **unsupported adapter** warning; finally disconnect internet to confirm older records are marked historical.
- Rate limits, API availability, low battery and connectivity need real-device testing.

### Non-claims

Mempool pressure, gas prices and network utilization are descriptive measures of the networks only. A correlation with a market move is not evidence of causation. The current module makes **no** buy/sell, direction, sentiment, probability, wallet-label or liquidation claims.

Public documentation: `https://mempool.space/docs/api/rest` and `https://github.com/blockscout/blockscout-api-v2-swagger`.
