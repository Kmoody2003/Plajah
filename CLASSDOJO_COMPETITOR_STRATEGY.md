# Plajah — The Ancillary Education Platform

**A ClassDojo-class competitor strategy (elementary → high school)**
**Strategy & build plan · June 2026**

> Thesis: ClassDojo, Seesaw, Remind, Bloomz and the LMS incumbents each own *one slice*
> of the school day and force teachers, students, and parents to juggle five disconnected
> apps. Plajah already has the connected substrate none of them have — identity, social
> graph, gamification, portfolios, live video, a safe-content engine, an athlete/creator
> identity that grows with the child, a digital reading library (Lorea), and a portable,
> student-owned record. Plajah doesn't beat ClassDojo by cloning it. It absorbs the entire
> category as one coherent, age-scaling, family-safe layer — the most comprehensive
> *ancillary* educational tool, sitting beside whatever LMS a district already mandates.

---

## 1. The Landscape — Who Owns What, and Where They're Weak

| Competitor | Grade band | What it owns | Core weakness / frustration |
|---|---|---|---|
| **ClassDojo** | K–6 | Behavior points, class story, parent messaging | Babyish for older kids; points feel arbitrary/bribery; no grades, no real portfolio, data not portable |
| **Seesaw** | K–5 | Student work portfolio, parent visibility | Portfolio dies at year-end; weak behavior/communication; paywalled features |
| **Remind** | K–12 | Mass teacher→parent texting | One-way blast only; no portfolio, no behavior, no content; pivoting to paid |
| **Bloomz / ParentSquare** | K–12 | Parent comms, sign-ups, conferences | Admin-comms tool, not a student experience; nothing for the kid |
| **Brightwheel** | Pre-K | Daycare check-in, billing, photos | Bottom of the age range only; no academic continuity |
| **Google Classroom / Canvas** | 4–12+ | Assignments, grades, the LMS of record | Cold, utilitarian; parents barely see it; zero engagement/behavior/portfolio; not the *family* surface |
| **Khan / Prodigy / IXL** | K–12 | Practice content | Content silo; no classroom social, no parent loop, no portfolio of the *whole* child |

**The structural gap:** every incumbent is a *single-function* tool. The teacher runs grades in Canvas, behavior in ClassDojo, portfolio in Seesaw, messaging in Remind, and practice in IXL — five logins, five data silos, five parent notification streams. Nobody owns the **whole child across years**, and nobody is the **family-safe place the student actually wants to be**.

---

## 2. The Top 5 Pain Points — and How Plajah Solves Each

### Pain 1 — "I'm drowning in disconnected apps." *(Teachers)*
Five tools, five gradebooks, five parent-message inboxes; nothing talks to anything.
**Plajah wins:** one platform where classroom + lessons + live sessions + behavior + portfolio + parent messaging already coexist on a shared identity and social graph. A teacher posts once; it lands in the gradebook, the student's portfolio, and the parent's digest simultaneously. *Plajah's existing `ClassroomsView`, Postman messaging, gamification services, and live-video stack are the pieces — they just need to be wired into one classroom surface.*

### Pain 2 — "Points are a black box that bribes my kid." *(Parents + students)*
ClassDojo points are subjective, teacher-invented, and evaporate at year-end.
**Plajah wins:** points map to **real, verifiable artifacts** — a graded submission, a completed lesson, a verified milestone — using the same **verify-then-record trust model** Plajah built for athletes (an achievement is earned against evidence, then permanently recorded). Behavior points become a transparent ledger tied to actual work, not a slot machine. The record is **student-owned and portable** (ties to Creator Passport / the chain record), so it follows the child K→12 and beyond instead of dying in a vendor's database.

### Pain 3 — "I only hear from school when something's wrong." *(Parents)*
Remind/ClassDojo are one-way teacher→parent blasts.
**Plajah wins:** a real **Parent account** linked to the child's living **portfolio** — weekly auto-digests ("here's what Maya made and mastered this week"), two-way classroom-scoped threads, and celebration of positives by default. Postman already provides the messaging primitive; it just needs a classroom-scoped, parent-aware layer.

### Pain 4 — "This feels babyish — my middle/high schooler won't touch it." *(Older students)*
ClassDojo's monsters/avatars cap out at ~grade 5.
**Plajah wins:** the **same account scales up**. The elementary kid's portfolio becomes the middle-schooler's creator profile becomes the high-schooler's **athlete/recruiting profile or creator résumé**. One identity, age-appropriate skin at every stage — Plajah already has the creator tools, Labs (12 science disciplines), athlete profiles, and music/film studios older students actually want.

### Pain 5 — "It's not really my child's record — it's locked in a vendor." *(Everyone)*
Seesaw portfolios and Dojo points are non-portable and vendor-owned.
**Plajah wins:** a **student-owned, portable record** — the portfolio, achievements, and reading progress belong to the family and travel across schools, grades, and platforms (Creator Passport foundation; optional chain anchoring like the athlete achievements). Switch schools, change teachers — the record persists.

---

## 3. Competing With Their Strengths (Not Just Their Weaknesses)

