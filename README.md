# ApexiCrypto original restored — standalone Android

This branch temporarily carries the complete restored source in `source/apexicrypto.tar.xz` for the first CI build. After a successful build, GitHub Actions publishes all source files into this **same branch** and removes the archive. `main` remains untouched.

The app preserves the original forecasts, signal entry, SL, TP1–TP3, four agent summaries and UI without requiring AI Studio to launch. Local forecasts work without an AI key; optional user-supplied Gemini direct API is session-only. Fake hardcoded whale and social data are not presented as live.
