# Plajah — Platform Strategy & GTM (2026)
### Education spearhead · Sports & Creator parallel fronts · per-vertical playbooks

**Author's note (founder reality, kept honest):** Solo-built, no budget, no VC interest, open to *values-aligned* capital only. The road is long and disciplined. Education is the best single shot at adoption (structural distribution + a wedge nobody owns), with equal commitment to Sports and the Creator side. This doc extends `PLAJAH_GTM_PLAN.md` (the creator-first GTM) and `CLASSDOJO_COMPETITOR_STRATEGY.md`, and adds everything built since: the full **Class Points + Education Ledger** stack, the **Academic Passport**, and the **Teacher Console**.

Every section ships in **two versions**: **🌱 Grassroots** (zero-budget, founder-doable today) and **💰 Funded** (when values-aligned money arrives). Lead with grassroots.

---

## 1. Current builds — what actually exists now (GTM refresh)

The creator stack (music/film/writers, Sanctuary memberships, FAST channels, Artist Services, Event PM, Right Now, Debate, Cora music analysis) is documented in `PLAJAH_GTM_PLAN.md`. **New since that doc — the entire education vertical, live in production:**

| Build | What it is | Status |
|---|---|---|
| **Reading Quest** | Pre-K–G7 gamified reading (5 pillars, quiz games, Phoneme Beat), standards-aligned | ✅ live |
| **Science Quest** | NGSS science-practices cartridge on the same engine | ✅ live |
| **Math Classroom** | Grades 1–8, now ledger-wired (Common Core) | ✅ live |
| **Learner Ledger** | Append-only, standards-as-a-graph record; proficiency + global PISA band | ✅ live |
| **Academic Passport** | One portable record across every subject; **verifiable-credential export** (Open Badges 3.0) | ✅ live |
| **Class Points** | Behavior/skill points + attendance + class story + parent view (generic, trademark-safe) | ✅ live |
| **Identity & safeguards** | Parent/Child/Teacher; emailless child login (username+pw via Cloud Run ADC); teacher-provision + parent-claim; COPPA/FERPA threat model | ✅ live (auth via runtime SA) |
| **Two teaching tracks** | **Teacher** (academic) vs **Instructor** (creator-economy courses) sharing one infra | ✅ live |
| **Teacher Console (8 tools)** | Plan-from-Mastery · Planner · Checks (QTI) · Gradebook (CSV) · Assess Work · Reports (print-ready) · Integrations (CASE/Clever/LTI) · Context (homeschool/pods/overlays) | ✅ live |
| **Interop layer** | Inbound CASE import (live) + OneRoster/LTI/Clever adapters; outbound Google Classroom/LTI/QTI/CSV exports | ✅ live (live OAuth pending) |

**The platform now spans 11 verticals:** Chora (music), Reello (short video), Taleo (film/TV), Lorea (books), Sports, Social, Classrooms/Education, Worlds (IP), Business, Plajah Labs (science), Games — over one identity + payments + ledger spine.

---

## 2. Honest reassessment — strengths & weaknesses across the platform

### Strengths
- **The spine no competitor has:** one self-owned, portable identity + record (Creator Passport ⨉ Learner Ledger ⨉ Athlete State Card) that follows a human across *everything they make and learn*, for life. This is the moat.
- **Structural distribution in education:** 1 teacher → ~30 students → ~30 families. The viral coefficient is built into the org chart, not bought.
- **A real creative-production stack** (Chora/Pixels/Fabula/Lorea/Taleo) that makes *learn-by-creating* and *creativity-as-assessment* real — uncopyable by pure-play edtech.
- **Generous economics** (90% creator share; low platform take) and **values features already built** (Pay-It-Forward charitable flow, data-export/ownership).
- **Uncontested beachheads:** Plajah Labs (science-with-live-data), structured Debate, the portable Learner Ledger — nobody is competing here.

