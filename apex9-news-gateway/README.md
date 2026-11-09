# APEX local news gateway (prototype)

Node.js 22+, no dependencies. This is a **local-only development gateway**.
It is not a deployed service and does not make providers live in the APK.

Set `APEX_CRYPTOPANIC_TOKEN` and/or `APEX_NEWSDATA_KEY` in the **server process environment**, never in Android files or Git.
No API request is made when a key is missing.
Run from the repository root with:
`node apex9-news-gateway/start.mjs`

Local endpoint: `GET http://127.0.0.1:8787/v1/news?provider=newsdata&coin=BTC`.
Cryptopanic provider: `provider=cryptopanic`. These two providers are intentionally disabled until keys are configured.

Quotas per key are conservative internal caps of **4/day, 100/month**, with 6-hour gaps. They are not verified vendor allowances. Attempts count, including errors.
The quota file is local; shared or public deployment requires a centralized atomic quota store, authentication, security review and verified provider plan/terms.
Do **not** expose this HTTP server to the Internet, bind it to a public IP, or assume it can serve a remote Android phone.
All responses are contextual news metadata, not predictions or trade instructions.

## Local endpoints and status
- `GET /v1/status`: configured flags, local remaining daily/monthly caps and next-allowed time, never raw credentials.
- `GET /v1/news?provider=cryptopanic&coin=BTC`: one provider, server-only key.
- `GET /v1/bundle?coin=BTC`: normalized cross-provider news with duplicates consolidated and per-provider states.

Local responses are not intended to be accessed from a separate web origin. The server rejects foreign `Origin` and `Host` values, and intentionally sets no permissive CORS header.

## APK integration boundary
The APEX client can parse an HTTPS same-origin `/v1/bundle` response but the build-time meta setting `apex-news-gateway-mode` is **disabled**. The current local server does not supply remote HTTPS or authenticated mobile access. Never simply switch this setting on in the Android APK: that would target the WebView origin, not a trusted service.

For any future hosted service, use a distinct authenticated HTTPS deployment, shared atomic quotas, explicit access controls and a reviewed app-to-server authorization design. Do not put upstream vendor keys or persistent bearer secrets in HTML, JavaScript, or APK storage. This is not a live integration yet.
