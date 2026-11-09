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