### Weaknesses (you named these — here they are squarely)
1. **Breadth is the #1 GTM liability.** 11 verticals = a confused first impression. A musician doesn't care about NGSS; a teacher doesn't need a FAST channel. *(Fix in §3.)*
2. **The narrative is unformed.** "Plajah does everything" is not a story; it's a warning. *(Fix in §3.)*
3. **Cold start, both sides, every vertical.** Supply needs demand and vice-versa.
4. **Zero-to-one trust.** Unknown brand asking for kids' data / creators' livelihoods.
5. **Solo bandwidth + no budget.** Every tactic must be founder-doable and free, or it doesn't happen.
6. **Monetization is broad but unproven** — many streams, ~no paying users yet.

### The reframe
Breadth is only a weakness *at the point of first contact*. After the wedge, breadth is **why people stay and expand** — and the longitudinal record is **why they can never leave**. The job is not to fix breadth; it's to **hide it at acquisition and reveal it at retention.**

---

## 3. The narrative fix — one sentence that makes breadth the moat

> **Plajah is the one place your creative and learning life lives — and it belongs to you, for life.**

The unifying truth: the **Creator Passport** (what you make), the **Learner Ledger** (what you learn), and the **Athlete State Card** (what you achieve) are *the same architecture* — a portable, self-sovereign record. Every vertical is a **lens on that one record**, not a separate app.

- To a parent: *"One record of your child's whole education — owned by you, portable anywhere."*
- To a creator: *"Your work follows you everywhere; nobody can wipe your audience."*
- To an athlete: *"Your grades, film, and stats in one recruiter-ready card."*

**Rule:** never pitch the platform. Pitch the **one wedge** for the audience in front of you, then let the record pull them across verticals. "Everything" is the second date, never the first.

---

## 4. The three-front strategy

| Front | Why | Wedge | Distribution |
|---|---|---|---|
| **🎓 Education (spearhead)** | Structural virality (teacher→class→families); free-wedge credible; portable ledger uncontested | "Free for teachers; one record you own" | Teachers, homeschoolers, pods (bottom-up; no procurement) |
| **🏅 Sports** | Same school, same families; the recruiting-tape-+-transcript card is unique | "Grades + film + stats in one card" | HS coaches/ADs, youth leagues |
| **🎵 Creator** | Highest direct monetization; the lifelong-funnel endpoint | "TikTok made you famous; Plajah makes you money" | TikTok/Reddit creator pipeline |

These three **share one school and one family**. A teacher is also a creator (Instructor track). A student-athlete is a learner. The kid in film school becomes the filmmaker. **It's one funnel with three doors.**

---

## 5. Education vertical — how to get users

**ICP order (easiest cash/loyalty first):**
1. **Homeschool families & micro-school/pod leaders** — *no procurement, decide instantly, pay directly, evangelize hard.* This is the fastest revenue + the warmest community. The platform already treats homeschool/pods as **native** org types.
2. **Individual teachers** (free forever) — the distribution engine. One teacher seeds 30 families.
3. **Faith & classical schools** — the **curriculum overlays** (Catholic/Christian/Islamic/Montessori/Classical/Charlotte-Mason) are a wedge no mainstream edtech offers; tight, evangelistic communities.
4. **Title-I / under-resourced & international schools** — teacher-provisioned emailless accounts + the verifiable transcript = an **equity** story (a globally-verifiable record for any kid). Funded by Pay-It-Forward sponsorship (§6).
5. **Districts** — last, slow, via the interop layer; not the early game.

**The wedge offer:** *free for teachers and the core games forever; one family price that beats any single competitor; you own the record.*

**Acquisition:**
- **🌱 Grassroots:** Live in r/homeschool, r/Teachers, homeschool/pod Facebook groups, classical/Charlotte-Mason forums, teacher-TikTok — *contribute first, never pitch.* Ship one irresistible free artifact per week (below). Offer 50 "Founding Classroom/Pod" slots: free everything for life + a badge + your direct line.
- **💰 Funded:** Teacher-influencer partnerships, homeschool-convention booths, edu-newsletter sponsorships (e.g., homeschool/pod newsletters), small geo-targeted parent ads.

