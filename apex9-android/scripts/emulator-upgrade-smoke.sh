#!/usr/bin/env bash
# APEX 9 Stage 11 — Android emulator installation and reinstall smoke.
# No fabricated quotes, forecasts, Room rows or user accounts.
set -euo pipefail
APK="$1"
OUTPUT="$2"
PACKAGE="com.apexintelligence.research"
ACTIVITY="$PACKAGE/.MainActivity"
mkdir -p "$OUTPUT"
test -s "$APK"
adb wait-for-device
BOOTED="$(adb shell getprop sys.boot_completed | tr -d '\r')"
if [ "$BOOTED" != "1" ]; then
  echo "::error::Android emulator did not finish booting"
  exit 1
fi
test "$(adb shell pm list packages | grep -c "^package:$PACKAGE$" || true)" -eq 0
echo "APEX emulator: installing clean APK"
adb install "$APK" | tee "$OUTPUT/install.txt"
adb shell am start -W -n "$ACTIVITY" | tee "$OUTPUT/launch.txt"
sleep 9
if ! adb shell pidof "$PACKAGE" >/dev/null; then
 echo "::error::APEX stopped after first launch"
 adb logcat -d -t 500 >"$OUTPUT/logcat-tail.txt" || true
 exit 1
fi
echo "APEX emulator: warm restart"
adb shell am force-stop "$PACKAGE"
adb shell am start -W -n "$ACTIVITY" >"$OUTPUT/relaunch.txt"
sleep 4
adb shell pidof "$PACKAGE" >/dev/null || {
 echo "::error::APEX failed to relaunch after force-stop"; exit 1;
}
# For debug builds, write a small arbitrary internal-storage canary and
# verify that adb install -r keeps the app's private files. It is NOT a Room
# record, proof of actual user migration, nor an account/device backup.
PRIVATE_PROBE="NOT_TESTED"
if adb shell run-as "$PACKAGE" sh -c \
 'mkdir -p files && printf APEX_STAGE11_REINSTALL_CANARY > files/apex_stage11_canary' 2>/dev/null; then
 PRIVATE_PROBE="CREATED"
fi
echo "APEX emulator: reinstall same signed binary without uninstalling"
adb install -r "$APK" | tee "$OUTPUT/reinstall.txt"
if [ "$PRIVATE_PROBE" = "CREATED" ]; then
 value="$(adb shell run-as "$PACKAGE" cat files/apex_stage11_canary 2>/dev/null | tr -d '\r\n')"
 if [ "$value" != "APEX_STAGE11_REINSTALL_CANARY" ]; then
  echo "::error::App-private storage canary disappeared on reinstall"
  exit 1
 fi
 PRIVATE_PROBE="PRESERVED"
fi
adb shell am start -W -n "$ACTIVITY" >"$OUTPUT/after-reinstall.txt"
sleep 6
adb shell pidof "$PACKAGE" >/dev/null || {
 echo "::error::APEX failed to relaunch after reinstall"; exit 1;
}
adb shell dumpsys package "$PACKAGE" >"$OUTPUT/package-info.txt"
# Ordinary API errors do not constitute native process crashes.
adb logcat -d -t 2200 >"$OUTPUT/logcat-tail.txt" || true
if grep -E -A 16 'FATAL EXCEPTION:|Process: com\.apexintelligence\.research' \
 "$OUTPUT/logcat-tail.txt" | grep -Eq \
 'Process: com\.apexintelligence\.research|com\.apexintelligence\.research.*FATAL'; then
 echo "::error::APEX native process crash detected"
 exit 1
fi
cat >"$OUTPUT/report.json" <<EOF
{
  "format": "APEX_ANDROID_EMULATOR_SMOKE_V1",
  "packageId": "$PACKAGE",
  "device": "GitHub Actions Android emulator",
  "initialInstall": "PASSED",
  "firstLaunch": "PASSED",
  "warmRestart": "PASSED",
  "sameApkReinstall": "PASSED",
  "relaunchAfterReinstall": "PASSED",
  "privateCanary": "$PRIVATE_PROBE",
  "roomHistoryRestoredFromPreviousApk": "NOT_TESTED",
  "realDeviceValidated": false
}
EOF
echo "APEX emulator smoke succeeded; private canary: $PRIVATE_PROBE"
