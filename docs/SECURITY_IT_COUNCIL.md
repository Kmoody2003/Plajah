# Security & IT Council

Six always-on monitoring agents for Plajah. They watch for bad activity, platform health problems and code
reliability/efficiency regressions, and they **propose** fixes. They never change production config,
firestore.rules, environment variables or code, and they never act on a person's account.

Code: `services/securityCouncil/*` (server), `routes/securityCouncil.ts`, `components/admin/SecurityCouncilPanel.tsx`
(rendered at the top of Admin → Threat Protection), `scripts/security-council-audit.mjs` +
`.github/workflows/security-audit.yml` (CI feed), tests in `tests/securityCouncil.test.ts`.

## How a run works

```
Cloud Scheduler (every 15 min) ──POST /api/cron/security-council──▶ runCouncil()
  1. collectSignals()   one shared, windowed (60 min), capped, projected read pass — no LLM
  2. six agents         pure functions: SignalContext → FindingDraft[]   (agents.ts, THRESHOLDS)
  3. upsertFinding()    dedupe by dedupeKey → security_findings/{f_<sha>}
  4. mitigations        ONLY if SECURITY_COUNCIL_AUTO_MITIGATE=true (see Guardrails)
  5. recommendations    account-level concerns → security_council_recommendations (human queue)
  6. triage             claude-haiku-5-5, only NEW/ESCALATED/REGRESSED findings ≥ medium, ≤ 6 per run
  7. baseline           EWMA per metric in security_council_state/baseline (1 read + 1 write)
  8. daily brief        once per UTC day after SECURITY_COUNCIL_BRIEF_HOUR_UTC (default 13) → claude-opus-5-5
```

A run is single-flight per 15-minute slot (`security_council_runs/r_<slot>` is claimed with create-once), so
Scheduler retries and overlapping instances are no-ops. Each run records signal counts, per-agent results and
**data gaps** (missing feeds) on that doc; the panel shows them.

## Charters, signals, thresholds

Thresholds live in `THRESHOLDS` (`services/securityCouncil/agents.ts`) and are returned by
`GET /api/security/council/overview`. Spike rules use the EWMA baseline: a metric must exceed an absolute
minimum **and** a multiple of its baseline; while the baseline is cold (< 8 runs) a higher absolute bar applies.

| Agent | Charter | Sources | Main thresholds (per 60 min) |
|---|---|---|---|
| **Sentinel** | Threat intel | `security_events` (auth/App Check/lookup/CSP types), `loginIssues` (emails hashed on read), `enforcement_actions`, edge telemetry | auth failures from one source ≥ 50 or ≥ 10 distinct accounts → high; platform auth-failure spike ≥ 30 and 3× baseline; ≥ 25 distinct emails failing with credential codes; App Check invalid ≥ 50 and 4× baseline; any privilege-change event → high; one actor ≥ 50 admin/enforcement actions; auth-method lookups ≥ 200 and 4×; CSP reports ≥ 100 |
| **Warden** | Bots & abuse | `users` count, `security_events` (signup/spam/follow), `content_reports` (metadata), edge 429s, `appeals` | signups ≥ 50 and 4× (≥ 200 → high); ≥ 5 signups from one source; ≥ 20 spam blocks from one account; ≥ 200 follow events from one account; reports ≥ 20 and 4×; ≥ 10 reports against one author; one source ≥ 300 × 429 (≥ 1500 → high + eligible for mitigation); PENDING appeals past `slaDueAt` |
| **Guardian** | Child safety & illegal content pipeline health | `content_reports` where reason = `sexual_minor_safety` and status = OPEN, `csam_cases` open statuses — **field projection only** (status + timestamps) | open child-safety report older than 60 min → high, older than 4 h → critical (floor high); any `report_failed` case → critical; case not `reported` after 24 h → critical. Never reads report text, snapshots, media refs or draft XML, and sends no samples to an LLM |
| **Medic** | Platform health | `errorReports` (no traces/emails), `loginIssues`, edge telemetry, `/healthz` probes, App Check JWKS errors | errors ≥ 30 and 3× (10× → high); clusters ≥ 15 per component+message; permission-denied clusters ≥ 5; probe failure → high, > 2 s → medium; route 5xx ≥ 10 and ≥ 5% (≥ 25% → high); provider config/network sign-in failures ≥ 10 → high; one source ≥ 50% of all traffic → "IP attribution collapsed" |
| **Auditor** | Dependencies & code | `security_audit/latest` (CI) | each high/critical production advisory; moderate count → low; each secret-scan location → critical (floor critical); feed older than 3 days → low; feed missing → info |
| **Steward** | Efficiency & reliability | edge telemetry, CI static scan + bundle | p95 ≥ 1.5 s over ≥ 30 requests (≥ 4 s → medium unless an AI/upload route); ≥ 20k requests/h on one route; unbounded `onSnapshot`/`getDocs` call sites; bundle +10% vs previous; any chunk ≥ 1.5 MB. Every Steward finding carries a concrete patch description |

