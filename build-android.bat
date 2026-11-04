@echo off
setlocal
cd /d "%~dp0"
echo [1/4] Installing project dependencies...
call npm install --no-audit --no-fund || goto fail
echo [2/4] Building offline web assets...
call npm run build || goto fail
echo [3/4] Preparing Android project...
if not exist "android\" (
  call npx cap add android || goto fail
)
call npx cap sync android || goto fail
echo [4/4] Open Android Studio: build APK via Build ^> Build Bundle(s) / APK(s) ^> Build APK(s).
call npx cap open android || goto fail
exit /b 0
:fail
echo BUILD FAILED. Check Node.js 22+, Android Studio and Android SDK.
exit /b 1
