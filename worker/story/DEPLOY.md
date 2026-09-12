# Taleo Story Intelligence worker — deployment

Watches a published movie (Mux HLS) with AI and writes a StoryReport to Cloud Storage plus a
status doc at Firestore `taleoAnalysis/{albumId}` (database `plajah-prod`). Runs as its own
Cloud Run service, called only by `plajah-api` (routes/taleo.ts). **Nothing here deploys
automatically** — the CI workflow does not build this directory. Deploy deliberately.

## Why a separate service

Same reasoning as the demucs worker (`worker/DEPLOY.md`): a job holds an ffmpeg transcode of a
full feature film plus per-chunk Gemini calls for many minutes. It needs the full request
lifetime, un-throttled CPU after the 202 response, and concurrency 1 — none of which the API
service should pay for.

## Deploy

```bash
gcloud run deploy plajah-story-worker \
  --source worker/story \
  --project gen-lang-client-0665118474 \
  --region us-west1 \
  --platform managed \
  --no-allow-unauthenticated \
  --port 8080 \
  --memory 4Gi \
  --cpu 4 \
  --no-cpu-throttling \
  --concurrency 1 \
  --timeout 3600 \
  --min-instances 0 \
  --max-instances 2 \
  --set-env-vars "GEMINI_API_KEY=<key>,POKEE_API_KEY=<key>,STORY_WORKER_KEY=<long-random>,STORY_MAX_USD=2,FIREBASE_STORAGE_BUCKET=gen-lang-client-0665118474.firebasestorage.app"
```

Load-bearing flags:

- `--no-cpu-throttling` — **required.** The pipeline runs on the in-process queue after
  `POST /jobs` returns 202; under request-scoped CPU it would crawl to a halt the moment the
  response is sent.
- `--concurrency 1` — one film at a time per instance; ffmpeg saturates the cores it is given.
- `--max-instances 2` — the cost ceiling; each analysis also spends real Gemini/Pokee dollars,
  so `STORY_MAX_USD` (per-job estimate guard, default $2) is the second line of defence.
- `--timeout 3600` — irrelevant to the background job itself but keeps long /jobs bodies safe.

## Environment variables

| Var | Required | Purpose |
|---|---|---|
| `GEMINI_API_KEY` (or `GOOGLE_AI_API_KEY`) | yes | S2 perception (Files API + generateContent, `gemini-3.6-flash`) |
| `POKEE_API_KEY` | recommended | S3 reasoning (`pokee-isaac`); unset → S3 falls back to Gemini and notes the lane on the job doc |
| `STORY_WORKER_KEY` | yes | shared secret; `POST /jobs` returns 503 until set, 401 on mismatch |
| `STORY_MAX_USD` | no (default `2`) | per-job estimated-cost guard; exceeded → assemble what exists, status `PARTIAL` |
| `FIREBASE_STORAGE_BUCKET` | no (default `gen-lang-client-0665118474.firebasestorage.app`) | stills + report/transcript destination |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | local dev only | on Cloud Run the metadata server supplies tokens; locally paste the SA key JSON |

## Auth: two options (default = identity token, like demucs)

**Recommended (deployed default): `--no-allow-unauthenticated` + identity token.** The worker
is unreachable from the open internet; `plajah-api` mints an identity token for the worker URL
from the metadata server (the exact pattern server.ts uses for `plajah-demucs`, and what
routes/taleo.ts implements) and sends it as `Authorization: Bearer <idtoken>`. The
`x-worker-key: STORY_WORKER_KEY` header is checked *in addition* — belt and braces, and it
keeps local dev honest. Grant the caller:

```bash
gcloud run services add-iam-policy-binding plajah-story-worker \
  --region us-west1 \
  --member serviceAccount:<plajah-api-service-account> \
  --role roles/run.invoker
```

**Alternative (Phase 1 shortcut): `--allow-unauthenticated`.** Cloud Run lets everything
through and `STORY_WORKER_KEY` becomes the only gate. Acceptable while the key is long and
random, but prefer the IAM route — a leaked key is then still not enough to reach the service.

The worker's own service account needs:
- `roles/storage.objectAdmin` on the bucket (stills, report.json, transcript.json)
- `roles/datastore.user` (job-doc writes to the `plajah-prod` Firestore database)

## Turn it on

```bash
gcloud run services update plajah-api --region us-west1 \
  --update-env-vars STORY_WORKER_URL=https://plajah-story-worker-xxxx.a.run.app,STORY_WORKER_KEY=<same-key>
```

Unset `STORY_WORKER_URL` to disable enqueueing instantly; job docs are then created in
`WAITING_MEDIA`/`QUEUED` but never poked.

## Verifying

```bash
TOKEN=$(gcloud auth print-identity-token)
curl -H "Authorization: Bearer $TOKEN" https://plajah-story-worker-xxxx.a.run.app/health
# → {"ok":true,"queue":0}
```

Watch a job: `taleoAnalysis/{albumId}` walks
`QUEUED → SAMPLING → PERCEIVING → REASONING → ASSEMBLING → READY` (or `PARTIAL`/`FAILED`),
with `progress.pct`, `usage.totalUsdMicros`, and `checkpoint` updating along the way.

```bash
gcloud run services logs read plajah-story-worker --region us-west1 --limit 50
```

## Known limitations (Phase 1)

- **A restart mid-job loses the tmp artifacts.** The checkpoint on the job doc shows where it
  died; re-POSTing the job re-runs from S1 (deliberately simple — no partial-stage resume).
- **Queued (not yet started) jobs die with the instance.** In-process FIFO, like demucs.
- **Costs are estimates.** Blended Gemini input pricing (see pipeline.ts header comment); the
  `STORY_MAX_USD` guard works on the estimate, not the invoice.

## Perception has three tiers (added 2026-08-30)

Native video is tried first; per-chunk it falls through to cheaper/more-available paths rather
than failing outright the moment video is unavailable or (confirmed live) silently reports
seeing nothing:

1. **Native video** — `gemini-3.6-flash` (+ 2 fallback models), full retry ladder.
2. **Cloud audio+stills** — same models, the chunk's audio track plus up to 6 still frames,
   when tier 1 exhausts or comes back empty. Tried because tier 1 and tier 2 fail
   independently (different Gemini capacity pools) even against the SAME API key.
3. **Fully offline (local models)** — `localModels.ts`: Whisper (`onnx-community/whisper-base`)
   for dialogue, Florence-2 (`onnx-community/Florence-2-base-ft`) for a caption per still, both
   via `@huggingface/transformers` on the container's own CPU (onnxruntime-node backend) — zero
   cloud dependency, zero per-call cost, immune to Gemini capacity entirely. Tried only when
   tiers 1 and 2 both fail. No continuous motion understanding, no speaker attribution — the
   deliberately-least-rich last resort, not a primary path.

**Dockerfile must stay glibc, not Alpine.** `onnxruntime-node`'s prebuilt native addon has no
musl build — `node:20-alpine` installs cleanly but the addon fails to LOAD at runtime the first
time tier 3 actually fires. Use `node:20-slim` (or any glibc base) — already the case in this
directory's Dockerfile; do not "optimize" it back to Alpine.

**First tier-3 call on a fresh instance is slow** — Whisper + Florence-2 weights (~450MB
combined) download once per container instance into `os.tmpdir()/story-worker-model-cache` and
stay warm for that instance's life (scale-to-zero loses the cache, next cold instance re-pays
it). `--memory 4Gi --cpu 4` accounts for holding both models plus ffmpeg; do not shrink this
back to the tier-1/2-only 2Gi/2cpu sizing.
