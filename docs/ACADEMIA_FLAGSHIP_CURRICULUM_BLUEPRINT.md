# Academia Flagship Curriculum Blueprint

The research-grounded plan for Plajah Academia's flagship course programs — Financial Literacy, Economics, Real Estate, American + Comparative Civics, Philosophy — each scaling PreK→adult, anchored to verified open educational resources, and built ON TOP of what Plajah already ships (Praxis, Learner Ledger, quests, OER machinery, Terra, Labs, Aria). Companion to `ACADEMIA_SESSION_HANDOFF.md`.

Date: 2026-08-25. Research: four background agents (finance/econ OER · civics/philosophy OER · real-estate OER · code inventory). Sections fill in as each lands.

## The rule of construction (user directive)
**Study what exists first; integrate and build on top.** Praxis IS the business school (8 interactive stages incl. Books = P&L accounting, Fund = capital ladder, Grow = credit + unit economics; founder bands; real-vs-simulate; Aria watchers). The Learner Ledger + standards graph is the record. The OER license gate is the ingestion chokepoint. Terra is the real-estate lab. Lectio's parser is the primary-source-study template. ageScaling bands drive PreK→adult scaling.

## Licensing regimes (load-bearing — governs every ingest decision)
1. **Public domain + CC BY** (FDIC, CFPB, SEC/FTC, US Gov works; OpenStax *Principles of Finance*; Saylor course shells) → ingest freely, even commercially.
2. **CC BY-NC / BY-NC-SA** (NGPF, OpenStax econ/accounting/entrepreneurship 3e, Siegel & Yacht, MIT OCW) → hostable ONLY if the Academia OER shelf stays genuinely noncommercial (free, no ads against it, never fee-gated — consistent with the existing "textbooks are NEVER paid" policy + `oerTextbookStaysFree()` rules). SA derivatives inherit the license. Route everything through `services/oerLicenseGate.ts`.
3. **ND licenses** (CORE Econ BY-NC-ND, MRU BY-ND) → embed verbatim with attribution; never adapt.
4. **All-rights-reserved standards docs** (CEE/Jump$tart 2021 National Standards, CEE Voluntary Econ Standards) → align + cite + link; never host. Encode as frameworks in `data/educationStandards.ts` (facts/alignment tags, not the text).
5. Gotcha: NGPF's Shutterstock/Getty images are EXCLUDED from its CC BY-NC — ingest requires an image-scrub pass. OpenStax econ moved CC BY (2e) → CC BY-NC-SA (3e); archived 2e stays CC BY if a commercial-safe econ text is ever needed. Verify every license upstream at ingest time (the OpenStax-license lesson: never assume a publisher has one license).

---

# Program 1 — Financial Literacy: "Money, Cradle to CFO"

## Source spine (ranked, licenses verified)
**Tier 1 — hostable spine (public domain / CC BY):**
- **FDIC Money Smart** (PreK-2 / 3-5 / 6-8 / 9-12 / Young Adults / Adults 14 modules / Older Adults / Small Business w/ SBA) — US Gov public domain, explicitly editable. THE only single source spanning PreK→adult→business-owner. Games suite (playmoneysmart.fdic.gov) = link-only. Ships bilingual (EN/ES).
- **CFPB youth suite** — Building Blocks framework (executive function → habits/norms → knowledge, ages 3-5/6-12/13-21) + activity database + Money as You Grow (parent prompts by age) + Your Money Your Goals (adult coaching) + credit-report/score pubs — all public domain. **The pedagogical skeleton for the whole program.**
- **OpenStax Principles of Finance** — CC BY 4.0 (rare full-BY business title) — the corporate-finance textbook, commercially safe.
- **Saylor Academy** BUS103/105/202, ECON101/102 etc. — CC BY course architecture (embedded readings re-check; exam banks NOT licensed).
- **SEC Investor.gov + FTC credit pubs + MyMoney.gov (FLEC "My Money Five")** — public domain.
- **FRED** — free API (attribution; some third-party series restricted; filter by series copyright field).

**Tier 2 — NC/SA (host on the free shelf only):** OpenStax Principles of Economics 3e + Accounting Vol 1/2 + Entrepreneurship (all CC BY-NC-SA); **NGPF** full 6-12 personal-finance curriculum (CC BY-NC 3.0 — better than its reputation; scrub stock images); Siegel & Yacht *Personal Finance* (CC BY-NC-SA); MIT OCW 15.401/15.501/14.01/14.02 (CC BY-NC-SA, full lecture video).

**Tier 3 — embed/link only:** CORE Econ (BY-NC-ND), MRU videos (BY-ND, embed whole), St. Louis Fed Econ Lowdown (Reserve-Bank proprietary; Permitted Use = whole-item noncommercial embed + link), Dallas Fed Building Wealth, EconEdLink (link), Khan Academy (link), FINRA/Jump$tart Clearinghouse (link). CEE/Jump$tart 2021 standards + CEE econ standards = align/cite/link only.

## Architecture: 6 strands × 6 bands
Strands ①Earning & Income ②Spending & Budgeting ③Saving & Investing ④Credit & Debt ⑤Risk, Insurance & Protection ⑥**The Money of Business** (entrepreneurial finance → accounting → corporate finance — the ladder that differentiates Plajah). Strands 1-5 mirror the 2021 CEE/Jump$tart topics so every lesson carries a standards tag. CFPB Building Blocks is the developmental logic (PreK-2 executive function; 3-8 habits/norms; 9+ decision-making).

| Band | Anchors | Plajah plug-in |
|---|---|---|
| PreK-2 | Money Smart PreK-2 sequenced by CFPB Building Blocks; Money as You Grow 3-5 | Kids-mode; **Aria reads parent money-prompts** via parent accounts |
| 3-5 | Money Smart 3-5 + CFPB activities; SEC intro saving | **First Praxis micro-venture** (lemonade sim: price/cost/profit); Ora goal-tracking |
| 6-8 | NGPF Middle School (scrubbed) ⨉ Money Smart 6-8; FTC/CFPB credit basics; compound-interest labs | Paper-trading "training wheels" (index only); Praxis venture w/ first real P&L |
| 9-12 | **NGPF full course** (the 30-state-mandate workhorse) + Money Smart 9-12/Young Adults as the fully-hostable track; CFPB credit modules; OpenStax Entrepreneurship (fin. chapters) | Full paper-trading sandbox + Aria debriefs; **Praxis Three P's capstone (Strand ⑥ IS Praxis)**; Ledger records for mandate states |
| College/Adult | Siegel & Yacht + Money Smart Adults + Your Money Your Goals; OpenStax Finance begins | Aria adult money-coach (education only — never personalized investment advice); creator-income money mgmt (Sanctuary tie-in) |
| Professional | Money Smart Small Business → OpenStax Accounting 1&2 → OpenStax Finance → MIT OCW 15.401/15.501 → Saylor shells | **Praxis capital ladder**: double-entry books on your OWN venture; read your own statements; simulated raises; WACC on your own cap table |

# Program 2 — Economics: "How the World Works, PreK → University"
Aligned to CEE's 20 Voluntary Standards (benchmarks gr. 4/8/12 — cited/linked, not hosted); college hands off to OpenStax/CORE/MIT.
Strands: ①Scarcity & Choice ②Markets & Prices ③National & Global Economy ④Money, Banking & the Fed ⑤**Economic Data & Reasoning (FRED)** ⑥Systems, Institutions & Policy.

