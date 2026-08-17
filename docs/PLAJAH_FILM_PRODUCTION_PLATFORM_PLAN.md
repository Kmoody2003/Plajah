# Plajah Film Production Platform: Research, Gap Analysis, and Delivery Plan

Date: 2026-08-17

## Executive decision

Do not build a StudioBinder clone beside a Scriptation clone. Build one **Production Graph** inside Artist Manager > Film, with the screenplay as the source of truth and role-specific workspaces as views over the same production data.

Plajah already has unusually strong bookends:

- development: Script Writing Studio, Worlds, characters, beats, revision colors, Fountain import/export, AI writing help;
- production: roster, call sheets, confirmations, daily briefs, sides, tasks, craft ordering, daily production reports;
- creation and finish: Fabula editing, Pixels visuals, Chora music licensing, Reello/live distribution, festivals, rights and monetization.

The missing center is a dependable chain from **script revision -> breakdown -> schedule -> visual plan -> department packet -> set record -> editorial metadata**. That chain should be the product.

## What the market leaders actually solve

### StudioBinder

StudioBinder is broad production coordination. Its current product connects screenwriting, script versions, element tagging, breakdown inventories, stripboards, alternate schedules, sides, DOOD and breakdown reports, shot lists, storyboards, mood boards, contacts, calendars, task boards, media, and distributed/trackable call sheets.

Its defining workflow is:

1. write or import a script;
2. tag cast, props, wardrobe, locations, equipment, VFX, and custom elements;
3. generate scene strips and arrange shoot days;
4. generate sides, reports, and call sheets from the schedule;
5. distribute and track delivery, views, and confirmations.

Sources:

- https://www.studiobinder.com/film-production-software/
- https://www.studiobinder.com/script-breakdown-software/
- https://www.studiobinder.com/production-scheduling-software-filmmaker/
- https://www.studiobinder.com/call-sheet-app/
- https://www.studiobinder.com/production-calendar/
- https://www.studiobinder.com/enterprise/

### Scriptation

Scriptation is the on-page working script. Its current product centers on rich PDF annotation; separate note layers; automatic character/scene highlighting; revision-aware note transfer; collated revision pages; script comparison; facing pages and inserted production documents; element tagging and reports; line rehearsal/read-aloud; and script-supervisor lining and slate/coverage work.

Its defining workflow is:

1. open the current production draft;
2. annotate in private, departmental, meeting, or shared live layers;
3. tag production elements and generate reports;
4. receive a revision or colored-page packet;
5. transfer notes to stable matching content and review changed/deleted annotations;
6. use the annotated script for rehearsals, blocking, coverage, and continuity.

Sources:

- https://scriptation.com/
- https://help.scriptation.com/en/article/what-is-scriptation-fuj75j/
- https://help.scriptation.com/en/article/how-do-i-transfer-my-notes-1khpcd8/
- https://help.scriptation.com/en/article/what-are-layers-and-how-do-i-use-them-1ozes9v/
- https://help.scriptation.com/en/article/how-does-scriptation-handle-a-pages-and-deleted-pages-17fa05u/
- https://help.scriptation.com/en/article/how-do-i-insert-or-import-new-pages-8fg0a3/

## Where the Plajah codebase is today

### Working foundations

| Area | Present capability | Main code |
|---|---|---|
| Screenwriting | Industry elements, title page, multiple formats, scenes/cast/beats, revision colors, locks, notes, auto-save, AI continuation/rewrite/coverage | `components/ScriptWritingStudio.tsx`, `types.ts` |
| Import/export | DOCX, PDF, text, Markdown and Fountain import; Fountain export | `components/ScriptWritingStudio.tsx` |
| Story world | Linked Worlds, characters, locations, timeline hooks | `components/ScriptWritingStudio.tsx`, `services/worldHub.ts` |
| Production core | Firestore production, members, scenes, call sheets, tasks, craft, DPRs | `services/filmProductionService.ts` |
| On-set UX | hub, call sheets, confirmations, roster, personal brief, craft, reports, sides | `components/film/FilmProductionSuite.tsx` |
| Business/admin | budget, crew, locations, schedule, contracts, invoices, festival distribution | `components/ArtistProjectManager.tsx` |
| Post and release | Fabula, Pixels, music licensing, Reello/live, distribution surfaces | `components/Fabula`, `components/plajahPixels`, related services |

