# APEX 9 — Cross-Asset Research (historical H1)

## Purpose
An opt-in, phone-local evidence comparison of BTCUSDT, ETHUSDT, and SOLUSDT on an identical H1 time axis. These assets can share broad cryptocurrency market factors: matching historical regimes are not independent validation or evidence of future price movement.

## Source and exclusions
- The user manually presses Compare BTC / ETH / SOL in Quality Research; each exact archive is read from the existing paginated Android Room bridge. Progress, cancellation, verified counts and explicitly excluded archives are shown.
- The pure analyzeCrossAssetRegimes function enforces the fixed three-asset universe and validates every complete archive with the existing analyzeResearchRegimes routine, including source OHLCV validity, all bars closed in the past, hourly chronology and absence of gaps.
- At least two fully valid archives are required. An absent third archive is shown as excluded, not silently ignored.
- Determine the exact common first/last H1 open timestamp across all verified assets. Keep every H1 row within that range. Require exactly one row for every common H1 hour in every included asset; re-run the regime audit on aligned slices. Missing candles are never filled, interpolated or shifted.
- Need at least 144 identical nonoverlapping four-hour historical windows. Each asset uses the same predefined 40H lookback thresholds. Compare historical counts and mode frequency on exactly matched anchors, not different calendar periods.
- For each asset show the total and per-mode frequency, and four-hour persistence share only when at least 15 qualifying originating transitions exist. Pairwise regime agreement is a count of exact same-mode labels at the same H1 anchor, shown overall and over three matched chronological folds.

## Interpretation
The interface shows counts and descriptive fractions, not an AI quality score or trading recommendation. Cryptoassets can be correlated; cross-asset agreement cannot establish causal links, market independence or a predictive advantage. Historical mode labels do not know the next four-hour label. No live signals, exchange orders, automatic downloads or inferred source values.

## Engineering and verification
The pure module is apex9-preview/cross-asset-research.mjs. Deterministic tests cover matched time axes, excluded missing source, partial comparison, invalid history, mismatch, empty overlap, sample gating, count conservation and future-perturbation isolation. The interface is apex9-preview/cross-asset-dashboard.mjs under Quality Research. Both are mandatory Android web assets and part of Android CI tests. No database schema migration or new API endpoint.

## Manual Android check
Ensure at least 30 days of complete H1 candles for two or three BTC/ETH/SOL Room archives. On Quality Research, run Cross-Asset. Verify missing-source disclosure, equal calendar timestamps, no old data after cancelling, and truthful partial counts. Android CI tests do not replace an actual phone test.
