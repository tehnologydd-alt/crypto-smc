# APEX 9 — Cloudflare monitor · phone-first UI

## Release-tested build

- Branch: `apex-ai-device-pairing-20261113`.
- Build: **APEX 9.0.987**, `versionCode=900987`, signed RELEASE.
- APK GitHub Actions run: https://github.com/tehnologydd-alt/crypto-smc/actions/runs/43461762095 .
- Artifact: `APEX9-AI-Cloudflare-Pairing-Signed-Update`.
- The Android build verifies `UPDATE_COMPATIBLE` against original signed APEX 9; no reinstallation or clearing data should be required.
- Source/security/UI tests: https://github.com/tehnologydd-alt/crypto-smc/actions/runs/43461815649 .

## Interface

- Overview: under Favorites, a compact **APEX AI · Cloudflare** card shows live HTTPS Worker reachability, device pairing, ACTIVE/ECO schedule, signed D1 language-agent attempt usage and time last checked.
- Buttons **Обновить** / **Подробности**. Details opens existing Settings dialog (no added navigation tab).
- Settings: manual device pairing with verification code and key fingerprint; day/month/night D1 attempt quota progress, next eligible request, separate actual GLM and Qwen successes on THIS phone and latest model request outcomes.
- Only Android native `getAiHealthStatus`, `getAiPairingStatus`, `getAiBudgetStatus`, `getAiActivityStatus` used for monitoring. Android Keystore signing handles private endpoints.
- Android health uses public `/health` and validates `service=apex-ai-edge`, `state=RUNNING`, HTTP 200; this does NOT prove a successful inference.
- State `APPROVED` plus a successful signed `/v1/budget/status` response of `POLICY_ACTIVE` is needed for `Подключён`. Pending/revoked/not paired/closed states are shown faithfully.
- Last eight model calls are recorded locally as role + result + timestamp, without source evidence or model text. Only `state=OBSERVED_MODEL_OUTPUT` + HTTP 200 is counted as successful.
- Dashboard refresh on launch, explicit refresh, and on open Overview while app is in foreground (90s); does **not** trigger LLM requests.

## Limits / honesty

- `usage.language.dailyUsed` is a conservative number of D1-reserved request attempts. Cloudflare Neurons or actual invoice are **not** visible in this interface.
- Real model analysis is not started by the new monitor. With no manually approved phone or no prior real model calls, model counters legitimately display zero / unverified.
- Original Worker and D1 remain as deployed; no Oracle, paid cloud tiers, trading orders or stored server tokens in APK.
- New dedicated Android Worker: https://apex-ai-collective-device.apex9-research-lab.workers.dev/health .
