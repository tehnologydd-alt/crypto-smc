# APEX Android First — H1 Scenario Map (Research-only)

## Feature
The Android Asset passport now shows a **time-accurate visual map of locally published H1 research scenarios** on genuine Binance Spot OHLCV candles.

The system starts from immutable saved hypotheses and observed Room `research_forecast_stages` records, not from estimated future events. The original baseline (4H final-close containment in a historical range) is unchanged.

### User flow
- Open **Актив → Сценарии наблюдения на графике** and use **Все сценарии** or **★ Отмеченные** (the same local user preference already present under Forecasts).
- The app displays at most three validated scenarios from the current device journal; user-marked scenarios appear first. If the Room journal is larger than the 75 rows retrieved, the UI exposes that partial-archive limitation.
- Each scenario card displays source anchor close, actual publication date, original low/high boundaries, exact number of verified stages, and consistent final outcome if the source result exists.
- Tap a card to focus its actual source candle in the chart. From **Прогнозы → Паспорт <asset>**, tap the corresponding button to open the specific research scenario.
- On the **H1** chart, `P` marks the authentic source *anchor close* supporting the later publication (the tooltip lists the separate publication time); `1` is the observed first closed H1 stage; `2` is the observed second stage; `4` is the separately validated final H1 evaluation.
- Only **actual completed H1 candles** appear under overlays. Colored original-price range shading runs across available source H1 candles from the anchor to the 4H target; it stops at the last real completed candle. Missing intermediate bars split the shaded segments. It never paints a full-width "future projection."
- User-selected scenarios receive a more visible cyan accent. Only a validated final result receives an H1 #4 result icon. Invalid/contradictory outcomes and unconfirmed stages are never assigned those icons.
- On M15/H4/D1, overlays are hidden with explicit text that the original research timeframe is H1.

## Architecture
- `scenario-map.mjs`: pure deterministic source validator, priority selection and close-time-to-viewport mapping. Reuses `inspectResearchTimeline()` from existing verifiable research history.
- `candle-chart.mjs`: canvas draws bounded bands and actual stage markers after mapping to real viewport candle indices; mouse and touch zoom/pan remain available.
- `app.mjs`: fetches bounded saved native Room history, reads existing locally marked scenario IDs, supports all/tracked filters, focuses selected anchors, and guards against stale asset-switch responses.
- `favorite-dashboard.mjs`: passes immutable scenario ID when opening Asset Passport from a research card.
- `index.html`, `styles.css`: mobile controls and truthful H1 source legend.

No new permissions, Room migrations, external server, exchange order execution, balance management, trade levels or claims of demonstrated predictive accuracy.

## Regression gates
Node tests cover:
- Strict asset isolation and the user's starred scenarios, with no hypothetical stage creation.
- Publication icon attached to the **actual** H1 candle close rather than a made-up candle at the publication timestamp.
- Only closed real H1 candles produce markers; live candles do not.
- Missing H1 source candle splits the displayed envelope and suppresses its absent stage marker.
- An incomplete four-hour horizon is never extended into blank future time.
- A valid final evaluation can show `4`; an unverified one cannot.
- Non-H1 charts must not display any research overlays.

Existing Android signed-release pipeline packages these modules, runs all previous Evidence Lab/Market Core/forecast regression tests and builds a compatible signed upgrade APK.

## Manual Android acceptance
1. Install new signed APK over current APEX 9.0.212 without clearing application storage.
2. Open **Прогнозы**, select a research record and click **Паспорт**. Confirm matching asset loads and the map highlights the original scenario.
3. Open H1 chart and inspect markers `P/1/2/4` only where the source candles are available. Drag/zoom to older H1 observations.
4. Switch to **★ Отмеченные**; confirm unstarred research scenarios disappear, and that the original immutable Room record is unchanged.
5. Switch to M15/H4/D1; overlays disappear, candle/chart information is still present.
6. Disconnect internet: existing Room candles/scenarios remain historical, without inventing fresh candles or results.

Known limitations: the native Room journal endpoint returns at most 75 recent records. Stage markers can be absent when the corresponding source bar has been pruned from the local candle cache or source coverage is incomplete. That absence is intentional.
