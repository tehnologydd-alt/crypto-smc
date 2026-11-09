# APEX 9 Research — installable Android preview

**Separate app** with package ID `com.apexintelligence.research`. It does not replace, uninstall, migrate or access the local data of the existing APEX 8.6 app.

The Android APK contains the `apex9-preview` research interface and its public market/source adapters. It has no AI assistant, demo accounts or order controls.

## GitHub Actions build

On branch `apex-9-evolution`, use the workflow **APEX 9 Research — Android APK**. Open its successful run, choose artifact `APEX9-Research-Android-APK`, unzip and install `APEX9-Research-Preview-debug.apk` on an Android device.

A freshly built **debug APK** is Android-installable but not a signed release. If subsequent debug builds have different signing certificates, Android may refuse installation over an older preview; uninstalling that **preview app only** will remove its local last-symbol preference. Never uninstall APEX 8.6 to test this package.

## Local build (requires Node 22, JDK 21, Android SDK)

From repository root:

```bash
node --test updates/test-v90-evidence.mjs updates/test-v90-market-depth.mjs apex9-preview/test-research.mjs apex9-preview/test-context-sources.mjs
cd apex9-android
npm install --no-audit --no-fund
npm run build:web
npx cap add android
npx cap sync android
node scripts/set-android-version.mjs
cd android
./gradlew assembleDebug --no-daemon
```

Result: `apex9-android/android/app/build/outputs/apk/debug/app-debug.apk`.

Builds use `@capacitor/*` **7.6.10** (patched release). `CapacitorHttp` performs public requests via Android native HTTP to avoid browser CORS limitations. This **does not** overcome blocked services, network outages, provider terms or rate limits.

## Explicit limits

- **Research-only preview**: Binance/Bybit public spot data, CoinGecko global market statistics, Bitcoin-only mempool statistics and GDELT news search.
- News matches are not vetted sentiment; order-book snapshots are not hidden liquidity; Bitcoin mempool totals do not track whale identities.
- Forecast engine and historical records from APEX 8.6 are **not yet integrated**. The Forecasts tab shows a truthful placeholder.
- No guarantee of push/background updates while the app is closed; this Android package does not introduce a background service.
- No private account access, trading or simulated balances.
- Always review public source coverage, timestamps and error statuses; availability varies by region.

## Web asset staging

`scripts/prepare-web.mjs` copies five preview files and two shared core modules to `dist/` and rewrites **only copied** imports from `../updates/...` to `./updates/...`. The repository's original web preview stays unchanged. All local module imports are verified before packaging.

## APEX 9.1 source budget (news and BLS calendar)

The app now has a local per-installation UTC-day request allowance for on-demand GDELT news (12), GDELT macro (6), individual-asset GDELT searches (8), and the official BLS iCalendar schedule (2). Requests are spaced by 45 min, 2 h, 90 min, and 12 h respectively; successful results are cached. Failed requests count as attempts. UTC midnight resets counts but does not bypass spacing. Stale cached articles are labelled as such. The app does not automatically fetch paid provider APIs.

`provider-scheduler.mjs` is a conservative, **not yet provider-connected** paid API reservation guard: explicit enablement, estimated cents per call, monthly cap, UTC-hour windows, interval between calls and reserved event slots. Its cost accounting is NOT an invoice. Storage loss, changed device time, other devices and provider-side quotas can make local controls insufficient for account-wide billing. API credentials and any payment account must not be embedded in the Android APK. No paid source, in-app purchase or scheduled background-paid collection is enabled.

BLS dates are scheduled releases, **not actual numeric data**. BLS may reject direct mobile requests; such a failure is shown, not replaced by an invented calendar.

## Visible and background market updates
A visible APEX WebView checks the selected Spot quote around every 30s using public
Binance REST. A full asset research refresh remains around every 10 minutes,
so changing quotes do not repeatedly fetch news, chain context or all books.
The light quote is displayed, but is not recorded as a fabricated closed candle.

With the existing opt-in background sync enabled, Android WorkManager requests
a run at its minimum 15-minute periodic interval. Actual execution can be
delayed by Doze, network constraints, battery optimization and app standby.
Turning it off cancels the unique periodic job. The worker stores a verified
public market observation and maintains native favorite research; it never
places trades. Faster guaranteed background execution requires a separate
foreground-service design and is intentionally not enabled.

