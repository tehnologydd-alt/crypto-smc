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
