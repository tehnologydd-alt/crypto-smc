# APEX 9.0 Evolution — implementation baseline (from APEX 8.7)

## Scope
This document starts the **isolated** redesign branch `apex-9-evolution` forked from `apex-intelligence-v2`. No existing application code, user data or build/release secrets have been changed.

## Verified repository facts (2026-11-07)
- Repository: `tehnologydd-alt/crypto-smc`; source branch: `apex-intelligence-v2`.
- Build workflow: `.github/workflows/apex-v2-android.yml`.
- Runtime app sources are **restored in CI** from `source/APEX_Intelligence_V2.b64.txt`; the `src/` tree is not directly checked into this branch.
- Existing overlays are located under `updates/` and include `apply-watch.cjs`, `apply-v85.cjs` and `apply-v87.cjs`.
- `updates/apply-v87.cjs` explicitly labels release 8.7 and patches the restored `src/App.tsx`, adding read-only public Testnet checks and local simulated order lifecycle.
- The inspected build workflow invokes `updates/apply-watch.cjs` and `updates/inspect-v63.cjs`, **not** `updates/apply-v87.cjs` explicitly. Do not infer that checkout + build currently reproduces 8.7 without verifying the actual overlay chain.
- `updates/configure-release.cjs` rewrites Android versionName as `6.3.<run>`; release metadata should be audited and corrected before publishing any 9.0 build.

## Non-negotiable preservation
1. Radar and complete searchable symbol catalog, including TON.
2. Live public market data and source-status/error reporting.
3. Market structure/Smart Money/forecast lifecycles and per-horizon scenarios.
4. Forecast journal and evaluation metrics, statuses and expiry rules.
5. Existing research/Director, virtual portfolio, and local demo histories.
6. Price and early-warning notifications, including Android background scheduling.
7. Local preferences, watchlists and saved records.
8. No implicit exchange account access or real trading introduced by a UI redesign.

## Proposed navigation
- **Радар** — browse/search, watchlists, actionable summaries.
- **Анализ** — one selected symbol, chart, horizons, forecast and levels.
- **Журнал** — historical forecasts, virtual portfolio and statistics.
- **Ассистент** — explanation, research and assistant-only actions.
- Settings accessed from top app bar; sections currently hidden under Director/research remain reachable in new structure.

## Isolation contract: assistant switch
Persist a boolean `apex_assistant_enabled_v1` with default `true` for an existing user's first migration unless previous preference says otherwise. Turning it off must:
- stop assistant-only polling, AI calls, conversational/assistant push and assistant-only work queues;
- prevent their rescheduling after app restart;
- keep radar data, forecast algorithms, journal, price notifications and core Android background refresh alive;
- preserve assistant history locally, display a clear 'Ассистент выключен' placeholder and allow reactivation;
- not impact existing virtual positions or demo accounting.
Implement the switch in a dedicated settings/service boundary rather than guarding the root App render.

## Migration plan
**Phase 0 — reproducible 8.7 baseline:** inspect overlay chain and build artifacts, confirm package/versionCode/signature, snapshot tests and persistence keys. Gate: CI demonstrates exact 8.7 feature set.
**Phase 1 — design system:** colors, typography, primitives, fixed bottom navigation, overlay modals and semantic states. Gate: responsive screenshots and accessibility review.
**Phase 2 — radar + analysis:** migrate UI only, reuse existing selectors/actions/data; verify search/filters, symbols and charts.
**Phase 3 — journal:** wire existing forecast and virtual-demo state unchanged.
**Phase 4 — assistant isolation:** dependency audit, persisted master switch and background job separation.
**Phase 5 — QA and release:** migration/rollback tests, Android lifecycle tests, push scheduling validation, release signing and versionCode review.

## Regression checklist (must pass before merge)
- APEX 8.7 source reproduces from a fresh checkout.
- No duplicate forecast generation on screen switching.
- Search still finds TON and the full catalog.
- Existing watchlist, scenarios, statistics and demo balance survive in-place APK update.
- Stale network feeds are labeled; they never masquerade as live.
- Disabling the assistant does not disable radar/background forecast updates.
- Assistant tasks remain stopped after process death and reboot.
- Notifications avoid duplicates and report Android background limitations honestly.
- UI does not make any local simulation appear to be a real exchange order.
- Installation over previous signed APK is tested; rollback path documented.

## First coding gate
Before implementing UI mutations, inspect reconstructed `src/App.tsx` from the exact 8.7 build and resolve the CI overlay gap. Do not apply brittle string replacements until anchors are verified, and do not change `main` or `apex-intelligence-v2`.
