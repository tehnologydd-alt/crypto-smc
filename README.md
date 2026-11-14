# APEX 9 · Market Intelligence

Android-first, research-only application. Active development candidate: `apex-dev`. Previous verified reference: `apex-ai-live-audit-20261113` at `bc6b77ac0abf3ef369594aff77d286b0f8b00a57`.

## Current source tree

- `apex9-android/` — Capacitor Android packaging, native Room storage, notifications, signed release tooling.
- `apex9-preview/` — current mobile interface, public source integrations, research and AI monitor.
- `apex-ai-research/` — AI research gateway, device authorization and guarded budgets.
- `apex9-cloudflare/` and `apex9-news-gateway/` — gateway services; infrastructure is not changed by this cleanup.
- `updates/` — only the two shared v90 evidence/depth modules and their tests.
- `docs/` — historical design and verification documentation.

## Local checks

Node.js 22+:

```sh
node apex9-android/scripts/prepare-web.mjs --check
node --test updates/test-v90-evidence.mjs updates/test-v90-market-depth.mjs apex9-preview/test-cloud-ai-monitor.mjs
cd apex9-android
npm ci
npm test
npm run build:web
```

The existing signed-update Android workflow checks release signer and increasing version code. Never commit credentials or signing material. Download only a successfully validated APK from GitHub Actions. Last verified pre-cleanup build: https://github.com/tehnologydd-alt/crypto-smc/actions/runs/43581150275 .

## Cleanup and recovery

The previous active branch and commit remain unchanged. Historical V2–V8.8 patch files, encoded V2 snapshot and obsolete V2/8.6 build workflows are removed from this candidate tree only, not from Git history. See `docs/REPOSITORY_CLEANUP_20261114.md`. Do not delete older branches until their ancestry and open PR dependencies have been reviewed. The default branch `main` has diverged and is not overwritten.

No real orders or account-management capabilities are included in this research application. Market observations and model outputs do not establish predictive accuracy.
