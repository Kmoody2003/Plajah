# Content Safety Pipeline (server-side media scanning)

Status 2026-10-08: built, unit-tested (pure policy), **not deployed**, no provider keys set. Nothing here has run against real media.

## Goal

Keep illegal content (CSAM above all) and real-world grotesque gore off Plajah **without flagging creative work**: horror art, anatomy, figure drawing, film SFX, fashion, music videos, war/news photography.

## Policy (services/safety/safetyPolicy.ts — pure, tested in tests/safetyPolicy.test.ts)

| Signal | Result |
|---|---|
| Any positive hash match (PhotoDNA / PDQ / CSAI) | `csam_block_and_report` |
| Gemini `sexualized_minor` **and** OpenAI `sexual` >= 0.5 (or text `sexual/minors` >= 0.5), not fictional | `csam_block_and_report` |
| One sexualized-minor signal only, a fictional depiction, or Gemini `PROHIBITED_CONTENT` refusal | `human_review`, **hidden**, csam queue (never auto-reported) |
| Graphic content that is fictional/artistic (Gemini, creator label, or creative tool) | `blur_interstitial` (viewer opts in); creator-labelled → `label` |
| Gemini `graphic_real` **and** OpenAI `violence/graphic` >= 0.9 | `block` (appealable, reviewed) |
| Graphic, one signal only / unclear | `human_review`, **blurred** meanwhile (stays up) |
| Explicit adult sex, two signals, non-artistic | `block`; artistic → interstitial; moderate (>= 0.6) → `MATURE_18` label |
| Self-harm instructions | hidden priority review; self-harm depiction → blurred priority review |
| No provider answered | `allow` with `scanComplete:false` → `scanStatus:'unscanned'` → sweep retries (max 5) |

The rules that protect artists: **a single classifier score never removes anything**. Removal needs a hash match or two independent signals that agree. Thresholds are named constants at the top of the policy file. Avatars cannot show an interstitial, so a "blur" result on an avatar becomes a hidden review (the photo is held in `avatarHeldUrl`).

The public target doc shows `blocked` for both block and CSAM, so it never reveals that a CSAM case exists.

## Architecture

```
client createPost (services/backendService.ts)  ─┐ fire-and-forget
                                                  ├─► POST /api/safety/scan  ─► safetyPipeline.scanTarget
cron  POST /api/cron/safety-sweep  (backstop)    ─┘                              │
                                                     mediaSafetyServer.scanMedia ◄┘  (per media item)
                                                       ├ fetch bytes: our bucket via service account, image.mux.com thumbnails
                                                       ├ PhotoDNA Match  ─┐
                                                       ├ OpenAI omni-moderation ─┼─► safetyPolicy.decideSafety
                                                       └ Gemini vision (art-aware) ┘
                                                     writes moderation/{collection}_{id}   (server-only)
                                                     patches target: moderationStatus, safetyLabels, scannedAt, scanStatus
                                                     csam → csamCase.openCsamCase (quarantine, csam_cases, hook, NCMEC draft)
```

Files:

- `services/safety/safetyPolicy.ts`: pure decision, combining, client visibility helpers
- `services/safety/mediaSafetyServer.ts`: providers + per-media scan (frames for video)
- `services/safety/safetyPipeline.ts`: target docs, moderation records, sweep, report escalation, soft-remove
- `services/safety/csamCase.ts` + `csamCaseCore.ts` (pure): quarantine, case record, CyberTip XML, `onCsamConfirmed(uid, caseId)`
- `services/safety/safetyServerIo.ts`: Firestore REST + GCS JSON API with the service-account token
- `services/safety/safetyScanClient.ts`: browser calls
- `routes/trustSafety.ts`: Express router, mounted in server.ts next to socialServer
- `components/safety/ModerationGate.tsx`: PostCard wrapper (interstitial / hidden / author notice)

Endpoints:

