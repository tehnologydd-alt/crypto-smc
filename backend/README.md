# Orbit Signals backend

Node.js 24 server for the optional Android server mode. The server monitors only the 1–10 marked USDT pairs on spot and USDT-M futures. It records signals, events, statistics and the adaptive model in a persistent SQLite database. The Android APK can switch back to its independent local mode.

## Run

For a public installation, use the included Docker Compose and Caddy configuration. Point a domain at the server, copy `.env.example` to `.env`, set `APP_DOMAIN` and a random `APP_TOKEN` of at least 24 characters, then run `docker compose up -d --build`. Keep `.env` and the data volume private. The APK requires the HTTPS domain and `APP_TOKEN` in Settings. `VAPID_SUBJECT` is optional for the native APK; set it only if using browser push in the included PWA.

For local development, use `node --test` then `node server.js`. The default binding is `127.0.0.1:3000`. On Windows, `./start-pc-backup.ps1` starts a separate LAN HTTPS server on port 3443. It creates a persistent SQLite database, a random access token and a pinned TLS certificate outside the repository. Keep `connection.json` and the PFX private and backed up. The phone needs the PC LAN IP in the home address field, token and certificate SHA-256 from that file. Open TCP 3443 in Windows Firewall for the active network profile and home subnet only. For remote access to the same process, use Tailscale Serve and enter its HTTPS `.ts.net` URL as the app's external address.

## API used by Android

- `POST /api/mobile/sync`: imports up to 50 changed phone signals, acknowledges their IDs and optionally returns current marked assets, signals and events, prices, model summary and usage counters. A stable database ID lets Android resend its history after server restoration. Imports train once, without counting historical outcomes as independent validation.
- `GET /api/mobile/state`: legacy read-only state route.
- `PUT /api/symbols`: set the 1–10 marked assets.
- `GET /api/limits`: usage counters and capacity estimate.

All API routes require `Authorization: Bearer <APP_TOKEN>` when the server is exposed beyond loopback. The app encrypts this key with Android Keystore. The mobile client polls approximately once per minute while open and by Android's background scheduler after closing; immediate native push is not yet implemented.

## Limit control

`limits.js` computes expected workload and enforces conservative Binance REST budgets: spot 1,000 weight/minute and 30,000/day; futures 500 weight/minute and 30,000/day. It reads Binance's `X-MBX-USED-WEIGHT-1M` response header and pauses requests after HTTP 429/418 for at least `Retry-After`. Only marked pairs are scanned. Counters are persisted in `data/state.json` and exposed to the APK. Restarts between saves can lose up to 30 seconds of counter updates, so these caps include substantial headroom.

At 10 marked assets and two markets, scheduled M5–H4 scans need about 9,240 REST requests/day in normal operation; reconnect recovery, chart views and retries add traffic. M1 and large trades use four WebSocket connections total. This Node process is **not a Cloudflare Worker**. A separate Cloudflare Free implementation using REST M1 would need about 38,040 Binance requests/day and would peak at 120 external calls in one H4 minute, over the 50 subrequests per Worker invocation. It would need scheduling across invocations, D1 persistence and CPU measurements before deployment.


## Автозапуск Node-сервера на Windows (телефон может быть закрыт)

Текущий Node-сервер с постоянными Binance WebSocket и SQLite предназначен для запущенного Windows ПК либо постоянно работающего VPS. При наличии Node.js 24+ выполните **на том компьютере, где хранится резервная база**, из каталога `backend`:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install-pc-autostart.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\check-pc-server.ps1
```

Установщик создаёт задание планировщика Windows, запускает существующий `start-pc-backup.ps1` после входа пользователя и проверяет его каждые пять минут. При закрытии Android-приложения Node продолжает работать, **пока компьютер включён, пользователь вошёл в Windows и интернет доступен**. Если ПК выключен или спит, непрерывный сбор прерывается. База и `connection.json` по-прежнему остаются за пределами GitHub. HTTPS-адрес ПК, токен и SHA-256 сертификата для Android берутся только из локального `connection.json`, их нельзя публиковать.

Проверка `check-pc-server.ps1` подтверждает только наличие Node-процесса и открытого локального HTTPS-порта; реальное получение стаканов Spot/Futures нужно дополнительно проверять по API сервера. Сеансы Binance при разрыве синхронизируются заново.

## Проверенный статус Cloudflare (21 ноября 2026)

Worker `orbit-signals-depth` и SQLite Durable Object развёрнуты как отдельный экспериментальный сборщик, а **не** как Node backend с прогнозами. Реальная проверка через GitHub Actions показала HTTP 403 для Binance Spot/Futures REST и HTTP 403 для Futures WebSocket из Cloudflare. Spot WebSocket отвечал 101 и присылал обновления, но REST-подтверждение стакана также блокировалось 403. Поэтому корректные 100-уровневые книги не собирались, архив оставался пустым. Автоматический Cloudflare Cron и повторные подключения выключены; не считайте этот Worker действующим источником истории или прогнозов. Подмена стаканов данными свечей/фиктивными снимками не применяется.

Проверка ошибки облака: `https://orbit-signals-depth.apex9-research-lab.workers.dev/health`. Для полного Node-сервера требуется реальный доступный ПК или отдельный постоянно работающий хост, с которого Binance разрешает получать стаканы. Развёртывание такого сервера на ПК не может быть подтверждено только GitHub-коммитом.
