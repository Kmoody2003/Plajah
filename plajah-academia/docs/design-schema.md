# Plajah Academia — Teacher Account Architecture & OER Assignment Library
## Design Schema v0.1 — August 2026

---

## Part 1: The Integrity Wall (dual-persona teacher accounts)

### Concept

One human, one login, two hard-separated personas:

- **District Persona** — anything connected to their day job: class rosters they teach, district-linked materials, school communications.
- **Independent Persona** — their Plajah creator business: courses, tutoring, ticketed workshops, payout account.

The wall is not a UI toggle — it's enforced at the data layer. Nothing in the Independent Persona can read District Persona data except through the Conflict Check service (below), which returns only boolean answers, never records.

### Firestore data model

```
users/{uid}
  role: "teacher"
  personas: {
    district: { active: true, districtId, schoolIds[], verifiedAt },
    independent: { active: true, creatorId, payoutAccountId }
  }
  integritySettings: {
    campusSilentMode: "auto" | "manual" | "off"   // default: auto
    geofences: [ { schoolId, lat, lng, radiusMeters } ]
    scheduleFence: { enabled, contractHours: [{day, start, end}] }
    disclosureAcknowledged: timestamp             // district outside-employment disclosure prompt
  }

// District persona subtree — Independent services have NO read access
districtPersona/{uid}/rosters/{termId}
  students: [ hashedStudentRef ]    // salted hashes, never raw identity
  schoolId, districtId, expiresAt   // rosters auto-expire at term end

// Independent persona subtree — District context has NO read access
creators/{creatorId}/offerings/{offeringId}
  type: "course" | "tutoring" | "workshop" | "event"
  visibility, pricing, payoutSplit
```

### Conflict Check service (the roster block)

The single bridge between personas. A Cloud Function, callable only by Plajah's checkout and booking flows:

```
conflictCheck(creatorUid, purchaserStudentRef) → { blocked: boolean, reason?: "ROSTER_MATCH" }
```

- At checkout for any **paid tutoring or paid 1:1 offering**, the purchaser's student reference is salted+hashed the same way roster entries are, and compared. Match → transaction blocked with a neutral message ("This educator isn't available to you for paid sessions right now") — never revealing roster membership.
- Broad **course purchases** (public, asynchronous) generate a softer response: allowed by default but flaggable per-district policy, since the ethics opinions center on *personalized paid services to currently-graded students*, not public content. Make this a district-configurable dial: `blockScope: "tutoring_only" | "all_paid" | "all"`.
- Roster hashes expire with the term (`expiresAt`), mirroring the Florida ethics logic: the conflict exists while the teacher has grading power over the student, and ends when the term does.
- Free interactions are never blocked — a teacher answering a former student's question isn't a conflict.

**Privacy note:** rosters live as salted hashes so even a full DB read can't reconstruct which students a teacher teaches. FERPA posture: Plajah never ingests raw student rosters — teachers (or a district integration) submit pre-hashed references via an SDK, so no education records touch Plajah's servers in identifiable form.

### Campus Silent Mode (the geofence)

Purpose: while a teacher is physically at their school (or within contracted hours), their Independent Persona goes dormant — no selling, no notifications, no storefront edits — so there is never a question of running a side business on district time or grounds.

Behavior when tripped:
1. Independent dashboard locked behind an interstitial: "Silent Mode — you're on campus. Your creator tools resume when you leave."
2. Push/email notifications from Independent Persona suppressed and queued.
3. Storefront stays **live to the public** (buyers unaffected) but the teacher cannot transact, message, or edit.
4. All entries/exits logged to `integrityLog/{uid}` — this log is the teacher's own defense artifact: exportable proof they never operated on campus.

