# Plajah Education — The Learner Ledger
### Architecture, safeguards, landscape & novel-ideas blueprint

**Status:** design + Phase-1 foundation (this doc ships with typed code: `data/educationStandards.ts`, `services/learningLedgerService.ts`, `services/accountSafeguards.ts`, and `types.ts` account extensions).
**Thesis:** Plajah becomes the **portable, learner-owned academic ledger for any student on Earth** — pre-school → university, every framework, every setting (classroom, district, private/religious school, homeschool, pod) — sitting *beside* whatever LMS a school already runs, and owning the one thing none of them own: the longitudinal, verifiable, cross-border record of what a human being actually learned.

This extends, and does not replace, the existing strategy in `CLASSDOJO_COMPETITOR_STRATEGY.md`. That doc argued Plajah absorbs the fragmented K-6 comms/behavior category as one age-scaling family-safe layer. This doc adds the **academic spine** under it.

---

## 0. The one-sentence architecture

> A single **append-only Learner Ledger** per student, expressed against a **graph of international standards**, written to by **games, classrooms, creative work, and teacher assessment**, and read through **five lenses** (student / parent / teacher / school-district / the learner-as-adult), portable out as **verifiable credentials**.

Everything below is a consequence of that sentence.

---

## 1. Identity & accounts

### 1.1 The four roles (all already in `accountType`)
- **PARENT** — owns a family; creates/claims children; sees their children's full ledger.
- **CHILD** — a managed sub-account. **The only account type with no email.** Logs in with a **username + password** set by a parent *or* a teacher.
- **TEACHER** — owns classrooms; can *provision* child accounts for a roster; gets **classroom-scoped** visibility only.
- **STUDENT** (self-owning, 13+/16+/18+ per jurisdiction) — a graduated child or an independently-registered older learner. Owns their own ledger.

Today: child = Firestore doc, no login, parent switches into them in-session. We keep that as a convenience, but add **real independent child login** and the **teacher→parent claim lifecycle**.

### 1.2 Child login without an email — the mechanism
Firebase Auth needs an identifier. We give the child one **without ever collecting a real email**:

- **v1 (ship first): synthetic-identifier auth.** Username `maya.r` maps to an internal credential `maya.r@learner.plajah` that the user never sees or types. The parent/teacher sets the password; Firebase stores the hash; **Plajah never stores the plaintext password.** Child types `username + password`; we append the internal domain and call `signInWithEmailAndPassword`. To create the child's auth record *without logging the parent out*, creation runs in a **secondary Firebase app instance** (`initializeApp(config, 'provisioning')`) so the parent's session is untouched.
- **v2 (hardening): custom-token auth.** A Cloud Function verifies `username + password` against a hashed credential record and mints a Firebase **custom token**. No synthetic emails at all; full control of lockout, rotation, and audit. Migrate v1 accounts transparently.

Username rules: globally unique within a namespace, **no full legal name as the public handle**, profanity-filtered, reserved-word blocked. Stored in a `usernames/{username}` lookup doc for uniqueness + reverse-resolution at login.

### 1.3 Teacher-provisioned accounts + the parent-claim lifecycle
A teacher with a roster but no parent emails (the common reality in under-resourced and international schools) can stand a class up in minutes:

```
TEACHER provisions child  ─►  state: SCHOOL_PROVISIONED (walled)
        │                         • school-scoped only: no public social, no DMs,
        │                           no posting, no ads, no marketplace
        │                         • visible to: provisioning teacher (classroom scope)
        │                         • credential: username + teacher-set password
        ▼
Family receives a CLAIM CODE (printed handout / QR, handed home offline)
        │
PARENT claims with code  ─►  proves family link out-of-band, transfers ownership
        ▼
state: PARENT_OWNED        • guardianUid set; parent owns the ledger
                           • teacher keeps CLASSROOM-SCOPED academic view ONLY,
                             and only while the child is enrolled
                           • parent can revoke teacher visibility, export, or delete
```

The **claim code** is the crux: a high-entropy, single-use, expiring token tied to the specific child, delivered to the family **offline by the teacher/school** (not emailed, not guessable). Claiming requires the code *and* an authenticated PARENT account. This stops a stranger from claiming a child by knowing a username.

