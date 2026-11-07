# APEX 9.0 — Visual Blueprint / Premium Research UI

**Design reference:** user-provided mobile finance dashboard image (black background, midnight-blue glass surfaces, cyan neon lines, fluid cards, circular quick actions, bottom dock). The picture is used as an **inspiration for visual language**, not copied verbatim. APEX is a deep market-research app, **not a wallet, trading desk or assistant**.

**Target:** Android phone first (360–430 dp), WebView/Capacitor 7, adaptable to wider layouts. This document is the UI contract for the `apex9-preview/` implementation and subsequent native release.

## 1. Visual principles

- Luxurious but restrained: graphite black background with subtle northern-teal light only in focal regions. Avoid neon outlines on every control.
- Insight hierarchy: **What is happening → Evidence → Uncertainty → Forecast lifecycle**. No redundant titles or duplicated metrics.
- Data integrity: every visible financial value must come from a source with timestamp. **Never invent graphs, accuracy figures, whale labels, confidence %, AI verdicts or operational statuses.**
- No assistant/chat, no balances, no wallets, no virtual trading, no executable orders, no real-account credentials, no demo features.
- One asset selected globally; search stays readily available. No fake investor persona/profile or congratulatory rhetoric.

## 2. Design tokens

| Token | Value | Usage |
|---|---|---|
| `background` | `#06090D` | screen |
| `surface` | `#0D1820` | cards |
| `surfaceRaised` | `#11252D` | elevated glass sections |
| `border` | `rgba(96, 220, 216, .17)` | quiet card outline |
| `text` | `#F1F8F9` | titles and values |
| `muted` | `#91ADB8` | secondary labels |
| `cyan` | `#37DDE3` | focus, tab active, accent |
| `mint` | `#71E9CE` | sourced positive history |
| `danger` | `#FF9FAD` | errors and historical negative change |
| `warning` | `#F1C685` | incomplete data |

- Typography: system-native sans, weights 400/600/750; numbers tabular. Hero asset 28 dp, price 34–42 dp, section heading 18–20 dp, card title 14–15 dp, body 13 dp, caption >= 11 dp.
- Spacing: base 4 dp; screen inset 16 dp; section gap 18–22 dp; card padding 17–22 dp; card radius 20–26 dp; quick button diameter >= 54 dp, targets >= 44 dp.
- Depth: soft cyan radial wash behind hero and a narrow accent rim; one strong focus per viewport. No wallpaper or decorative pretend sparklines.
- Motion: 140–220 ms opacity/translation only; honor reduced motion. No animations that imply live prices when offline.

## 3. Exact portrait layout (360–430 dp)

```text
┌───────────────────────────────────────────┐
│ APEX 9.0                        ● 4/6     │  62–76 dp masthead
│ MARKET INTELLIGENCE                       │
│                                           │
│ РЫНОЧНЫЕ ИССЛЕДОВАНИЯ                     │
│ Понимать рынок глубже                     │  2-line editorial intro
│                                           │
│ ┌───────────────────────────────────────┐ │
│ │ ИЗБРАННЫЙ АКТИВ         ↻ Обновить    │ │
│ │ BTCUSDT                               │ │
│ │ $ --,--.--       ±--% / 24 ч         │ │  single main hero
│ │ Аналитическое покрытие: 2/7           │ │
│ │ Источники проверены: время ...        │ │
│ └───────────────────────────────────────┘ │
│                                           │
│ ИССЛЕДОВАТЬ       [пара / поиск]  [GO]    │  full symbol catalog incl TON
│                                           │
│   ◉       ◈       ⬡       ◎              │  four round shortcuts
│ Ликвид.  Новости Ончейн   Прогнозы       │
│                                           │
│ Рынок под наблюдением                     │
│ [BTC] [ETH] [TON] [SOL] →               │  honest shortcuts, no fake metrics
│                                           │
│ Состояние исследования                    │
│ ┌──────────┐ ┌───────────┐                │
│ │3 / 6     │ │2 / 7      │                │
│ │источники │ │слои       │                │
│ └──────────┘ └───────────┘                │
│ ┌──────────┐ ┌───────────┐                │
│ │24 ч ...  │ │данных мало│                │
│ └──────────┘ └───────────┘                │
│                                           │
│ [Источник/события/задержки...]           │
│                                           │
│ ┌─────────┬─────────┬────────┬─────────┐ │
│ │ ◉ Обзор │ ◈ Актив │ ◎ Прогн│ ≡ Источ│ │ fixed bottom dock
│ └─────────┴─────────┴────────┴─────────┘ │
└───────────────────────────────────────────┘
```