**Irresistible free artifacts (zero cost, founder-doable):**
- A **"what your kid actually knows"** free report (the Academic Passport, generated from a 10-minute placement) — parents share these.
- The **standards-coverage gap finder** (Plan-from-Mastery) as a free teacher tool.
- **"Move countries, keep your proficiency"** demo (cross-framework crosswalk) — viral with international/expat families.

---

## 6. Pricing — the massive undercut + cross-subsidy

### What families actually pay today (researched)
| Tool | Family price | What you get |
|---|---|---|
| **ClassDojo Plus** | $15.49/mo · $109.99/yr | at-home behavior rewards |
| **IXL** | $9.95/mo (1 subj) · $15.95/mo combo · $79–129/yr | practice, 1–2 subjects |
| **Prodigy** | $9.95–$19.95/mo (Core/Plus/Ultra) | math (+ English) game |
| **Time4Learning** | $29.95/mo (PreK-5) · $39.95/mo (6-12) | full curriculum |
| **Seesaw** | school/district only, ~$2–5/student/yr | portfolio (free for teachers) |
| **MasterClass** (creator track) | $15/mo ($180/yr) | celebrity courses |
| **Skillshare** (creator track) | $13.99/mo ($168/yr; promo $60/yr) | creator courses |

**The reality:** a typical engaged family stitches together **IXL + ClassDojo Plus + Prodigy + a reading app = $40–60/mo across 4 disconnected silos**, none of which keep a portable record.

### Plajah's pricing — "everything, for the price of one"
| Plan | Price | Who | What |
|---|---|---|---|
| **Free** | $0 | everyone | Core Reading/Science/Math games, Class Points, parent view, the Ledger | 
| **Teacher** | **$0 forever** | educators | Full Teacher Console (8 tools), provisioning, gradebook, planner, reports |
| **Plajah Learn (family)** | **$7.99/mo · $59/yr** | families/homeschool | All subjects + Turbo + full Academic Passport + verifiable credentials + multi-child |
| **Pod / Micro-school** | **$4/student/mo** (cap) | pods | Family features across the pod + shared planning |
| **School / District** | **$2–4/student/yr** | institutions | Rostering (OneRoster/Clever), LTI, Ed-Fi analytics, admin |

**Undercut math:** one family price (**$59/yr**) beats *any single* competitor and replaces a *$500–700/yr* fragmented stack — and it's the only one that hands you a **portable record you own**. Teachers free (the engine). Districts at **$2–4/student/yr** undercut IXL's $5–10.

### The cross-subsidy (your idea — refined)
**Yes: let Business + the creator-economy take subsidize education so the family/teacher price stays near-zero.** Education is the **adoption, trust, and data-network engine** — it does not need to be the early profit center. Treat it as customer acquisition for the whole platform: the family who comes for free reading stays for Lorea/Chora/Worlds; the verified teacher becomes a paid Instructor.

### Should Plajah+ raise prices to pay for education? — **No.**
Raising the creator/consumer price taxes the very audience you're winning and blurs the value. Instead:
1. **Keep Plajah+ where it is** ($4.99/$9.99/$14.99). Don't make creators pay for schools.
2. **Fund education from Business + the platform take**, and run **Plajah Learn** as its own clean P&L.
3. **Turn the subsidy into a feature — "Sponsor a Classroom."** You already built **Pay-It-Forward.** Let creators, businesses, and parents voluntarily sponsor Title-I/international classrooms (and get the badge + a thank-you from the class story). The cross-subsidy becomes a *values-aligned marketing story*, not a price hike — and it's a wedge into Business and faith communities. **This is the elegant answer.**

---

## 7. How the education stack actually monetizes (+ novel ideas)

