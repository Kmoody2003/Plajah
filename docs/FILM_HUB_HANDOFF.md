# Film Hub — Session Handoff Note

**Purpose:** hand off the in-progress Film Hub work so another assistant (e.g. ChatGPT) can continue mid-stream. Written 2026-08-31. Repo: `C:\Users\Kenne\plajah`. Branch: `feat/kith-sightings`.

---

## 0. TL;DR — where things stand

Building out the **film production pipeline** in **Artist Manager → Film** (`components/ArtistProjectManager.tsx` + `components/film/*`, backed by `services/filmProductionService.ts`). A phased "cliff-closer" plan (full plan file: `.claude/plans/idempotent-imagining-pike.md`).

- **SHIPPED & COMMITTED** (commit `a840372`): W1 Clearances, W2 Accounting, W3 Script Revisions — **backend only** (7 files). Type-clean.
- **DONE, UNCOMMITTED**: the Film-Hub **UI tabs** for W1–W3 live in `components/ArtistProjectManager.tsx`, which is **not committed** because another concurrent session's "demo-mode" feature is interleaved in the same file (see §3).
- **IN PROGRESS (this session)**: seeding the **demo showcase** with a greenlit screenplay + breakdown so the Script Supervisor role is demoable (`services/productionShowcaseTemplate.ts`). Typecheck pending confirmation at handoff time.
- **REQUESTED / NOT STARTED**: (a) mobile-first / tablet touch UX for the Film Hub, (b) a computer-vision **continuity check** feature. See §6.

---

## 1. CRITICAL: shared working tree (multiple live sessions)

Several Claude/agent sessions edit **one shared checkout on branch `feat/kith-sightings`** simultaneously. `git status` shows files from other sessions (Terra, Melos, CreatorHub, `firestore.rules`, `firebaseAdminRest`, `services/demoMode.ts`). **Do NOT `git add -A` or commit files you didn't change.** Commit only your own scoped files after diffing to confirm no foreign hunks. `components/ArtistProjectManager.tsx` currently contains BOTH this work's film tabs AND another session's demo-mode feature (imports `../services/demoMode`) — committing it whole bundles their WIP + requires their untracked `services/demoMode.ts`.

## 2. Build guardrails
- **Typecheck** (baseline ~81 errors, all pre-existing in unrelated files — Academia/GlobalPlayer/etc.; treat as noise, just confirm you add **zero new**):
  `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`  (bare `tsc` OOMs without the flag). Vite build skips typecheck.
- **Firestore gotcha**: writing `undefined` field values THROWS. The service strips undefined via `stripUndefined`/`clean` (`JSON.parse(JSON.stringify(...))`) before every write — keep using it.
- **Auth-gated**: the whole Artist Manager requires sign-in; the in-app dev-server preview can't reach it without creds. Another session's dev server occupies this folder, so `preview_start` from a new session won't hit it.
- **Codec files are OFF-LIMITS** (owned by a concurrent codec session): `services/fabula/codecMatrix.ts`, `services/crossover/*`, `services/fabula/fcpxml.ts`. Consume, never edit.

## 3. What each wave did (SHIPPED in commit a840372 unless noted)

The **6-layer pattern** every feature follows:
1. **Model + subcollection trio** in `services/filmProductionService.ts` (`productions/{id}/<sub>` + generic `sub*/put*/patch*/remove*`).
2. **Ledger** — extend `WorkflowEventType`/`entityType` in `services/productionGraph.ts`; emit via `batch.set(...workflowEvents...)`.
3. **Provider** — add slice to `components/film/FilmProductionSuite.tsx` in these spots: `Ctx` interface, `useState`, the reset block, the demo block, the subs effect, the `value` object. Hook is `useProd()`.
4. **Integration point** (real value) — e.g. schedule conflict engine `analyzeSchedule` in `services/productionScheduleService.ts`.
5. **Smarts** — new `askProductionBrain` mode in `services/productionIntelligenceService.ts` (add to `ProductionBrainMode`, prompt map, `ProductionCorpusData`, `buildAuthorizedProductionCorpus`, the `names` loader array, pass-through).
6. **Tab** — register in `ArtistProjectManager.tsx`: `PMTab` union (~L2864), `FILM_TABS` (~L2896), `renderTab` switch (~L2975). Tab component is a `React.FC` calling `useProd()`, inline-Tailwind like `FilmLocationsTab`/`FilmBudgetTab`.

