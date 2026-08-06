# Plajah Academia — Launch Plan & Oversight Analysis

*School starts in ~2 weeks. Goal: a highly polished, coherent Academia ecosystem that impresses
teachers and parents first, then students — with real educational-safety standards, a Duolingo-style
integrated-language experience, PreK-12 → higher-ed scaling, and demo teacher/parent/child accounts so
anyone can walk the whole loop without signing up.*

## 0. The reframe (good news)

This is **not a build-from-scratch**. The hard, unglamorous foundation is already **live and well-designed** —
the job is to **thread it into one coherent, demoable product** and polish the surfaces teachers/parents see.

**Already LIVE (real Firestore/auth):**
- Account types `STUDENT | TEACHER | PARENT | CHILD` with rich family/education fields.
- **Learner auth without email** (username+password → Firebase custom token), teacher **provisioning** with
  single-use **claim codes**, parent-claim flow.
- **Content-safety chokepoint** (`contentSafety.ts`), **Kids Mode** + screen-time, guardian passcode.
- **COPPA**: children hard-excluded from ads/behavioral tracking. **FERPA**: record-scoping + audit log.
- Reading Quest (Duolingo-style *mechanics* for literacy), a live LMS (`ClassroomsView`), a Learner Ledger.

**The oversights (why it doesn't yet feel like one product):**
1. **The ClassDojo itself is 100% demo/in-memory** (`ClassPointsView` + `classroomStore`) — it never touches
   real classes, students, or the ledger. The signature teacher→student→parent loop lives only in a throwaway demo.
2. **Two disconnected "classroom" systems** — the behavior-points Dojo (demo) vs the live LMS courses
   (`ClassroomsView`) — no shared roster or identity.
3. **No demo teacher/parent/child login.** The only no-signup taste is one Dojo screen. Your "anyone can see how
   it works" ask isn't possible today.
4. **Teacher/parent panels are under-routed** (Dashboard-only): provisioning, parental controls, roster.
5. **Faked analytics** (`ClassroomAnalyticsView` uses `Math.random`).
6. **No multilingual learning** — Reading Quest is English-only (the standards model already has a `LANGUAGE`
   subject + CEFR slot to build into).
7. **Chat isn't education-aware** — no classroom room type, and *anyone can DM anyone* (no student↔student block).

## 1. Beat the incumbents where they hurt (from real ClassDojo/Seesaw complaints)

| Teacher/parent pain (ClassDojo/Seesaw) | Plajah's answer |
|---|---|
| Assignments **get lost** in a mixed announcement feed | **Separate** Assignments from Announcements; assignments have due dates + a clear tab |
| **Glitchy translation** | Reliable, first-class translation — and it feeds the integrated-language experience |
| **Ad / upsell nagging** ("Beyond School" pop-ups) | **Zero ads. No commercial use of student data.** (Already: kids are ad-excluded.) A trust flag teachers can see |
| **Weak parent/child security** (kids getting into parent accounts) | Separate PARENT/CHILD accounts, guardian passcode, claim-code parent verification — already built |
| **Notification overload** (Seesaw approves *everything*) | Smart, batched approvals; digest, not firehose |
| **Needing two apps** (comms + behavior) | One platform: behavior + portfolio + comms + *actual learning content* |
| Babyish for older kids | Same identity scales K → 12 → higher-ed → creator/athlete/Labs profile |

## 2. Educational safety standards to make visible (COPPA + FERPA, incl. 2025 COPPA amendments)

Most of this is **built** — the work is to **surface it as a trust layer** teachers/parents can see, and close the
Phase-2 gaps.
- **Verifiable parental consent** for under-13 (claim-code flow exists — surface it in onboarding).
- **Data minimization** + **no commercial use of student data** + **no ads to students** (built; state it plainly).
- **School-can-consent for education only** (FERPA in-loco-parentis) — teacher provisioning path.
- **Data access / deletion / export** requests (pairs with the student-owned portable record / Learner Ledger).
- **Close Phase-2 gaps:** provisioning-cap enforcement wired to the roster; verify child-account `firestore.rules`.

## 3. Nibbles is forbidden in education *(DONE this pass)*

"Nibbles" = the 18+ couples/intimate DM mode. `intimateGating.isBlockedMinor` now also returns true for
`isEducationAccount` — **students, teachers, school-provisioned children, verified-teachers, and admins can never
enable it**, and classroom rooms (non-PRIVATE) were already excluded. Personal PARENT accounts (adults) are unaffected.

## 4. Phased build plan

### Phase A — Demo teacher/parent/child walkthrough *(the showable centerpiece — build first)*
A no-signup "Tour Academia" mode: pick **Teacher**, **Parent**, or **Student** and drop into a fully-seeded, coherent
class (Ms. Rivera, Room 4B) that threads the *real* surfaces — Dojo points, a class roster, an assignment, a
parent view of one child's week, the Learner Ledger, and a lesson with attached content. Interactive on a
seeded store; nothing persists. This is what wins a 2-week pitch.

### Phase B — Unify the ecosystem (thread the foundation)
- Make the Dojo read a **real roster** (a teacher's `classrooms/` class + provisioned students) instead of only
  `DEMO_CLASS`; write behavior/skill points to the ledger + points service.
- One **Academia hub** that routes the already-built panels (provisioning, parental controls, roster, ledger,
  quests) to top-level nav — no more Dashboard-only burial.
- Replace `Math.random` analytics with `learningLedgerService`.

### Phase C — Education-scoped chat (reuse the chat system)
- Add a `CLASSROOM` room type + `classId`; auto-create teacher↔class rooms and parent↔teacher threads.
- A `canDM(me, them)` policy: **students can't DM students**; parent↔teacher allowed; teacher↔student allowed;
  enforced in UI + `firestore.rules`. Separate **Assignments vs Announcements**.
- Nibbles already excluded (Phase 3 + non-PRIVATE room type).

### Phase D — Teacher content-surfacing (a differentiator no ClassDojo has)
A "**Add to lesson**" picker that pulls Plajah's rights-cleared archives straight into a `Lesson`
(`schoolChassis.ts` `Lesson` already holds `videoId`/`resources[]`/`assignment`):
- **Chora music history + the Vault** (`fetchVaultTracks`, `fetchVaultShelf`, `fetchConservatoryRecordings`).
- **Film history** (`fetchArchiveVideos`, `ARCHIVE_GENRE_SOURCES`, `filmMuseum` halls).
- **Labs arts & history blends** (`artMasters`, `combatAtlasData`, World-History/Architecture/Archaeology views).
- Whole curricula: `CHORA_CURRICULUM`, `FILM_SCHOOL`, `PHOTO_ART_SCHOOL`.

### Phase E — Duolingo-style integrated languages
Extend the Reading-Quest chassis (5-pillar engine, grade bands, streaks/XP, standards→CEFR mapping already
present) into a **languages cartridge**: vocab, translation, listen/repeat, spaced repetition, streaks/leagues —
woven into lessons and offered PreK → higher-ed via CEFR levels. This is the "learn with integrated languages"
experience inside lessons.

### Phase F — Polish for PreK-12 → higher-ed
One age-scaling design: playful for PreK-2, cleaner for middle/high, and a professional mode that flows into
higher-ed/creator courses (`INSTRUCTOR` teachingKind already exists).

## 5. Recommended sequence for the deadline
1. **A (demo accounts)** — the thing you pitch. Highest impact, self-contained.
2. **B (unify hub + real roster + kill faked analytics)** — makes the demo *true*.
3. **C (education chat)** + surface the **safety/trust layer** — teacher/parent confidence.
4. **D (content-surfacing)** — the "only Plajah can do this" wow.
5. **E (languages)** and **F (age-scaling polish)** — depth, as time allows.
</content>
