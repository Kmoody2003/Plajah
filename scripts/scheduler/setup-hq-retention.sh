#!/usr/bin/env bash
# Daily 30-day purge for Content HQ and the Media Library: POST /api/hq/retention/sweep. Not run by CI.
#
# Checked read-only 2026-11-01: no such job in any of ten regions checked. The only job in the project is
# terra-nightly-ingest (us-west1). plajah-api runs in us-west1 and has neither CRON_SECRET nor ADMIN_SEED_KEY set,
# so the sweep refuses every call today. A secret named CRON_SECRET already exists in Secret Manager; this attaches
# it. It does not print it.
#
# Run once, after the server code that serves the sweep is live:
#   bash scripts/scheduler/setup-hq-retention.sh            print the commands
#   bash scripts/scheduler/setup-hq-retention.sh --apply    run them
set -euo pipefail

PROJECT=gen-lang-client-0665118474
REGION=us-west1
SERVICE=plajah-api
JOB=hq-retention-sweep
SECRET=CRON_SECRET
RUN=echo
[ "${1:-}" = "--apply" ] && RUN=

URL=$(gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format='value(status.url)')

# The service's runtime account must be able to read the secret, and the service must have it.
SA=$(gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format='value(spec.template.spec.serviceAccountName)')
$RUN gcloud secrets add-iam-policy-binding "$SECRET" --project "$PROJECT" \
  --member="serviceAccount:$SA" --role=roles/secretmanager.secretAccessor
$RUN gcloud run services update "$SERVICE" --project "$PROJECT" --region "$REGION" \
  --update-secrets "CRON_SECRET=$SECRET:latest"

# Runs at 04:30 UTC, after the Terra ingest. Up to 100 of each per run. Retries on failure, and a purge is safe to repeat.
if [ -n "$RUN" ]; then
  KEY='<value of the CRON_SECRET secret>'
else
  KEY=$(gcloud secrets versions access latest --secret="$SECRET" --project "$PROJECT")
fi
if gcloud scheduler jobs describe "$JOB" --project "$PROJECT" --location "$REGION" >/dev/null 2>&1; then VERB=update; HEADERS=--update-headers; else VERB=create; HEADERS=--headers; fi
$RUN gcloud scheduler jobs "$VERB" http "$JOB" \
  --project "$PROJECT" --location "$REGION" \
  --schedule="30 4 * * *" --time-zone="Etc/UTC" \
  --uri="$URL/api/hq/retention/sweep?limit=100" \
  --http-method=POST \
  "$HEADERS"="x-cron-key=$KEY,Content-Type=application/json" \
  --message-body='{}' \
  --attempt-deadline=540s \
  --max-retry-attempts=3
