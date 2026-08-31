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

## 6. REQUESTED NEXT WORK (not started)

### 6a. Mobile-first / tablet touch UX for the Film Hub
Kenne wants a **phone-first, touch-first** UX for on-set users — intuitive, delightful, solving the pain of managing a production from a phone/tablet. The current Film tabs are dense desktop layouts. Likely approach: an on-set mobile shell (big touch targets, one-thing-per-screen, the "My Brief"/call-sheet/DPR/craft flows optimized for a phone in the field), respecting `useSafeArea`/`TouchTarget` from `src/lib/designSystem.tsx` and the adaptive-nav work. Consider an artifact mockup first (Kenne responds well to those) before building. Related memory concepts: adaptive nav, mobile+TV program.

### 6b. Computer-vision continuity check (Script Supervisor)
Kenne's idea: the Script Supervisor **photographs a scene**, and after a reset the tool **compares** to detect props out of place / missing that break continuity — ideally fed from the **live camera feed of the shot**, producing a **continuity score** covering not just prop placement but **lighting changes**. This is a genuinely differentiated feature (partial precedent: ScriptE, Moment.dev, some AI continuity R&D — but on-device real-time CV continuity scoring from camera feed is largely unsolved/emerging). Fits Plajah because: (1) the Script Supervisor role + `BreakdownElement.continuityState` + `mediaUrls` already exist; (2) the platform already runs on-device CV (MediaPipe/WebGL) for VTuber/live translation/camera lenses — so image-diff, object-presence detection, and histogram/lighting-delta scoring are feasible client-side. Suggested shape: a "Continuity" capture surface tied to a scene, storing a reference frame + reset frames, running a diff (structural similarity + object detection + luminance/white-balance delta) → a 0–100 score with flagged regions. Start with a feasibility spec + artifact, then a prototype.

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
