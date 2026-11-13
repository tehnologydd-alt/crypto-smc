# APEX AI Collective — two-server, free-tier research architecture

**Status: CODE PREPARED, NOT DEPLOYED.** There is currently no connected
Oracle Cloud VM or Cloudflare Worker for this stage. Do not represent either
service as live. Never commit secrets or put a shared server token in an APK.

## What actually runs where

| Runtime | Planned model / purpose | Free-tier boundary |
| --- | --- | --- |
| Cloudflare Workers + Workers AI + D1 | `@cf/zai-org/glm-4.7-flash` (analyst), `@cf/qwen/qwen3.8-27b` (independent critic); HTTP API, auth and quota counter | Workers Free limits; Workers AI 10,000 **Neurons/day total**; internal cap **12 language-agent requests/day** is an additional guard and does NOT guarantee that the Neuron allocation will last |
| Oracle Cloud Ampere A1 VM | XGBoost and LightGBM (CPU inference; manual candidate training and evaluation) | Oracle Always Free **2 OCPU / 12 GiB RAM across A1 VMs**; capacity availability and idle reclaim are outside APEX control |

The four roles are four independently evaluated components. A "Director"
can coordinate them later, but it is not a fifth billable model. The
Cloudflare Worker has GLM and Qwen evidence-agent endpoints; it also offers
a protected proxy for evaluated XGBoost/LightGBM observations when a private
HTTPS Oracle origin is configured. It **does not** autonomously schedule
training or issue trading instructions. Android pairing is a subsequent
stage, not quietly enabled here.

This is separate from the already existing `apex9-cloudflare` news pilot
and does not replace, redeploy or modify that worker.

## APEX automatic cost guard — Kyiv day / overnight ECO

The shared request governor in `edge/budget-governor.mjs` determines
Europe/Kyiv local time **including DST**, and applies the following
internal *attempt* ceilings before contacting any chargeable AI/CPU
provider. Every failed attempt is counted. D1 counter queries are
atomic; if D1 is missing, an upstream call is blocked.

| Research mode | Local time | GLM + Qwen shared | Cloud Run CPU gateway |
| --- | --- | --- | --- |
| ACTIVE | 08:00–23:00 | Up to **12/day**, 5-min minimum gap | Up to **100/day**, 2-min minimum gap |
| ECO | 23:00–08:00 | Maximum **1/whole night**, 60-min minimum gap | Maximum **4/whole night**, 30-min minimum gap |
| Monthly guard | Calendar month, Kyiv time | **280/month** | **1,800/month** |

The night uses a single bucket across midnight, so 23:00–00:00 cannot
reset and start another set of night requests at 00:00. The separate
calendar-day and month caps apply simultaneously. These conservative
ceilings intentionally reserve spare capacity; they can be revised after
measuring real provider consumption.

Protected `GET /v1/budget/status` displays current scheduling state,
remaining internal counts, cooldowns and a clear
`billingObserved:false` / `neuronUsageObserved:false` flag. Both
the CPU model-status check and CPU prediction use the same CPU quota.
Auth and validation run before a quota reservation.

**CRITICAL:** The governor does *not* know real Workers AI Neurons
usage, Google Cloud vCPU-seconds, memory-seconds, billing or other workloads
in either account. It cannot guarantee a zero bill. Google Cloud budget
alerts are **not a hard spend cutoff**; separately enforce conservative
Cloud Run `min-instances=0`, `max-instances=1`, `concurrency=1`,
no GPU, short request timeout, and configure cloud billing alerts.
Keep **CPU training as a separately bounded scheduled job**, not in the
HTTP inference handler. Avoid treating a cron task as free indefinitely.

The CPU `train.py` command also refuses to launch heavy learning in
Kyiv `ECO` hours, unless the operator explicitly passes
`--allow-night-training`. The model API does not activate an unevaluated
candidate and does not produce synthetic outcomes.

**No automatic background scheduler is installed in this stage.**
The day/overnight policy governs incoming work and training launches,
not a promise of 24-hour data polling or a paid always-on VM. A later
version can introduce a consented, quota-aware Cloudflare Cron/Queue
that triggers active daytime research. Do not connect unrestricted
market-provider polling to this Worker before reviewing source limits.

## Server 1: Cloudflare, no mandatory paid plan

1. In your own Cloudflare Free account, create a D1 database called
   `apex-ai-research`; retain its **database ID**.
2. Copy `edge/wrangler.template.jsonc` to `edge/wrangler.jsonc`
   and replace `REPLACE_WITH_YOUR_CLOUDFLARE_D1_DATABASE_UUID` with your
   own D1 ID. Do not commit your resulting account-specific file.
3. Use the Cloudflare CLI from `apex-ai-research/edge`:
   ```sh
   npx wrangler@latest login
   npx wrangler@4 d1 execute apex-ai-research --remote --file=./schema.sql --config=./wrangler.jsonc
   npx wrangler@latest secret put APEX_EDGE_TOKEN
   npx wrangler@latest deploy --config wrangler.jsonc
   ```
4. Generate a unique random token for `APEX_EDGE_TOKEN`, store it in the
   Cloudflare secret store only, and never share it in chat or GitHub.
   Worker `GET /health` is public but does **not** prove AI/model availability.
   The protected `POST /v1/agents/analyze` accepts strictly bounded
   source-backed observations and roles `analyst` or `critic`.
5. Check the Workers AI dashboard for **real** Neuron usage. Internal
   attempts are atomically counted in D1 even when inference fails;
   the free tier stops serving requests at its own daily limits.