### 1.4 Stats siloing (who sees what)
One ledger, strict scopes:
- **Child** sees their own game-facing view (XP, badges, "you're getting stronger at…").
- **Parent** sees their *own* children's full ledger; **never** another family's data, never the teacher's other students.
- **Teacher** sees enrolled students' **classroom-scoped academic** data only — mastery against the standards they teach, assignment results, attendance. **Not** the child's home/out-of-school activity, **not** guardian contact info beyond what the parent shares, **not** other classrooms.
- **School/district** sees **aggregated, de-identified-by-default** cohort analytics; named-student access requires role + relationship.
- Multi-guardian (custody, co-parents, pods): a **primary guardian** plus invited **co-guardians** with per-scope grants; disputes escalate to admin. A child can exist in two homes and one school without leaking any of the three to the others.

### 1.5 Lifecycle: graduation to self-ownership
At the age of digital consent (13 US-COPPA / 16 GDPR / varies), the child can be **offered self-ownership**: with guardian sign-off, the account graduates to STUDENT, keeps its entire ledger, and the learner becomes the data owner. The ledger is designed for this from day one — it is *the learner's*, merely *managed* by a guardian while they're a minor.

---

## 1b. Two teaching tracks — Teachers vs Instructors (one shared infrastructure)

Plajah teaching runs as **two parallel tracks that share the same classroom infrastructure** (classes, lessons, assignments, enrollment, live sessions) but are catered to two different worlds:

| | **Teacher · Academic track** | **Instructor · Creator track** |
|---|---|---|
| Who | K-12 / academia educators | Any creator teaching their craft (an artist's photography class, a producer's beat-making course, a tutor) |
| Analog | School / district LMS | MasterClass · Skillshare · tutoring marketplaces |
| Learners | Provisioned/managed **student accounts** (children) | Regular Plajah users who **self-enroll** |
| Identity load | High — verified teacher, student provisioning, claim flow, COPPA/FERPA | Low — no child provisioning, no academic compliance overhead |
| Standards & ledger | Yes — standards-aligned, writes the **Learner Ledger** | Optional — completion/skills, not academic standards |
| Monetization | Typically free / institution-funded | First-class — set a price, the creator-economy split |
| Verification | `teacherVerification` gates student provisioning | None required to publish a course |

**Implementation:** the `Classroom` carries a `track: 'ACADEMIC' | 'CREATOR'` (existing classes default to `CREATOR`); a user's `teachingKind` records `TEACHER` and/or `INSTRUCTOR` (a person can be both). The Teaching tab presents the two as a mode switch:
- **Academic** → the standards/ledger class creator **plus** the student-provisioning panel (verified teachers only).
- **Creator** → the streamlined course creator (title, subject, **price**, lessons) — learners enroll directly; no provisioning.

We are **not** jettisoning the creator-economy classroom — it persists in parallel and reuses the same `Classroom`/lessons/enrollment/grading plumbing, just streamlined for courses. The academic track layers standards + the ledger + managed student identity on top of that shared base.

## 2. Safeguards (the threat model — including the ones not yet thought through)

Children's data is the highest-liability surface on the platform. Treated as a first-class threat model, not a checkbox.

### 2.1 Regulatory floor
- **COPPA (US, <13):** data minimization, **verifiable parental consent**, and **no behavioral advertising to children.** Plajah runs ads — child accounts must be **hard-excluded from the ad + tracking pipeline** (enforce at the ad-serving chokepoint, not the UI).
- **FERPA (US education records):** school-provisioned data is an education record; the school is the data steward until claimed; honor access/correction rights.
- **GDPR-K + UK Age-Appropriate Design Code (and global equivalents):** high-privacy defaults, no dark patterns, no profiling of children, data-portability + erasure.
- **Data residency:** "any student on Earth" implies regional storage obligations (EU, etc.) — design the ledger so a student's records can be region-pinned.

