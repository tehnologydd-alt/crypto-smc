# APEX 9 — H1 Level Sequence Audit (historical research)

## Need addressed
The original APEX empirical-range experiment predicts whether the H1 close after four complete H1 candles remains inside a predetermined historical band. It does **not** publish a direction, market entry, TP1/TP2/TP3 or stop-loss. Therefore outcome labels WITHIN_RANGE and OUTSIDE_RANGE cannot establish whether hypothetical target or protective levels were reached first.

## Versioned two-branch benchmark
For every structurally valid, immutable forecast, build conditional UP and DOWN reference paths from the same original anchor and band. The anchor close is displayed as **reference entry**, not a confirmed exchange fill. Let U = bandHigh − anchor and D = anchor − bandLow.
- UP: TP1 = anchor+U/3, TP2 = anchor+2U/3, TP3=bandHigh, protection=anchor−D/3.
- DOWN: TP1=anchor−D/3, TP2=anchor−2D/3, TP3=bandLow, protection=anchor+U/3.
- Same fixed method for all records, both directions and all assets. A historical range hypothesis has no basis for choosing UP over DOWN, and this new reference is not a buy or sell recommendation.
- For **new** Android native forecasts, the payload stores the exact version H1_DUAL_LEVEL_STUDY_V1 and both price paths at publication time in immutable hypothesis JSON; original model ID, band and H1 outcome calculation do not change. JavaScript validates any committed figures against the original band's deterministic formula.
- For **old** forecasts, derived levels are explicitly marked RETROSPECTIVE and must never be counted as the originally published forecast's TP/SL performance.

## Objective observed path
A user presses **Проверить порядок касаний H1** on the selected journal card. The app reads the original complete historical H1 Room archive for that exact asset, independently checks the anchor OHLCV, anchor close and each elapsed subsequent completed H1 candle. The resulting per-level first-touch stamps are **H1 candle closure times**, not invented tick times.
- Later H1 candles: if only TP1 or SL is touched in the earliest touched full hour, label that first at H1 resolution. If TP1 and SL are touched inside the same H1, mark SAME_H1_UNKNOWN. Higher TPs in the same bar are listed together with no intrabar order claim.
- The first post-anchor H1 candle begins slightly *before* actual publication (publication follows the preceding close). If it touches any threshold, mark PUBLICATION_HOUR_UNKNOWN; H1 OHLC cannot distinguish before/after publication.
- Missing, duplicate, future, unfinished, inconsistent candles or anchor mismatch fail closed as NEEDS_DATA. In-progress horizons remain PARTIAL without false completed outcomes.
- A level touch is not an executed order, financial profit/loss, objective directional forecast accuracy or safe automated entry. No stats are added to existing verified published-range statistics. More granular timestamped post-publication source records would be needed to resolve unknown intrabar order.

## Android UI
Each journal card now shows one anchor reference price and two short, side-by-side branches with TP1–TP3 and SL. On user request the card displays the source-verified first touched H1 levels with timestamps and explicit ambiguity. On-demand reads use native Room, cache for 45 seconds only and never invent data if the archive is incomplete. No new exchange credentials, trading permissions, execution, Room database migration or network calls.

## Tests and verification
Pure tests exercise deterministic published and retrospective levels, stored immutability, missing/tampered sources, TP-first vs SL-first, same-candle ambiguity, first-hour pre-publication exposure, multiple targets in the same candle and partial horizons. JavaScript UI test verifies every journal card's reference levels and native immutable payload commitment. GitHub Actions builds the Android app; real phone data and touch behavior still require separate verification.
