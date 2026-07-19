# Demucs worker — deployment

Studio-quality 4-stem separation (htdemucs). Runs as its own Cloud Run service, called only by
`plajah-api`. **Nothing here is deployed automatically** — the CI workflow does not build or
deploy this directory. Deploy it deliberately, when you want to start paying for it.

## Why it is a separate service

| Constraint | plajah-api today | What demucs needs |
|---|---|---|
| Base image | `node:20-alpine` (musl) | Debian — torch publishes no musl wheels |
| Image size | small | ~2GB with torch + baked weights |
| Memory | 2Gi | 8Gi (torch + weights + segment tensors) |
| Request timeout | 300s | up to 3600s; a song takes minutes on CPU |
| Concurrency | default 80 | **1** — demucs saturates every core it is given |
| CPU allocation | request-scoped | **always allocated**, or the background job stalls |

Putting demucs on the API image would tax every cold start of every endpoint, and an OOM during
separation would take the whole backend down. Hence the split.

## Deploy

```bash
gcloud run deploy plajah-demucs \
  --source worker \
  --project gen-lang-client-0665118474 \
  --region us-west1 \
  --platform managed \
  --no-allow-unauthenticated \
  --port 8080 \
  --memory 8Gi \
  --cpu 4 \
  --no-cpu-throttling \
  --concurrency 1 \
  --timeout 3600 \
  --min-instances 0 \
  --max-instances 3 \
  --set-env-vars STORAGE_BUCKET=<your-bucket>
```

Every flag above is load-bearing:

- `--no-allow-unauthenticated` — the worker is not reachable from the internet. Only callers with
  an identity token for its URL get in, which is why `plajah-api` mints one per job.
- `--no-cpu-throttling` — **required.** The job runs on a background thread after the response is
  sent. Under default request-scoped CPU, Cloud Run throttles the instance to near zero the moment
  `POST /jobs` returns, and the separation crawls or stalls. This also means you pay for instance
  time for the whole job, not just request time.
- `--concurrency 1` — demucs uses every core available. A second concurrent job on one instance
  makes both slower and risks the OOM killer.
- `--max-instances 3` — the actual cost ceiling. Each instance is 4 vCPU + 8Gi held for minutes.
  Raise deliberately; there is no other spend limit on this service.
- `--min-instances 0` — scales to zero between jobs. Cold start is slow (large image) but you pay
  nothing idle. Set to 1 only if the cold start becomes the complaint.

### Grant the caller permission

```bash
gcloud run services add-iam-policy-binding plajah-demucs \
  --region us-west1 \
  --member serviceAccount:<plajah-api-service-account> \
  --role roles/run.invoker
```

The worker's own service account needs `roles/storage.objectAdmin` on the bucket (it writes stems
and status docs).

### Turn it on

Separation stays disabled until the API knows the worker's URL:

```bash
gcloud run services update plajah-api --region us-west1 \
  --update-env-vars DEMUCS_WORKER_URL=https://plajah-demucs-xxxx.a.run.app
```

Unset it to turn the feature off instantly — the client falls back to on-device and instant stems.

`DEMUCS_ALLOWED_HOSTS` (comma-separated) extends the source-URL allowlist beyond Firebase/GCS
storage. Keep it tight: it is the SSRF boundary.

## Cost

A 4-minute song is roughly 3–8 minutes on 4 vCPU. At 4 vCPU + 8Gi with CPU always allocated,
that is on the order of **100× a normal API request per separation**, and you pay for the full
job duration, not just the request. With `--max-instances 3` the worst case is three instances
held continuously.

Sanity-check the real number against current Cloud Run pricing before opening this to all users.
Gate it behind a paid tier or a per-user quota if it is not already.

## Verifying a deploy

```bash
# Health (needs an identity token — the service is private)
TOKEN=$(gcloud auth print-identity-token)
curl -H "Authorization: Bearer $TOKEN" https://plajah-demucs-xxxx.a.run.app/health
# → {"ok":true,"model":"htdemucs","bucket":true}
```

Then from the app: open a track's Breakdown → Studio separation. Watch the job with

```bash
gcloud run services logs read plajah-demucs --region us-west1 --limit 50
```

Status transitions are `queued → fetching → separating → uploading → done`, readable at
`GET /api/crossover/stems/job/:jobId` on the API.

## Known limitations

- **A redeploy mid-job loses that job.** The worker thread is a daemon; the client sees a stalled
  status and can retry. A durable queue (Cloud Tasks) is the fix if this becomes common.
- **No per-user quota.** `apiLimiter` on the API is the only rate limit, and it is not
  cost-aware. Add a quota before this reaches free-tier users.
- **CPU only.** A GPU revision would cut minutes to seconds, at meaningfully higher cost.