### Structural problems to fix before feature expansion

1. **Three sources of truth.** Script documents, Firestore production scenes, and Artist Manager's local film stores can describe the same scene, cast member, schedule, or location independently.
2. **One default production per user.** `defaultProductionId(uid)` makes the v1 Firestore suite effectively single-project even though `fetchMyProductions` anticipates multiple productions.
3. **Owner-only operations are too coarse.** Production subcollections are broadly owner-writable/member-readable. Department heads cannot safely own their layer, breakdown items, reports, or tasks.
4. **Call-sheet confirmation is not safely concurrent.** The client reads the full confirmation map and writes it back, so simultaneous confirmations can overwrite one another. Use a transaction or per-recipient acknowledgement documents.
5. **Demo/local data competes with durable data.** Budget, crew, locations, schedule, and festivals use separate local stores while on-set data uses Firestore.
6. **Revision color is styling, not revision control.** There is no immutable draft/version entity, scene identity mapping, locked pages, A/B pages, change set, or annotation migration audit.
7. **No formal breakdown inventory.** Scenes carry characters and basic metadata, but there are no normalized elements, category templates, quantities, continuity state, department ownership, availability, cost, or linked media/docs.
8. **Scheduling is grouping, not scheduling.** Scenes are assigned a day; there is no drag-and-drop stripboard, day breaks, banners, company moves, conflicts, alternate schedules, cast availability, or schedule versioning.
9. **No visual planning model.** Fabula and Pixels exist, but shot lists, setups, storyboards, overhead diagrams, lens/camera plans, and coverage requirements are not first-class production records.
10. **No working-script annotation layer.** Current element notes are text fields, not anchored marks with author, department, visibility, layer, media, status, and revision-transfer behavior.
11. **Delivery is incomplete.** Call sheets can be published and confirmed, but email/SMS delivery attempts, view receipts, recipient-specific packets, change deltas, and escalation are not modeled.
12. **No offline-first set mode.** On-set continuity, script supervision, and confirmations must tolerate poor connectivity and sync conflicts.

## Product concept: Plajah Production Graph

Every artifact should carry stable IDs and relationships:

`Production -> Script -> Draft -> Scene -> Breakdown Element -> Schedule Strip -> Shoot Day -> Call Sheet -> Shot/Take -> Media Asset -> Fabula Timeline -> Release -> Rights/Revenue`

People, locations, documents, tasks, annotations, approvals, expenses, and messages attach to nodes in that graph. The UI can then show different role-based views without duplicating data.

### Core entities

- `Production`: project/episode container, company, owners, lifecycle state, timezone, policies.
- `ProductionMembership`: user/person, role, department, scoped permissions, availability, rate, union status, emergency/dietary data with field-level privacy.
- `Script` and immutable `ScriptDraft`: source format, hash, revision color/date, locked page map, parent draft, change set.
- `Scene`: stable identity independent of scene number; current text snapshot; story order; aliases across drafts.
- `AnnotationLayer` and `Annotation`: owner, visibility, department, anchor range, page coordinates, media, tags, resolution state.
- `BreakdownElement`: category, scene occurrences, department owner, quantity, continuity state, images/docs, vendor, cost, readiness.
- `ScheduleVersion`, `ScheduleStrip`, `ShootDay`: order, day breaks, banners, moves, unit, estimated duration, conflicts, approval state.
- `VisualPlan`, `Shot`, `StoryboardFrame`, `CameraSetup`: scene coverage, framing, lens, movement, lighting, audio, VFX and assets.
- `DistributionPacket` and `RecipientDelivery`: call sheet/sides/revision packet, channel, attempt, delivered/viewed/confirmed timestamps, recipient delta.
- `SlateTake` and `ContinuityRecord`: roll/clip, take status, circled take, notes, coverage, wardrobe/prop state, media links.
- `WorkflowEvent`: immutable event/outbox record that drives downstream updates and audit history.