**Direct:** ① Plajah Learn family tier · ② Pod/student pricing · ③ School/district licenses (later) · ④ **Instructor track take-rate** (a verified teacher publishes a paid creator-economy course — the bridge from education into the creator economy).

**Indirect / novel (the real edge):**
1. **The lifelong funnel.** Education is the *top* of the creator funnel. The kid who masters music theory (Chora/Lorea), films a scene (Taleo), builds a world (Worlds) — grows into a *paying creator* on the same platform. Monetize the human across 18 years, not the worksheet.
2. **"Plaid for learning records."** License the **portable-ledger API + verifiable-credential verification** to other edtechs, employers, and universities (verify a transcript: small fee). Be the interoperability rail, not just an app.
3. **Consented, aggregate outcome data** as a benchmarking product — *"PISA for everyone"* (anonymized, opt-in). Districts/researchers pay for cohort analytics the silos can't produce because they don't span subjects.
4. **Sponsor-a-Classroom** (Pay-It-Forward) — community/business subsidy as recurring revenue + brand goodwill.
5. **Turbo** as a premium acceleration tier; **creative-artifact portfolio → opportunities** marketplace (student film/song/writing surfaced to the creator economy + scholarships).
6. **Faith/curriculum overlays** as a premium institutional add-on (a paid Catholic/classical strand layered on public standards).

---

## 8. Cross-pollination — Sports (HS + elementary) ↔ the Ed stack ↔ everything

The whole platform shares **one student, one family, one trust graph, one Class Points engine, one record.** That's the cross-sell substrate.

**Headline play — the Student-Athlete Ledger.** Merge the **Learner Ledger** (academics) with the **Athlete State Card** (achievements/stats/film). For the HS athlete chasing recruitment this is *gold*: recruiters want **grades + film + stats in one verified place**, and no one unifies it. *"Your recruiting tape and your transcript, in one card you own."*

**Distribution loops:**
- **Team → classroom → family.** A HS coach brings 20 athletes → who are students (their teachers) → whose families. Sports is a *second bottom-up door into the same school*.
- **Elementary/youth leagues.** Rec coaches use **Class Points** for team effort/behavior; those same families already have kids in Reading/Science Quest → in-family cross-sell.
- **Creativity loop.** Students make **highlight reels & hype videos** (Reello/Taleo) about their sport using **Chora/Pixels** — that's creative practice + portfolio + *creativity-as-assessment* (ledger evidence). Sport becomes a content + learning engine.
- **Fan rooms/archives** (sports) pull the community in; the record keeps them.

**The unifying object:** State Card (athlete) + Academic Passport (learner) + Creator Passport (maker) = **one portable human record.** That single card *is* the platform's narrative and its cross-pollination engine.

---

## 9. Film & Taleo — beyond direct movie sales

