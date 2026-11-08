# APEX Android First — Research Patterns (completed studies)

## Objective
Add an evidence-only comparison of **real, already-published and evaluated research scenarios**. The feature shows whether a few observable types of H1 price paths occurred in the stored archive and how their frequencies differed between three consecutive historical groups. It does **not** claim stable future predictability, issue trading signals, place orders or optimize thresholds.

## Where
**Прогнозы → Качество исследований → Research Patterns · повторяемость**.
Choose a single asset through the existing `evidence-asset` selector, tap **Сравнить завершённые исследования**. All data are read from the existing local Room forecast journal and saved finished Binance Spot H1 candles. No new network calls are made by the audit.

## Three fixed mutually exclusive categories
1. **Все 4 закрытия внутри** — all four successive *completed H1 closing prices* after the original anchor remained inside the unchanged published low/high interval.
2. **Выход и возврат внутрь** — one or more of H1 steps 1–3 closed outside the original interval but H1 step 4 closed inside.
3. **Итоговое закрытие снаружи** — fourth H1 closed outside the interval, regardless of the intermediate closings.

Only closes count; brief candle high/low touches are not counted as independent confirmation or target hits. This is NOT a TP1/TP2/TP3/SL classification.

## Evidence integrity
- A source hypothesis must satisfy the **existing strict forward-published forecast** validator (`inspectOutcomeRow`): original 96-bar basis, 4-bar horizon, original anchor/band, reliable publication time and valid outcome stored after the target close.
- All **five** completed 1h OHLCV bars must be available for the same asset (one anchor plus four later closes). Reconstruct with existing **Scenario Replay**. Duplicate timestamps, invalid OHLCV, future bars, inconsistent anchor or final close do not qualify.
- The final actual close is independently compared with the stored result; only a matching source record is classified.
- Exclude overlapping 4-hour target windows to avoid inflating the number of independent horizons. Different assets are **never pooled**.
- Count missing historical candles, corrupted/inconsistent records, unpublished/unresolved matured outcomes, overlaps, and valid observations separately. **Never silently report the remainder as a representative success rate**.
- Only with at least **36 nonoverlapping complete studies** for one asset, distributed into three chronological groups of at least 12 studies, AND a **complete known Room journal with no unresolved matured results or inconsistent source bars**, display observed rates for each category in each period.
- When Android returns only the latest 75 research records but has more on disk, rates are **hidden** and the limited scope is explained.
- The chronological groups are equal-sized observation groups, **not calendar quarters**. Periods are neither independent external validation datasets nor a reliable estimate of future success. A difference in historical shares does not establish statistical significance, causality, or tradable performance.
- The model and published original research outcomes remain immutable, and no new Room migration or Android permission is required.

## Implementation
- `apex9-preview/research-patterns.mjs`: pure deterministic classification and source completeness gate.
- `apex9-preview/research-patterns-dashboard.mjs`: phone-first on-demand Room-backed comparison, with count-only mode when evidence is insufficient or partial.
- `apex9-preview/test-research-patterns.mjs`: cases for all three categories, non-overlap, incomplete Room journal, missing H1, contradictory results, foreign asset isolation, sample minimum and future dates.
- Changes limited to existing Quality UI, asset staging and test pipelines; no new server, wallet, exchange order API or background network jobs.

## Manual Android checks
1. Install the signed update over APEX 9.0.236 without deleting app storage.
2. Go to **Прогнозы → Качество исследований → Research Patterns**.
3. Select a favorite asset in the existing selector and run comparison.
4. Initially there may be insufficient completed 4-hour scenarios or a partial Room journal. You should see source counts and a transparent reason, **not invented historical percentages**.
5. With sufficient continuous local H1 bars and a complete nonoverlapping set, view separate historical period frequency bars for the three categories.
6. Switch asset and confirm old results disappear. Disconnect network to confirm the audit is fully local.
7. Check Favorites, Scenario Map/Replay, Evidence Lab and Research Validation remain functional.

## Limits
Historical source consistency is not cross-exchange validation. APEX caches a bounded candle series and currently retrieves no more than 75 Room research rows per request. Even if three periods exhibit similar observed proportions, no conclusion about future precision is justified.