## Android forecast alerts and optional keep-screen-on
The gear in the upper-right header opens native-backed settings. Notifications
are OFF by default and require an explicit user-triggered Android permission
grant. LIMIT_READY, TP1–TP3 and SL can be selected separately. Notification
events are taken only from immutable Room stages after genuine closed M5 bars.
Each forecast/stage is deduplicated with a local persistent delivery ledger.
Existing old history is not replayed as new notifications. Delivery can be
delayed or prevented by WorkManager timing, Android permissions, network
availability and missing M5 candles. No broker orders or actual trades are involved.

The opt-in keep-screen-on switch is OFF by default, uses the Android activity's
FLAG_KEEP_SCREEN_ON while APEX is visible, and consumes additional battery.
It does not wake the screen or keep an Android service running in background.

## Event routing and free public social context
The overview has one short market-wide events stream from cached, quota-limited
GDELT news/macro and the official BLS planned release calendar. Editorial topic
matching is not verified importance or causal price impact. The asset Data pane
contains only asset-matched GDELT headlines and explicit links to the separate
common macro calendar; there is no unsupported assertion that macro news
caused a specific token's movement.

Public Bluesky search is optional and on-demand when the asset Data pane is
opened: max six attempts per UTC day on this installation, minimum two-hour
spacing, per-symbol caching. Results are labelled user opinions, not verified
news or sentiment measurements.

## APEX 9.1 – event-matched historical M5 observation
On the Macro screen, a recent official *scheduled* BLS timestamp can be compared
with BTCUSDT or ETHUSDT Spot M5 observations at the exact same UTC clock on the
previous one and two days. The entire 52h5m 625-candle period is fetched with
**one** bounded public Binance request (up to 650 rows, no credentials), subject
to the existing eventStudy local allowance (6 attempts/day, 30m spacing), only
when the user explicitly requests it. Missing, unfinished or duplicated M5
candles fail closed. The result is not an estimated macro effect, not a
verified BLS release, and not a trading signal. Two controls alone do not
support statistical significance. The first successful comparison per event
and asset is retained locally (up to 80 snapshots, for at most 90 days).

## APEX public no-key research sources (personal research mode)
The Overview reads Alternative.me Fear & Greed (market-wide only), at most
3 attempts/day, 80/month, 6h spacing. When the user opens an asset's Data
page, OKX Spot public ticker is requested at most 12/day, 300/month, 1h
spacing. DEX Screener is at most 8/day, 210/month, 2h spacing;
GeckoTerminal at most 6/day, 160/month, 3h spacing. DEX is limited to
exact prechecked WETH/WSOL network/contract mappings; other instruments
are explicitly unsupported. No automatic DEX ticker-to-contract inference.
These are conservative **per-device** caps, NOT official provider guarantees
nor shared IP limits. All requests are public read-only GET with no user
accounts, tokens or order execution. Failures count as attempts; cached
results carry observed/cached timestamps and are labelled stale if necessary.
CoinPaprika and key-required providers are not embedded in the distributed APK
pending confirmation of access and acceptable redistribution/licensing terms.

## Personal free news APIs without hosting (Android)

APEX can query NewsData.io and CryptoPanic directly from the Android app, **without a Cloudflare server**. Go to **Источники → Бесплатные API · лимиты → Личные бесплатные API** and enter the key issued by the provider; then open **Новости → Обновить** to check real availability. Keys are encrypted with Android Keystore, are never in the committed code, are not returned to JavaScript after saving, and can be deleted from the same panel. No sign-up, payment, or account keys are embedded in this APK.

- **NewsData.io**: official $0 plan has 200 credits per day but approximately 12-hour delayed news. The on-device internal cap is 180/day, 5,580/month, minimum 10 minutes between requests, and up to 6 hours of sanitized per-asset cache. Its actual server-side allowance always takes priority.
- **CryptoPanic**: mobile calls are documented, but plan entitlement is account-specific and cannot be manufactured. The cautious on-device limit is 4/day, 100/month with a 6-hour interval until confirmed; provide your own entitled token.
- **Reddit**: the official external Data API requires approval and application registration. Reddit announced no new public API access requests after October 31, 2026 and retirement of RSS on November 13, 2026; this APK deliberately does not scrape or bypass those controls. It keeps approved-input validation disabled until access is available.
- Device backup/restore may make old Keystore ciphertext unreadable on a different phone; re-enter the provider key in the app if necessary.
- If a provider blocks the phone, rejects credentials, or has no recent articles, APEX reports the actual source state; no fake articles are generated.
- **Security**: type keys only into the Android APK, not into chat messages or untrusted links. All private provider calls use fixed HTTPS hosts with redirects disabled and deliberately omit request URLs from error text.

This is an optional user-configured research feature. Existing GDELT, Bluesky, spot-market and on-chain adapters remain independent and do not need this setup.
