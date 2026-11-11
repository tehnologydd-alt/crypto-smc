# APEX 9 — audit of source quality and research lineage
**Date:** 2026-11-11  
**Baseline:** `apex-m1-precision-charts` (PR #24, tested signed Android M1 preview)  
**Audit branch:** `apex-source-audit-phase1`  
**Scope:** inspected existing repository implementation; NO production-device data or historical empirical source reliability was inspected.

## Findings: already implemented; do not rebuild
| Topic | Verified code | Current claim / boundary |
| --- | --- | --- |
| Favorites-only native collection and research | `ApexSyncWorker.kt`, `ApexPreferences.kt`, `ApexAutoForecast.kt`, `ApexMultiFrameForecast.kt` | WorkManager periodic 15m with deferrable scheduling; at most 10 favorites; no guarantees about each-minute wakeups |
| Immutable as-published evidence | `ApexEvidenceContext.kt`, `forecast-evidence-context.mjs` | Saves latest validated observation PER KIND at publication, including provider ID/time; legacy entries have no retroactive source reconstruction |
| Chronological feature comparisons | `forecast-feature-holdout.mjs`, `forecast-feature-stability.mjs`, `forecast-feature-ablation.mjs`, `forecast-feature-rolling.mjs` | Feature associations, separated time windows; NOT source-by-source causal value or live model calibration |
| Research quality and shadow checks | `automatic-decision-quality.mjs`, `forecast-shadow-challengers.mjs`, `forecast-shadow-calibration.mjs`, `forecast-release-readiness.mjs` | Bounded Room reads; read-only, NO silent model changes |
| API health, limits, cross-provider context | `source-health.mjs`, `source-reconciliation.mjs`, `source-reliability.mjs`, `free-source-budget.mjs` | Operational counters for 12 web-layer public adapters; NOT verified real-world forecast usefulness |
| M1 outcome tracking | `ApexM1Evaluation.kt`, `directional-scenario.mjs`, `forecast-multiframe.mjs` | Closed M1 sequence in new research; historical M5 methodology preserved |

## Confirmed gaps / risks (priority)
1. **P0 — Android background ticker payload-contract defect (fix included in Phase 1).** `ApexSyncWorker.kt` saved `priceChangePercent24h` but native published-evidence validator expects `changePercent24h` AND positive `quoteVolume`. Background-only market observations therefore could not satisfy `ApexEvidenceContext.sanitized(..., kind="market")`. Fix parses `quoteVolume`, writes the canonical keys, rejects invalid volume and excessive change, and adds cross-file contract regression tests. Historical records are left untouched.
2. **P1 — M1 research is not yet included in several existing historical feature-quality cohorts.** The new `verifiedDirectionalEvidence` explicitly returns `source='M1'`, but `forecast-feature-ablation.mjs` and `forecast-probability-readiness.mjs` still have an H1 gate `check.source!=='M5'`. New M1 observations can therefore be counted as legacy/excluded by those checks even when the forecast is valid. This is NOT a reason to relabel old M5 results: add a distinct, comparable M1 evidence cohort with its own prospective registration boundary and regression tests.
3. **P1 — API operational reliability does not cover all native background requests.** `source-reliability.mjs` records the web-layer events while `ApexSyncWorker.kt`, native candle collection and Radar have separate network paths. Never claim 12/12 full-device observability from the web ledger.
3. **P1 — Provider versus feature attribution is not equivalent.** The existing fixed ablation covers `efficiency/travelNorm/volumeNorm`; temporal holdout covers `sameRadar/higherRadar/marketDay/visibleDepth`. Neither proves which news aggregator, onchain endpoint or exchange API independently improved a forecast.
4. **P1 — Evidence as published preserves only the latest observation of each kind.** A forecast's single `liquidity` feed cannot simultaneously prove use of BOTH Binance and Bybit depth. Missing news/macro/social is not provider failure. Comparisons require a versioned, bounded, additive evidence contract with multiple distinct provider IDs.
5. **P1 — Presence of news/social metadata is not factual validation.** `ApexEvidenceContext.kt` explicitly marks `news/macro/social` as unverified context metadata. Headlines, posts and narratives cannot be assigned predictive credibility solely from response statuses.
6. **P2 — Cross-venue comparison coverage and clock semantics vary.** DEX wrapped pools vs native CEX Spot, USD aggregate vs USDT quote, cache vs network, and local-received vs provider-observed timestamps must stay separate. Existing `source-reconciliation.mjs` makes some of these distinctions; they need explicit native provenance and test coverage.
7. **P2 — M1 storage and backfill can impose a larger network/power budget.** Measure actual API attempts, duplicates, absent M1 bars and favorite-scope before increasing polling. WorkManager scheduling is inexact. Do not infer an M1 wake frequency from M1 resolution.

## Stages and exit criteria

### Stage 1 — schema repair + read-only lineage baseline (this branch)
- [x] Fix native background Binance ticker so canonical `price`, `changePercent24h`, `quoteVolume` satisfy immutable context validator, without retroactive historical edits.
- [x] Add a bounded, pure `source-lineage-audit.mjs`, requiring full single-asset Room archive and structural forecast verification; count VERIFIED/LEGACY/INVALID, OBSERVED/STALE/MISSING and publisher source ID separately for M15/H1/H4.
- [x] Reuse the existing bounded `automatic-decision-quality.mjs` pipeline and Android asset packaging; no extra market requests.
- [ ] CI tests (Node and Android Gradle), PR review and optional signed test APK.
- **Exit:** Kotlin/JS field contract and archival lineage tests green; old M5 remains untouched; no source is assigned forecast accuracy.

### Stage 2 — M1 cohort consistency + comprehensive native API request ledger
- First correct the H1 quality/readiness cohort gates so verified post-change `M1` records are not silently excluded as `legacyH1`. Keep archived M5 and current M1 source cohorts separate; validate all dependent shadow/rolling/holdout results independently before reporting new quality trends.
- Add an append-only, bounded local Room table or equivalent dedicated native ledger of attempted network operations: provider ID, request class, asset-scope, attemptedAt, completedAt, HTTP/result code, validated provider timestamp, cache/429/timeout distinction. Never save credentials or raw payload.
- Integrate the existing web ledger without double counting cached results or replayed snapshots; measure 1m and exchange background paths only when actual GET was made.
- Cap retention and batch reads; no new background task solely for collecting reliability scores.
- **Exit:** traced native + web coverage documented, finite retention, and tests for failed GET, 429, unsupported Spot, cached response, clock skew, offline and cancellation.

### Stage 3 — immutable mult-provider evidence V2
- Design an ADDITIVE `evidenceAsPublished` version with bounded per-source identities, source-group, genuine provider timestamps and content-hash/validated numerical features, tied to a specific forecast ID and publication time.
- Support multiple providers per kind while preserving raw provider scope (USD aggregate / USDT venue / wrapped DEX / news mention / onchain metadata).
- Historical V1/M5 cohorts remain READ-ONLY and separate. Missing samples stay missing; no retrospective reconstruction or invented source correlations.
- **Exit:** migration/compat tests pass; two same-kind providers can be distinguished in new publications; cross-provider timestamp and duplicate detection verified.

### Stage 4 — pre-registered forward-only provider contribution research
- Freeze the test hypothesis, eligible provider cohort, reference score and cutoff BEFORE collecting results.
- Compare outcomes with/without provider availability on the SAME non-overlapping, horizon-purged, temporally held-out forecast cohorts. Report coverage, sample sizes, confounders, negative controls and uncertainty; missing provider data is not a negative API score.
- Keep operational uptime, content concordance and incremental research value as **three independent measures**. Correlation is not causation; do not equate TP3/SL association with guaranteed future accuracy.
- **Exit:** no leakage from later outcomes; null on insufficient observations; fixed rules repeated in independent periods; no automatic forecast-weight or trade changes.

### Stage 5 — compact UI + resource verification
- Attach per-source provenance and descriptive usefulness only to the existing Sources/Research pages; avoid duplicate screens or dashboard clutter.
- Display **Observed / Missing / Stale / Legacy**, public API operational health, sample count, timestamp basis and disagreements; make unverified/insufficient obvious.
- Benchmark 10 favorites, battery/network load, M1 backfill and startup/cache; maintain user-approved API quotas.
- **Exit:** signed APK smoke-tested on device (Android cold start, background return, source outage, favorite removal, offline cache, historical forecast preservation) and reviewable before release.

## Architecture principle
```
Public & native API request -> validated provider observation -> immutable as-published
source attribution -> outcome and non-overlap verification -> forward-only
pre-registered descriptive contribution audit -> UI (never an automatic trading action)
```

**Non-goals:** real-money orders, model self-training without external validation, unfounded confidence percentages, buying additional API quotas, automatic market-wide scanning, overwriting historical forecasts.

## Why a new lineage module instead of a new analysis engine
The new module reads the already stored Room `evidenceAsPublished` through existing validation. It adds a missing *provider provenance view*, NOT another feature scorer, availability poller or source reconciliation engine. The completed Android/web pipeline and current forecast outcome audits are reused.

## Verification plan
- JavaScript: `node --test apex9-preview/test-source-lineage-audit.mjs`, core/evidence regression and existing M1/M5 historical tests.
- Android: `apex9-research-apk.yml` on the PR branch, including source-contract tests and Gradle compile.
- APK: inspect GitHub Actions artifact SHA256; only claim device behavior after install on device.