## The end-to-end workflows to build

### 1. Greenlight a script into a production

- Choose a Script Studio project and create a Production from it.
- Snapshot an immutable Draft 1; parse scenes and character cues.
- Reconcile characters and locations with Worlds instead of creating duplicates.
- Create a readiness checklist, budget shell, roles, permissions, and target dates.
- Never copy scenes into a disconnected store; projection views read from the shared graph.

### 2. Department breakdown

- Highlight script text and tag an element or accept AI-suggested tags.
- Support cast, extras, props, set dressing, wardrobe, makeup, vehicles, animals, stunts, SFX, VFX, sound, music, intimacy, safety, equipment, and custom categories.
- Each unique element gets a profile with occurrences, continuity photos, documents, owner, status, cost, vendor, and dependencies.
- Department heads receive a queue of suggested/unreviewed elements and approve changes.
- Generate element lists, scene breakdowns, day-out-of-days, risk reports, and budget deltas.

### 3. Revision-safe working script

- Publish drafts as immutable versions, including locked-page and revision-color metadata.
- Diff by stable scene and semantic text anchors, not only page coordinates.
- Transfer annotations and breakdown occurrences automatically; classify exact, moved, changed, orphaned, and deleted anchors.
- Present a review inbox for ambiguous transfers and show who/what downstream artifacts are affected.
- Allow private, role, department, meeting, and production-wide live layers.
- Support pen/highlight/text/shape/stamp/photo/audio/video annotations, facing pages, bookmarks, auto-highlights, and filtered PDF packets.

### 4. Stripboard and production calendar

- Generate scene strips from the approved draft and breakdown.
- Drag scenes across days; add day breaks, banners, moves, meals, rehearsals, pickups, travel, and second units.
- Offer alternate schedule versions and compare cost, company moves, cast hold days, daylight, location availability, complexity, and risk.
- Detect conflicts; recommendations must explain their constraints and never silently rearrange an approved schedule.
- Promote an approved schedule into call sheets and department work queues.

### 5. Visual planning and coverage

- Build shot lists and storyboards per scene, with reusable camera setups and overhead blocking diagrams.
- Let users draw/import/generate storyboard frames, then refine them in Pixels.
- Attach shots to script ranges and breakdown elements.
- Carry the plan into the call sheet, personal brief, camera/sound reports, and Fabula bins.
- Track planned, captured, omitted, pickup-needed, and editorially-covered states.

### 6. Distribution and acknowledgement

- Generate recipient-specific call sheets, sides, revision pages, and department briefs.
- Deliver through in-app notifications plus email/SMS providers; log attempts and bounces.
- Show viewed, confirmed, declined/problem, and superseded states.
- On republish, send a concise recipient-specific delta and preserve the prior acknowledgement audit.
- Escalate only the people affected by a change.

### 7. Script supervision and camera-to-post

- Log slates, rolls/clips, takes, timecode, sound roll, lens, circled takes, continuity notes, line changes, and coverage.
- Capture continuity photos against character/look/prop/scene state.
- Offline queue all set operations and reconcile on reconnect.
- Generate DPR, camera, sound, continuity, and editor reports from the same records.
- On media ingest, match filenames/timecode/slate metadata and pre-bin footage in Fabula by scene/setup/take.

## What Plajah can do that the two competitors cannot do holistically

### The creative-to-audience loop

Plajah can connect story development, production, post, publishing, community, rights, and revenue. A scene can move from Script Studio and Worlds into breakdown/schedule, arrive in Fabula already organized, publish to Reello/FAST/live, and report audience response and revenue back to the creator's project dashboard.

### Story-world continuity, not just page continuity

Worlds can validate characters, locations, timeline, canon, props, and relationships across scripts, episodes, books, games, and transmedia. Revision review can flag story contradictions alongside production changes.

### Camera-to-community production