### Data sources the council adds

* **Edge telemetry** (`services/securityCouncil/telemetry.ts`) — one middleware on `/api`, mounted before the
  global limiter. O(1) per request: counts, 4xx/5xx/429 and a bounded latency sample per normalised route, 429s
  and request counts per salted IP hash. Each instance writes **one** `security_telemetry` doc per 5 minutes
  (none when idle). Raw IPs are never stored (`hashIp` is the same salted hash as `services/securityEvents.ts`).
* **security_events** — written by `services/securityEvents.ts` as per-minute rollups (`counts` exact,
  `samples` ≤ 3 per type) plus capped urgent docs. Totals use rollup counts; per-account / per-source signals
  use samples, so they are lower bounds.
* **CI audit** — see below.

## Findings

`security_findings/{id}`: `{agent, severity, title, evidence, proposedFix, status: open|ack|fixed|false_positive,
firstSeen, lastSeen, dedupeKey, occurrences, lastRunId, triage?, mitigationId?, recommendationId?, regressedAt?,
statusHistory[]}`.

* The id is a hash of `dedupeKey`, so the same problem is one finding across runs; `occurrences` counts runs.
* An open finding's severity never silently drops; triage may **raise** it, and may lower a brand-new finding
  only down to the agent's `severityFloor` (child safety, secrets cannot be lowered).
* `fixed` + signal returns → reopened as `open` with `regressedAt`. `false_positive` stays suppressed
  (`lastSeen` still advances so you can see it recurring).
* Evidence is code-computed metrics; strings are redacted (emails, tokens, keys, IPs) and size-capped.

### How findings flow into fixes

1. The panel lists active findings by severity with the proposed fix, AI triage and evidence.
2. A human acknowledges it, then makes the change through the normal path (PR → review → CI → deploy; rules
   via `firebase deploy --only firestore:rules` by a person).
3. Mark it **fixed**. If the signal comes back, the council reopens it automatically (regression).
4. Mark **false positive** with a note when the signal is benign; consider tuning `THRESHOLDS` in a PR.
5. Account-level items (spam farm, follow churn) appear in `security_council_recommendations` with
   `status: pending_human_review`. The enforcement team reviews them under Fair Process — the council never
   writes `enforcement_actions`, `appeals`, `moderation/*` or `csam_cases`.

## Daily Council Brief

`security_briefs/{yyyy-mm-dd}` `{summary, topRisks[], recommendedActions[], perAgent{open,critical,high,headline},
activeMitigations, openFindings, councilRunsLast24h, engine, status}`. Written once per UTC day by the first run
after the brief hour (create-once lock on the date), or on demand with **Regenerate brief**
(`POST /api/security/council/run?brief=force`). With `ANTHROPIC_API_KEY` it is synthesised by
`claude-opus-5-5` (effort `medium`, structured JSON output, server-side refusal fallback enabled because
security analysis can trip the cyber classifier); otherwise a deterministic brief is written. The legacy
"CSO Assessment" card now shows this brief.

