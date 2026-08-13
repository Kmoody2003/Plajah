# infra

Cloud infrastructure config that isn't covered by `firebase.json` or the GitHub Actions workflows.

## artifact-registry-cleanup-policy.json

Retention policy for the `cloud-run-source-deploy` Artifact Registry repo, which holds the
`plajah-api` container images that `gcloud run deploy` pushes on every backend deploy.

**Why it exists.** Each deploy pushes a fresh ~1.2 GB image and orphans the previous one as
untagged. With no retention policy the repo reached **1.14 TB / 910 images** between
2026-06-12 and 2026-08-13 — roughly $110/month in storage, growing ~$57/month each month.

**What it does.** Keeps the 10 most recent `plajah-api` versions, deletes untagged versions
older than 7 days. `Keep` rules take precedence over `Delete` rules regardless of file order.

**Why 7 days and not 30.** Backend deploy cadence is ~17/day (797 revisions in two months),
so a 30-day window still holds ~500 images / ~600 GB and caps storage at only ~$60/month.
7 days caps it at ~$14/month while still retaining ~117 rollback targets. The `keepCount: 10`
rule is a safety floor for the case where deploys pause for a week or more.

**Trade-off.** Cloud Run pins each revision to an image digest, so deleting an untagged image
makes that revision un-rollback-able. The serving revision is never at risk — it's tagged
`latest`, and the policy only deletes `UNTAGGED` versions.

**This does not affect vulnerability scanning cost.** Artifact Analysis bills $0.26 per scan
at push time, not per image stored, so retention changes nothing on that line. Scanning cost
tracks deploy frequency only — the levers there are disabling `containerscanning.googleapis.com`
or deploying less often.

## Vulnerability scanning

Artifact Analysis automatic scanning is **disabled** on `cloud-run-source-deploy`. It billed
$0.26 per scan at push time — at ~17 deploys/day that was ~$130/month to repeatedly scan
near-identical images, while the vulnerability surface only changes when dependencies do.

Nothing depended on it: Binary Authorization is not enabled on this project, and no CI step
reads Container Analysis occurrences. Deploys are unaffected.

To re-enable, or to disable it again if a new repo is created:

```bash
gcloud artifacts repositories update cloud-run-source-deploy \
  --location=us-west1 --project=gen-lang-client-0665118474 \
  --disable-vulnerability-scanning     # or --allow-vulnerability-scanning
```

Replaced by, in order of value:

1. **Dependabot** (GitHub repo settings) — alerts plus automatic fix PRs, free.
2. **`npm audit --omit=dev --audit-level=critical`** in the `deploy_api` job of
   `firebase-hosting-deploy.yml` — hard-failing. `npm audit fix` on 2026-08-13 cleared all 3
   critical production advisories (protobufjs RCE, node-tar file smuggling, websocket-driver
   resource-limit bypass), so the gate is green as of that date and a red build means a new
   critical actually landed. 14 high + 4 moderate remain below the gate threshold.
3. **On-demand GCP scans** if console integration is ever wanted back — `gcloud artifacts
   docker images scan`, still $0.26 each, but weekly instead of per-push is ~$1/month.

### Applying it

Dry run first (evaluates and logs, deletes nothing):

```bash
gcloud artifacts repositories set-cleanup-policies cloud-run-source-deploy \
  --location=us-west1 --project=gen-lang-client-0665118474 \
  --policy=infra/artifact-registry-cleanup-policy.json --dry-run
```

Policies evaluate about once every 24h. Read the dry-run decisions from the repo's
"Cleanup policy dry run results" panel in the Cloud console, or via Cloud Logging:

```bash
gcloud logging read "protoPayload.serviceName=artifactregistry.googleapis.com AND protoPayload.methodName=~CleanupPolicy" --project=gen-lang-client-0665118474 --freshness=2d --limit=50
```

Once the flagged set looks right, arm it:

```bash
gcloud artifacts repositories set-cleanup-policies cloud-run-source-deploy \
  --location=us-west1 --project=gen-lang-client-0665118474 \
  --policy=infra/artifact-registry-cleanup-policy.json --no-dry-run
```

### Checking repo size

```bash
gcloud artifacts repositories list --project=gen-lang-client-0665118474 --format=json
```

`sizeBytes` is only populated by `list` — `describe` returns it empty, which looks alarming
and isn't.
