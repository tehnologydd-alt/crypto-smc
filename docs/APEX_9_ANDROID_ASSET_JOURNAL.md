# APEX 9 — Per-asset Research Journal

The earlier Android getResearchForecasts query returned the latest 75 forecasts across all assets. That global cap hid older local evidence when many assets were monitored.

This change extends the existing optional native query with an asset argument, a native Room query scoped to the asset, and per-asset published/evaluated counts. Legacy calls without an asset preserve existing behavior. There is no schema migration and no data deletion.

The JS bridge checks that native explicitly acknowledges assetScoped=true, confirms the requested asset, verifies every row belongs to it and confirms totals. Older APKs that ignore the scope cannot claim full coverage.

Evidence Lab, Research Patterns and Research Stability now use a single selected asset. When the selected asset itself has more than 75 saved rows, or when older H1 bars were pruned from the 500-hour candle cache, historical percentages and uncertainty bands remain hidden. Missing evidence is never backfilled or invented.

Tests cover per-asset isolation, partial native pages, old bridge compatibility, malformed records and invalid assets. Device verification should compare BTCUSDT and TONUSDT with nonempty journals and check update-in-place preserves Room history.
