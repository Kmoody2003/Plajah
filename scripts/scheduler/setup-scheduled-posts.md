# Scheduled posts: server-side publisher setup

`POST /api/social/publish-due-posts` (routes/socialServer.ts) publishes every `scheduled_posts` doc whose
`publishAt <= now` (status PENDING, or a PUBLISHING claim older than 5 min), up to 50 per call. Each doc is
claimed with a Firestore `updateTime` precondition and the post is written with the deterministic id
`sched_<scheduledId>`, so the author's own client publisher can never double-publish.

The route returns **503 if `SCHEDULER_SECRET` is unset** and 401 on a wrong `x-scheduler-secret` header
(constant-time compare). Nothing here has been run for you: these are the commands to run.

Variables used below (adjust):

```bash
PROJECT=gen-lang-client-0665118474
REGION=us-central1                 # your Cloud Run region
SERVICE=plajah                     # your Cloud Run service name
SERVICE_URL=https://plajah.com     # public base URL (Firebase Hosting proxies /api to Cloud Run)
```

## 1. Index (required, once)

`firestore.indexes.json` now contains `scheduled_posts (status ASC, publishAt ASC)`. Deploy it:

```bash
firebase deploy --only firestore:indexes --project $PROJECT
```

Wait for the index to finish building (console > Firestore > Indexes) before the first run, otherwise the
query returns HTTP 500 ("run failed").

## 2. Create the secret and give it to Cloud Run

```bash
# generate + store the shared secret
openssl rand -hex 32 | tr -d '\n' | gcloud secrets create scheduler-secret --data-file=- --project $PROJECT

# let the Cloud Run runtime service account read it (find it with: gcloud run services describe $SERVICE --region $REGION --format='value(spec.template.spec.serviceAccountName)')
gcloud secrets add-iam-policy-binding scheduler-secret \
  --member="serviceAccount:RUNTIME_SA_EMAIL" --role="roles/secretmanager.secretAccessor" --project $PROJECT

# expose it to the service as env SCHEDULER_SECRET (creates a new revision; redeploy of the new server code is a separate step)
gcloud run services update $SERVICE --region $REGION --project $PROJECT \
  --update-secrets SCHEDULER_SECRET=scheduler-secret:latest
```

The new routes only exist after the server code is redeployed to Cloud Run (the normal CI deploy).

## 3. Cloud Scheduler job (every minute, header secret)

```bash
SECRET=$(gcloud secrets versions access latest --secret=scheduler-secret --project $PROJECT)

gcloud scheduler jobs create http publish-scheduled-posts \
  --project $PROJECT --location $REGION \
  --schedule="* * * * *" --time-zone="Etc/UTC" \
  --uri="$SERVICE_URL/api/social/publish-due-posts" \
  --http-method=POST \
  --headers="x-scheduler-secret=$SECRET,Content-Type=application/json" \
  --message-body='{}' \
  --attempt-deadline=60s \
  --max-retry-attempts=0
```

`--max-retry-attempts=0` is intentional: the job runs again next minute, and claims make overlap safe.
To rotate the secret later: add a new secret version, `gcloud scheduler jobs update http publish-scheduled-posts ... --update-headers=...`,
then redeploy/update the service so it picks up `:latest`.

### Alternative: OIDC instead of a header secret

Only works if you call the Cloud Run `*.run.app` URL directly with the service requiring authentication; with the
public Firebase Hosting URL use the header secret above. The route still requires `x-scheduler-secret`, so for OIDC
you would send both (`--oidc-service-account-email=... --oidc-token-audience=<run.app URL>` plus the header).

## 4. Verify

```bash
gcloud scheduler jobs run publish-scheduled-posts --location $REGION --project $PROJECT
curl -s -X POST "$SERVICE_URL/api/social/publish-due-posts" -H "x-scheduler-secret: $SECRET"
# => {"ok":true,"due":N,"published":N,"failed":0,"skipped":0}
```

Schedule a post 2 minutes out from the app, close the app, and confirm it appears in the feed on time.

## Notes / limits

- Follower push notifications for the published post are NOT sent by the server publisher (they are client-side
  today); the post itself, feed mirror and hashtag rollups are.
- A doc that cannot be built (empty payload, local `blob:` media) is marked `FAILED` with `lastError`; transient
  write errors retry up to 3 attempts, then `FAILED`.
- Private-account authors are routed to `private_posts` (no feed mirror), org DEPARTMENT threads stay in `posts`.
