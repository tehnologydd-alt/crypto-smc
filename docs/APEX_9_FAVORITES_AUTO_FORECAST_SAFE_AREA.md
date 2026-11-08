# APEX 9 Android First — Favorites and Automatic Research Lifecycle

## User-approved product changes
- **No fixed home coins:** the horizontal rail contains only user-selected favorites.
- User can search the real Binance USDT catalog, add/remove favorites with a dedicated control or card ×, and scroll the rail horizontally. **Maximum 10 different symbols** is enforced atomically in Android DataStore.
- Empty list is valid. The app **does not pre-add BTC/ETH/GRAM/SOL** to a new install. Preexisting data is preserved.
- **No manual Create Forecast button.** Whenever the app is foregrounded, it checks the user-selected favorites at bounded intervals, with a user-visible source status. Opt-in background WorkManager sync can check them when Android permits (battery/network scheduling, no fixed guarantees). No continuous running server.
- Four research statuses shown as filters: **Ожидает подтверждения → Прогноз подтверждён → Активный → Завершённые.**
- On-device auto model is an experimental *range scenario* for the next four closed H1 candles, constructed from 96 preceding confirmed closed candles; it does not predict direction or produce trading instructions.
- A candidate starts `PENDING_CONFIRMATION`; after the first post-anchor closed H1 candle **inside the original range**, stage becomes `CONFIRMED` (technical observation, not independent confidence evidence). After a second post-anchor closed H1 candle it becomes `ACTIVE`. At four consecutive observed H1 closes it becomes `COMPLETED` and records an immutable evaluation. A candidate not confirmed at the first candle may still complete at expiry, without pretending it was confirmed.
- The original scenario remains in the existing `research_forecasts` table; results in `research_forecast_results`. A new append-once `research_forecast_stages` table logs stage transitions, observed time, captured time, and explanation.
- Room **v3 → v4** migration adds the stage-log table without deleting the old observations, candles, forecasts or evaluation records.
- To conserve mobile resources: one active candidate per favorite, at most 10 API checks per foreground pass, periodic foreground checks at most once every ~15 min. Background checks run through user-opted WorkManager ~hourly subject to Android scheduling restrictions. Missing API data does not become a fake forecast or result.
- Static logo 'A' replaced by the existing official APEX teal/metallic icon, reused as `apex9-preview/apex-logo.svg`.
- Android native MainActivity explicitly fits content below status bar/cutout and above gesture/three-button navigation using `WindowInsetsCompat`. UI bottom dock and scroll areas have spare space for safe interaction.

## User testing
1. Install update over the previous signed APEX 9.0.82. Data from Room v3 and DataStore should remain.
2. Open home: previously hardcoded row is gone. Search for GRAM, add favorite, then another coin. Scroll cards sideways and remove one via ×.
3. Attempt an 11th favorite: add disabled and native setting refuses.
4. Open forecasts: no Create button; four stage tabs and genuine journal. Wait for public H1 source observations; inaccurate/outdated data must not manufacture entries.
5. When actual new closed H1 bars arrive, observe stages. Closing/restarting the app should retain the history. No success % should be displayed without calibration.
6. Optional background checks can be enabled in Sources; Android may defer them.
7. On the Android phone, inspect top status bar (time/signal/battery) and bottom system gesture/navigation icons. The APEX content and floating dock must not be overlapped.

## Known limitations
The current automatic baseline has not been validated for predictive skill. One public Spot exchange feed is not independent confirmation from several sources. The `CONFIRMED` stage reflects only predefined technical source observation. Offline or rate-limited source scans cannot complete evaluations. New API data are required to continue observation; automatic checks do not bypass Android process/Doze restrictions. Future work should test additional independent sources and validated models before displaying confidence metrics.
