# APEX Android First — Research Timeline and Verified Observation Counters

## Scope
Improves the existing **Прогнозы** journal without introducing trading commands, order execution, private APIs, adjustable targets or invented outcomes. Builds on immutable, device-local **Room v4** stage events and outcome records already saved by APEX Auto Forecast.

## What the new UI shows
Each journal card now includes a source-grounded 4-step history:
1. Research hypothesis publication time — sourced from `publishedAt`.
2. First subsequent finished H1 close confirmed within the original range — sourced from the Room stage log's `CONFIRMED.observedAt`.
3. Second subsequent finished H1 observation — sourced from the stage log's `ACTIVE.observedAt`.
4. Target (fourth) finished H1 close evaluated — only sourced from a valid, immutable `research_forecast_results` row, cross-checked against the original published interval.

Each event displays its actual source observation time and, if written to the phone later, also its distinct capture/record time. Missing stage events are not inferred from clock time or UI status.

The card shows the time to the four-hour research horizon while still before it. If the horizon passes and no valid evaluation exists, it explicitly shows **"Результат ещё не проверен: нужны закрытые свечи"**. This does not count as an order cancellation, a loss, a hit or a verified completion. Incorrect or contradictory stored outcomes are clearly marked, not treated as confirmed results.

## Two separate statistics groups
The existing **Все** and user-picked **Отмеченные** observation groups remain distinct. Recorded outcome counts now require strict validation of the source experiment:
- Exact asset/method/hypothesis ID, anchored closed H1 time and four-hour horizon.
- Preserved published range, target time and published-at chronology.
- Actual stored evaluated close in a valid numerical range.
- Outcome WITHIN_RANGE/OUTSIDE_RANGE must agree with that close and original published low/high boundary.
- Evaluation must occur after the real target close and may not be in the future.
- Inconsistent records are separated; elapsed time without a stored result is separated; neither contributes to successful observed range coverage.
- If the Android journal is truncated to its existing maximum 75 most recent records, the UI explicitly says the summary only covers loaded records.

The research hypothesis tests final close containment. These counters are **not TP/SL order hits**, not executable order outcomes, and not independently proven prediction accuracy.

## Implementation
- `apex9-preview/research-timeline.mjs` — deterministic, pure JS timeline and outcome consistency validator.
- `apex9-preview/favorite-dashboard.mjs` — renders a four-stage mobile timeline on each loaded research card, with source timestamps, overdue state and result integrity warnings.
- `apex9-preview/journal-stats.mjs` — applies the same verifier to both all and selected scenarios.
- `apex9-preview/styles.css` — touch-friendly legible timeline, distinct evidenced vs not-yet-evidenced stages.
- `test-research-timeline.mjs` and updated `test-journal-stats.mjs` cover real stage timestamps, due-but-unverified cases, contradictory outcomes, lack of log data, and separate all/tracked counts.

No migrations, secret keys, additional market polling or changes to the baseline research model. The pass/fail of these tests is determined exclusively from verified source rows, not fabricated application state.

## Phone check
Install the signed release over the prior version, open **Прогнозы**, choose **Все** or **Отмеченные**, choose each stage, open a card and inspect its timeline. Confirm that older scenarios do not suddenly acquire missing progress events and that completed scenarios display only independently consistent results. Switch to **Качество исследований** and confirm it is still accessible in its own page, with the prior Evidence Lab and Research Validation behavior intact.