- `POST /api/safety/scan`: Bearer token. `{targetCollection, targetId}` for posts, private_posts, videos, albums or users the caller owns, or `{storagePath|url, surface}` for a file under the caller's uid. Limited to 60 per hour per uid.
- `POST /api/safety/report-escalate {reportId}`: the reporter's own `sexual_minor_safety` report. `reportContent` calls it automatically.
- `GET /api/safety/cases`: platform admin only. Case **metadata** (`caseMetadataView`): no URL, path, hash or IP.
- `GET /api/safety/review-queue`: platform admin. csam-queue items are redacted (no reason, no signals).
- `GET /api/safety/status`: platform admin. Shows which providers, ffmpeg and NCMEC are configured.
- `POST /api/safety/admin/remove`: platform admin soft-remove. Sets `moderationStatus:'removed'`, `removedAt` and `removedBy`. It also revokes Storage download tokens (saved in `moderation/*.revokedTokens` so the item can be restored) and **keeps** the doc and its files.
- `POST /api/cron/safety-sweep?hours=24&budget=40`: header `x-cron-key` must equal `ADMIN_SEED_KEY` or `CRON_SECRET`. Order of work: open `sexual_minor_safety` reports first, then recent posts, private_posts, videos and albums that have no completed scan, then avatars (a rotating cursor in `safety_sweep_state/users`). Completion is judged from the server-only `moderation/*` doc, because a client can forge `scannedAt` on its own post. Schedule it every 10–15 min with Cloud Scheduler. If `APPCHECK_ENFORCE` is on, exempt `/api/cron/` the same way the other crons are.

Video is scanned as frames, never the whole file. Mux videos use `image.mux.com/{playbackId}/thumbnail.jpg?time=N` (4 frames). Storage videos use ffmpeg, which pulls 4 single frames. Gemini sees all the frames in one call. OpenAI and PhotoDNA get one call per frame, and the worst frame wins.

Only our bucket and Mux are fetched. Third-party URLs, such as GIPHY GIFs and link previews, are skipped, which leaves no SSRF surface.

## Env vars (all server-only, also listed in .env.example)

| Var | Purpose |
|---|---|
| `PHOTODNA_SUBSCRIPTION_KEY` (+ optional `PHOTODNA_ENDPOINT`) | Microsoft PhotoDNA Cloud Service Match |
| `OPENAI_API_KEY` (+ `OPENAI_MODERATION_MODEL`) | omni-moderation-latest (free endpoint) |
| `GOOGLE_AI_API_KEY` / `GEMINI_API_KEY` (+ `SAFETY_GEMINI_MODEL`, default gemini-3.6-flash) | art-aware second opinion |
| `NCMEC_CYBERTIP_USER`, `NCMEC_CYBERTIP_PASS`, `NCMEC_ENV` (test or prod), `NCMEC_SUBMIT_ENABLED` (default false), `NCMEC_REPORTER_EMAIL/FIRST_NAME/LAST_NAME` | CyberTipline submission |
| `MUX_TOKEN_ID`/`MUX_TOKEN_SECRET` (existing) | pull playback ids of a CSAM video |
| `GOOGLE_SERVICE_ACCOUNT_JSON` / Cloud Run ADC (existing) | Firestore + Storage |

With no keys set, everything still works but every scan is `unscanned`, so nothing is approved silently.

## Getting the free services

