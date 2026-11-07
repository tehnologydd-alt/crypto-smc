# APEX 9 Research — Android update, icon and GRAM migration design

## Native Gram / TON correction
- On 15 June 2026 native Toncoin became Gram (`GRAM`); the network still uses the name TON.
- APEX uses `GRAMUSDT` for new Binance/Bybit spot queries, news matching and quick asset chips.
- Legacy input `TON` or `TONUSDT` resolves to the current Gram symbol on lookup and stored last-symbol preferences, not to a stale/delisted ticker.
- The asset search continues to use the actual current Binance Spot USDT catalog; it does not synthesize listings.
- Distinguish the native GRAM coin of the TON network from unrelated jetton tokens named GRAM.
- Historical external references: Binance announcement 2 July 2026, Blockchain.com rebranding July 2026.

## Install-over-app update contract
- Android package ID: `com.apexintelligence.research`. The installed APEX 8.6 has a different ID; it is not overwritten.
- Monotonic Android `versionCode = 900000 + GITHUB_RUN_NUMBER`. `versionName = 9.0.RUN`.
- Stable signing uses four **existing private GitHub Actions secrets**:
  - `APEX_KEYSTORE_B64`
  - `APEX_KEYSTORE_PASSWORD`
  - `APEX_KEY_ALIAS`
  - `APEX_KEY_PASSWORD`
- All four must be set; the key must remain **identical** across all installed release versions. Partial configuration fails the build. Never commit, reveal or print private keys.
- When all secrets are available, Android build produces `APEX9-Research-Preview-signed.apk`. Otherwise it produces a clearly labeled `APEX9-Research-Preview-debug.apk` that **cannot be promised to update over prior builds**.
- Android validates package ID, certificate and versionCode. Successful release updates should preserve the app's own local data; the older debug APEX 9 preview may require one one-time uninstall/reinstall when moving to the stable signed release. **Do not uninstall APEX 8.6**.
- No background self-install; every APK update requires explicit user approval by Android.
- GitHub releases can be published **only by manually dispatching** the `APEX 9 Research - Android APK` workflow with `publish_prerelease = true` and configured signing. Normal code pushes do not publish APKs publicly by themselves.
- `Источники → Версия и обновления → Проверить обновление` checks official signed releases by canonical tag URL, then sends the user to the official GitHub release page. Absence of a release is reported clearly.

## Icons
- Original app icon: `apex9-android/assets/apex-icon.svg`; metallic/cyan A apex, orbital radar, subtle price bars; rendered for all Android launcher densities with adaptive foreground and dark backing.
- Android status-bar / notification icon: `apex9-android/assets/ic_stat_apex.xml` and generated `res/drawable/ic_stat_apex.xml`: a **white monochrome A** on transparent background, tinted by Android to the configured accent. Do not use a tiny colorful launcher image as the notification status symbol.
- Capacitor local-notifications plugin v7 configured with `smallIcon: 'ic_stat_apex'` and `iconColor: '#37DDE3'`. Notification metadata is also added to the Android manifest for future FCM integration.
- **Icons are configured, but no forecast-notification scheduling service has been added**; absence of an actual notification is not an icon failure.

## Quality gates
1. Confirm `GRAM` and legacy `TON` aliases with real exchange catalog and unit tests.
2. Verify package ID and incremented versionCode in compiled manifest.
3. Verify `mipmap-*` launcher assets, adaptive icon and `drawable/ic_stat_apex` resources in compiled app.
4. Confirm successful signed APK generation and persistent certificate fingerprint across two distinct runs when secrets exist.
5. Validate install-over-app on a real Android phone, without deleting any local app data.
6. Confirm missing sources, news and partial data are still correctly labeled.
7. Do not claim push notifications, active ML forecasts, or real-time background processing before they are actually implemented and tested.