With permissions and embargoes, a production can designate approved BTS moments, stills, livestream windows, fan extras/casting calls, local vendors, or community screenings without exporting data to another marketing stack.

### Rights-aware assets from inception

Every song, photo, likeness, location release, stock asset, contract, and generated element can carry provenance, license scope, territory, window, expiration, and downstream usage. Fabula can warn before export if a cut contains an asset outside its rights window.

### Role-aware daily operating system

The existing Daily Brief concept should become a live role-specific home screen: today's calls, revision deltas, assigned script layers, shots, safety notes, tasks, transport, food, documents, approvals, and unread changes. This is more useful than giving every crew member the same large production dashboard.

### Production intelligence based on actual work

Aria can answer operational questions from structured production state: “What breaks if actor availability moves?”, “Which unshot moments are essential to the trailer?”, or “Which props appear tomorrow but are not ready?” Recommendations should include evidence, affected records, confidence, and a reversible proposed change set.

## Recommended information architecture

Artist Manager > Film should become project-first:

1. **Productions**: create/select/archive a production; no implicit per-user production.
2. **Home**: health, blockers, approvals, recent revision impact, next milestone.
3. **Story**: script drafts, outline, Worlds, revision compare.
4. **Breakdown**: working script, layers, elements, reports.
5. **Plan**: schedule, calendar, cast/crew, locations, budget, tasks, documents.
6. **Visualize**: shot lists, storyboards, mood boards, blocking.
7. **Shoot**: call sheets, briefs, sides, live set, script supervision, reports, craft.
8. **Post**: Fabula handoff, media ingest, review/approval, music and rights.
9. **Release**: QC, distribution, festivals, marketing, audience and revenue.

The existing tabs should migrate into these stages rather than remain a 16-item flat row.

## Phased delivery plan

### Phase 0 — Architecture and safety (2 weeks)

- Write an ADR for the Production Graph and stable ID rules.
- Inventory every film store and define migration ownership.
- Add multiple production selection/creation and remove implicit `film_{uid}` assumptions.
- Define production roles and a permission matrix; split sensitive member data.
- Add emulator-backed Firestore rule tests.
- Replace swallowed write errors with typed results, logging, retry UX, and telemetry.
- Change confirmation writes to transactions or acknowledgement documents.

Exit: two users can belong to multiple productions with correct scoped access; failures are visible; no new feature writes to legacy local film stores.

### Phase 1 — Unified production spine (3–4 weeks)

- Add `ScriptDraft`, stable `Scene`, `ProductionMembership`, `WorkflowEvent`, and migration adapters.
- Greenlight a Script Studio document into a production.
- Migrate local scenes, crew, locations, budgets, and festivals to production subcollections.
- Replace demo seeding in real user projects with an explicit sample-production template.
- Add event-driven projections so call sheets and dashboards update from shared records.

Exit: edit a scene once and see the same identity in Story, Breakdown, Schedule, Call Sheet, and Reports.

### Phase 2 — Breakdown MVP (4 weeks)

- Text-range tagging with standard/custom categories.
- Element manager and occurrence profiles.
- Department ownership, status, media/docs, quantities, cost and vendor fields.
- AI suggestions in a human approval queue.
- Breakdown summary, element list, cast DOOD, and CSV/PDF exports.

Exit: an AD can import/greenlight a script, finish a production-ready breakdown, and share accurate department reports.

### Phase 3 — Scheduling and reliable call-sheet distribution (4–5 weeks)

- Versioned stripboard, drag/drop, day breaks, banners, moves and alternate schedules.
- Availability and conflict engine for cast, locations, daylight, workload and elements.
- Generate calls from an approved schedule rather than manually assigned scene days.
- Recipient packets; delivery/view/confirmation tracking; delta resend; templates.
- Production calendar with dependencies and task linkage.

Exit: approved schedule -> personalized call sheet/sides -> traceable acknowledgement works without re-keying.

### Phase 4 — Working script and revisions (5–6 weeks)

