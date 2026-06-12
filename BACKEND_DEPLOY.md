# Production API backend (Cloud Run) — setup & runbook

**Problem this solves:** production is Firebase Hosting (static `dist/`), which has
**no `/api` backend** — so every `/api/*` call returned the SPA `index.html`. That
silently broke everything that needs the server (Mux live streaming, Stripe
payments, the AI agent/Muse, push, events/tickets, merch, Cora analysis, the
`/api/proxy` + `/api/fetch-rss` proxies, etc.).

**Fix:** `server.ts` (Express — already serves the SPA + every `/api` route, binds
`0.0.0.0:$PORT`, runs the sports-ingestion worker) is deployed to **Cloud Run** as
`plajah-api`, and Firebase Hosting rewrites `/api/**` to it. Static assets keep
the Hosting CDN.

```
Browser ──▶ Firebase Hosting (CDN: dist/, index.html)
                 │  /api/**  ─▶  Cloud Run: plajah-api (server.ts)  ─▶ ESPN/Stripe/Mux/Anthropic/Firestore
                 └  /**      ─▶  index.html (SPA)
```

Wired in this repo:
- `firebase.json` — `/api/**` → `run: { serviceId: plajah-api, region: us-west1 }`.
- `Dockerfile` — `npm ci --include=dev` (the server runs via `tsx`), `tsx server.ts`.
- `.gcloudignore` — lean upload context (keeps `dist/`).
- `.github/workflows/firebase-hosting-deploy.yml` — a **separate** `deploy_api`
  job builds the SPA and runs `gcloud run deploy plajah-api --source .`. It is
  isolated from the hosting job, so an API-deploy failure never blocks hosting.

---

## One-time setup (must be done by an Owner of the GCP project)

Project: `gen-lang-client-0665118474` · Region: `us-west1`

### 1. Enable the required APIs
```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com --project gen-lang-client-0665118474
```

### 2. Grant the CI deploy service account the needed roles
The CI uses the service account in the GitHub secret
`FIREBASE_SERVICE_ACCOUNT_GEN_LANG_CLIENT_0665118474` (its email is the
`client_email` field of that JSON — call it `<DEPLOY_SA>`).
```bash
PROJECT=gen-lang-client-0665118474
for ROLE in roles/run.admin roles/cloudbuild.builds.editor \
            roles/artifactregistry.admin roles/iam.serviceAccountUser \
            roles/storage.admin; do
  gcloud projects add-iam-policy-binding $PROJECT \
    --member="serviceAccount:<DEPLOY_SA>" --role="$ROLE"
done
```
`iam.serviceAccountUser` is required so CI can deploy a service that runs **as**
the Cloud Run runtime service account.

### 3. Set the server's secrets on the service
The deploy only sets non-sensitive baseline env
(`NODE_ENV`, `VITE_FIREBASE_DB_ID=plajah-prod`, `VITE_FIREBASE_PROJECT_ID`).
Add the real secrets **once** (they persist across deploys because CI uses
`--update-env-vars`, which merges and never clears them). Use Secret Manager:
```bash
# example for one secret; repeat per key
printf '%s' "sk_live_…" | gcloud secrets create STRIPE_SECRET_KEY --data-file=- --project $PROJECT
gcloud run services update plajah-api --region us-west1 --project $PROJECT \
  --update-secrets STRIPE_SECRET_KEY=STRIPE_SECRET_KEY:latest
```
Keys the server reads (set the ones whose features you use):
`ANTHROPIC_API_KEY`, `GOOGLE_AI_API_KEY`/`VITE_GOOGLE_AI_API_KEY`,
`GOOGLE_SERVICE_ACCOUNT_JSON` (Firestore Admin — needed by the sports worker,
push, cron), `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` + `STRIPE_PRICE_TIER1..3`,
`MUX_*`, `ENCRYPTION_KEY` (Fediverse creds), `CRON_SECRET`, `TWITTER_CLIENT_ID/SECRET`,
`PRINTFUL_API_KEY`, `GELATO_API_KEY`, `BING_SEARCH_KEY`. Missing keys just disable
that one feature — the server starts regardless.

---

## Deploying

- **Automatic:** push to `master`. The `deploy_api` job builds + deploys Cloud
  Run; the hosting job deploys the CDN with the `/api/**` rewrite. (Until step 2's
  IAM is granted, only `deploy_api` fails; hosting keeps shipping.)
- **Manual bootstrap** (run once locally if you'd rather not wait for CI):
  ```bash
  npm ci && VITE_MUX_TOKEN_ID=x VITE_MUX_TOKEN_SECRET=x npm run build
  gcloud run deploy plajah-api --source . --project gen-lang-client-0665118474 \
    --region us-west1 --allow-unauthenticated --port 8080 --memory 1Gi --cpu 1 \
    --timeout 300 \
    --update-env-vars NODE_ENV=production,VITE_FIREBASE_DB_ID=plajah-prod,VITE_FIREBASE_PROJECT_ID=gen-lang-client-0665118474
  ```

## Verify
```bash
# Cloud Run service directly (JSON, not HTML):
curl -s "$(gcloud run services describe plajah-api --region us-west1 \
  --project gen-lang-client-0665118474 --format='value(status.url)')/api/fetch-rss?url=https%3A%2F%2Ffeeds.bbci.co.uk%2Fnews%2Frss.xml" | head -c 200
# Through the CDN (after a hosting deploy):
curl -s "https://plajah.com/api/fetch-rss?url=https%3A%2F%2Ffeeds.bbci.co.uk%2Fnews%2Frss.xml" | head -c 200
```
Both should return RSS XML (`<?xml … <rss>`), **not** `<!doctype html>`.

## Cost / ops notes
- Defaults to **scale-to-zero** (`min-instances=0`) — ~$0 idle. To keep the API
  warm **and** keep the background sports-ingestion worker continuously running,
  add `--min-instances 1` (≈ a low monthly cost). Live scores already come from
  the client (ESPN direct), so min-instances 0 is fine for correctness.
- Rollback: `gcloud run services update-traffic plajah-api --region us-west1
  --to-revisions <PREVIOUS_REVISION>=100`.
