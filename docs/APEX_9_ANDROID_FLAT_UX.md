# APEX 9 — Flat UX and Navigation Restructure

## Problem
The expanding research app developed an unnecessarily long asset passport and one giant stacked Quality page. Users had to scroll through unrelated panels or navigate Forecasts before reaching core research.

## New first-level navigation
The bottom dock now has five primary destinations: Overview, Asset, Scenarios, Research and Sources. Research is a first-class tab rather than a submenu under Scenarios.

The asset passport provides exactly three adjacent primary tasks: **Graph**, **Structure** and **Data**. The actual historical price chart is first under Graph. Existing scenarios remain under Graph; Market Core and multitimeframe structure are grouped under Structure; order-book history, network context and public source data are grouped under Data. The asset's research explanation button remains visible above all three.

Research provides five first-level tasks: **Summary**, **Data**, **Checks**, **Regimes** and **Assets**. Summary gives existing source-based Research Synthesis. Data displays the Evidence Lab, local H1 sources and manually initiated archive repairs. Checks groups historical validation and study patterns. Regimes shows the regime, transition, stability and holdout studies. Assets contains the historical, exact-time cross-asset comparison.

A single always-visible asset selector at the top of Research applies to all five tasks. It is no longer buried within Evidence Lab. All original analysis handlers and native Android Room source elements remain mounted; visibility is managed with CSS instead of recreating or duplicating dashboards.

## Accessibility and integrity
Primary section controls are real 44–46px buttons with pressed-state announcements, keyboard focus, no nested tree and a small-screen layout. The direct favorite "Почему?" link opens the correct selected asset in Research Summary. Normal Research dock entry starts in Summary. Sources and Scenarios remain direct dock tabs.

No algorithm changes, fake market data, exchange execution, database migrations or new network permissions. The flat-workspace route helper is pure; it resolves invalid section names to safe defaults.

## Verification and Android walkthrough
CI runs historical source integrity tests plus new checks for all five dock destinations, the three asset tasks, five research tasks, only one shared asset selector, unchanged source panel IDs and asset-specific explanations.

On a phone: open Research directly from the bottom dock, choose all five tasks, switch selected asset without stale evidence; open Asset and switch Graph/Structure/Data; from an ETH favorite tap "Почему?" and verify ETH's Summary with return to the ETH passport. The chart should be first, touch targets legible at narrow widths and local H1 data should never be synthesized to hide gaps. Physical Android device validation remains a separate test.