The bottom dock floats above the safe-area inset. Main scroll content has extra padding so the last card is always reachable, including Android gesture navigation.

## 4. Navigation and screens

### 4.1 Обзор (default)
Purpose: quickly understand the selected asset and whether data coverage is sufficient.

1. APEX masthead and aggregate healthy-source count.
2. Hero with **actual** selected ticker, quote, historical 24h change, coverage/freshness; show dashes when unavailable.
3. Inline searchable catalog; TON resolves to TONUSDT. Unknown pairs are not presented as validated.
4. Four round shortcuts: Ликвидность → Актив/depth; Новости → Источники/articles; Ончейн → Актив/chain; Прогнозы → Прогнозы.
5. Quick asset chips (BTC/ETH/TON/SOL): selection triggers actual re-query, no invented coin movement.
6. Compact status grid: public sources online, 24h price change, evidence layers covered, quality context.
7. External context summary and missing source-layer explanations.

### 4.2 Актив
Purpose: drill into one actual asset.

- Persistent selected-symbol label; 24h ticker volume/time.
- Visible liquidity snapshots, per venue; best bid/ask, spread, visible depth imbalance; **not a liquidation heatmap**.
- CoinGecko global crypto context (clearly not asset-specific).
- Bitcoin mempool panel only for BTC; for TON/other assets show **not applicable**.
- Future additions: real candle chart with precise source/timeframe provenance, event timeline and comparative regime table; no decorative mock data.

### 4.3 Прогнозы
Purpose: show forecast hypotheses and observable outcomes, not trade execution.

- States: предварительный → опубликован → отслеживается → завершён/просрочен/отменён.
- Per forecast: source timestamp, horizon, scenario, assumptions, invalidation, historical status, evaluation and uncertainty.
- Source baseline **APEX 8.6**. Until the historical engine is genuinely migrated, show an explicit placeholder and **no invented signals or performance statistics**.
- Future notifications must be user-consented and compatible with Android background limits.

### 4.4 Источники
Purpose: trust and diagnose every input.

- Market adapters Binance ticker, Binance/Bybit visible book with per-source OK/STALE/RATE_LIMITED/OFFLINE.
- Context adapters CoinGecko global, mempool.space (BTC only), GDELT searchable articles (search matches only).
- GDELT article links show publisher/domain and observed time; clicking opens HTTPS, no embedded third-party HTML.
- Inapplicable vs missing vs failed states visually distinct. Source errors never silently fall back to fabricated metrics.
- Future connectors (social, tracked whales, derivatives and scheduled macro) explicitly marked not connected.

## 5. Key interactions

| Action | Expected result |
|---|---|
| Search asset | Normalize pair → cancel previous requests → show load state → resolve each source independently |
| Tap quick asset chip | Select and research corresponding live pair (no trade action) |
| Tap a round shortcut | Navigate to corresponding screen and section; retain chosen asset |
| Tap bottom dock | Switch instantly; selected asset and already loaded snapshot stay intact |
| Tap refresh | Trigger one new collection; show invalid/stale/cancelled states |
| Background/resume | Refresh only when due; never suggest push guarantees |
| API offline | Show ‘Недоступен’ and preserve provenance; never invent values |
| Data missing | No chart curve, performance %, probability or directional order recommendation |
| Restart app | Preserve only selected asset preference in separate research-preview storage |

## 6. Data and accessibility requirements

- Dominant accent on selected nav only; subdued inactive controls. Buttons have visible text + accessible labels.
- 44×44 dp minimal target, screen-reader descriptions, `aria-live` for async source results; keyboard/search submission.
- Contrast >= WCAG AA for ordinary text; source-state uses **text and color**, never color alone.
- HTML is static and source text written through safe DOM `textContent`; no injection from news feeds.
- Pure read-only public network operations; no accounts, credentials or private APIs. Do not claim current source availability until an actual successful request.
- Android app ID `com.apexintelligence.research` remains separate from 8.6 during preview.
- APK can be called ‘ready to install’ only after GitHub Actions and artifact validation pass.

## 7. Scope status

**This iteration:** exact visual tokens, navigation, circular actions, hero hierarchy and strong empty/error states. All existing market/context data components must keep working.

**Not yet implemented:** 8.6 forecast engine migration, social analysis, verified whale address clusters, historical ML evaluation and fully calibrated forecasts. UI may reserve space, but must describe these as planned.