### 2.2 Abuse vectors and mitigations (the part most teams miss)
| Vector | Mitigation |
|---|---|
| Anyone mints "child" accounts to farm data/identities | Only **verified teachers** (school-domain email, district SSO via Clever/ClassLink, or admin approval) can provision; unverified "teacher" gets sandboxed, low-cap powers |
| Stranger claims a child by guessing a username | Claim requires an **offline, single-use, expiring high-entropy code** + an authenticated parent; rate-limited; lockout on repeated failures |
| Teacher retains spying access after the year ends | Teacher visibility is **scoped to active enrollment** and auto-revokes on unenroll/term end; parent can revoke anytime |
| Teacher ↔ child private contact | **No unmonitored private messaging** with provisioned minors; school comms run through logged, parent-visible channels |
| Child escalates their own privileges | Child **cannot** change accountType, guardian, safety settings, add an email, or disable Kids Mode; enforced in Firestore rules, not just UI |
| Credential theft | Plajah never stores plaintext child passwords (Firebase hash / custom-token); login rate-limited; password reset only via parent/teacher (child has no email) |
| Custody / co-parent disputes | Primary-guardian model + co-guardian grants + admin escalation; full **audit log** of who created/claimed/accessed each child record |
| PII leakage in public handles | Usernames may not be the child's full legal name; public surfaces show display name only; email field stays empty and unexposed |
| Orphaned accounts (teacher leaves, never claimed) | Provisioned-but-unclaimed accounts **expire/auto-archive** after a configurable window; school admin can reassign stewardship |
| Ledger tampering | Ledger is **append-only**; corrections are new entries that supersede, never edits; high-stakes assertions are signed |

### 2.3 The audit log
Every create / claim / access / export / delete on a child record writes an immutable `AccountAuditEvent`. This is both a safeguard and a compliance artifact (FERPA access logs). Encoded in `services/accountSafeguards.ts`.

---

## 3. The standards ledger (international by design)

### 3.1 Standards as a **graph**, not a checklist
Most tools store standards as a flat list of checkboxes. We model the **knowledge graph**: each `LearningStandard` has prerequisites, a domain, a grade placement, and **cross-walk edges** to equivalent standards in other frameworks. This is what makes the ledger portable across borders.

Frameworks seeded (extensible registry in `data/educationStandards.ts`):
- **US:** Common Core (ELA + Math), NGSS (science).
- **International:** UK National Curriculum, IB (PYP/MYP/DP), Cambridge Primary/Lower-Secondary, Singapore Mathematics.
- **Cross-cutting proficiency scales:** **CEFR** (languages A1–C2), **PISA** proficiency bands (global benchmarking), and a Plajah-internal mastery scale (0–100) that maps to all of them.

A student who masters "decode CVC words" earns that **competency once**; the ledger renders it as Common Core RF.K.2 *and* UK NC "blending sounds" *and* the relevant Cambridge objective. **Move country, keep your proficiency.**

### 3.2 Proficiency, not points
Internal mastery (0–100) rolls up into **proficiency levels** (`Emerging → Developing → Proficient → Advanced → Turbo`) and maps outward to **PISA bands** and **CEFR** where applicable. Parents and students see "where do you stand — locally and globally," not just a letter grade.

### 3.3 The ledger entry
The atomic unit is an append-only **`LearningRecord`**: *student × standard × evidence × proficiency-delta × timestamp × source*. Sources include game completions (ReadingQuest/MathClassroom), teacher assessments, and **creative artifacts** (a song, a film scene, a Lorea book report scored against a rubric). Roll-ups produce per-standard mastery, per-domain proficiency, and the global benchmark.

High-stakes records (a certified competency, a course completion) become **`CompetencyAssertion`s** — signed, exportable as **Open Badges 3.0 / W3C Verifiable Credentials / Comprehensive Learner Record (CLR)**. This is the bridge to the existing **Creator Passport** work (`[[creator-passport]]`): the learner's record is anchored the same way their creative identity is, and travels with them for life.

---

## 4. Turbo — acceleration *and* depth

"Turbo" is not just "next grade early." Genuine gifted education needs **two axes**:
- **Vertical (acceleration):** when a student demonstrates mastery, unlock above-grade standards — compaction, skip the drill.
- **Horizontal (depth/enrichment):** Bloom's higher tiers, Olympiad/competition-level problems, cross-domain synthesis projects, and "transfer" tasks that apply a skill in a novel context.

Turbo is a **proficiency tier above `Advanced`** in the same scale, plus a **TurboTrack** content layer per domain. It triggers on evidence (sustained high mastery + fast, accurate, low-hint performance), is **opt-in and reversible**, and is visible to parents/teachers as "ready to go beyond." Target: **at minimum Prodigy-class engagement, but with real academic depth Prodigy doesn't attempt** — the differentiator is depth + transfer + creative production, not just more questions.

---

## 5. Teacher tools — the easiest planner + universal interop

### 5.1 Planning as a **diff against the class's live mastery**
The killer feature. A teacher does **not** start from a blank lesson plan. Plajah reads the class's ledger, finds the standards-gaps, and **generates a standards-aligned plan that targets exactly those gaps** — with three differentiated tracks auto-built (**Support / On-Level / Turbo**) and content pre-pulled from Plajah's own stack (ReadingQuest/Math games, Lorea books, Chora music, Labs sims) plus open resources. Planning becomes "approve and tweak," not "create from scratch."

