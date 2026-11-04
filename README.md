# ApexiCrypto Android (отдельная ветка)
Это самостоятельный Android-проект **ApexiCrypto**, отдельно от Market Intelligence AI.
Ветка `apexicrypto-android` не содержит файлы Kotlin-приложения из `main`.

Исходный пакет разворачивается GitHub Actions при первом запуске; после этого он будет заменён
на обычные редактируемые файлы React/TypeScript + Capacitor.

Сборка создаёт тестовый Android APK как артефакт `ApexiCrypto-debug-apk`.
Исходный проект не использует сервер AI Studio / Gemini; онлайн нужны публичные
биржевые API. Реальные ончейн-переводы китов и социальный ML-мониторинг не реализованы.