- **W1 Clearances** — `ProductionClearance` + `clearances` sub (9 types, 6-state status, links member/location/scene/element, PRIVATE docs via Content HQ `addHqAsset`). `putClearanceWithEvent`. Schedule engine raises a **`CLEARANCE` conflict** (scene whose permit/release isn't in hand or expired). `CLEARANCE_SCAN` AI mode. UI = `film_clearances` tab (in ArtistProjectManager.tsx, uncommitted).
- **W2 Accounting** — extended `ProductionBudgetLine` (accountCode/category/fringePct/committed) + `purchaseOrders`/`pettyCash`/`timecards` subs. `buildCostReport` (Est+fringe vs Committed vs Actual), `computeWorkHours`, `timecardsFromDpr`/`seedTimecardsFromDpr` (auto-seed from a DPR's actual times). `BUDGET_BENCHMARK` mode. UI = rebuilt `FilmBudgetTab` (segmented: Budget/POs/Petty/Timecards/Cost Report), uncommitted.
- **W3 Script Revisions** — extended `RevisionColor` ladder (types.ts) + `REVISION_LADDER`/`nextRevisionColor`, `diffDraftScenes`, `draftScriptBlocks` in productionGraph. `ProductionScene` gains `revisionColor`/`changedInRevision`/`isNewInRevision`. `greenlightScriptToProduction` **auto-advances the colour on each revision + diffs the prior draft to mark changed scenes**. **Sides now lock to the greenlit draft** (`SidesView` reads `fetchDraftBlocks(currentDraftId)`, previously mis-read the live editable script). Revision-history panel + `*`/`★` marks in `FilmScriptTab` (uncommitted). NOT done: locked page numbers / A-pages / colored-page PDF.

## 4. In-progress this session: DEMO SEED (uncommitted)

File: `services/productionShowcaseTemplate.ts` (was clean/no concurrent edits when started). The Firestore showcase ("Halflight", a sci-fi thriller) already seeded 8 breakdown elements but had **no greenlit script**, so the Breakdown "Script" tagging view showed *"Greenlight a script to begin tagging"* — the reason the Script Supervisor role looked empty.

Changes made:
- Added a **greenlit `ScriptDraft`** (`draft_halflight_white`, 8 scripted scenes with real screenplay `ScriptElement[]`), set `production.linkedScriptId`/`currentDraftId`, and anchored each scripted scene's `sourceElementId` to its `SCENE_HEADING` element (this is how `mapDraftElementsToScenes` links a script element → a scene; see `services/productionBreakdownService.ts:148`).
- Generated **CAST breakdown elements** from the roster so the **Cast DOOD** grid fills (DOOD view filters `category === 'CAST'|'EXTRAS'`).
- Added 3 **Pokee `SUGGESTED`** prop/vehicle elements (source `AI`, anchored to the script) so the "review & approve" pipeline is demoable.
- Added `scriptDrafts` to `FilmShowcaseCorpus` + `writeCorpus` collection list.
- **Bumped `FILM_SHOWCASE_TEMPLATE_VERSION` 2 → 3** so existing users get a fresh re-seed (showcase id is `showcase_film_v{VERSION}_{uid}`; `ensureFilmShowcaseProduction` only reuses a doc whose `templateVersion` matches).

**Caveat:** the Breakdown tab reads breakdown/draft from **Firestore** (`subscribeBreakdownElements`, `fetchApprovedScriptDraft`), not from provider context. So this seed populates the **signed-in Firestore showcase** only. The **signed-out in-memory demo** (`demo_film_local`) still won't show breakdown (would need the tab to accept context data — out of scope). Users demo signed-in.

**To verify the seed live:** sign in → open Artist Manager → Film → the showcase auto-creates as `showcase_film_v3_{uid}` → Breakdown tab: Script view shows the Halflight page; Elements shows cast + props + 3 suggested; Cast DOOD fills; Reports generate per-department packets.

## 5. Companion artifact (already delivered)
A published Artifact visualizes the Script Supervisor breakdown workflow: **https://claude.ai/code/artifact/c7e9dd44-1be7-456d-8e1c-140117204afb** (source: scratchpad `breakdown-board.html`). NOTE: it currently uses invented "Cold River"/Maya content; the real demo is "Halflight"/Elena — re-skinning to match is a pending nicety.

## 6. FEATURE THREADS (status)

Four published concept artifacts back these threads: **Script Breakdown Board**, **On-Set Companion**, **Continuity Eye**, **Set to Cut**. (Artifacts are on claude.ai/code — links live in the session; not in the repo.)

### 6a. On-set mobile UX + Master Clock — ✅ SHIPPED (commit 4eb97bb)
`services/masterClockService.ts` (pure `buildDayClock` = drift/meal-penalty/OT thresholds from call sheet + scene page-count + DPR actuals; `estimateLostTimeCost` = $ of drift from crew day rates; `timerEntries` subcollection for role stopwatches). `components/film/MasterClock.tsx` = compact sticky bar rendered persistently in `FilmProductionProvider` above EVERY film tab. `components/film/OnSetMobile.tsx` = phone-first "Today" from `buildDailyBrief` (call countdown, time-spine, one-tap confirm via `acknowledgeRecipientDelivery`); `useIsPhone()` (<700px). `ProductionHubTab` is now a responsive wrapper → `OnSetMobile` on phones, `ProductionHubDesktop` else. Direction artifact: **On-Set Companion**.

### 6b. Continuity Eye (CV continuity) — concept + artifact done, NOT built
Artifact **Continuity Eye**. Score model: **SSIM** prop-diff matched to tagged breakdown elements + **luminance/white-balance/colour-temp** lighting delta + **feature-match** framing gate (camera-moved vs set-changed) → 0–100, on-device (MediaPipe/WebGL already in stack for VTuber/live). Extended per Kenne with: **object memory** (box+name a prop/costume → visual signature/embedding → recognised across setups/angles/days, linked to its breakdown element + `continuityState`) and **presence check** (the scene's required breakdown elements → pre-take checklist present/missing/wrong) + 8 scenarios (wardrobe state, right-prop-right-hand, cross-day match, progressive states, reset-ghost guide, set-dressing completeness, actor-on-mark, first-team batch). P1 = still-vs-still on one device (browser); object re-ID across angles/days = harder P2 (embeddings). Advisory only; ties to `BreakdownElement.continuityState`/`mediaUrls`, feeds the DPR.

### 6c. Set-to-Cut / Live Edit — flagship vision, artifact + **grounded MVP scoped** (NOT built)
Artifact **Set to Cut**. The thesis: the edit begins as the first take is printed, because Plajah uniquely owns the whole chain (script + breakdown + Story Intelligence + Fabula NLE + Live streaming + CV continuity). Six features: Camera-to-Cut, living rough cut, director's take log (Continuity Eye repurposed), story-aware assembly, private video-village stream, proxy→BRAW conform.

**Camera/proxy intel (domain, for the artifact + build):** don't integrate cameras one-by-one — integrate the transport layer. Most-open camera APIs: **ARRI Camera Access Protocol (REST+WebSocket)** and **Canon CCAPI (REST)**, then Blackmagic (Camera Control protocol + BRAW SDK), Sony (Camera Remote SDK), RED (R3D SDK = decode only). Camera-agnostic path: **Frame.io C2C API/webhooks**, **Teradek/Accsoon** edge uploaders, **NDI/SRT**, or a phone uploader. Metadata (scene/take) via camera API → digital slate → timecode+slate-OCR → manual tap (fallback). High-efficiency proxy = **H.264 short-GOP ~1/2-res 6–12 Mbps** (WebCodecs HW-decode, ~60MB/min), a separate low-latency WebRTC/SRT stream for monitoring, edge/camera-native proxies (avoid cloud transcode), relink to masters by TC+reel on the desktop tier.

**MVP is grounded against real code (see agent findings baked in below):**
- **Fabula needs NO code change.** A Fabula project is a plain JSON blob (`{id,title,type:"film",mediaPool:[],acts:[{scenes:[{timeline:{clips}}]}],edits:[{timeline:{clips,trackSettings}}],bins:[],tracks:[...]}`). Clip = `{id,trackId,start,duration,srcIn,kind:"media",assetId,label}` (seconds; video = linked picture+audio pair). Asset (mediaPool) = `{id,name,type:"video",url?/cloudUrl?,duration,bin,tags:[]}`; **bins are just a string tag `asset.bin`**. Persist: IndexedDB `studio:prod:<id>` + `studio:index`, media bytes OPFS `studio:blob:<assetId>`, cloud `fabula/{uid}/{id}.json` + Firestore `fabula_projects` (`services/fabulaProjects.js`).
- **The handoff seam** (reuse verbatim): write the project + `idbSet('studio:handoff',{prodId,editId})` + `window.dispatchEvent(new CustomEvent('OPEN_FABULA'))`. **Template = `services/melos/beats/sendToFabula.ts`** (single edit) or `services/fabulaBridge.ts` (multi-bin). Single-clip live variant = `fabula:incomingClip` + `{importClip:true}` (see `components/MobileLiveStreamer.tsx:1164` `sendToFabula`, consumed at `Fabula.jsx:811-832`).
- **Story Intelligence (`services/storyIntelService.ts` + `routes/taleo.ts` + `worker/story/*`) ingests a PUBLISHED Mux film, NOT a script — per-film batch ~$0.75–$2. Do NOT use its batch pipeline for live assembly.** Reuse its *patterns*, not the service.
- **Take transcription (reuse):** `analyzeClipForScript(mediaBase64, mime, castNames, clipLabel)` (`services/geminiService.ts:265`) → **speaker-attributed timed dialogue + slugline guess** (18MB inline cap → chunk). Sibling `generateTimeCodedCaptions` (`:213`) is what Fabula's `transcribeClip` (`Fabula.jsx:3250`) already calls.
- **Script dialogue (reuse):** walk `productions/{prodId}/scriptDrafts/{currentDraftId}.elements` (or `fetchDraftBlocks`) — SCENE_HEADING→CHARACTER→DIALOGUE.
- **Matcher (reuse as template):** `services/lyricSync.ts` already fuzzy-aligns a transcript to reference text — same shape as take-transcript ↔ scripted-line.
- **Reasoning shell (reuse):** add a `SELECTS`/`COVERAGE_GAP` mode to `askProductionBrain` (`productionIntelligenceService.ts` — corpus already has scenes + breakdown + scriptDraft, but NOT footage → inject take transcripts if Brain must reason over them).

**Net-new (narrow):** (1) a **`takes` subcollection** `productions/{prodId}/takes/{id}` = `{sceneId,sceneNum,takeNumber,proxyUrl|proxyAssetId,duration,circled?,rating?,status:GOOD|NG|HOLD|SELECT,transcript?,matchScore?,byMemberId,createdAt}` — the take↔scene link that doesn't exist today; (2) a **take-log UI** (new panel / extend OnSetMobile / a `film_edit` tab); (3) a **`buildFabulaProjectFromTakes(prod,scenes,takes)`** service (new `services/filmEditBridge.ts`) that maps scene→`bin`, takes→mediaPool assets + `v1` clips at increasing `start`, circled/best per scene → `edits[0].timeline.clips` rough cut, then the handoff; (4) the **transcript-vs-script scorer** + **coverage-gap set logic**.

**Phasing:** **P1** (browser, no AI/camera) = `takes` model + take-log (circle/rate/NG, manual proxy upload) + `buildFabulaProjectFromTakes` Send-to-Fabula (bins per scene, circled selects as a rough cut) — proves "the edit prepopulates from the production." **P2** = transcribe (`analyzeClipForScript`) + align (lyricSync template) → best-reading selects + coverage-gap flag (+ Brain mode). **P3** = live proxy stream (WebRTC, single-clip handoff appends takes). **P4** = native tier (Blackmagic camera-control metadata, BRAW conform via Crossover desktop, C2C/NDI/SRT ingest).

### 6d. Crew PTT / Comms — phone-to-phone, NEVER bridged to set radios
Frame it phone-to-phone; the physical radio channel stays informational. Offline tiers: **T1** internet WebRTC (foundation shipped, see [[plajah-walkie-talkie]] memory) → **T2** local-WiFi WebRTC w/ a base-station device + QR pairing → **T3** off-grid WiFi-Direct/WiFi-Aware/BLE mesh = **native Capacitor only** (Android-first; iOS MPC restricted). Concept lives in the On-Set Companion artifact.

## 7. Quick file map
- `services/filmProductionService.ts` — the model spine + all subcollection helpers + cost report + revision fields + greenlight.
- `services/productionGraph.ts` — script projection, revision ladder/diff, workflow-event types.
- `services/productionScheduleService.ts` — stripboard + `analyzeSchedule` conflict engine.
- `services/productionBreakdownService.ts` — breakdown model, `mapDraftElementsToScenes`, `suggestProductionBreakdown` (Pokee).
- `services/productionIntelligenceService.ts` — `askProductionBrain` (modes: ASK/RISK_SCAN/NEXT_ACTIONS/CONTINUITY/DAY_PLAN/CLEARANCE_SCAN/BUDGET_BENCHMARK).
- `services/productionShowcaseTemplate.ts` — the "Halflight" demo corpus + Firestore seed.
- `components/film/FilmProductionSuite.tsx` — the `FilmProductionProvider` + `useProd()` + on-set tabs (Hub/CallSheets/Roster/Brief/Craft/Reports).
- `components/film/FilmBreakdownTab.tsx` — the 5-view breakdown tool.
- `components/film/FilmScheduleTab.tsx` — the stripboard tab.
- `components/ArtistProjectManager.tsx` — the Film discipline tabs (Overview/Script/Budget/Crew/Locations/Clearances/Distribution) + tab registration. **Shared with another session — commit carefully.**