Cloudflare does not run XGBoost/LightGBM training inside a Worker:
the free Worker CPU budget is too small.

**Security:** the first pilot uses a private bearer credential stored
only in Cloudflare and your own operator system. **Do not copy this
credential into Android**: an app-distributable secret is not a secure
user login. Android auth and per-user tokens need a proper pairing
and revocation flow before production client integration.

### Optional manual GitHub deployment for Cloudflare

The repository includes `.github/workflows/apex-ai-cloudflare-manual-deploy.yml`.
Once the workflow exists on the default branch, enter repository Secrets
`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` and variables
`APEX_AI_D1_DATABASE_ID`, `APEX_AI_WORKER_ORIGIN`. Configure the Worker
secret `APEX_EDGE_TOKEN` in Cloudflare. Choose **Actions → APEX AI Collective —
manual Cloudflare deploy → Run workflow** and enter `DEPLOY_APEX_AI` as
explicit approval. This job only deploys the separate AI Worker; it does
not provision Oracle, start paid resources or publish a mobile API key.
The Worker health check confirms its identity, **not** live Workers AI quota
or real training. No automatic push-to-cloud deployment is enabled.

Cloudflare's `@cf/qwen/qwen3-30b-a3b-fp8` is scheduled for retirement on
2026-11-20; this implementation uses its replacement `@cf/qwen/qwen3.8-27b`.

## Server 2: Oracle Always Free A1

Provision an **Always Free eligible Ubuntu ARM64** A1 VM in the selected
home region, staying within the combined 2 OCPU / 12 GiB allowance.
Oracle may have no free capacity and can reclaim low-utilization Always
Free instances. Keep off-site backups of the model artifacts. Do not
upgrade to a paid account merely to bypass a capacity error.

Install Docker/Compose. Then in the cloned repository:

```sh
cd apex-ai-research
mkdir -p model_store verified_observations
sudo chown -R 10001:10001 model_store
cp .env.example .env
# Edit .env on the VM and set a long RANDOM token (not the example value).
docker compose up -d --build
curl -fsS http://127.0.0.1:8789/health
```

The Cloudflare Worker exposes protected `POST /v1/boosters/predict` and
`GET /v1/boosters/status` routes, which fail closed until the Oracle HTTPS
origin is configured. Neither endpoint places orders or generates a model
without evaluated artifacts.

The compute server binds **localhost only**, so the training and
inference endpoints are not exposed to the internet. To connect it
to the Cloudflare Worker later, configure **authenticated HTTPS**
through a securely managed hostname or tunnel. Set the Worker secrets
`APEX_COMPUTE_TOKEN` and `COMPUTE_ORIGIN` (an HTTPS URL). The
hostname/tunnel is **not configured in this repo** and should not be
silently replaced with a plain HTTP public port. Some hostname choices
may have costs; a `workers.dev` address alone does not provide an
Oracle origin hostname.

Protected local endpoints:
- `GET /health` — whether an evaluated model is actually active.
- `GET /v1/models/status` — model availability and exact features.
- `POST /v1/predict` — *research-only* scores from the two booster
  models. Returns HTTP 409 until evaluated models are activated.
  No order placement, stops, or trading automation exists.

## Training: only from actual verified APEX records

The training script reads **user-provided, real, completed and
source-traceable** JSONL. It never generates price rows or missing
outcomes. Train one asset per dataset. Each record must have exactly:
`asset` (e.g. the verified ticker's market symbol),
`observed_at` (Unix seconds),
`resolved_at` (Unix seconds after the observation),
`label` (confirmed binary outcome),
`source_ids` (nonempty audit references),
and `features` (exactly these 10 pre-observation measured features):

```
return_1m, return_5m, volatility_15m, volume_z_15m,
spread_bps, book_imbalance, large_trade_pressure,
whale_flow_score, relative_volume, cross_venue_disagreement
```

A dataset requires >=240 resolved observations. Training uses a
chronological final 20% holdout, excludes labels that were resolved
after holdout began, checks both classes, and reports **Brier score**
and log loss against a constant-prior baseline.

```sh
docker compose run --rm cpu-research python train.py \
  --observations /srv/apex/verified_observations/verified.jsonl \
  --models /srv/apex/models --version v001
```

Results are written as `v001.xgboost.json`,
`v001.lightgbm.txt` and `v001.candidate.json`. **They are NOT
activated automatically** even if a holdout score looks favorable.

After reviewing real holdout data, leakage controls and independent
forward results, an operator can explicitly activate a candidate:

```sh
docker compose run --rm cpu-research python activate.py --models /srv/apex/models --version v001 --confirm-reviewed-version v001
```

Activation refuses invalid hashes and candidates that do not beat the
historical baseline on the held-out sample. This is a minimum software
gate, not proof of future predictive improvement.
Check temporal leakage, data lineage, changes in market regime and
calibration on additional forward periods first. Activation is a
separate deliberate operator action with a matching `active.json`.
This code does not guarantee any improvement in forecast quality.

## Current technical boundary and next step

* Both server source packages, the independent models and tests are
  prepared in GitHub; no VM, database, Cloudflare account, billing
  setting, DNS record or live endpoint has been created on your behalf.
* Actual deployment requires access to your own Cloudflare account,
  Oracle Always Free account, their capacity availability and consent
  to create services. Never paste credentials into chat.
* Next integration stage: private Oracle transport, reliable
  source-backed training-export from APEX Room, dataset/version
  integrity signatures, authenticated Android pairing, rollbacks
  and out-of-sample monitoring, **before** any model scores appear in
  the mobile research panel.
