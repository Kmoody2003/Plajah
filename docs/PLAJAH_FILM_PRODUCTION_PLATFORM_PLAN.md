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

### Implementation status — Phase 1 completed (August 17, 2026)

The Phase 1 vertical slice is implemented:

- multiple productions are available through an explicit workspace selector;
- productions start empty, and sample data is an owner-triggered template;
- Script Studio greenlights an immutable `ScriptDraft` into a selected production;
- stable scene identity survives draft revisions while schedule, status, pages, notes, and location decisions are preserved;
- call sheets use live scene projections, so edits reach Call Sheets, Daily Briefs, and DPR generation without re-keying;
- budget, locations, festivals, membership, and scenes use shared production subcollections;
- prior browser-only film data has an explicit production import adapter;
- hiring and link/QR enrollment create role-bound memberships keyed by Plajah user ID;
- Firestore rules cover drafts, workflow events, operational scopes, and private member data;
- focused graph tests cover identity, extraction, and revision reconciliation.

Phase 2 must extend these records rather than create parallel scene, crew, or schedule stores.

### Production Brain — whole-production context (implemented August 17, 2026)

Film Production Hub now includes a Pokee-Isaac reasoning surface that rebuilds its context from the live production graph for every analysis. It can answer free-form production questions or run risk, priority, continuity, and shoot-day passes across the approved script, scene breakdown, call sheets, staffing, tasks, locations, craft, distribution, workflow history, hiring, budget, and daily reports.

The corpus is authority-filtered before it is sent: budget, reports, hiring records, and sensitive crew contact data are included only when the asking user's production permissions allow them. Responses separate evidence, risks, missing information, and role-owned next actions; they cannot directly mutate production records.

### Implementation status — Phase 2 completed (August 17, 2026)

The first Breakdown vertical slice is implemented as a shared Film Tools workspace:

- canonical breakdown elements aggregate stable scene occurrences instead of duplicating the same prop, cast member, or requirement per scene;
- the approved-draft reader lets permitted users select exact screenplay text and preserves its source element, trimmed quote, and character offsets on the stable scene occurrence;
- standard categories route work to an owning production department, with custom categories available;
- department heads can approve, assign, and advance only their own department's elements; production-wide script authority remains separate;
- Pokee can propose grounded elements from the approved draft, but every suggestion stays outside production truth until a permitted person approves it;
- approved elements can become department-owned tasks without re-keying;
- element, scene, and Cast DOOD views plus filtered CSV and print/PDF output are available;
- element detail views support independently editable scene quantities, evidence, notes, and removal while preserving at least one grounded occurrence;
- governed media and document attachments support production references up to 25 MB, with uploader-scoped storage and department-authorized record changes;
- department-scoped report packets provide readiness, blockers, ownership, vendor, cost, evidence, attachment counts, CSV, and print/PDF output;
- the Production Brain corpus now includes the live breakdown inventory and approval state;
- append-only workflow events record AI suggestion passes, human approvals, occurrence changes, and attachment changes.

Phase 2 exit achieved: an AD can greenlight a script, complete a production-ready breakdown, delegate department preparation without crossing authority boundaries, and share accurate department packets without re-keying the script.

### Implementation status — Phase 3 completed (August 17, 2026)

The production schedule is now a versioned approval workflow rather than a number stored independently on each scene:

- stable scene records become draggable strips inside named schedule versions;
- alternate schedules clone arrangements without mutating the approved version, and prior approvals are superseded rather than overwritten;
- shoot days carry dates, unit, general call, page totals, estimated duration, banners, and explicit company moves;
- shoot days can link production tasks as dependencies, keeping prep ownership visible on the board;
- cast/crew availability, location availability, and scene restrictions can be entered as hard or soft constraints;
- the conflict engine explains cast, location, daylight, workload, blocked-breakdown, and unmarked-company-move problems before approval;
- only a conflict-clear saved draft can become production truth, and approval projects the selected day assignment back onto the stable scenes;
- call sheets are generated from the approved schedule with its plan/version/day identity attached;
- reusable call-sheet templates preserve safety, parking, basecamp, hospital, meal, and relative timing defaults while allowing the production call to move;
- publication creates a personalized recipient packet per active crew or called cast member, including individual call, relevant scenes, sides/department-brief flags, and recipient-specific deltas on republish;
- delivered, viewed, confirmed, problem, and superseded states live in independent recipient documents, eliminating the shared confirmation-map race;
- a recipient can view or confirm only their own linked packet, while call-sheet managers see the complete delivery dashboard;
- schedule plans, constraints, delivery state, and approval history are included in the authority-filtered Production Brain corpus.

Phase 3 exit achieved: approved schedule → schedule-linked call sheet → personalized packet → independent, traceable acknowledgement works without re-keying. Email and SMS transport adapters can be added later without changing the packet or receipt model.

### Implementation status — Production Chat foundation completed (August 17, 2026)

Plajah Chat now treats a production as a governed communication workspace while preserving the platform's existing consumer messaging behavior:

- every production starts with Announcements, General, Schedule & Calls, Safety, and Crew Help;
- the workspace adds department rooms from the active roster, infers Stunts/SFX, Locations, and Transportation needs from the scene plan, and adds shoot-day rooms from linked call sheets;
- deterministic room IDs make repeated provisioning idempotent, while roster and call-sheet changes safely resync the structure;
- department rooms include production leadership plus the relevant department rather than exposing every operational room to the whole company;
- Plajah Chat keeps DMs, audio/video calling, rich messages, voice/video notes, reactions, search, and collaboration boards;
- production rooms add group PTT using the film department radio plan, with a recent-transmission reel;
- each person gets a private production note and a context card containing their position, department, personal call, department focus, and radio channel;
- Announcements are read-only for ordinary crew and writable by production leadership;
- Nibbles is explicitly disabled in production rooms and production-context DMs begin with it off;
- central Chat groups production rooms under Sets, while Artist Manager › Film exposes the complete production workspace;
- Production Brain receives recent messages only from production channels the asking user can already read; private notes and DMs are always excluded.

Communication foundation exit achieved: roster/schedule changes produce the right governed rooms, crew can message/call/PTT without leaving the production, and private or leadership-only boundaries remain enforceable at the data layer.

### Implementation status — Production Chat live workflow layer completed (August 17, 2026)

- Chat messages can carry stable references to canonical tasks, scenes, breakdown elements, call sheets, schedules, decisions, and alerts rather than flattened screenshots or copied text.
- Native Plajah cards subscribe to the original record, render its current operational state and linked image/document assets, and refresh automatically when an authorized author changes it.
- Authority-aware actions let the right role advance a task, update scene or department readiness, record a decision outcome, or resolve an alert without giving that person control of unrelated production data.
- Crew can acknowledge a live object or request clarification; each response is an independent user-owned record so one recipient cannot overwrite another.
- Schedule and call-sheet cards use the same acknowledgement path, providing a reusable change-confirmation workflow inside Chat.
- Production conversations support focused threads and `@name` mentions with mention-specific notifications and an in-chat “Mentioned you” marker.
- Decision, alert, and acknowledgement records are included in the authority-filtered Production Brain corpus, while private notes and DMs remain excluded.
- Firestore validates live references against the room's production and preserves immutable author/recipient ownership at the data layer.

Live workflow exit achieved: production data remains interactive and current inside Chat, edits return to the canonical source, and communication does not bypass production authority.

### Implementation status — Production Action Engine completed (August 18, 2026)

- Approving a schedule now calculates affected scenes, departments, crew, downstream systems, and review risks before authority commits the change.
- Approved schedules create a durable, retryable governed action and automatically route the canonical schedule card to Announcements and Schedule & Calls.
- Publishing or revising a call sheet calculates the called population and operational gaps, then routes the live call-sheet card to Schedule & Calls and its shoot-day room.
- Each governed revision has its own action ID, acknowledgement scope, deadline, delivery state, and authority requirement; an acknowledgement from an older revision cannot satisfy a newer one.
- Failed channel delivery returns the action to `READY` instead of losing the workflow, allowing an authorized person to retry it from the Operations Inbox.
- Production Chat now includes **My work**, a personal role-filtered queue for required acknowledgements, call-sheet confirmations, assigned tasks, and changes awaiting authorized publication.
- The governed change feed shows downstream consequences, risks, delivery status, acknowledgement completion, overdue state, and role-gated escalation controls.
- Confirming a call-sheet packet from the inbox updates both the recipient delivery and its governed-action acknowledgement.
- Pokee's authority-filtered corpus now includes production actions, their impact analysis, delivery state, deadlines, risks, and acknowledgements.
- Firestore rules preserve the action's production, original actor, required permission, and canonical entity while allowing only the appropriate authority to publish or escalate it.

Action Engine exit achieved: an approved production change becomes durable work, reaches the right operational channels as live data, requests a fresh response from the right people, and remains visible until responsibility is closed.

The interactive showcase production is intentionally deferred until the remaining production-suite implementation is wrapped. It should be created as a separate final demonstration pass so every completed workflow can be seeded and exercised end to end without contaminating real-user production creation.

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

## Governed production change connectors — implemented

The production Action Engine now connects the suite's operational mutation paths to Production Chat and the Operations Inbox:

- task assignments publish a live task card to the responsible department and assignee;
- scene status and schedule-sensitive scene edits route to Script, Direction, or Schedule & Calls with acknowledgements when the downstream day can change;
- location and permit changes route to Locations and, when material, Schedule & Calls;
- breakdown blockers route to the owning department plus Safety or Crew Help, while department heads remain confined to their assigned department;
- hiring and invite enrollment create live roster join records without granting authority beyond the assigned role;
- every enrolled production member can issue a Safety alert, while urgent alerts require crew acknowledgement;
- Member and Location are first-class live chat entity cards, so original-author updates render everywhere without screenshots or copies.

Firestore rules mirror these boundaries. Production-wide permissions remain role-owned; the only narrow exceptions are self-enrollment announcements, member-authored Safety alerts, and department-scoped blockers.

## Universal project showcase — implemented

`Afterlight · Plajah Production Showcase` is a versioned, read-only production template installed for each signed-in account when the Film Production suite is opened. It appears in the normal production switcher with a Demo label, but its production records and chat composer are locked.

The showcase includes a connected roster, role authority, four-scene short-film plan, three locations, approved three-day schedule, published call sheets, personalized deliveries, department breakdown with active blockers, budget, tasks, craft service, festival strategy, a finalized DPR, staffing opening, decision, safety alert, Operations Inbox changes, generated production channels, and native live-data chat cards.

“Copy project” creates a separate editable production owned by the user. All production-scoped IDs are rewritten so schedules, call sheets, breakdown occurrences, actions, and deliveries point to the new production while preserving the demonstration data and workflow shape.