- **PhotoDNA Cloud Service** (Microsoft): free for qualifying organizations, after vetting. Apply at https://www.microsoft.com/en-us/photodna. Expect a review of who you are and how you will use it. You receive an Azure API Management subscription key, which goes in `PHOTODNA_SUBSCRIPTION_KEY`.
- **Google Content Safety API** (a classifier that prioritizes likely-novel CSAM for review) and **CSAI Match** (hash matching for video): free for qualifying companies through Google's Child Safety Toolkit at https://protectingchildren.google/tools-for-partners/. Not wired yet. Add each as another `HashMatchSignal` source (`'csai'`) or as a priority input.
- **NCMEC ESP registration**: register as an Electronic Service Provider with the CyberTipline (https://report.cybertip.org/ or espteam@ncmec.org). NCMEC issues credentials for the **exttest** environment first. Validate the drafted XML against the XSD there, then request production access.
- **PDQ** (Meta, open source) hashes for cross-platform hash sharing (StopNCII, Tech Coalition Lantern) are a later addition. `HashMatchSignal.source:'pdq'` is already in the policy.

## When a CSAM case opens

1. **Quarantine.** The object is copied server-side to `safety_quarantine/{caseId}/…`. The storage.rules fallback denies all client reads there. The copy gets its download token stripped and a **temporary hold**, so it cannot be deleted or overwritten, and then the public original is deleted. If the copy fails, the original is locked in place instead (token stripped + hold) and the case says `locked_in_place`. Client-SDK reads that go through storage.rules may still work on that path, so a human must move it. For Mux, the playback ids are deleted and the asset is kept.
2. **Case record.** `csam_cases/{caseId}` is written. No client rule exists for it, so it is default-deny. It holds the uploader uid, the IP (captured when the uploader's own client called scan), md5/sha256, the PhotoDNA tracking id, the storage paths, the timestamps, `preserveUntil` = detection + 365 days, and the drafted `ncmecDraftXml`.
3. **Account hook.** `onCsamConfirmed(uid, caseId)` writes `user_sanctions/{uid}.criminalReview = {active:true, since, caseId}`, which services/enforcement/standingCore.ts already reads.
4. **Report.** Status is `report_drafted`. Automated submission (submit, upload, fileinfo, finish) runs only when `NCMEC_SUBMIT_ENABLED=true` and the credentials are set. Otherwise submit **manually**: a designated person signs in to the CyberTipline ESP portal and files from the case metadata plus the quarantined file (which the portal uploads; nobody opens it). Then the case is set to `reported` with the reportId.

The admin UIs **never** receive media. `/api/safety/cases` returns metadata only, and the review queue redacts csam items. A placeholder is all anyone sees.

## Legal duties (US; this is not legal advice, confirm with counsel)

- **18 U.S.C. 2258A**: once a provider has *actual knowledge* of apparent CSAM, it must report to the NCMEC CyberTipline "as soon as reasonably possible". Failure is fined. A hash match is generally treated as actual knowledge.
- **REPORT Act (2024)**: preserve the reported content and related data for **one year** (it was 90 days before), and keep it secure. That is `preserveUntil`, plus the hold on the quarantine object. Do not release the hold before `preserveUntil`, and not after it either if law enforcement has asked for an extension.
- **Do not view, copy or redistribute** beyond what reporting and preservation need. Staff do not open the files. Keep the number of people with bucket access to `safety_quarantine/` minimal, and log that access.
- **Do not tip off the user** that a report was filed. The public status is `blocked`, the same as any other block.
- Apparent CSAM includes realistic computer-generated imagery. Fictional or drawn sexualized minors are prohibited content and are hidden for trained review. A human decides whether the case is reportable (18 U.S.C. 1466A).

## Not covered yet (gaps)

- **Firestore rules cannot enforce any of this.** The repo's `firestore.rules` is over 256 KB and cannot be deployed, so the rules can neither require `moderationStatus` on read nor stop an author from overwriting `moderationStatus`, `safetyLabels` or `scannedAt` on their own post. Display-side hiding is client-side only. The sweep judges completion from the server-only `moderation/*` doc, so forging `scannedAt` does not dodge a scan, but an author can un-hide their own blocked post by editing the field. Once the rules can be deployed, deny client writes to those fields and deny reads where `moderationStatus in ['blocked','removed','pending_review_hidden']` for anyone but staff.
- **Media goes live before the scan.** The post publishes first and the scan runs asynchronously, so there is a window of seconds to minutes. A pre-publish gate (upload, scan, then publish) is the next step, starting with avatars and DMs.
- **Surfaces not wired.** The client only calls scan from `createPost`. Videos, albums and avatars are covered **only by the sweep**. DMs, comments, live frames, Tela and book covers have no wiring (the surfaces exist in the policy). Avatar hiding sets `photoURL:''`, but other cached copies of the photo URL (authorPhoto on old posts) are not touched.
- PostCard still shows the header of a hidden post on non-feed surfaces (profile grids and similar). Only the content is hidden there. FeedView filters hidden posts out entirely.
- Not wired: PDQ, CSAI Match, the Google Content Safety API, or text-only CSAM grooming detection.
- The NCMEC XML has not been validated against the live XSD.
- A sweep that scans every recent post costs provider calls. OpenAI moderation is free, but Gemini is not. Tune `budget`.
- No reviewer UI was built for `moderation/*` (the review-queue API exists), and no UI for appeals of automated blocks. The enforcement work in services/enforcement/* is a separate effort.
- Soft-remove revokes download tokens. A restore must put the saved token back (`moderation/*.revokedTokens`), and no restore endpoint exists yet.
