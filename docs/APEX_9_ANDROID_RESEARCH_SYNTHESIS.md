# APEX 9 — Research Synthesis

## User benefit
A single explanatory, read-only historical research summary for the asset selected on the Quality Research page. The manually triggered report describes what genuinely appeared in source-verified price history, where time-segment comparisons differ and what cannot be established. No AI certainty score, directional forecast, trading recommendation or automated exchange controls.

## Sources
- Select exact asset from the existing evidence-asset selector; read its original closed 1H candles from the existing paginated, read-only Android Room bridge, max 4800.
- Independently run historical Research Regimes, Regime Stability, Transition Lab and fixed 60/40 Research Holdout with the 40-hour embargo. If the original archive is incomplete, time-disordered, gap-filled, future-dated, or fails structural validation, all observations and all percentages are hidden.
- For BTC, ETH or SOL only: read remaining two archives and invoke Cross-Asset Research on the fixed three-asset universe. Missing or partial peers cannot be fabricated. Cross-Asset data appears only after exact same-hour alignment; exclusions and limitations remain visible. Other assets receive a truthful single-asset synthesis with Cross-Asset marked not applicable.

## Three narrative groups
1. Observed in verified history: source count, closed 4H windows, mode frequencies, transitions, available holdout counts, same-hour cross-asset matches when corroborated by real Room archives.
2. Historical discrepancies: descriptive largest observed differences between early/late mode frequencies or holdout transitions at a predeclared 20 percentage-point threshold; low pairwise same-mode agreement below the predeclared 45% descriptive threshold. Neither threshold is a hypothesis test nor gives model confidence. Selecting only the maximum across categories increases multiple-comparison risk, which is disclosed.
3. Missing or not established: sparse origin regimes (fewer than 15 independent-to-segment transitions), absent or mismatched peer archives, unverifiable source history, and universal caution that past comparisons do not prove forecast accuracy, causality or future returns.

## UI/state lifecycle
The manual Research Synthesis button on Quality Research uses the same asset selector and progress text; an explicit Stop button and asset-selection change invalidate all in-progress asynchronous reads, with no stale cross-asset results. Repeated taps are disabled while busy. A source/status strip and source names accompany every observation. All text uses textContent, not dynamic HTML.

## Testing
Pure source-derived module apex9-preview/research-synthesis.mjs, Node tests test-research-synthesis.mjs. HTML/UI apex9-preview/research-synthesis-dashboard.mjs, packaged as mandatory Android web assets. Assertions include valid solo and three-asset research, missing peer data, gapped primary input, future bar and asset mismatches, fixed thresholds and data modification isolation. Android CI build and test passing is not equivalent to testing with the installed app and live on-device archive.