- Immutable drafts, page locking, revision colors, A/B pages and page packets.
- Anchored annotation engine and private/department/live layers.
- Draft diff and note/element transfer with changed/deleted/orphan review.
- Auto-highlights, facing pages, filtered sides and printable layer exports.
- Read-aloud/rehearsal mode using Plajah audio/voice infrastructure.

Exit: a department can work through a major revision without recreating its notes or losing auditability.

### Phase 5 — Visual planning and set mode (5–6 weeks)

- Shot lists, camera setups, storyboards and blocking diagrams.
- Pixels round-trip for generated/imported frames.
- Offline-first mobile set shell.
- Slates/takes, lining, coverage, continuity photos, camera and sound reports.
- DPR automation and pickup detection.

Exit: planned coverage and actual captured coverage can be compared scene by scene, even after an offline shoot day.

### Phase 6 — Fabula, rights and release loop (4–5 weeks)

- Match ingested media to scene/setup/take and create Fabula bins/timeline markers.
- Send circled takes, line changes, continuity and director notes to editorial.
- Link music/license requests and all production asset rights to cuts.
- Rights/QC gate on export; delivery package templates.
- Feed approved promo assets to Plajah publishing surfaces and connect performance/revenue back to the production.

Exit: production metadata survives into post and release; no manual relabeling of an entire shoot.

## Build order inside each phase

Use vertical slices, not isolated frontend tabs:

1. schema and security rules;
2. service/command layer with idempotency and audit events;
3. migration/backfill;
4. role-specific UI;
5. export/import interoperability;
6. emulator/unit/integration tests;
7. telemetry and staged rollout.

## Testing and non-functional requirements

- Firestore emulator tests for every role and subcollection.
- Transaction/concurrency tests for acknowledgements, revisions, schedule approval, and offline replay.
- Golden fixtures for Fountain, Final Draft-compatible import/export where legally/technically feasible, PDF page packets, locked pages, A/B pages, and scene renumbering.
- Audit log for publish, approval, delivery, transfer, override, and rights changes.
- Offline queue with idempotency keys and explicit conflict UI.
- PII separation for contact, medical/emergency, dietary, rate and contract data.
- Large-production performance target: 120-page draft, 250 scenes, 5,000 annotations, 10,000 element occurrences, 250 members.
- Accessibility: keyboard workflows on desktop, large touch targets on set, high-contrast revision colors, screen-reader labels.

## Metrics that prove the product works

- time from imported script to first complete breakdown;
- percentage of scene data reused without re-entry downstream;
- revision annotation/element transfer success and unresolved-anchor rate;
- schedule conflicts caught before publication;
- call-sheet delivery/view/confirmation rate and median acknowledgement time;
- unready-element count at T-24 hours;
- planned shots versus captured coverage and pickup rate;
- percentage of media auto-matched into Fabula;
- number of rights exceptions caught before export;
- weekly active productions by crew role, not only project owner.

## Immediate first backlog (first 10 tickets)

1. ADR: Production Graph, stable IDs, drafts and event/outbox conventions.
2. `ProductionSwitcher` plus create/join/archive flows.
3. Replace `defaultProductionId(uid)` in provider routing with selected `productionId`.
4. Permission matrix and Firestore emulator rule suite.
5. Transactional/per-recipient call-sheet acknowledgement model.
6. Durable Firestore models for budget, locations, festivals, and production crew; migration adapter from local stores.
7. `ScriptDraft` snapshot and Greenlight command from Script Studio.
8. Stable scene reconciliation across draft imports.
9. Breakdown category and element/occurrence schema with a minimal tagger.
10. Workflow event/outbox plus a projection that updates production scenes from the approved draft.

## Guardrails

- Do not put AI between a crew member and an approved production fact; proposals require review.
- Do not use page number or scene number as identity.
- Do not overwrite published drafts, schedules, call sheets, or reports; supersede them.
- Do not let every member read sensitive personal/financial/medical fields.
- Do not build separate “StudioBinder mode” and “Scriptation mode.” The value is one connected workflow.
- Do not prioritize cosmetic parity before multi-project support, shared identity, permissions, revisions, and reliable distribution.