## Guardrails

* **Propose, don't change.** The module writes only `security_*` collections. No code path writes rules,
  env/config, code, or another system's collections.
* **The only automatic action** is `tighten_rate_limit` on a salted IP hash, and only when
  `SECURITY_COUNCIL_AUTO_MITIGATE=true`:
  * triggered by a hard threshold (≥ 1500 × 429 in 60 min, or ≥ 100 auth failures from one source that the edge also saw);
  * never for a source carrying ≥ 20% of all traffic (shared proxy/NAT), never for `SECURITY_COUNCIL_MITIGATION_ALLOWLIST`;
  * at most 5 per run, limit clamped to 10–120 req/min, expires in ≤ 1 hour, recorded in `security_mitigations`
    with `undo: {method, path}`;
  * excess requests get a normal **429 with Retry-After** — never a 403, block or lockout;
  * webhooks, `/api/cron/*` and `/api/security/*` (including the undo endpoint) are never gated;
  * never targets a uid. Account concerns become human-queue recommendations.
* **Undo** from the panel or `POST /api/security/council/mitigations/:id/undo`. The handling instance drops it
  immediately; other instances within 60 s (background cache refresh, never awaited on a request).
* **Untrusted content.** Error messages, CSP details and report-adjacent text are redacted, length-capped and
  wrapped in `<<<UNTRUSTED_DATA … UNTRUSTED_DATA>>>` delimiters the content cannot forge; system prompts tell the
  model it is data, not instructions. LLM output is advisory and stored redacted.
* **No UX cost.** No user-facing request waits on the council: the edge middleware is in-memory, flushes on
  an unref'd timer, and refreshes mitigations in the background.

## Cadence and cost (estimates)

| Item | Volume | Cost |
|---|---|---|
| Firestore reads per run | ~150–600 docs (rollups ≈ 60/instance/h, error/report windows, telemetry ≈ 12/instance/h, open child-safety items, ~6 COUNT aggregations) | 96 runs/day → ~15k–60k reads/day ≈ **$0.01–0.04/day** |
| Firestore writes | run doc + baseline + 1 per active finding per run + telemetry 12/instance/h | ≈ 1k–5k writes/day ≈ **< $0.01/day** |
| Haiku 5.5 triage | only new/escalated ≥ medium, ≤ 6/run (~2k in / 300 out each) | typically $0; worst case ≈ **$0.20/day** |
| Opus 5.5 brief | 1/day (~6k in, ~2k out + thinking) | ≈ **$0.05–0.10/day** |
| Cloud Run | one 2–10 s request per 15 min | negligible |

## Scheduling (Cloud Scheduler)

The cron route accepts `x-cron-key` equal to `CRON_SECRET` (preferred) or `ADMIN_SEED_KEY`, like the other
`/api/cron/*` jobs. The service is `plajah-api` in `us-west1`.

```bash
PROJECT=gen-lang-client-0665118474
URL=$(gcloud run services describe plajah-api --region us-west1 --project $PROJECT --format='value(status.url)')

gcloud scheduler jobs create http security-council \
  --project $PROJECT --location us-west1 \
  --schedule "*/15 * * * *" --time-zone "Etc/UTC" \
  --http-method POST --uri "$URL/api/cron/security-council" \
  --headers "x-cron-key=$CRON_SECRET,Content-Type=application/json" \
  --message-body '{}' --attempt-deadline 300s --max-retry-attempts 1

# Manual run / test:
gcloud scheduler jobs run security-council --project $PROJECT --location us-west1
curl -X POST "$URL/api/cron/security-council?brief=force" -H "x-cron-key: $CRON_SECRET"
```

### Environment