Trigger stack (defense in depth, because geolocation alone is spoofable and battery-dependent):
- **Geofence** — Capacitor Geolocation + native geofencing APIs on Android; browser Geolocation with polling on web/desktop.
- **Schedule fence** — contracted hours block regardless of location (covers field trips, GPS failures).
- **Network hint** — optional: known district Wi-Fi SSIDs/IP ranges as a secondary signal.
- **Manual toggle** — one tap "I'm at school" / "I've left," always available; auto mode is default but manual overrides upward (can always ADD silence, can't remove an auto-triggered one until the fence clears or a 30-min cooldown passes).

Failure posture: if location is unavailable, fall back to schedule fence. Never fail open during contracted hours.

### Disclosure assist

At Independent Persona activation: a one-screen prompt summarizing that most districts (including Detroit PSCD) permit outside employment but expect disclosure and prohibit use of district time/resources, with a generated PDF disclosure letter the teacher can hand to HR. Store `disclosureAcknowledged`. Cheap to build, huge trust signal, and pre-empts the most common way teachers get in trouble.

---

## Part 2: Standards-aligned assignment library

### Correction on PISA — and the right layering

PISA is the OECD's *assessment framework* for 15-year-olds (reading, math, science literacy + rotating domains like creative thinking and Learning in the Digital World). It defines proficiency levels and competencies — it is **not a curriculum with grade-by-grade scope and sequence**, so it can't be the primary skeleton for a K-12 assignment library. The right structure:

- **Spine:** Common Core (ELA + Math) and NGSS (science) — these are what U.S. teachers actually plan against, they're free to use, and OER is already tagged to them.
- **Overlay:** PISA proficiency levels as a *competency layer* on grades 6–10 assignments — "this task exercises PISA Math Level 4 (formulating situations mathematically)." This is a genuine differentiator: no mainstream U.S. platform tags to PISA, and it gives Plajah international portability (PISA is the shared language across 80+ countries) plus a rigor signal for parents.
- **Seed items:** OECD/NCES publish released PISA items from past cycles with scoring rubrics — usable as exemplar tasks and for calibrating difficulty. (Verify OECD's terms for redistribution vs. linking before ingesting verbatim; framework alignment requires no license at all.)

### OER sources to ingest (license-checked)

| Source | Coverage | License | Commercial-use OK? | Notes |
|---|---|---|---|---|
| **CK-12** | K-12 math, science, ELA, social studies (FlexBooks) | CC BY-NC | **No** — non-commercial | Link out / free-tier only; cannot sit behind Plajah paid features without a separate agreement with CK-12 |
| **OpenStax** (Rice Univ.) | HS/AP + college: Algebra, Calculus, Biology, Physics, etc. | CC BY | **Yes** | Best-in-class quality; remixable into paid products with attribution |
| **EngageNY / Eureka Math** | Full K-12 math + ELA curricula | CC BY-NC-SA | **No** | Same posture as CK-12 |
| **Utah OER (UEN)** | K-12, standards-aligned, built for re-alignment | Mostly CC BY | **Yes** (check per-item) | Explicitly designed to be revised to other standards |
| **Mathematics Vision Project** | Secondary math | CC BY | **Yes** | Strong integrated-math sequence |
| **Saylor Academy** | ~100 full courses, HS-adaptable | CC BY | **Yes** | Includes practice questions |
| **Project Gutenberg / Standard Ebooks / DPLA** | Literature, primary sources | Public domain | **Yes** | The ELA reading backbone — zero restrictions |
| **PISA released items** (OECD/NCES) | Math, reading, science tasks + rubrics | OECD terms | Verify | Exemplars + difficulty calibration |

**The licensing architecture that matters:** tag every ingested item with its license at the record level, and let the license drive placement — CC BY and public-domain items can power paid Plajah Academia features; CC BY-NC items live only in the free tier or as outbound links. Getting this wrong is a real legal exposure; getting it right is invisible plumbing.

```
libraryItems/{itemId}
  source, sourceUrl, license: "CC-BY" | "CC-BY-SA" | "CC-BY-NC" | "CC-BY-NC-SA" | "PD"
  commercialOk: boolean          // derived from license, drives tier placement
  attribution: string            // pre-composed, rendered wherever item appears
  shareAlike: boolean            // derivatives of BY-SA content must stay BY-SA
  subjects[], gradeBands[], standards: [{framework: "CCSS"|"NGSS"|"PISA", code}]
```

### Assignment template schema

One template model across all subjects; subject packs are configurations, not new code:

```
assignmentTemplates/{templateId}
  subject: "ela" | "math" | "science" | "socialStudies" | "worldLang" | "arts"
  gradeBand: "K-2" | "3-5" | "6-8" | "9-12"
  taskType: "practiceSet" | "readingResponse" | "labReport" | "essay" |
            "projectBrief" | "exitTicket" | "quiz" | "discussion"
  structure: {
    objective,                    // teacher-editable learning objective
    standardsAlignment[],         // CCSS/NGSS codes + optional PISA level
    materials[],                  // links into libraryItems (license-filtered)
    steps[], differentiation: { support, extension },
    rubric: { criteria: [{name, levels[]}] },   // pre-built per taskType
    estimatedMinutes
  }
  remixOf: templateId | null      // provenance chain for teacher remixes
  license: inherited-most-restrictive-of-materials
```

Teacher flow: pick subject → grade band → task type → get a populated template with license-appropriate materials suggested → edit → assign (District Persona, free) **or** package into a paid course (Independent Persona, CC-BY/PD materials only — the license filter applies automatically at the wall).

That last line is where Parts 1 and 2 meet: the same wall that separates the personas also separates what content may cross into commercial use.

---

## Part 3: Build difficulty, natively in Plajah

Honest sizing against the existing React/TS/Vite + Capacitor + Firebase stack:

| Component | Difficulty | Est. effort | Notes |
|---|---|---|---|
| Dual-persona data model + security rules | Moderate | 2–3 wks | Mostly Firestore security-rules discipline; the design above maps directly |
| Conflict Check service | Moderate | 1–2 wks | One Cloud Function + hashing SDK; the hard part is district onboarding UX, not code |
| Campus Silent Mode | Moderate-hard | 2–3 wks | Capacitor geofencing on Android is well-trodden; web fallback is polling + schedule fence; battery/permission edge cases eat the time |
| Disclosure assist | Easy | 2–3 days | One screen + PDF generation |
| OER ingest pipeline (first 3 CC-BY/PD sources) | Moderate | 2–3 wks | Scraping/parsing + license tagging + standards mapping; OpenStax and Gutenberg have clean formats |
| Standards taxonomy (CCSS + NGSS + PISA overlay) | Moderate | 1–2 wks | CCSS/NGSS codes are published and structured; PISA overlay is a manual mapping exercise for ~grades 6–10 first |
| Assignment template engine + editor | Moderate-hard | 3–4 wks | The template schema is simple; the editor UX is the real work |
| **Total, one strong full-stack dev** | | **~3–4 months** | Or ~6–8 wks for a v1 that ships the wall + Silent Mode + one subject (Math, OpenStax-powered) |

Recommended v1 slice: **Integrity Wall + Conflict Check + manual Silent Mode + Math templates from OpenStax/MVP (CC BY only)**. That's the trust story and one complete subject — demoable to Detroit teachers on the street, per the GTM plan. Geofencing auto-mode, the full subject matrix, and the PISA overlay are v1.1+.

Open blocker carried from previous sessions: brand/design tokens still haven't been provided, so any UI built for this inherits placeholder tokens.