| Band | Anchors | Plajah plug-in |
|---|---|---|
| PreK-2 | CFPB scarcity/choice activities; Econ Lowdown picture-book lessons (link) | Kids-mode goods-and-services games |
| 3-5 | Money Smart 3-5; EconEdLink/Econ Lowdown elementary (link); first FRED price-over-time graph | Praxis micro-venture doubles as markets lab |
| 6-8 | Econ Lowdown MS modules (link) + NGPF econ (NC) + MRU intro embeds; **FRED dashboard-lite** (CPI/unemployment) | Live FRED-API widgets in lessons; class prediction games |
| 9-12 (AP) | **MRU Principles Micro/Macro embeds (AP-aligned)** + OpenStax Econ 3e/AP (NC); Fed monetary-policy resources; FRED data projects | Paper trading = market mechanics; Praxis = marginal cost is YOUR cost; AP-streak stat cards |
| College | OpenStax Micro/Macro 3e (hostable core) + CORE Economy 2.0 (modern linked track) + Saylor ECON101/102 shells | Aria econ tutor grounded in the hosted corpus; Ledger course records |
| Advanced | MIT OCW 14.01/14.02 + intermediate/grad (NC-SA, lecture video); CORE ESPP policy track; BLS/BEA/FRED empirics | FRED research notebooks; Labs "Findings" social layer for student analyses |

## Educator hooks (finance/econ)
1. **The mandate wave, turnkey**: 30 states require a standalone personal-finance course (76% of students by class of 2031) — pre-tagged to every 2021 CEE/Jump$tart benchmark w/ printable per-state alignment matrices.
2. **Fully public-domain spine** = no paywall creep, no login walls, printable everything, bilingual, legally bulletproof.
3. **Learn accounting by running a company** — double-entry books on your own Praxis venture; the P&L you read is your own. FDIC Small Business → OpenStax Accounting → live venture sim in one ladder exists nowhere else.
4. **Econ with real data, live** — FRED widgets in K-12 lessons; replay the 2008/2020 shocks from real series.
5. **The whole-family loop** — CFPB Money as You Grow through Plajah parent accounts, Aria delivering age-keyed money conversations while the child progresses; Ledger credentials at the end.

---

# Program 3 — Full-Stack Real Estate: "Plajah Real Estate School"

**Strategic opening (verified):** there is NO comprehensive open "Real Estate Principles" licensure textbook anywhere — the field is proprietary (Brueggeman/Fisher etc.). The open pieces exist as law casebooks + finance texts + MIT lecture notes + federal PD material. **Plajah can assemble the FIRST truly open full-stack real-estate curriculum.**

## Source spine (licenses verified 2026-08-25)
**Tier 1 hostable:** **MIT OCW 11.431J RE Finance & Investment + 11.432J RE Capital Markets (REITs/MBS/CMBS) + 11.433J RE Economics** (all CC BY-NC-SA — the actual MSRED core, lecture notes/problem sets/exams downloadable); **OpenStax Principles of Finance** (CC BY — TVM/pro-formas math substrate, even for paid tiers); **CFPB Your Home Loan Toolkit** (PD, publishes co-branding instructions inviting reuse) + IRS Pubs 527/523/936/946 (PD) + **HUD/FHA** SF Handbook 4000.1 + fair-housing + PD&R research (PD) + FDIC Money Smart "Your Own Home" (PD); **Sustainable Property Management** (VT, CC BY-NC-SA); **Open Source Property casebook** (CC BY-NC) + **eLangdell Land Use** + property casebooks (CC BY-NC-SA); Saylor BUS202 shells (CC BY structure; exam banks NOT reusable).
**Tier 2 data (powers Terra labs):** **Detroit Open Data Parcels (Current)** — daily-updated assessor feed, open-data EO 2015-2, Terra already ingests (recommend a one-line city confirmation for at-scale redistribution); Census/ACS housing (PD); FHFA HPI (PD); FRED housing series (API, third-party series restricted); Zillow ZHVI/ZORI (display-w/-attribution "Data Provided by Zillow Group" on every page, never bulk-mirror).
**Link-only:** Fannie HomeView / Freddie CreditSmart (free certificates — the "get an industry-recognized cert" exit ramp), **USPAP (strictly proprietary — teach ABOUT it, never host)**, Lincoln Institute, Urban Institute, PSI exam bulletin (topic LISTS are facts — build the syllabus to them), APA. **All exam banks authored in-house.**

## Architecture: 6 strands × 5 levels (Terra is the lab at every level)
Strands: S1 Property & Home · S2 Agency & Transactions · S3 Valuation & Appraisal · S4 RE Finance & Investment · S5 Development & Planning · S6 Markets, Data & Policy.
- **L1 Foundations (MS/newcomer):** what owning means; comps as a game; read a neighborhood (ACS). **Terra: "Adopt a Parcel"** — every student picks a real Detroit parcel; assessed value, lot, sale history from the live feed. Property becomes a real thing on a real map.
- **L2 Consumer (HS/adult):** the full homebuying journey — CFPB Toolkit hosted as interactive lessons; fair housing (HUD); mortgage math from OpenStax TVM. **Terra: "Could I afford this block?"** — a real Loan Estimate against live FRED rates. Exit ramp: HomeView/CreditSmart certificates (linked).
- **L3 Licensure Prep (career): Michigan Salesperson Track first** (Terra is Detroit-based; template for other states) — syllabus mapped 1:1 to the PSI national outline's 11 topic areas + 35 MI-specific items, each taught from open sources; **every math drill uses real parcels** (prorations, transfer tax, commissions on actual Detroit sale records).
- **L4 College/Investor:** appraisal approaches (11.431 + FHA protocol; USPAP taught-about); full DCF/cap-rate/NPV/IRR/leverage arc; rental tax & depreciation; property ops. **Terra capstone: "The Detroit Pro Forma"** — 10-year DCF on a real income parcel w/ real taxes, ZORI rents, FRED rates; defend buy/pass.
- **L5 Professional/Corporate:** REITs, MBS/CMBS, waterfalls (11.432); land economics & regulating development (11.433); housing-finance policy. **Terra: "Assemble a Site"** — multi-parcel assembly in a real corridor, zoning check vs the city dataset, development pro forma, mock CMBS-underwriting memo.
Cross-cutting: property-law mini-casebook threads L3-L5; **Praxis reuses the L4 investor track**; L1-L2 ship as classroom packs via Teacher Tools.

## Educator/professional hooks (real estate)
1. **Real-parcel, real-numbers coursework** — "underwrite this actual building on Woodward" against a live daily municipal feed beats every textbook's fictional 123 Main St.
2. **MIT's actual MSRED core, restructured** — the sequence MIT charges ~$90k to sit, legally hosted/adapted, wrapped in Terra data labs.
3. **The first open licensure-prep track** — pre-license is a ~$200-500 slideshow industry; a free exam-outline-mapped Michigan track is genuine disruption + a CTE-pathway flagship.
4. **A public-domain consumer core districts can trust** — CFPB+FDIC+IRS: government-vetted, unbiased, license-clean.
5. **First rent check → CMBS waterfall in one ladder** — the L5 memo on the same Detroit asset the student "adopted" at L1 is a story people retell.

License guardrails: NC-SA (MIT/eLangdell/VT) stays on the free shelf w/ share-alike; CC BY + PD unrestricted; USPAP/Lincoln/Urban/GSE/PSI never hosted; Zillow attribution on every derived chart; exam banks in-house.

# Program 4 — American Civics: "The Long Argument of Liberty"