| Variable | Purpose |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | required — Firestore REST access (same as the rest of server.ts) |
| `CRON_SECRET` / `ADMIN_SEED_KEY` | cron auth |
| `ANTHROPIC_API_KEY` | optional — enables triage and the Opus brief |
| `SECURITY_COUNCIL_INGEST_KEY` | optional — enables `POST /api/security/council/ingest-audit` (must match the GitHub secret) |
| `SECURITY_COUNCIL_AUTO_MITIGATE` | `true` to allow the reversible rate-limit tightening (default off) |
| `SECURITY_COUNCIL_MITIGATION_ALLOWLIST` | comma list of IP hashes never mitigated |
| `SECURITY_COUNCIL_PROBE_PATHS` | default `/healthz`; comma list of GET paths Medic probes |
| `SECURITY_COUNCIL_PROBE_BASE` | default `http://127.0.0.1:$PORT` |
| `SECURITY_COUNCIL_BRIEF_HOUR_UTC` | default 13 |
| `SECURITY_COUNCIL_MAX_TRIAGE` | default 6 per run |
| `SECURITY_COUNCIL_TRIAGE_MODEL` / `_BRIEF_MODEL` | default `claude-haiku-5-5` / `claude-opus-5-5` |
| `SECURITY_COUNCIL_TELEMETRY_FLUSH_MS` | default 300000 |
| `RESEND_API_KEY` | used by the legacy Threat Protection "Alert" button (now reports failure honestly) |

## CI feed (`.github/workflows/security-audit.yml`)

Daily (06:17 UTC), on every PR, and on demand. Runs `npm audit --json --omit=dev --package-lock-only`, a
location-only secret scan of tracked files, a heuristic scan for Firestore listeners/queries with no
`limit()`, and (daily only) a build to measure bundle size. The summary (kept under the server's 10 kb JSON
limit) is uploaded as an artifact and, when the `SECURITY_COUNCIL_INGEST_KEY` secret is set, POSTed to
`/api/security/council/ingest-audit` (`vars.SECURITY_COUNCIL_INGEST_URL` overrides the default
`https://plajah.com/api/security/council/ingest-audit`). PR runs are stored as `security_audit/pr_<branch>`
and never overwrite `latest`. The workflow never fails on findings and never commits.

## Legacy "Advance Threat Protection" stack — what changed

The old CSO stack was a simulation presented as live data. Now:

* `services/csoAgentService.ts` has no seed telemetry, no constant bot-traffic/timeline numbers, no
  `Math.random` risk scores and no canned IOCs. Simulated events are flagged `simulated`, use RFC 5737
  documentation IPs, are labelled `[SIMULATION]` everywhere (UI, email subject/body, chat) and never send a
  warning to a real user. Nothing claims `BLOCKED_IP`.
* Email goes through Resend server-side when `RESEND_API_KEY` is set; otherwise `emailSent:false` with a reason
  (the old relative `fetch('/api/postman/send')` failed on the server and its `catch` returned `true`).
* `routes/threatProtection.ts` `/stats`, `/events`, `/assessment` read council data (`csoBridge.ts`); metrics
  with no source (bot traffic %, geo, total traffic) are listed in `unavailableMetrics` and shown as "n/a".
  The map is explicitly simulation-only (real events have no geolocation by design).
* `services/backendService.ts` no longer falls back to the in-browser fake service; failures surface in the UI.

## Known limits / follow-ups

* `security_events` per-source signals are sampled (lower bounds). Exact per-source counters would need
  `securityEvents.ts` to keep per-ipHash counts in its rollup.
* `trust proxy` is `1`; behind Firebase Hosting → Cloud Run that may attribute many users to one hop. Medic
  flags this when one source dominates; verify before turning on auto-mitigation.
* The council collections are server-only (no client rules needed; the admin UI reads through the API).
  Both `security_telemetry` (14 days) and `security_council_runs` (30 days) carry an `expireAt` timestamp —
  enable Firestore TTL policies on that field (`gcloud firestore fields ttls update expireAt --collection-group=security_telemetry --enable-ttl --database=plajah-prod`, same for `security_council_runs`).
* Admin chat delivery from the server is not implemented (the old path used the browser SDK); the UI says so.