Selling movies is one thin line. Taleo's real surface:
1. **Taleo = a film-school cartridge** on the education chassis. Standards-aligned media-arts curriculum; students make films scored against standards (creativity-as-assessment). *Taleo becomes a school product, not just a storefront* — and a Sports/Creator cross-pollinator (highlight reels, hype films).
2. **FAST channels + ad revenue** (24/7 auto-scheduled, owner-set ad markers) — already built.
3. **Taleo Studios subscription** — sell the *tools*, not the films: **Fabula** (NLE) + **Pixels** (render) + distribution as a filmmaker SaaS (vs. Vimeo OTT's $75–100/mo).
4. **Licensing & syndication marketplace** — cross-creator licensing, festival mode (screeners + watermarking), B2B content licensing to brands/other channels.
5. **Ticketed virtual premieres / watch parties** (Right Now social layer) — live, social, monetized screenings.
6. **Branded/sponsored film** + creator↔brand matchmaking (Artist Services).
7. **The lifelong funnel:** the kid in Taleo film school (education) → the indie filmmaker (creator) selling/streaming on Taleo. Education feeds the storefront.

---

## 10. Per-vertical marketing playbooks (head-turning, never crass)

Each: **the Hook** (one attention-grabbing, clever idea) · **🌱 Grassroots** · **💰 Funded**.

### 🎵 Chora (music)
- **Hook — "See the song."** The Breakdown: a song's music-theory staff lighting up in instrument colors *as it plays*. A 15-sec clip of a famous song's theory coming alive is mesmerizing.
- 🌱 Post Breakdown clips of popular songs to r/musictheory, music-teacher TikTok; ship the **"Spotify vs Plajah payout calculator."** DM 20 producers/week.
- 💰 Sponsor music-educator newsletters; micro-influencer producers do Breakdown reaction videos.

### 🎬 Reello (short video)
- **Hook — "Reels that pay rent."** Short-form that actually monetizes the maker (90% share), with a portable audience.
- 🌱 Payout-comparison content; reply-guy in creator-economy threads; founding-creator DMs.
- 💰 Creator-economy podcast reads; small TikTok/IG ad tests.

### 🎥 Taleo (film/TV)
- **Hook — "Run your own 24/7 TV channel. No gatekeepers."**
- 🌱 r/Filmmakers, r/indiefilm, NoFilmSchool, Stage 32 — genuine help + the FAST-channel walkthrough. Festival-mode for circuit creators.
- 💰 Indie-festival sponsorships; filmmaker-newsletter placements.

### 📚 Lorea (books / reader)
- **Hook — "The library that reads itself to your kid."** (kids read-aloud) + "annotated music scores you can sell."
- 🌱 BookTok, homeschool reading groups, library/literacy-nonprofit partnerships; public-domain kids' library as a free magnet.
- 💰 BookTok creators; homeschool-curriculum reviewers.

### 🏅 Sports
- **Hook — "Your recruiting tape and your transcript, in one card."** (Student-Athlete Ledger)
- 🌱 DM HS coaches/ADs; offer free State Cards to a local team; youth-league Class Points pilots; parent groups.
- 💰 Regional sports-org / league sponsorships; AAU/club partnerships.

### 💬 Social
- **Hook — "Right Now — see what your people are into this second."** (kills doom-scroll; solves loneliness)
- 🌱 The loneliness-research narrative + a 20-sec Right Now demo; r/ post on "the antidote to algorithmic feeds."
- 💰 Paid amplification of the Right Now demo to Gen-Z.

### 🎓 Classrooms / Education
- **Hook — "One record that follows your kid from pre-K to college — and you own it."** + "Everything ClassDojo + IXL + Khan — free for teachers."
- 🌱 r/homeschool, r/Teachers, pod/classical communities; the free "what your kid knows" Passport; 50 Founding Classrooms/Pods; the "move countries, keep proficiency" demo.
- 💰 Teacher-influencers; homeschool conventions; edu-newsletter sponsorships.

### 🌍 Worlds (IP / worldbuilding)
- **Hook — "Your story's universe — explorable, not a wiki."**
- 🌱 r/worldbuilding, fan-fic/anime communities; creator-built world showcases (Artist Mode landing).
- 💰 Fandom-creator partnerships; webcomic/indie-author sponsorships.

### 💼 Business
- **Hook — "The page that runs your business *and* funds a classroom."** (Sponsor-a-Classroom tie-in)
- 🌱 Local SMB outreach; the unified ad-dashboard demo; pitch the Pay-It-Forward goodwill angle to mission-driven SMBs.
- 💰 SMB-targeted ads; local chamber-of-commerce partnerships.

### 🔬 Plajah Labs (science)
- **Hook — "Paste a DOI — get live data."** (the enricher auto-attaches NASA/NOAA/NCBI/USGS).
- 🌱 r/science, r/AskScience, science Twitter; pitch science communicators (FAST-channel angle); ResearchGate.
- 💰 Science-org / museum partnerships; STEM-educator sponsorships.

### 🎮 Games
- **Hook — "Games that teach — and the points are *yours*."** (gamified learning; the Class Points / Turbo economy)
- 🌱 Edu-game + homeschool communities; the Phoneme Beat / Turbo-challenge clips; family game-night angle.
- 💰 Family/edu-gaming influencers.

**Cross-vertical mega-hook (the one that grabs without being crass):** the **portable card** — *"Everything you make, learn, and achieve, in one record you own for life."* Demo it as a single shareable Passport. It's the through-line for every channel.

---

## 11. Funding posture — bootstrapped, values-aligned only

No VC (control + values misalignment with a self-sovereign, creator-and-learner-owned mission). Sequence of capital, least-dilutive first:
1. **Revenue** (Plajah Learn family tier + creator take + Business) — the cleanest fuel.
2. **Dogfood SeedRaiser** — crowdfund Plajah *on Plajah*; the community that funds it becomes the first users + the story.
3. **Grants** (non-dilutive, values-aligned): EdTech/literacy/STEM foundations (e.g., education-equity and learning-record grants), arts grants (Chora/Taleo/Lorea), sports-equity grants (youth access), faith-community funds (the curriculum overlays). The **verifiable transcript for any kid on Earth** is a fundable equity thesis.
4. **Mission-aligned angels / impact investors** — people who invest *where values align* (your words): creator-ownership, kid-data dignity, portability.
5. **Strategic partners** — districts, sports orgs, faith networks, homeschool co-ops who co-fund the slice they need.
6. **Pay-It-Forward / Sponsor-a-Classroom** — community + business subsidy as a recurring, values-native funding rail.

**Discipline principle:** every dollar should buy *distribution or trust*, not vanity. Until then, grassroots is the whole game — and it's enough to get the first 100 of each (teachers, athletes, creators).

---

## 12. The disciplined sequence (next 6 months, solo, ~$0)

1. **Pick one wedge per front and go deep** — Education: homeschool/pods. Sports: one local HS team. Creator: music payout-calculator.
2. **Ship one free, shareable artifact/week** (Passport report · payout calculator · Breakdown clips · Student-Athlete card · "move countries keep proficiency").
3. **50 Founding Classrooms/Pods + 1 Founding Team + 10 Founding Creators** — white-glove, free-for-life, your direct line; harvest testimonials.
4. **Turn on Plajah Learn ($59/yr)** for homeschool families — the first clean revenue.
5. **Stand up Sponsor-a-Classroom** (Pay-It-Forward) — the cross-subsidy + the values story.
6. **Let the record do the cross-sell** — every wedge user meets the *one card*, and the breadth becomes the reason they stay.

---

### Sources (competitor pricing, 2025–2026)
- [ClassDojo Plus pricing](https://www.classdojo.com/plus/) · [TrustRadius](https://www.trustradius.com/products/classdojo/pricing)
- [IXL pricing 2025](https://ixl.discount/pricing/) · [IXL cost 2026 (Brighterly)](https://brighterly.com/blog/ixl-cost/)
- [Prodigy membership cost 2026 (Brighterly)](https://brighterly.com/blog/prodigy-membership-cost/) · [Prodigy memberships](https://www.prodigygame.com/Memberships/math/)
- [Seesaw pricing/packages](https://seesaw.com/pricing-packages/)
- [MasterClass review/pricing 2026](https://www.myengineeringbuddy.com/blog/masterclass-reviews-alternatives-pricing-offerings/)
- [Skillshare pricing (myeLearningWorld)](https://myelearningworld.com/skillshare-pricing/)
- [Time4Learning cost 2026 (Brighterly)](https://brighterly.com/blog/time4learning-cost/)

*Internal refs: `PLAJAH_GTM_PLAN.md` (creator GTM), `PLATFORM_ECONOMICS.md` (Plajah+ tiers), `CLASSDOJO_COMPETITOR_STRATEGY.md`, `docs/education/PLAJAH_EDUCATION_LEDGER_BLUEPRINT.md`.*