- **ClassDojo's strength is the *daily ritual*** (the class-story check-in parents love). Plajah matches it with a **living portfolio feed** that's richer (real work + behavior + reading + creative output) and safe-by-default for kids.
- **Seesaw's strength is *student work capture*.** Plajah already has media capture, galleries, and creator tools — capture is a solved primitive; Plajah adds the *cross-year continuity* Seesaw lacks.
- **Remind's strength is *reach* (SMS).** Plajah matches with push + email digests, but adds the two-way, context-rich thread Remind never had.
- **Google Classroom's strength is *being the system of record*.** Plajah does **not** fight to replace the LMS — it's the **ancillary family-and-engagement layer beside it**, importing rosters and grades rather than owning them. This is the wedge: districts don't rip out Canvas, but they'll add the free, safe, engaging family layer.

---

## 4. Plajah's Unfair Advantages (Things No EdTech Competitor Has)

1. **A family-safe content engine** — kids accounts with adult-content filtering, maturity gating, kids-mode skinning, and parental screen-time controls built into the *same* platform (see §5). No EdTech competitor has a real media platform to make safe; Plajah does.
2. **Lorea — a built-in digital reading library** — populated with public-domain / Creative-Commons / open-licensed **children's books and learn-to-read tools** (phonics, sight words, leveled readers). ClassDojo has nothing like a library; Plajah turns "20 minutes of reading" homework into a tracked, in-platform experience.
3. **Gamification that's already built** (achievements / points / badges services) — just not yet wired to classrooms. Wiring it is the ClassDojo-killer feature.
4. **Identity that scales K→12→career** — the same account becomes a creator, athlete, scientist (Labs), or musician profile. Engagement that *grows up* with the student.
5. **Verify-then-record trust** — the athlete-achievement model applied to learning milestones makes points trustworthy and portable.
6. **Live video + portfolio + social, already production-grade** — class live sessions, work capture, and a moderated social layer exist today.

---

## 5. Child Safety & Family Controls — The Foundation (build first)

Because the user base includes minors, the safety layer is the prerequisite for everything else.

- **Account types: `PARENT` and `CHILD`.** A parent account links to one or more child accounts (`guardianUid`). A child account is created/managed by the guardian.
- **Safe-by-default for children:** the **adult-content filter is ON by default** and cannot be disabled by the child. Age-gated / restricted / explicit content in Movies, Music, and the social Feed is hidden for child accounts.
- **Maturity gating:** a single `maxMaturity` ceiling (G / PG / PG-13 / TEEN / MATURE) the parent sets; the central content-safety engine filters every surface against it, reading existing content flags (`isExplicit`, `isNSFW`, `ageRestriction`) plus a maturity rating.
- **Auto-hide adult-themed posts:** the Feed runs through the safety filter for child viewers.
- **Kids-Mode skinning (foundation):** a kids-mode flag + safe theme/affordances that can re-skin the entire Plajah experience for a child — bigger, friendlier, fewer adult surfaces, curated entry points (Lorea, Classroom, age-appropriate creation).
- **Timed sessions / screen time:** parent-set daily time limit and allowed hours; when exceeded, the child's session locks behind a parent passcode.

*This foundation is what makes Plajah a place parents trust their kids — the thing no EdTech competitor can offer, because none of them run a media platform.*

---

## 6. The Build Plan (phased)

**Phase 0 — Family & Safety foundation** *(prerequisite)*
- `PARENT` / `CHILD` account types; guardian linkage; `parentalControls` model.
- Central `contentSafety` engine + Feed/Movies/Music adoption.
- Kids-Mode foundation (theme + safe affordances) and parental screen-time guard.
- Parental Controls panel for guardians.

**Phase 1 — ClassDojo core (the daily loop)**
- Wire the existing **gamification** services to classrooms: configurable **behavior/skill points**, awarded against real events (submission, lesson complete, teacher recognition).
- **Attendance** (daily check-in / tardy), real **lesson-completion + progress** (replace the faked `Math.random()` analytics).
- **Class story / portfolio** — the living feed of a child's work + wins.

**Phase 2 — The parent loop**
- Parent portal: each child's portfolio, points ledger, attendance, progress.
- Classroom-scoped two-way **parent↔teacher messaging** + weekly auto-digests + announcements.

**Phase 3 — Reading & content**
- **Lorea children's library**: ingest public-domain / CC / open-licensed children's books + **learn-to-read tools** (phonics, sight words, leveled readers); reading-time tracking tied to classroom + parent visibility.

**Phase 4 — Continuity & portability**
- Student-owned, portable record (Creator Passport / optional chain anchoring); identity scales into creator/athlete/Labs profiles as the student ages up.

---

## 7. Go-to-Market Wedge

1. **Free, safe, and additive** — districts keep their LMS; Plajah is the no-rip-and-replace family-engagement + reading layer beside it.
2. **Win the parent, not the procurement office** — the safe-content + reading library + portfolio is a *consumer* value prop parents adopt directly; teachers follow where parents already are.
3. **Age-up retention** — the one EdTech tool a family never outgrows, because the same identity becomes the kid's creator/athlete/scholar profile. This is the structural moat ClassDojo (capped at grade 5) can never cross.

---

*Companion to the platform's existing classroom system (`ClassroomsView`), gamification services (achievement/points/badge), Postman messaging, Lorea reader, and the Athlete verify-then-record model. Phase 0 (Family & Safety foundation) is built first; subsequent phases build on it.*