### 5.2 Interoperability as the moat (not a chore)
Be the **universal adapter** so Plajah drops into any school on Earth without rip-and-replace:
- **Rostering:** Clever, ClassLink, **OneRoster 1.2** — import classes/teachers/students in one click (and a path to auto-provision the walled child accounts from a district roster, skipping manual claim where the district consents).
- **Single sign-on:** Google, Microsoft, Clever/ClassLink SSO.
- **Content + grade passback:** **LTI 1.3 / Deep Linking / Assignment-and-Grade Services** so Plajah activities launch from, and report grades back to, Google Classroom / Canvas / Schoology / district LMS.
- **Standards:** **CASE (1EdTech)** to ingest any framework as machine-readable data — this is how the standards graph stays current across states and countries.
- **District data:** **Ed-Fi** alignment for district-scale analytics.

The strategic point from `CLASSDOJO_COMPETITOR_STRATEGY.md` holds: **sit beside the LMS, own the longitudinal learner record the LMS can't.** Interop is what lets us sit beside it; the ledger is what makes us indispensable.

### 5.3 The teacher toolkit (study of best-in-class, reimagined)
Best-of-breed today is fragmented: ClassDojo (behavior), Google Classroom (assignments), Planbook/Common Curriculum (planning), PowerSchool/Infinite Campus (gradebook/SIS), IXL/Khan (practice), Kahoot/Quizizz (formative), Seesaw (portfolio). Plajah's unfair advantage is **one record under all of it**:
- Gradebook + standards-based grading (mastery view, not just %).
- Auto-generated, differentiated lesson plans (5.1).
- Formative checks that write straight to the ledger.
- Attendance + behavior (already shipped in ClassroomDojo) unified with academics.
- Portfolio of **creative artifacts** as assessable evidence (Plajah's moat — see §6).
- Parent comms (2-way, logged) — the ClassDojo wedge, now backed by real academic data.

---

## 6. Deployment contexts — one ledger, every setting

| Setting | What Plajah provides |
|---|---|
| **Classroom / school** | Rostered classes, standards-based gradebook, planner, parent comms |
| **District** | OneRoster/Ed-Fi sync, cohort analytics, framework selection per state |
| **Private / religious / classical** | Framework **overlays** — Catholic/Christian/Islamic/Montessori/Charlotte-Mason/Classical curricula as selectable standard sets layered on or replacing public frameworks |
| **Homeschool** | Parent-as-teacher mode: pick framework(s), auto-plan, the ledger *is* the legally-useful records-of-instruction + a portable transcript |
| **Pods / micro-schools** | **First-class org type:** multiple families, rotating parent-teachers, shared planning, one ledger spanning the pod |
| **University / lifelong** | The graduated learner carries the same ledger; competencies become a verifiable transcript + portfolio for admissions/employers |

Homeschool + pods are usually bolted-on afterthoughts elsewhere; here they're native, because the ledger is **learner-owned**, not institution-owned.

---

## 7. Landscape study — and where Plajah uniquely wins

**Incumbents, by what they own:**
- **ClassDojo / Seesaw** — behavior + portfolio + parent comms (K-6). No academic spine, no standards graph, no record after the year.
- **Google Classroom / Canvas / Schoology** — assignment plumbing + gradebook. Institution-owned, siloed per school, dies when the student leaves.
- **PowerSchool / Infinite Campus (SIS)** — system-of-record for *the district*, not the *learner*; not portable; not engaging.
- **IXL / Khan / DreamBox / Lexia / Prodigy** — adaptive practice. Strong content, single-subject silos, no cross-framework portability, no creative production, no ownership.
- **Credly / Open Badges** — credentials, but disconnected from daily learning.

**The gap nobody owns:** a **single, portable, learner-owned, internationally-interoperable record** that is simultaneously *engaging to a child*, *useful to a parent*, *time-saving to a teacher*, *meaningful to a district*, and *verifiable to a university/employer* — and that **follows the human, not the institution.**

**Why Plajah specifically can take it (unfair advantages):**
1. **Portable identity infra already exists** — Creator Passport (AT-Proto + timestamp anchor) is the exact substrate a learner-owned ledger needs. No edtech has this.
2. **A real creative-production stack** — Chora (music), Pixels (visuals), Fabula (film), Lorea (books). Enables *learning by creating* and *creativity-as-assessment* — impossible to copy quickly.
3. **The family-safety layer is already built** (Phase 0/1: contentSafety, KidsSessionGuard, parental controls) — the hardest compliance groundwork is done.
4. **One-record/many-lenses pattern already proven** in ReadingQuest (one progress model → student/parent/teacher dashboards). Scale it to the whole ledger.
5. **Consumer-grade engagement** — Plajah is a media platform first; it can make academics feel like the rest of the product, not like enterprise software.

---

## 8. Novel ideas — the things nobody is doing well

1. **The learner-owned academic passport.** Your verified record follows *you* across schools, districts, countries, homeschool, and into university/work — anchored like Creator Passport, exported as Open Badges 3.0 / Verifiable Credentials. The category's biggest unclaimed prize.
2. **Standards-as-a-graph with live cross-walks.** Master a competency once; it renders in every framework. Move from Lagos to London to Singapore and your proficiency *travels*. A "Rosetta Stone" for curricula.
3. **Creativity-as-assessment.** Compose a song to prove you understand fractions; film a scene to prove you understand a historical event; the artifact is scored against the standard and stored as evidence. Plajah's media stack makes this uniquely real.
4. **Planning as a diff against live mastery.** Teachers approve auto-generated, gap-targeted, pre-differentiated plans instead of building from blank. Hours back per week.
5. **Global proficiency benchmarking for the individual.** Every student/parent sees a PISA-style "where you stand in the world" band — motivating and meaningful in a way letter grades aren't.
6. **Process-evidence trust in the AI-cheating era.** Because the ledger is longitudinal + multimodal, Plajah trusts *trajectory + creative artifacts + process*, not one-shot tests — and can flag implausible jumps. Authentic assessment as a feature, not a policy.
7. **Pods & homeschool as native org types**, with the ledger spanning multiple families and rotating parent-teachers.
8. **One record unifying SEL/effort + academics.** Extend the ClassDojo behavior wedge into a growth-and-effort ledger sitting *beside* mastery — because effort/growth framing changes outcomes.
9. **A verifiable transcript for any student on Earth** — the equity play. A homeschooler, or a child in a country with weak formal credentialing, can graduate with a globally-verifiable, fraud-resistant record.

---

## 9. Phased roadmap

- **Phase 1 — Foundation (this commit):** standards-ledger data model + seed (`data/educationStandards.ts`), learner-ledger service (`services/learningLedgerService.ts`), identity-safeguards policy as code (`services/accountSafeguards.ts`), account-model type extensions (`types.ts`). Typed, verified, demo-safe; no live auth changes yet.
- **Phase 2 — Identity & safeguards live:** child username/password login (secondary-app provisioning), teacher-provision + parent-claim flow, Firestore rules for the new states, audit log, ad-pipeline child exclusion.
- **Phase 3 — Game build-out + Turbo:** ReadingQuest content fully populated + standards-tagged across all bands; MathClassroom mapped to the ledger; Turbo tracks; benchmark surfacing. Then clone the chassis to Science.
- **Phase 4 — Teacher tools:** standards-based gradebook + the "diff-against-mastery" planner + creative-artifact assessment.
- **Phase 5 — Interop:** OneRoster/Clever/ClassLink rostering, LTI 1.3 launch + grade passback, CASE framework ingestion, Ed-Fi.
- **Phase 6 — Verifiable credentials:** CompetencyAssertion → Open Badges 3.0 / VC export, anchored via Creator Passport; the portable transcript.
- **Phase 7 — Contexts:** pods/homeschool/religious-overlay org types; university/lifelong handoff.

---

## 10. Open decisions to lock (founder input)
1. **Child auth v1 path:** synthetic-identifier (ship fast, client-only) vs. custom-token (needs a Cloud Function, more secure). Recommend v1 now, v2 as hardening.
2. **Teacher verification bar:** school-domain email only, or also district SSO (Clever/ClassLink) at launch?
3. **First international frameworks to fully seed** beyond US (recommend UK NC + Cambridge + IB PYP for reach; Singapore Math for math credibility).
4. **Ad-exclusion enforcement point** for child accounts — confirm the single chokepoint in the ad pipeline.
5. **Credential standard** to lead with — Open Badges 3.0 vs. full CLR (recommend Open Badges 3.0 first).
6. **Data-residency** posture for non-US students (EU pinning at minimum).
