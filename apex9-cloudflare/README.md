# APEX Cloudflare Free deployment pilot

**Status: code prepared, NOT deployed.** Requires the user's Cloudflare account, explicit deployment approval, a Workers/D1 database and a GitHub authorization token. No Cloudflare account, secret or domain is present in the repository.

Unlike the local Node/Caddy example, this pilot serves both the **private APEX web app** and **same-origin read-only news API** from a Worker. Cloudflare supplies HTTPS at `workers.dev`; a custom domain is optional. Android is separate and never has embedded API keys or Basic Auth credentials.

## One-time setup
1. Register or sign in to Cloudflare and use the **Workers Free** plan; do not upgrade for this pilot.
2. Create a D1 database named `apex9-news` and copy its **database UUID**.
3. Create a Workers API token with the minimum necessary permissions; do not send the token in chat or commit it. In the GitHub repo Settings > Secrets and variables > Actions, add **Secrets** `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Add **Variables** `APEX_D1_DATABASE_ID` and `APEX_WORKER_ORIGIN`, e.g. an exact `https://<your-worker>.<your-subdomain>.workers.dev` origin; ensure it matches the actual worker name and account subdomain. For the default worker name see `wrangler.template.json`.
4. Run the **manual** GitHub Actions workflow `APEX Cloudflare Pilot Deploy`; it will refuse to deploy if any setting is missing. It prepares an isolated web copy, applies SQL tables to D1, and deploys the Worker. It never deploys automatically on Git pushes.
5. In the Cloudflare Workers dashboard, add **Secret** `APEX_SITE_USER` and a strong, unique **Secret** `APEX_SITE_PASSWORD` (the single-user web login). Without both, all endpoints return 401. Use the same dashboard Secret controls for optional `APEX_CRYPTOPANIC_TOKEN` and `APEX_NEWSDATA_KEY`. Do not put these values in `vars`, source files, or APK files.
6. Open the worker HTTPS URL in a browser and sign in. Verify `/v1/status` shows `NOT_CONFIGURED` for news providers without secrets, and `/v1/bundle?coin=BTC` returns no invented news. Only after configuring provider keys can the server make real queries.

## Security and limits
- Every static file and API route requires HTTPS Basic Auth, checked by the Worker before serving assets.
- No CORS allowance. Cross-origin API calls are forbidden; third-party pages cannot consume browser news quotas.
- D1 performs an **atomic reservation before each vendor request**, applying provider-specific internal caps: NewsData.io **180/day, 5,580/month, minimum 10-minute gap**; CryptoPanic **4/day, 100/month, minimum 6-hour gap**. These are APEX safety ceilings, **not provider-advertised allowances**. A failed request still counts, and D1 errors stop new upstream requests.
- NewsData.io Free is advertised as **200 credits/day**, with **roughly 12-hour-delayed news**. APEX must not present those articles as real-time. CryptoPanic's actual entitlement must be checked in the connected account.
- Cached, sanitized articles are stored by provider and coin in D1, so refreshes do not continually spend vendor quotas.
- Every article remains context, never a trade instruction.
- Secrets live only in Cloudflare server settings. The current Android app remains standalone; do not copy browser credentials into the APK.

Cloudflare account usage and upstream API limits should be checked in the provider dashboards. Workers Free and D1 Free enforce resource quotas, but this workflow does not purchase or enable a paid tier.

## Recovery
The manual deploy action can be re-run after fixing config or code. DB quota state survives app redeployments. Do not delete D1 to reset quotas. Missing/malformed configuration fails without publishing the app. Do not mistake successful CI tests for an active cloud service.
