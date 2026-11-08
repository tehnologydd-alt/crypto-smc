# APEX 9 — Research Stability

This release extends Research Patterns with a fully local, source-gated historical uncertainty view. It does not change original forecasts, create trading signals, configure orders, or call external APIs.

Where: Прогнозы → Качество исследований → Research Patterns → Research Stability.

Source gate: it reuses validated, verified, nonoverlapping, completed 4-hour H1 outcomes. If Research Patterns reports insufficient history, incomplete Room journal, missing H1 bars, inconsistent published outcomes or malformed source, ALL stability rates and ranges stay hidden.

For each predefined class and each of the three chronological periods the view shows the observed share with Wilson interval (nominal 95%), sample count, and early-to-late percentage-point change. The overlap marker is only a descriptive hint, never a statistical or predictive claim.

Limitations: Wilson intervals assume independent Bernoulli events. Market observations can be correlated, and 12 observations per fold are very few. Neither overlapping nor disjoint intervals prove future stability, predictive power, independence, or profitability.

Tests: apex9-preview/test-research-stability.mjs covers extremes, invalid counts, insufficient/incomplete source states, cross-period change, and duplicate classification IDs. CI stages research-stability.mjs in Android assets, runs tests, and builds APK via the existing GitHub Actions workflow.