## Source spine (licenses verified 2026-08-25)
**Tier 1 hostable (PD / CC BY):** OpenStax **American Government 3e** (CC BY — the base text) + **Intro to Political Science** (CC BY — comparative backbone); **National Archives** founding docs + DocsTeach activities (PD); **Constitution Annotated / CONAN** (PD — clause-by-clause case-law treatise, free); **Project Gutenberg** (Locke, Montesquieu-Nugent, Federalist, Common Sense, Mill — strip PG header/footer, trademark-only license); **Wikisource** (Magna Carta, 1689 English Bill, Mayflower Compact, Winthrop/Mayhew sermons — check per-page banners, user translations are CC BY-SA); **Library of Congress** (per-item rights); **CIA World Factbook** (PD — comparative data layer); **The American Yawp** (CC BY-SA); Saylor POLSC shells (CC BY 3.0). Foreign founding texts effectively PD/official: France 1789+1958 (Conseil constitutionnel EN), PRC 1982 Constitution EN (PRC Copyright Law Art. 5 excludes official translations), Japan 1946 EN (PD, 1946), Brazil 1988 (STF official EN), UK as-enacted texts (OGL v3). Argentina BCN EN PDF = host cautiously. German Basic Law EN translation = LINK-ONLY (commissioned translation).
**Tier 2 (NC/SA free-shelf):** MIT OCW 17.20 + comparative (BY-NC-SA); **Constitute Project** (CC BY-NC — EXCLUDES Hein/OUP/IDEA-sourced texts, check per constitution); China Law Translate (NC site policy, link/ask).
**Link-only:** **iCivics** (proprietary; terms forbid rehosting AND AI-training use — games still free+excellent for learners), Bill of Rights Institute, Annenberg Classroom videos (embed), We the People (its simulated-congressional-hearing METHOD is unprotected pedagogy — reimplement), C3 Framework PDF (no CC confirmed — use the Inquiry Arc as pedagogy, link the PDF), NCC Interactive Constitution, Founders Online annotations (letters PD, annotations copyrighted), Avalon (finding aid only — source PD texts from Gutenberg/NARA), MLK "Letter from Birmingham Jail" (NOT PD — the one link-only spine text).

