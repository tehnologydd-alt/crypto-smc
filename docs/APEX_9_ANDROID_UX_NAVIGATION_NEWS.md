# APEX Android First — Mobile Navigation & Research UX Renovation

## Why
Screenshots of APEX 9.0.178 showed the market hero, search, source notice and other overview-only modules persisted while the user browsed Forecasts. This release reorganizes the Android WebView without replacing any previously collected data or changing the Android package identity.

## Implemented
- **Overview-only home widgets**: market hero, compact asset search, news/macro shortcuts, horizontally scrollable favorites, market notices and overview diagnostic sections are displayed only in `overview`. Big **Этапы прогнозов** and **Evidence Lab** diagnostics are moved from Forecasts into Overview.
- **Compact search**: symbol field and Open button, less vertical space; catalog help and provider counts in a collapsible details panel; existing 10-favorite DataStore limit untouched.
- **Two side-scrollable shortcuts**: "Новости" and "Макроэкономика", each opening an independent view instead of duplicating the Sources page.
- **Crypto news**: GDELT Doc 2.1 public article search, recent 48-hour window, verified HTTPS destination, timestamps, topic-title filter, domain diversity and explicit provider failure state. Selection is freshness/topic based, not a verified story importance score or market impact claim.
- **Macro context**: GDELT topic filter for rates, inflation, central banks and economy with direct links to official Federal Reserve, BLS and ECB event/release calendars; no fabricated dates, macro surprises or economic metrics.
- **Favorite asset tap → Passport**: tapping the favorite card anywhere except its remove button takes the user to the full selected `Актив` screen; selected symbol updates before navigation.
- **Real tiny charts**: favorites and individual research scenarios can display a tiny sparkline only from actual finished cached Room H1 candles. Absent/stale data are never replaced by a fake trend. Charts are explicitly historical.
- **Forecasts tab**: compact all / **selected** observation views plus short stage filters. User selections are a local UI preference (WebView localStorage), kept separately from immutable Room research forecast history. Distinct stat blocks for all and selected: observed completion, range containment, out-of-range and unresolved results. The 75-item returned journal is explicitly treated as a partial view when more are stored.
- **Research-only scenario price bands**: the Passport H1 Canvas overlays the original saved research envelope `bandLow..bandHigh` while the hypothesis is pending/confirmed/active. It never draws executable trade orders. No original published evidence is changed by viewing the chart.
- **Automatic Passport**: previously manual public market-horizon, on-chain and related checks are now triggered as the user opens the passport with rate limiting; refresh buttons are hidden on Asset, while status and source-age caveats remain visible. Android can still pause background work.

## Important explicit limits
The existing APEX native V1 experiment tests *whether the final H1 closing price after four full hours falls inside a fixed empirical range*. It does **not** calculate market/limit entries, three take-profits or stop-loss outcomes. This UI renovation deliberately **does not generate copy/paste exchange orders or misrepresent range evaluation as TP/SL targets**. A four-hour deadline without enough verified candles stays unresolved rather than being recorded as a fictional time cancellation. The user can **observe/select** research scenarios, not copy executable orders.

The selected research observation preference uses WebView localStorage. It survives normal signed APK upgrades on the same installed WebView data, but it is **not** a Room-origin source record and should not be confused with immutable forecast history.

## Tests
Pure JS tests cover real-only sparklines, source-validated GDELT editorial items, missing news and independent all/selected research counts. Existing market, forecast, Evidence Lab and validation tests still run. Android build ensures all new modules are bundled into the signed APK.

Manual phone checks:
1. Update signed app over 9.0.178; verify favorites and Room history persist.
2. Tap all four dock tabs: only Overview has hero, search, notice, stages summary and Evidence Lab.
3. On Overview scroll the two shortcut buttons sideways; News opens recent crypto stories, Macro opens recent macro mentions and official calendars. Empty/offline states must not fabricate stories.
4. Search for and add an asset, tap a favorite anywhere; inspect its passport, automatic observations and historical H1 envelope overlay.
5. Switch to Forecasts, select or unselect a research scenario; compare all and selected counts, switch stage filters, restart app to ensure UI selection persists.
6. Confirm mini charts show only for assets with cached finished candles; otherwise an explicit empty label.
7. Verify Android status and gesture bars still do not overlap app content.

No additional authentication, notifications, private network endpoints, live execution or new Room migration.
