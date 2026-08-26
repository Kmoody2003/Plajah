# Platform security assessment and hardening — 2026-08-25

## Executive summary

This pass addressed several immediately exploitable configuration and application risks. It does not claim that compromise or DDoS is impossible. Volumetric DDoS resistance must be enforced at Google's edge, before traffic consumes Cloud Run instances.

## Remediated in this pass

- Removed a committed application encryption key and Hue OAuth client secret from `apphosting.yaml`; both now reference Secret Manager.
- Changed the Firebase Storage catch-all from public read to deny-by-default.
- Changed `chat_intimate` objects from anonymous public reads to authenticated reads. A future schema migration should enforce actual room membership.
- Made Mux and Resend webhooks fail closed when their verification secret is missing, added constant-time comparisons, and added a five-minute replay window to Mux signatures.
- Removed shared secrets from cron/admin query strings, where proxies and access logs commonly record them. Callers must now use the documented headers.
- Added a global API abuse limiter in addition to the existing route-specific limits.
- Configured a single trusted proxy hop in production so IP-based limits cannot be bypassed with a forged `X-Forwarded-For` value.
- Added server request/header/keep-alive timeouts to constrain slow-client resource exhaustion.
- Rejected request-controlled origins for Stripe redirects and generated URLs.
- Added static-host security headers and removed Express technology disclosure.
- Changed the production container to run as the unprivileged `node` user.

## Required before the next production deployment

1. Rotate the exposed `ENCRYPTION_KEY` and `HUE_CLIENT_SECRET`. Removing them from the current file does not remove them from Git history, build logs, forks, or clones.
2. Store the replacements with `firebase apphosting:secrets:set ENCRYPTION_KEY` and `firebase apphosting:secrets:set HUE_CLIENT_SECRET`, then grant the backend access.
3. Configure `MUX_WEBHOOK_SECRET` and `RESEND_WEBHOOK_SECRET` in Secret Manager. Their endpoints now intentionally return 503 if verification cannot be performed.
4. Update scheduler/admin callers:
   - retention and publishing jobs: `X-Cron-Key`
   - Terra ingestion: `X-Terra-Cron-Key`
   - Chora backfill: `X-Backfill-Key`
   - classic-book seed: `X-Admin-Key`
5. Purge the exposed secrets from Git history with an approved history-rewrite procedure, then invalidate old clones and CI caches. Coordinate this because rewriting shared history is disruptive.

## DDoS controls required outside this repository

Application rate limits only handle small and medium abuse. For volumetric protection:

- Put the public application behind Google Cloud HTTPS Load Balancing and Cloud Armor; do not expose the default `run.app` Cloud Run URL publicly.
- Set Cloud Run ingress to internal-and-cloud-load-balancing and require the load balancer path.
- Apply Cloud Armor adaptive protection, WAF rules, threat-intelligence feeds, geo/rate rules appropriate to the audience, and a default per-IP throttle for `/api/**`.
- Add stricter edge rules for expensive AI, proxy, upload-initiation, transcode, login, checkout, and pairing endpoints.
- Configure Cloud Run maximum instances to cap cost, while reserving minimum instances only for required availability. Add per-service concurrency and CPU/memory limits based on load tests.
- Use a distributed rate-limit store or Cloud Armor for multi-instance enforcement; the Express memory store is per-process.
- Alert on request rate, 4xx/5xx ratio, latency, instance count, egress, Firestore operations, Storage bytes, authentication failures, and billing anomalies.
- Enable budget alerts and automated emergency controls. Keep a tested incident runbook for blocking traffic without locking out operators.

## Open risks and follow-up work

- `npm audit --omit=dev` reports 18 production dependency findings: 14 high and 4 moderate. Several are in `epubjs`/`react-reader`, `@huggingface/transformers` (`sharp`, `onnxruntime-node`, `adm-zip`), and Giphy dependencies. Some fixes require breaking upgrades and some currently have no upstream fix. Test and upgrade or isolate/remove these features before treating untrusted EPUB, archive, image, or model input.
- Content Security Policy remains disabled because the application currently relies on inline code and many third-party media/frame origins. Build a report-only policy from observed production traffic, remove inline execution, then enforce it.
- Several legacy Storage namespaces intentionally allow public reads and broad authenticated writes, with single-object limits up to 25 GB. Migrate uploads to owner-scoped paths, validate membership/ownership server-side, and introduce per-user quotas and lifecycle rules.
- Firestore rules are large and include public-readable collections and client-maintained counters. Add emulator-based negative authorization tests for every sensitive collection and abuse tests for counter/list growth.
- Firebase App Check should be enforced for Firestore, Storage, Authentication where supported, and custom API endpoints should validate App Check tokens in addition to user ID tokens.
- Shared-key cron authentication should ultimately be replaced by Cloud Scheduler OIDC with a dedicated least-privilege service account.
- Secrets should be scanned in CI (including Git history), dependencies should be scanned on every lockfile change, and container images should be scanned and signed.

## Verification performed

- TypeScript: `npm run lint`
- Production dependency advisory query: `npm audit --omit=dev`
- Git whitespace validation: `git diff --check`
- Static review of Express middleware/routes, outbound URL validation, webhook handling, Firebase rules, hosting configuration, container configuration, and secret patterns