## Architecture: 5 strands × 5 bands
Strands: I Foundations of Liberty (intellectual history) · II Structure of Government · III Rights & the Citizen · IV Civic Action · V The Living Constitution. **Every cell carries a primary-source spine entry — learners touch the actual documents at every age.**
- K-2: class constitution, community helpers, "a very old promise" (NARA hi-res parchment); spine = the 52-word Preamble chanted/illustrated + one Mayflower Compact sentence.
- 3-5: Magna Carta as story, 3 branches as a game (iCivics linked), one amendment/week in kid language, petition unit; spine = Magna Carta cl. 39-40, Declaration's 2nd sentence, First Amendment verbatim.
- 6-8: Locke consent + Montesquieu separation in **Bennett/Early-Modern-Texts modernized excerpts** (rights FAQ permits rehosting w/ attribution!); 1689 Bill vs US Bill side-by-side; mock trial/legislature; spine = full Declaration, Art. I-III abridged, Federalist 51 excerpt, Douglass "What to the Slave…" excerpt.
- 9-12: the full BEFORE-America canon (Locke 2nd Treatise 2/9/19, Spirit of Laws XI.6, Magna Carta, 1689, Winthrop, Mayhew 1750, Cato's Letters, Common Sense) + OpenStax AmGov 3e restructured; Federalist 10/51/78 vs Brutus I; C3-style informed-action capstone; spine = the DURING canon complete (all 27 amendments, Washington's Farewell, Seneca Falls, Gettysburg, Lincoln's 2nd Inaugural).
- College/Adult: intellectual-history seminar (Aristotle→Founders full texts), CONAN clause-by-clause, moot court, Founders Online correspondence.

**THE mechanic — the Telescoping Text:** each canonical document exists ONCE with band-tagged excerpt views (K-2 sentence → 3-5 paragraph → 6-8 page → 9-12 full+gloss → college full+apparatus). Same document ID, same permalink, age lens. Legally possible only because the spine is 100% PD — nobody else has built it. Implementation chassis: Lectio's parser/decoration machinery.

## Comparative Civics template (per nation: Founding Texts · Government Structure · Rights Tradition · Civic Life Today)
UK (Magna Carta→1689→unwritten constitution, OGL) · France (1789 Declaration, 1958, laïcité) · Germany (Paulskirche 1849 PD as the "before" → Basic Law linked; militant democracy; bpb as the model) · China (1912 provisional PD as contrast → 1982 EN official; text-vs-practice taught as compare-the-text) · Japan (1889 Meiji PD → 1946 PD — a unique before/after pair; Art. 9) · Brazil (1824 → 1988 Citizen Constitution, longest rights catalogue; participatory budgeting) · Argentina (1853/1994; amparo; Nunca Más memory culture). Data layer: Factbook (PD) + Constitute side-by-sides (NC, link where needed) + OpenStax IPS concepts. Every module's capstone: *"Read their founding text next to ours — what did they promise, and how is it kept?"*

# Program 5 — Philosophy: "The Examined Life"
**Hostable spine:** OpenStax **Introduction to Philosophy** (CC BY, includes Indigenous/Indian/Chinese traditions); **forall x: Calgary** (CC BY — full formal logic); **Wi-Phi videos (CC BY-NC-SA — SA not ND, so clippable/subtitlable!)**; PD translations ONLY pre-1930 (Jowett Plato, Nugent Montesquieu, Meiklejohn/Abbott Kant, Elwes Spinoza) + **Early Modern Texts w/ attribution** (Locke/Hume/Kant/Mill modernized — the HS readability bridge). Modern scholarly translations (Cooper, Guyer-Wood, Cohler) = NEVER ingest, cite as further reading. **Link-only:** SEP (confirmed NOT open — exclusive Stanford distribution), IEP, PLATO P4C lessons (permission required — but the community-of-inquiry METHOD is unprotected, reimplement), 1000-Word Philosophy, NHSEB ethics-bowl cases (write original Plajah cases).
**Ladder:** PreK-2 wonder circles (P4C community of inquiry, picture-book prompts) → 3-5 structured P4C (question-of-the-week; Aesop PD prompts) → 6-8 argument literacy (fallacies; Euthyphro/Crito STAGED AS DRAMA from Jowett; Wi-Phi; forall x ch.1-2 leveled) → 9-12 Ethics Bowl + TFL logic + OpenStax survey + EMT moderns → College full program (Ancient→Early Modern→19th c. history sequence + branch courses; MIT OCW 24.xx + Saylor shells as structure; SEP/IEP the linked reference layer).
**The bridge:** college Political Philosophy and Civics Strand I are THE SAME shared units — Locke's Second Treatise lives once, serving both programs.

## Educator hooks (civics/philosophy)
1. **The Telescoping Text** (see above) — the flagship claim.
2. **"Read the World's Promises"** — US First Amendment beside Germany Art. 5, Japan Art. 21, Brazil Art. 5-IV, China Art. 35: actual constitutional text, not summaries.
3. **Before America, 1215–1776** — the prehistory of liberty as a connected arc almost no US curriculum teaches, built from hosted PD texts.
4. **Philosophy from age 4** — one platform, wonder circles → proofs → seminars, the same inquiry ritual at every band.
5. **"This text belongs to everyone"** — every core reading printable/remixable with zero permission anxiety, stamped on every page; a marketing weapon where iCivics/BRI/Annenberg say "look, don't touch."

---

# Platform integration map — VERIFIED by code inventory (2026-08-25)

## Already built — WIRE, don't rebuild
- **Praxis** (`data/praxisJourney.ts`, `components/praxis/PraxisView.tsx` 1403L, route `PRAXIS`) — all 8 stages interactive; Books = live P&L w/ margins + cash-vs-accrual; Fund = full capital ladder w/ dilution calc; Grow = CAC/LTV verdicts + personal-vs-business credit + MONEY_MOVES (safety net, SEP-IRA, index funds, honest crypto risk). **Orphaned: single nav entry (AcademiaHomeView, edu accounts only); zero ledger writes; no standards.** = The Business School AND FinLit Strand ⑥, ready today.
- **FILM SCHOOL** (`components/FilmSchoolView.tsx` 777L + `data/filmSchoolCurriculum.ts` 1585L, route `FILM_SCHOOL`) — 8 tracks Foundations→Acting on the school chassis; every watchAlong a VERIFIED public-domain film on archive.org; every lesson ends in a Fabula assignment. "The single most complete course in the repo." Plus `TaleoFilmMuseum.tsx` (6 halls on MuseumHall) + TALEO_HISTORY. **Gap = discoverability only** (back-navs to MOVIES_TV; invisible from Academia; bespoke PLAJAH-FILM framework, no NCAS media-arts seeded).
- **MUSIC CONSERVATORY** — `ChoraConservatory.tsx` (route `CHORA_CONSERVATORY`): 6 tabs (Hall/History/**Curriculum** w/ real `MU:` NCAS ids, 6 tracks incl. "Sampling and the Law"/Instruments/Repertoire/Public Domain) + `MusicTheoryStudio.tsx` (route `MUSIC_THEORY`: 7 lessons × NOVICE/INTERMEDIATE/MAESTRO + WebAudio ear training + score reader). **Gap = wiring** (back-navs to MUSIC; Theory Studio off-chassis, no ledger; NCAS-Music not in educationStandards).
- **Terra** (9 components + 17 services, ALL status live; routes TERRA/TERRA_MAP/TERRA_STUDIO/…) — Detroit parcel spine **377,863 parcels daily**, RESO client, OLR, zoning `envelopeEngine` (`computeEnvelope`/`checkCompliance`), **ParcelStudio 3D massing + shadow study on R3F**. Shipped product, ZERO education layer — the RE course scaffolds learners through these tools.
- **Museum engine** — `MuseumHall.tsx` (halls+figures, Wikipedia REST portraits) proven across Film/Combat/Art/Music/History. Philosophers' Hall = another instance.
- **Primary-source reader chassis** — Sacred Library `FAITH_TEMPLATE`/`FAITH_WINGS`/`FaithWing.tsx` + Lectio `LectioReader` (635L)/SutraReader + crossReferences. **The proven template for Civics Hall + Philosophy readers (the Telescoping Text implementation chassis).** Gutenberg shelf ALREADY carries Common Sense, Douglass's Narrative, Walden.
- **Labs** — PlajahLabsView (16 tiles), 12 data-driven ScienceDiscipline studios, bespoke WorldHistory (w/ PRIMARY_SOURCES: LoC/Wikisource/Perseus/DPLA…)/Architecture/Archaeology/CombatAtlas (2587L data, 94 owned assets), ArtGallery (live Met+AIC open access w/ fail-closed edu filter), Solar System/Human Body(2423L)/Plant Biology modules, 6 sport explainers, Comic/WorldCup museums.
- **Quests** — Reading/Science/History/Math write the ledger (History's C3 codes bucket as "General" — fix via standards seeding); Language Quest = CEFR + SM-2 spaced repetition (no ledger yet).
- **Teacher Tools** — heatmap gradebook, Plan-from-Mastery, rubric assessment, CASE/LTI/QTI/Classroom interop. **Learner Ledger** — append-only + verifiable credentials, knows only ELA/SCIENCE/MATH today.

## THE THREE LOAD-BEARING BUILD FACTS
1. **`services/schoolChassis.ts` is the course engine.** Curriculum→Track→Lesson (body, videoId, watchAlong, assignment.tool, resources, standardIds); `markLessonComplete` already writes ledger records (`source: 'school-lesson'`). Film School, Photo-Art School, Chora curriculum ride it today. **Every new program = a new Curriculum data file on this chassis** (finlitCurriculum.ts, econCurriculum.ts, civicsCurriculum.ts, realEstateCurriculum.ts, philosophyCurriculum.ts) — NOT new components.
2. **`data/educationStandards.ts` is the chokepoint.** Zero SOCIAL/civics/econ/finlit/NCAS standards seeded. Seeding C3 (civics), CEE/Jump$tart topics (finlit), CEE econ, NCAS-Music, NCAS-Media-Arts instantly upgrades History Quest + Chora Curriculum + Film School from "General" bucketing to real roll-ups AND is the prerequisite for all five new programs' credentials.
3. **Discoverability is the real bug, not content.** Praxis, Film School, Conservatory, Music Theory, Combat Atlas, Terra, Ledger, the Sky, Sacred Library are ALL shipped and ALL invisible from the Academia landing. The Front Row landing's job is to surface them (LIVE badges) beside the new programs.

## Other verified gaps
- **Paper trading / portfolio sim: does NOT exist anywhere** — must be built (FinLit 6-8+ anchor; `stockQuoteService.ts` exists for quotes).
- **Four uncoordinated level systems** — ageScaling `AgeBand` (used in 2 files), quest `BandId`, Praxis `FounderBand`, MusicTheory `Difficulty`. New programs should key on ageScaling's `ageBandFor` + extend, and a reconciliation pass is warranted.
- Philosophy: thinnest — zero content; Perseus listed in PRIMARY_SOURCES; MuseumHall + wing template ready.

## Build order (recommended)
1. Seed frameworks/standards (C3, CEE-FinLit topics, CEE-Econ, NCAS-Music, NCAS-Media) in educationStandards.ts + wire Praxis/MusicTheory/LanguageQuest → ledger.
2. Ship the upgraded Front Row landing (artifact done: https://claude.ai/code/artifact/8e466c20-7773-4847-a05b-f203141fb6dd) as the real `AcademiaLandingView` replacement, surfacing everything live.
3. Author `finlitCurriculum.ts` on the schoolChassis (FDIC/CFPB spine; Strand ⑥ deep-links into Praxis chapters).
4. `civicsCurriculum.ts` + the Telescoping Text reader (Lectio chassis) + founding-docs Gutenberg/NARA ingest.
5. `econCurriculum.ts` (+ FRED widgets), `realEstateCurriculum.ts` (Terra labs), `philosophyCurriculum.ts` (+ Philosophers' Hall).
6. Paper-trading sandbox (new build; serves FinLit + Econ).

---

# STEP 1 — SHIPPED (2026-08-25): standards seeded + Praxis on the Ledger

Branch `feat/academia-hub`. All touched files esbuild-clean; graph audited (no duplicate ids, no dangling prerequisites, no unknown frameworks).

## 1. `data/educationStandards.ts` — the chokepoint opened
- **`Subject` extended:** `+ FINLIT | ECON | CIVICS | PHILOSOPHY | REALESTATE` (safe — all three consumer maps are `Partial<Record<Subject,…>>`).
- **7 frameworks added** (14 total): `C3_SOCIAL`, `CEE_FINLIT`, `CEE_ECON`, `NCAS_MUSIC`, `NCAS_MEDIA`, `PLAJAH_RE`, `PLAJAH_PHIL`.
- **101 standards added** (136 total). Distribution: ELA 17 · SCIENCE 10 · MATH 8 · SOCIAL 12 · CIVICS 16 · ECON 21 · FINLIT 20 · ARTS 16 · REALESTATE 9 · PHILOSOPHY 7.
- **`C3_SOCIAL` is byte-identical to `data/historyQuestData.ts` `C3_FRAMEWORK_ID`**, and the `D2.His.*` ids mirror it exactly → History Quest records now roll up by domain instead of bucketing under "General". Verified: `D2.His.1.K-2 → Chronology & Context`, `D2.His.14.6-8 → Causation & Argument`.
- **`MU:*` ids mirror `data/choraCurriculum.ts`** → Conservatory completions roll up (verified `MU:Cr1.1 → Creating — Imagine`, `MU:Cn11.0 → Connecting — Context`). **`MA:*`** added for Film School (was the bespoke `PLAJAH-FILM`).
- Grade spans map to terminal grade (K-2→g2, 3-5→g5, 6-8→g8, 9-12→g12); CEE benchmarks sit at g4/g8/g12.
- **Licence posture honoured:** CEE/Jump$tart/NCSS/NCAS documents are all-rights-reserved — we ALIGN and CITE only; every `statement` is a learner-facing paraphrase authored for Plajah, never hosted standards text. `PLAJAH_RE` / `PLAJAH_PHIL` are explicitly labelled Plajah-authored because no open national standard exists for those fields.

## 2. Praxis → Learner Ledger (the orphan fixed)
- `services/learningLedgerService.ts`: `LearningRecordSource += 'praxis'`.
- `services/praxisService.ts`: new **`PRAXIS_STAGE_STANDARDS`** map + **`recordPraxisMastery(uid, stageKey, band)`**. Mastery eases toward a founder-band target (new 72 / some 80 / pro 88) via `before + (target-before)*0.5`, so repeated engagement converges instead of jumping to full marks off one completion; never records a regression; fully swallowed errors (a ledger hiccup must never block a founder).
- `components/praxis/PraxisView.tsx`: `completeChapter` now calls it alongside `awardPraxisPoints`.
- **All 8 stages resolve** to seeded standards: spark→CEE.ECON.14.12 · validate→CEE.ECON.7.12 · form→PFL.RISK.12 · books→PFL.BIZ.12 + PFL.BIZ.ACCT · operate→PFL.BIZ.12 · comply→PFL.RISK.12 · fund→PFL.BIZ.FIN · grow→PFL.CREDIT.12 + PFL.INVEST.12 + CEE.ECON.15.12.

## 3. New subjects made visible
`LearnerLedgerView` SUBJECT_META, `TeacherToolsView` SUBJ_LABEL, and `services/skyGraph.ts` SUBJECT_ANCHOR all extended, so the new subjects render in the Academic Passport, the teacher gradebook, and get their own constellations in the Sky.

## NOT done in step 1 (next up)
- **Not browser-verified** — compile + data-graph audit only. A signed-in Praxis run should be exercised to confirm live Firestore ledger writes.
- `MusicTheoryStudio` and `LanguageQuest` still write no ledger records (both now *have* standards to write against).
- Film School still declares framework `PLAJAH-FILM` in `data/filmSchoolCurriculum.ts` — switch to `NCAS_MEDIA` ids to activate roll-ups.
- Step 2 remains: ship the upgraded Front Row landing as the real `AcademiaLandingView`.

---

# LOOSE ENDS CLOSED + STEP 2 SHIPPED (2026-08-25)

## Loose ends (all three closed)
1. **Film School → NCAS_MEDIA.** Its 59 bespoke `FILM.*` ids across 8 tracks were seeded into the graph *generated from `data/filmSchoolCurriculum.ts` itself*, so every `statement` is the lesson's own learning claim, each carrying a `crosswalk` to its NCAS `MA:*` anchor. `curriculum.framework` flipped `'PLAJAH-FILM'` → `'NCAS_MEDIA'`. Chose this over collapsing 59 lessons into ~9 NCAS codes — that would have thrown away the track-level granularity the curriculum already earned.
2. **Music Theory Studio → ledger.** 7 `THEORY.*` standards seeded under `NCAS_MUSIC` (NOVICE→g5, INTERMEDIATE→g8, MAESTRO→g12), crosswalked to `MU:*`. `markComplete` now appends a record for signed-in learners (target 82, eased 0.6).
3. **Language Quest → ledger.** New **`CEFR`** framework + 6 standards keyed `CEFR.<level>.<lesson id>` mirroring `data/languageDecks.ts`. The session handler appends a record whose target is the learner's **actual session accuracy**, so a shaky run records honestly rather than granting full marks.

**Graph after:** 208 standards / 15 frameworks. Audited clean — no duplicate ids, no dangling prerequisites, **no dangling crosswalks**, no unknown frameworks. All six wired courses resolve (History Quest, Chora, Film School, Music Theory, Language Quest, Praxis).

## Step 2 — the Front Row landing is now the real `AcademiaLandingView`
`components/AcademiaLandingView.tsx` rebuilt from the verified artifact, same props contract so both `App.tsx` call sites work untouched. Scoped `<style>` block (matches `AcademiaHubView`).
- **Hero + PreK→Professional scaler** — 6 bands; every school card rewrites its description for the selected band.
- **Schools front row** (8 cinematic covers, snap-scroll + arrows): Business School→`PRAXIS` · School of Money→`PRAXIS` · Real Estate→`TERRA` · Civics Hall→`HISTORY_QUEST` · Economics→`ACADEMIA_COURSES` · Philosophy→`SACRED_LIBRARY` · Music Conservatory→`CHORA_CONSERVATORY` · Film School→`FILM_SCHOOL`. LIVE badges on the three that are genuinely shipped.
- **Museums & Labs rail** (12 cards) surfacing the previously-invisible shipped work: Human Body, Solar System, Plant Biology, Combat Atlas, Science Studios, Art Galleries, Reading/Science/Language Quests, Math Classroom, Music Theory, the Sky.
- **The Telescoping Text** spotlight — the Preamble at five zoom levels, auto-cycling.
- **Why educators switch** (6 cards) + credential strip → `LEARNER_LEDGER`. Demos tab retained via `AcademiaDemosView`; education accounts keep a portal shortcut to `ACADEMIA_HOME`.

**BROWSER-VERIFIED** on localhost:3000: all 8 schools render, 12 lab cards, 3 LIVE badges, the scaler genuinely rewrites copy (`"The full Praxis journey…"` → `"Run the class store…"`), and clicking Business School navigates into Praxis. Console clean (only preview-proxy 403s). Every `nav` value validated against the `AppView` union — `COMBAT_ATLAS` isn't one (Combat Atlas lives inside `PlajahLabsView`), so that card routes to `PLAJAH_LABS`.

## Still open
- Praxis/MusicTheory/LanguageQuest ledger writes are compile- and route-verified but **not exercised against live Firestore** (needs a signed-in run).
- The flagship curricula themselves (finlit/econ/civics/realestate/philosophy `Curriculum` files on `schoolChassis`) are the next build — the landing currently points those four schools at the nearest shipped surface.
- Paper-trading sandbox still doesn't exist.

---

# STEP 3 — SHIPPED (2026-08-25): the School of Money

The first flagship curriculum, authored on the shared School chassis exactly as the build rule requires (a `Curriculum` data file, not a new engine).

## What shipped
- **`data/finlitCurriculum.ts`** — `MONEY_SCHOOL`, framework `CEE_FINLIT`. **6 strands / 16 lessons**, every lesson carrying real multi-paragraph teaching prose (no stubs), `standardIds`, authoritative `resources` and an `assignment`.
  - Strands 1–5 mirror the 2021 CEE + Jump$tart topics: Earning & Income · Spending & Budgeting · Saving & Investing · Credit & Debt · Risk & Protection.
  - **Strand 6, "The Money of Business"**, is the differentiator: its three lessons (How a Business Makes Money · Keeping the Books · Unit Economics and the Cost of Capital) are *done inside Praxis* — the P&L the learner reads is their own venture's.
- **`components/MoneySchoolView.tsx`** — thin shell over `<SchoolView>`; the header states the educator pitch in five seconds (strand/lesson count, CEE + Jump$tart alignment, public-domain spine, and an explicit "education, not advice" line).
- **Route `MONEY_SCHOOL`** added to the `AppView` union + `App.tsx` lazy import and render block.
- **Landing wired**: the School of Money card now routes to `MONEY_SCHOOL` and carries a **LIVE NOW** badge — it is no longer pointing at the nearest shipped surface.
- **Chassis extended**: `LessonAssignment.tool` gained `'PRAXIS'`, and `SchoolView` routes/labels it, so a lesson can deep-link straight into the venture simulator ("Open Praxis"). This is the first assignment tool that hands a learner to another *school* rather than a studio.

## Licence posture held
The spine is public domain (FDIC Money Smart, CFPB youth + adult toolkits, SEC Investor.gov, FTC, MyMoney.gov, IRS/SBA) — which is what lets the course promise free, printable, no login wall. The CEE/Jump$tart standards **document** is all-rights-reserved: every `body` is original prose written for Plajah and `resources` link out to the government original rather than mirroring it. Nothing reproduces standards text.

## Verification
- Compile-clean: `finlitCurriculum.ts`, `MoneySchoolView.tsx`, `AcademiaLandingView.tsx`, `App.tsx`, `types.ts`, `schoolChassis.ts`, `SchoolView.tsx`.
- Data audit: **19 standard tags, 0 unresolved** against the seeded graph; 0 lessons with thin prose; tools used = `NONE` + `PRAXIS`.
- **BROWSER-VERIFIED** on localhost:3000: landing shows 8 covers with School of Money carrying its LIVE badge → clicking it opens the school → all 6 strands render with the alignment and public-domain claims → expanding "The Money of Business" and opening "How a Business Makes Money" shows the teaching prose, the assignment, the resources and the **Open Praxis** button. Console clean (only preview-proxy 403/HMR noise).

## Next
- Author the remaining flagship curricula the same way: `civicsCurriculum.ts` (+ the Telescoping Text reader on the Lectio chassis), `econCurriculum.ts` (+ live-data widgets), `realEstateCurriculum.ts` (+ Terra parcel labs), `philosophyCurriculum.ts` (+ a Philosophers' Hall on `MuseumHall`).
- Paper-trading sandbox (serves FinLit Strand 3 and Economics) still does not exist.
- Ledger writes across Praxis / Music Theory / Language Quest / school-chassis completions remain **not exercised against live Firestore** — one signed-in run would close that out.

---

# STEP 3b — SHIPPED (2026-08-25): Civics Hall + the Telescoping Text

The second flagship curriculum, and the first to ship its **signature mechanic as working software** rather than a described idea.

## The Telescoping Text is real
**`data/foundingDocuments.ts`** — **9 documents × 5 zoom levels = 45 complete entries**, all public domain: Preamble · Magna Carta 39–40 · Locke's Second Treatise · English Bill of Rights 1689 · Declaration of Independence · Federalist 51 · First Amendment · Douglass 1852 · Gettysburg Address.

Each zoom carries **real text plus a teaching lens** — the lower bands do NOT paraphrase the document away, they quote a shorter *true* fragment and frame it, so a five-year-old still touches the actual words. Verified live: K–2 renders `"We the People…"`, College renders the full Preamble, switching document serves Magna Carta clause 39 verbatim.

Translations are pre-1930 where translation is involved; no modern scholarly translation or annotated edition is included, since those carry their own copyright.

## The curriculum
**`data/civicsCurriculum.ts`** — `CIVICS_HALL`, framework `C3_SOCIAL`. **5 strands / 13 lessons**, 26 standard tags, all resolving against the seeded `D2.Civ.*` graph:
- **I Foundations of Liberty (4)** — the *before-America* arc almost no curriculum teaches as connected: Magna Carta → Locke's consent → the 1689 English settlement → the Declaration read as a legal brief.
- **II Structure of Government (3)** — Federalist 51's design principle, **Brutus and the Anti-Federalist case** (taught as a real argument that was genuinely contested), and how a law is *actually* made vs the textbook diagram.
- **III Rights & the Citizen (2)** — the First Amendment's five freedoms and who it actually binds; due process traced from clause 39 to incorporation.
- **IV Civic Action (2)** — Douglass's "holding a country to its own words" move; then the C3 informed-action capstone on a real local issue.
- **V The Living Constitution (2)** — the Second Founding, and **how a constitution should be read**, taught as the unresolved argument it is.

**Teaching posture, stated in the file header and honoured in the prose:** contested questions are taught as contested. Where Americans genuinely disagree, the lesson presents the strongest version of more than one position and asks the learner to argue both before choosing. The Declaration lesson does not route around the contradiction between "all men are created equal" and its authors' slaveholding — it teaches what happened to the sentence afterwards.

## Wiring
- **`components/CivicsHallView.tsx`** — two tabs: **The Texts** (the Telescoping reader: document list, band selector, the quoted text, the lens, a link to the public-domain original) and **Curriculum** (`<SchoolView>`).
- Route `CIVICS_HALL` added to the `AppView` union, `App.tsx` lazy import + render block.
- **Both `MONEY_SCHOOL` and `CIVICS_HALL` added to `handleGlobalNavigate`** — found in review that the `NAVIGATE` CustomEvent path silently no-ops for targets missing from that chain (the landing's direct `onNavigate` prop always worked; the event path did not).
- Landing card now routes to `CIVICS_HALL` with a **LIVE NOW** badge.

## Verification
- Compile-clean across all six touched files.
- Data audit: 13 lessons, **26 standard tags, 0 unresolved**, 0 thin lessons; 9 docs × 5 bands, **0 incomplete zooms**.
- **BROWSER-VERIFIED**: Civics Hall renders with all 8 document titles, all 5 bands, the C3 and public-domain claims; the zoom selector genuinely swaps text; document switching works; all 5 strands render on the Curriculum tab. Console clean (preview-proxy 403/HMR noise only).

## Remaining flagship curricula
`econCurriculum.ts` (+ live-data widgets) · `realEstateCurriculum.ts` (+ Terra parcel labs) · `philosophyCurriculum.ts` (+ a Philosophers' Hall on `MuseumHall`). Paper-trading sandbox still unbuilt. Ledger writes still not exercised against live Firestore.

---

# STEP 3c — SHIPPED (2026-08-25): Real Estate School

The third flagship curriculum, and the one with a genuine market opening: **no comprehensive open real-estate curriculum exists anywhere**. The open pieces (MIT OCW's real-estate sequence, OpenStax finance, federal consumer material, open property-law casebooks) had simply never been assembled. This is that assembly — and its homework runs on live parcels.

## What shipped
- **`data/realEstateCurriculum.ts`** — `REAL_ESTATE_SCHOOL`, framework `PLAJAH_RE`. **6 strands / 14 lessons**, 16 standard tags all resolving, no thin lessons.
  - Property & Home (2) · Agency & Transactions (3) · Valuation & Appraisal (2) · Finance & Investment (3) · Development & Planning (2) · Markets, Data & Policy (2).
  - Ladder runs first-rent-cheque → consumer homebuying → agency/fair housing → the three valuation approaches → pro formas, leverage and return measures → REITs/CMBS/waterfalls → zoning envelopes and residual land value → submarket analysis and the policy layer.
- **`components/RealEstateSchoolView.tsx`** — chassis shell with an "Open Terra — adopt a parcel" entry and the disclaimers stated up front.
- **`TERRA` assignment tool** added to the chassis + `SchoolView` (alongside `PRAXIS`), so lessons deep-link into the parcel tools.
- Route `REAL_ESTATE_SCHOOL` in the `AppView` union, `App.tsx` lazy import + render block + `handleGlobalNavigate` branch; landing card rewired from `TERRA` to the school with a **LIVE NOW** badge.

## The lab is real — 10 of 14 lessons run on Terra
Assignments say "open this actual parcel", not "imagine a property". Learners adopt a real Detroit parcel and carry it through the whole ladder: read its record → comp it → build a ten-year pro forma with its **actual assessed taxes** → compute its **legal buildable envelope** via Terra's zoning engine → run a residual land value → profile its submarket from public data. The `computeEnvelope`/`checkCompliance` engine and Parcel Studio's 3-D massing already existed; this is the curriculum that scaffolds a learner through them.

The Development lesson deliberately teaches Terra's **refusal to guess** (missing dimensions, overlays, historic districts and PDs produce explicit blockers) as the correct professional posture — a zoning analysis that assumes away what it doesn't know is worse than none.

## Licence posture held
Public domain carries the consumer tier (CFPB toolkit, HUD/FHA, IRS pubs, Census, FHFA). MIT OCW and open casebooks are CC BY-NC-SA and stay on the free shelf. OpenStax Finance (CC BY) is the maths substrate. **USPAP is taught about and never reproduced** — it is a copyrighted professional standard sold by its publisher. Lincoln Institute, Urban Institute, GSE courses and PSI bulletins are link-only; all practice questions are authored in-house. Zillow-derived figures require attribution wherever displayed. Disclaimers (not legal advice / not an appraisal / not a zoning determination / not investment advice) are rendered in the header.

## Verification
- Compile-clean across all five touched files; data audit shows 0 unresolved standards, 0 thin lessons, 10 Terra-lab assignments.
- **BROWSER-VERIFIED**: the school renders with all 6 strands, the live-parcel and source claims, the disclaimers and the Terra button; opening "Zoning and the Buildable Envelope" shows the real body prose, the Parcel Studio assignment and the **Open Terra** action.
- ⚠️ **Verification note worth keeping:** my first pass reported the lesson reader as open when it was not — the checks had matched the lesson *blurb* in the track listing and the *header's* Terra button. Re-tested by clicking the actual lesson row and asserting on body-only strings. When verifying a reader, assert on text that can only exist inside it.

## Three flagship schools now live
Money · Civics · Real Estate. Remaining: `econCurriculum.ts` (+ live-data widgets) and `philosophyCurriculum.ts` (+ a Philosophers' Hall on `MuseumHall`). Paper-trading sandbox still unbuilt; ledger writes still unexercised against live Firestore.

---

# STEP 3 COMPLETE (2026-08-25): all five flagship curricula shipped

| School | id | Framework | Strands | Lessons | Tags |
|---|---|---|---|---|---|
| School of Money | `money-school` | CEE_FINLIT | 6 | 16 | 19 |
| Civics Hall | `civics-hall` | C3_SOCIAL | 5 | 13 | 26 |
| Real Estate School | `real-estate-school` | PLAJAH_RE | 6 | 14 | 16 |
| School of Economics | `econ-school` | CEE_ECON | 6 | 13 | 25 |
| School of Philosophy | `philosophy-school` | PLAJAH_PHIL | 4 | 9 | 12 |
| **TOTAL** | | | **27** | **65** | **98** |

**Audit across all five: 0 unresolved standards, 0 thin lessons.** Every lesson carries real multi-paragraph teaching prose, standard tags, authoritative resources and an assignment.

## Economics — the live-data school
`data/econCurriculum.ts` + `components/EconSchoolView.tsx`, route `ECON_SCHOOL`. The differentiator is that macro lessons name the **actual public series to pull** rather than reproducing a stale chart — this month's CPI, this month's unemployment, the real policy rate. The capstone builds a live dashboard from FRED/BLS/BEA with axis labels, sources and a stated uncertainty. Teaching posture: where the profession is genuinely divided (minimum wages, trade, stimulus, price controls) the course teaches the mechanism and the evidence and says the disagreement is real; where there is broad agreement it says that too. GDP is taught **with** its limits (unpaid work, distribution, depletion) rather than as a wellbeing score.

## Philosophy — age 4 to seminar
`data/philosophyCurriculum.ts` + `components/PhilosophySchoolView.tsx`, route `PHILOSOPHY_SCHOOL`. The ladder: wonder circles → structured inquiry → argument literacy and fallacies → Socrates staged from the actual Apology → formal logic on `forall x` → ethics frameworks → ethics bowl → the early-modern knowledge crisis → liberty. **The same community-of-inquiry ritual recurs at every band**, which is what makes it one ladder rather than five subjects.

**The bridge is real:** the college Political Philosophy unit and Civics Hall Strand I are the *same material* — Locke's Second Treatise lives once in `data/foundingDocuments.ts` and serves both schools.

Licence care worth noting: Wi-Phi is CC BY-NC-**SA** (adaptable — the common assumption that it is ND is wrong); Early Modern Texts permits rehosting with attribution despite "all rights reserved" on the PDFs; SEP is confirmed **not** open and is link-only; modern scholarly translations (Cooper, Guyer–Wood, Cohler) are never ingested. The P4C *method* is unprotected pedagogy and is reimplemented in original prose rather than copied from PLATO's lesson plans.

## The landing is now honest
**All 8 school covers carry a LIVE badge and route to a real destination** — verified in-browser: Business School→Praxis, Money, Real Estate, Civics, Economics, Philosophy, Music Conservatory→Chora, Film School. No card points at "the nearest shipped surface" any more.

## Verification
- Compile-clean across every touched file; combined data audit clean.
- Dev server transforms all four new modules (200, no transform errors).
- **BROWSER-VERIFIED**: both new schools render with all strands and their headline claims; the Economics lesson reader opens with **body-only** assertions (`"Demand-pull"`, `"Pull the current CPI series"`) rather than blurb text — applying the verification lesson from step 3c; landing shows 8/8 live. Console clean (preview-proxy 403/HMR only).

---

# Step 4 — the practice portfolio and the seven nations

## Paper Trading sandbox
`services/paperTradingService.ts` + `components/PaperTradingView.tsx`, route `PAPER_TRADING`, entered from the School of Money header ("Open the practice portfolio"). It serves FinLit Strand 3 (Saving & Investing) and the Economics markets strand.

It runs on **real live prices** through the existing `stockQuoteService` proxy, with virtual cash. Five decisions are deliberate and are the reason this is a teaching instrument rather than a game:

1. **No real money, ever.** There is no deposit path and no brokerage integration. A paper-trading tool that funnels a sixteen-year-old toward a funded account is an advertisement, not a lesson.
2. **Every trade requires a written reason** — enforced in `placeOrder` (rejects under 12 characters), not merely encouraged. Reviewing your own past reasoning is the actual pedagogy and it is the one thing a brokerage app will never make you do.
3. **Training wheels.** Younger bands may only trade five broad funds (VOO, VTI, VXUS, BND, VT). The lesson at that stage is diversification and time; a learner who picks a meme stock and gets lucky has learned the wrong thing. Educators can lift it per band.
4. **Honest returns.** Performance is reported against VOO held over the same period, stamped at portfolio open. Without this a learner in a rising market mistakes the tide for skill — the single most important thing this kind of tool can teach, and the thing most of them omit.
5. **No shorting.** Selling more than you hold is rejected with a plain-language explanation rather than silently permitted.

Persistence mirrors the Praxis/ventures pattern: localStorage first so guests and offline learners keep their place, Firestore mirror for signed-in users, reconciled by `updatedAt`, never throws.

**Verification: 16/16 unit tests pass**, plus a live browser run that placed real orders at live quotes:

| Check | Result |
| --- | --- |
| Short reason rejected | "Write why you are making this trade (at least a sentence)…" |
| Valid trade executes and journals the reason | reason rendered back in the journal |
| Cash math | 10,000.00 − 1,408.18 = **8,591.82** exact |
| Oversell rejected | "You hold 2 shares of VOO. You cannot sell more than you own — short selling is out of scope here." |
| Benchmark stamped at open | `benchmarkStart` recorded; panel shows "benchmark +0.07%" |
| Review loop writes back | reflection saved to the trade and re-rendered |

## Comparative Civics — seven nations
`data/comparativeCivics.ts`, surfaced as a third **Seven Nations** tab in `components/CivicsHallView.tsx` alongside The Texts and Curriculum.

One template re-instantiated seven times — United Kingdom, France, Germany, China, Japan, Brazil, Argentina — each with founding texts, government structure, rights tradition, civic life today, and the **actual free-expression clause in its own words**, set against the US First Amendment for a side-by-side. That comparison is the whole point: every one of these systems promises free expression, and reading the seven promises next to each other is how a student learns that the promise and the practice are separate questions.

**This module does not rank nations.** It teaches each system on its own terms and lets the primary text do the arguing.

Licence posture, verified per nation: UK under OGL v3.0 (hostable); France 1789 Declaration public domain; **Germany's Basic Law English translation is link-only** and carries a visible "link only" badge; PRC official translations fall outside copyright under Art. 5 of its own law; Japan's 1946 Constitution is public domain; Brazil's STF official translation is usable; Argentina link-preferred.

**Browser-verified:** all seven nations render; Germany shows the Basic Law with the link-only badge and Article 5 text; China's and Japan's speech clauses render in full; the US anchor ("Congress shall make no law…") and the capstone question are present.

## Closing the two gaps

Both items left open at the end of step 4 are now built.

### Comparative civics is now graded coursework
The seven nations were a reader module; they are now also **Civics Hall Strand VI, "The World's Promises"** — nine lessons on the shared School chassis, so comparative civics writes Learner Ledger records under `C3_SOCIAL` exactly as the five American strands do.

`data/comparativeCivicsLessons.ts` exports `COMPARATIVE_STRAND`, appended to `CIVICS_HALL.tracks`. The reader dataset and the coursework share one source: `data/comparativeCivics.ts` supplies the reference material for both, so neither can drift from the other.

The shape is a **method lesson, seven nation lessons, and a capstone**. The method lesson comes first deliberately — a student who compares countries without a method produces a ranking, which is the exact failure this strand exists to prevent. It teaches four questions applied identically to every system including the United States, insists on separating what a text *promises* from what a system *delivers*, and sets one rule: **name the mechanism, not the vibe.** "Country X is less free" is a feeling wearing the costume of a finding; "Country X permits prior restraint through mechanism Y, upheld in cases Z" can be checked and proved wrong.

Six comparative-government standards were seeded to support it — `D2.Civ.4`, `D2.Civ.6`, `D2.Civ.10`, `D2.Civ.13` across the 6–8 and 9–12 bands, written learner-facing in original wording since the C3 document is NCSS-copyrighted and is aligned to, never reproduced.

The capstone puts all **eight** free-expression clauses on one page and asks for two rank-orders — by strength of *text*, then by strength of *practice*. Wherever a country moves between the lists, the student has found something no constitution contains: an independent judiciary, a professional civil service, a press that survives commercially, a military that stays in barracks, a losing party that concedes. That gap is the actual content of comparative civics.

Civics Hall is now **6 tracks / 22 lessons**, avg 3,412 characters of teaching body per Strand VI lesson, 239 scheduled minutes.

### The educator view of the practice portfolio
`components/PaperTradingClassView.tsx` (route `PAPER_TRADING_CLASS`), reached from a **Open the class journal** button in the practice portfolio that only appears for teachers — gated on the same signal the profile header uses, so a student never sees a door into other learners' work.

A teacher picks a classroom they own and reads the whole class's **reasoning** side by side. That ordering is the design: journals are the top-level content and returns are a secondary column, because a class ranked by return teaches students that the goal is to beat each other, which is the opposite of the lesson. **There is no sort-by-return option** — the sortable signals are participation, reflection and depth of reasoning.

Four rules are honest-by-construction:
- A learner who never opened a portfolio renders as *"hasn't opened one"* — never a zero, never dropped from the list. Opened-but-idle is a visibly different state.
- Returns always carry the same-period benchmark. A green number in a rising market is the tide, not the student.
- Reads are **cloud-only**. `loadPortfolio` falls back to localStorage, which on a teacher's device holds the *teacher's* portfolio — using it would silently show a teacher their own trades under a student's name. `loadPortfolioCloud` exists specifically to make that impossible, and there is a test for it.
- A "worth asking about" panel surfaces patterns as teaching openings, not verdicts: who hasn't started, who is writing one-line reasons ("a trade without a thesis"), and who has traded repeatedly while holding a single instrument (the diversification lesson).

### Verification
Tests are now **persisted in the repo** rather than run as throwaway scripts:

| Command | Covers | Result |
| --- | --- | --- |
| `npm run test:paper` | learner guardrails + educator rows, incl. the no-local-fallback rule | **14/14** |
| `npm run test:civics` | standard-tag resolution, lesson depth parity, reader/coursework sync, licence flags | **8/8** |

Browser-verified against the running dev server:
- Strand VI lists all nine lessons; the Germany lesson opens with **body-only** assertions (the eternity-clause passage, the 1952 party ban, "there shall be no censorship", Weimar, and the assignment prompt) rather than blurb text.
- The class journal renders populated: per-learner chips (`1/1 reviewed`, `0/3 reviewed`, `hasn't opened one`), the vs-benchmark column, expanded journals showing reason and "Looking back" reflection, the unreviewed state, and all four sorts reordering the roster correctly.
- Guests correctly do **not** see the teacher entry point.
- Production `vite build` clean.

Two verification notes worth keeping. Assertions on rendered text must be **case-insensitive** where the design applies `text-transform: uppercase` — a passing-looking `false` cost time here. And `indexOf` ordering checks must be scoped to the row list: the "worth asking about" panel names students above the table, which silently inverts a naive sort assertion.

## What remains open
1. **Ledger writes are still not exercised against live Firestore.** Praxis, Music Theory, Language Quest and all five school-chassis curricula — now including Civics Hall Strand VI — write records in code and are route- and unit-verified, but no signed-in run has confirmed the writes land. This remains the single biggest untested claim in the build, deferred at the user's direction until a signed-in pass.
2. The Telescoping Text corpus is 9 documents; the design supports many more.
3. The class journal reads classrooms a teacher owns. Parent-facing visibility of a child's journal is not built.
