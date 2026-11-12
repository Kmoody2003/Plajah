# Plajah Live Legislation Engine — Blueprint

**Working name:** *Forum* (placeholder — rename freely).
**Status:** design only. Nothing wired.
**Date:** 12 November 2026.
**Builds on:** Tela document graph (`docs/TELA_CREATIVE_ENGINE_ARCHITECTURE.md`), ARIA
(`services/aria/*`, `services/debateAria.ts`), the Identifier Registry transparency log
(`docs/PLAJAH_IDENTIFIER_LEDGER_BLUEPRINT.md`, `services/registry/types.ts`), Elevate Mobilize
(`services/elevateMobilizeService.ts`), Structured Debates (`DEBATE_STRATEGY.md`), the anti-bot
playbook (`docs/ANTI_BOT_PLAYBOOK.md`) and Museion live data.

---

## 0. The thesis

Legislation is written in rooms constituents never see, then published as a finished PDF when
the only remaining input is "call your representative." Forum turns a bill into a **living Tela
document**: as an office drafts, verified constituents can read every clause in plain language,
annotate it, propose alternative wording, and signal support, in the open. Live public data
is attached to the clauses it affects, and ARIA explains the text and summarizes what people said.
Every signal goes into a tamper-evident log so that nobody, Plajah included, can quietly change
the record of what the public said.

Four rules shape everything below:

1. **Advisory, never binding.** Elected officials keep the vote. Forum gives them a verified,
   auditable picture of what their constituents think, clause by clause. It is not an election
   and must never be marketed as "blockchain voting". Binding online voting is a security
   problem no one has solved (coercion, vote-buying, client compromise), and claiming it would
   cost us every serious government partner.
2. **Consensus over majority.** The output that matters is not "62% oppose" but "these three
   wordings are supported across groups that disagree about everything else". Bridging beats
   headcount (see §5).
3. **ARIA explains; it does not decide.** Same rule as `chmsFinance.ts` and `acctPulseLive.ts`:
   numbers and tallies are computed deterministically in code. ARIA parses, summarizes and
   narrates, and always cites clause IDs. It never casts, weights or tallies signals, and it never
   writes into the bill without a human accepting the change.
4. **The ledger is invisible and records claims, not truth.** This is Registry design rules #2 and #3
   unchanged. There is no token and no gas, and nobody needs a wallet to take part. The log proves
   *that* a verified person in District 4 signalled X on clause 3(b) at time T, and that the
   published tally includes that signal. It does not decide who is right.

---

## 1. What has been tried (and why it mostly stalled)

| Precedent | What worked | What broke |
|---|---|---|
| **vTaiwan / Pol.is** (2015–) | Opinion-clustering surfaced cross-group consensus. Uber and alcohol-sales regulations shipped from it | Government stopped committing to act on outputs, and participation decayed |
| **Madison** (OpenGov Foundation, US Congress) | Line-by-line public comments on bill text | Low traffic, and offices treated it as PR, not input |
| **Decidim** (Barcelona) / **CONSUL** (Madrid) | Open-source, used by hundreds of cities for participatory budgeting | Proposals rarely touch actual statutory language |
| **Iceland crowdsourced constitution** (2011) | 3,600 comments shaped a draft approved in a 2012 referendum | Parliament never ratified it. Without legislator buy-in, outputs die |
| **Better Reykjavík** | Recurring city commitment to debate top ideas | Ideas, not text |
| **FCC net-neutrality docket** (2017) | — | Millions of fake comments (NY AG found ~18M fraudulent). This is the threat model |
| **Estonia e-ID** | Strong, privacy-preserving national identity that makes signals trustworthy | Not available in the US; we have to build tiered verification |

**Lesson:** the technology was never the bottleneck. Projects failed on (a) **no binding
commitment from the drafter to respond**, (b) **unverifiable participants**, and (c) **input
that floated free of the actual text**. Forum is designed against all three: the sponsor
response ledger (§6), tiered verification (§4), and clause-anchored everything (§2).

---

## 2. The bill as a Tela document

A bill is a Tela document graph whose frames are **provisions** with stable IDs, not pages.

```
Bill
 └─ Version (v1 … vN, each an immutable snapshot; edits are Tela operations)
     └─ Division → Title → Section → Subsection → Paragraph → Clause
                                                     └─ span (character range, for annotations)
```

- **Stable provision IDs** (`sec-3.b.ii`) survive renumbering. Annotations, signals and data
  bindings attach to the ID and a text span, so they re-anchor (or are flagged "orphaned") when
  the wording changes, the way Google Docs comments behave.
- **Interop:** import/export **Akoma Ntoso** (OASIS LegalDocML) and **USLM** (US Code XML), and
  emit PDF/print via the existing Tela print path. Design rule #1 from the Registry carries over:
  never invent a format where a standard exists.
- **Redline view:** version-to-version diff in a style similar to Congress's Comparative Print Suite. A constituent's
  proposed amendment is a *suggestion layer* (Tela operations not yet applied), so staff can accept,
  merge or decline it with one click, and the outcome is recorded.
### 2.1 Two drafting spaces: Private Draft and Public Draft

Every bill has two spaces that share one document graph but never share history.

```
PRIVATE DRAFT (office only)                         PUBLIC DRAFT (everyone)
 working copy, edited continuously                   immutable published versions
 ├─ member + staff + counsel edits                   ├─ Public v1 ──► comment, stance, wordings
 ├─ private ARIA: lint, conflict check (§8)          ├─ Public v2 ──► redline v1→v2 only
 ├─ private notes / internal comments                ├─ Public v3 …
 └─ "Publish" ───── snapshot ─────────────────────►  └─ each version hashed onto the ledger
        ▲                                                       │
        └──── accepted public wordings flow back as ops ◄───────┘
```

- **Private Draft** is visible only to the office: the legislator, staff, legislative counsel, and
  invited collaborators such as committee staff or co-sponsors. Each person gets a per-office role,
  and access requires hardware-key 2FA. The office gets the full editor and the full analysis suite
  (§8), so it can find conflicts *before* the public sees the text. Nothing in Private Draft is
  indexed, searchable or exposed through any public API. ARIA calls on private text run under a
  no-retention, no-training policy, and every access is logged for the office.
- **Publish** takes a snapshot of the working copy (or of selected sections) and makes it **Public
  Version N**. The public only ever sees published versions and the redlines between them. Edits
  made between publishes are not shown publicly, so the office can rework language freely, and
  everything it publishes is permanent and hash-anchored. The office can't quietly rewrite a
  version people already commented on.
- **Feedback flows back.** When the office accepts a public wording, it lands in Private Draft as a
  pending operation. Comments stay anchored to the public version they were made on, and when the
  next version is published the system shows which ones were addressed (the clause changed) and
  which still apply.
- **Concept-only publish.** An office can publish just the problem statement and goals before any
  text exists, which opens the consensus statements (§5) early.
- **Records-law caveat.** Whether unpublished drafts are exempt from public records requests
  varies by state and body, and many legislatures exempt drafting requests and legislative counsel
  work product. Forum stores Private Draft separately and supports office-controlled export and
  retention, but the office's counsel decides what's disclosable, not Plajah.

### Lifecycle

| Stage | Who writes | What the public can do |
|---|---|---|
| **P Private drafting** | Office in Private Draft, with the analysis suite | Nothing; the bill isn't visible |
| **0 Concept** | Sponsor posts the problem, goals and constraints | Statements and agree/disagree (Pol.is-style), plus evidence submissions |
| **1 Public draft** | Office publishes Public v1, v2 … while drafting continues privately | Annotate, propose wording, clause stance, ask ARIA, read the conflict report |
| **2 Comment window** | Text frozen per version | Formal comments (public record), ranked choice between alternative wordings |
| **3 Markup** | Committee amends | Watch the redline; the response ledger shows what was adopted and why |
| **4 Introduced / Enacted** | — | Final read-out: what changed because of public input |
| **5 Monitoring** | — | Live indicators bound to clauses keep updating: the "real-time study" |

---

## 3. Participation primitives

| Primitive | Anchored to | Tier needed | Notes |
|---|---|---|---|
| **Read + ask ARIA** | Clause | Anyone | Plain-language explainer, reading-level toggle, translation |
| **Annotation** (question, concern, evidence, story) | Span | Tier 1 | Threaded. Typed, so ARIA can group them |
| **Clause stance** (support / oppose / amend / unsure) | Provision | Tier 2 for district tally | One live stance per person per provision per version; you can change it, and the latest counts |
| **Proposed wording** | Span | Tier 1 | A suggestion layer. Others can endorse it, and the best ones go to ranked choice |
| **Ranked choice between wordings** | Provision | Tier 2 | Sponsor-curated shortlist (original plus top alternatives) |
| **Consensus statements** | Bill or section | Tier 1 | Short claims ("Small landlords should be exempt"), agree/disagree/pass. Feeds §5 |
| **Evidence submission** | Provision | Tier 1 (orgs: Tier 3) | Data, studies, testimony video. Organizations must disclose who funds them |
| **Structured debate** | Provision | Tier 1 | Reuse `debateAria.ts`: challenger vs defender on a contested clause, judged by ARIA's rubric |

Voice and video testimony reuse the Live Hub and Ambo engines. Testimonies are transcribed, attached to clauses
and summarized like any annotation.

---

## 4. Identity: verified, one person one signal, without surveillance

The hard requirement is that we can prove each counted signal came from a distinct, real
constituent of the district, **and** that the sponsor's office cannot see how a named
individual signalled.

### 4.1 Tiers

| Tier | Proves | How |
|---|---|---|
| 0 Guest | Nothing | Read-only and ARIA questions |
| 1 Account | A human-ish account | Firebase Auth plus App Check plus anti-bot playbook signals |
| 2 Constituent | Lives in district D | Voter-file match (where state law permits) **or** a mailed postcard code (Nextdoor-style) **or** ID-plus-address via a verification vendor. Re-verified each year |
| 3 Organization | Is entity X, funded by Y | EIN/registry lookup plus a disclosure form. Labelled as an org in every view |
| Official | Sponsor/staff of office O | Invited by an office admin. Hardware-key 2FA |

### 4.2 Privacy-preserving signals (the actual "blockchain component")

1. Once Tier 2 is verified, Forum issues the person an **anonymous district credential**: membership
   in a Merkle group of verified district members (Semaphore-style zero-knowledge group
   membership). The identity commitment is held client-side; the issuer stores who was verified, not which commitment
   belongs to whom.
2. Every stance or ranked-choice ballot is submitted with a zk proof that "I am in group D" plus a
   **nullifier** derived from `(identity secret, bill, provision, version)`. The same person
   cannot double-count, and their signals cannot be linked across bills.
3. Signals are appended to the **existing Registry transparency log** as `LedgerStatement`s (new
   statement kinds, §12). Epoch Merkle roots are anchored to Bitcoin via OpenTimestamps, exactly as
   the Registry blueprint plans. There is still no token and no gas, and nobody needs a wallet.
4. **Anyone can audit:** download the epoch, recompute the tally, and check that their own receipt
   (nullifier plus leaf hash) is included. If someone tampers with the record, the anchored roots
   expose it.

Annotations and proposed wordings are **not** anonymous by default: public speech attached to a public
bill should carry a name or a stable pseudonym plus a "verified constituent" badge. The anonymity
guarantee covers *stances and ballots*, where pressure and retaliation are the real risks.

**Honest scoping:** zk credentials are Phase 4. Phases 1–3 can ship with server-side
deduplication (a hashed verified ID per bill) and the same public tallies. The guarantee is weaker,
and the UI must say so ("verified by Plajah", not "cryptographically proven").

### 4.3 Tallies are always split

Every number shows its population: **verified constituents of the district** · verified elsewhere ·
unverified · organizations. A sponsor sees the first number as the headline. A national
astroturf campaign can make noise in the third column and cannot touch the first.

---

## 5. The consensus engine

Majority tallies reward whoever mobilizes hardest. Forum's headline output is **bridging
consensus**:

1. Participants agree, disagree or pass on short statements (and stances on provisions).
2. Build the participant × statement vote matrix, reduce it (PCA), and cluster it (k-means, with k chosen
   by silhouette score). This is the Pol.is method, which is open source and well studied.
3. For each statement or wording, compute **group-informed consensus**: the *minimum* (or product) of
   agreement probability across clusters. A wording that 70% of every cluster accepts outranks
   one that 95% of one cluster and 10% of the other accepts.
4. Publish the **opinion map**: clusters, what each believes, and where they overlap. ARIA writes
   the narrative ("Group A is mostly renters, B mostly small landlords; both support a 60-day
   notice period, and they split on rent caps"). Its input is the deterministic output, and it cites statement IDs.

All of this is computed in code, versioned, and reproducible from the public log. ARIA never
picks the winner.

---

## 6. The sponsor response ledger (the anti-"PR exercise" mechanism)

The single biggest reason civic platforms die is that drafters ignore their output. Forum makes
responding cheap and *not* responding visible:

- When an office opens a bill, it **commits to a response threshold**, e.g. "we will respond in
  writing to every proposed wording endorsed by ≥ 50 verified constituents, and to the top 10
  consensus statements, before markup."
- Each response is one of: **Adopted** (links to the redline), **Adopted in part**, **Declined
  (reason)**, or **Out of scope (reason)**. ARIA can draft the response; staff edit and sign it.
- The bill page shows a public **"You said / We did"** panel and the office's response rate.
  Responses are ledger statements too.

This is the feature to lead with when selling to offices: it turns constituent engagement into an
artifact they can campaign on.

---

## 7. Live data and the "real-time study"

Each provision can bind **impact indicators**: live series that show the situation the clause
is trying to change.

```
Provision sec-4.a  "caps annual rent increases at 5% for units built before 2005"
  ├─ indicator: median rent, District 4      ← Census ACS 5-yr (B25064), city open data
  ├─ indicator: eviction filings / month      ← court records feed / Eviction Lab
  ├─ indicator: new residential permits       ← city Socrata/CKAN portal
  ├─ scenario: affected units = f(build year) ← assessor parcel data, computed in code
  └─ fiscal note: admin cost estimate         ← staff-entered model with stated assumptions
```

- **Sources:** Census ACS, BLS, BEA, FRED, CDC WONDER, HUD, state open-data portals (Socrata,
  CKAN, ArcGIS Hub), and the sponsor's own uploads. Reuse Museion's live-data adapters and caching.
- **Scenario sliders:** where a provision has a parameter (5%, 60 days, $15/hr), the reader can
  move it and see the computed exposure change ("affects ~4,200 units"). The models are
  deterministic, published, and come with their assumptions stated.
- **Monitoring after enactment** is the real "real-time study": indicators keep updating against
  the pre-enactment baseline, and the bill page becomes a living scorecard. Sunset and review dates
  can trigger an automatic re-open for comment.
- **Honesty rule (enforced in the UI):** live data shows *context and trends*, not *causal impact*.
  Any panel that implies "this law caused X" must come from a stated method (difference-in-
  differences against comparison districts, etc.) and carry its caveats. ARIA is barred from
  causal language unless a model output supports it.

---

## 8. The Law Library and statutory analysis

Forum imports the law that already exists into the same provision graph as bills. A new draft
can then be checked against it automatically: what it changes, what it contradicts, what overrides
it, and what happened in other places that passed something similar.

### 8.1 The corpus

| Layer | Sources | Notes |
|---|---|---|
| US Constitution, US Code | uscode.house.gov (USLM XML) | Public domain, structured |
| Federal regulations | eCFR API, Federal Register API | Daily updates |
| State constitutions and codes | Each legislature's bulk download/XML where offered. Otherwise scrape the official site | Coverage and format vary widely. Track provenance per state |
| State bills (all 50) | Open States / Plural API, LegiScan | Bill text, versions, votes, sponsors |
| State regulations | State administrative codes | Patchy, so add them state by state |
| Municipal and county codes | City-hosted codes, open-data portals | Many cities publish through Municode or American Legal Publishing, whose terms restrict bulk copying. Prefer official city sources or partner agreements |
| Case law | CourtListener (Free Law Project) | Which provisions courts have interpreted or struck down |

- **The text of the law is public domain.** In *Georgia v. Public.Resource.Org* (2020) the Supreme
  Court held that legislatively authored annotations can't be copyrighted either. Third-party
  compilations, headnotes and codifier formatting can still carry rights, so we store official text
  and our own structure.
- **Point-in-time versions.** Every provision stores effective-date ranges, so analysis runs
  against the law *as of* a date, and the "before" baseline for monitoring (§7) stays fixed.
- **Same model as bills.** Statutes become Provision graphs with stable IDs (`ca.civ.1946.2.b`), so
  the reader, ARIA explainer, annotations and data bindings all work on existing law too. That
  makes the Law Library a public product in its own right: readable, plain-language law for every
  state and city on Plajah. It also gives Academia's civics and law curricula
  (`docs/ACADEMIA_LAW_MEDICINE_BLUEPRINT.md`) a real-text backbone.

### 8.2 The analysis pipeline

It runs on every save in Private Draft and on every Public version. Steps 1–4 are deterministic
code. Steps 5–7 use retrieval and ARIA, and their results are labelled with confidence and sources.

1. **Citation extraction and resolution.** Parse references ("§ 12-104(c)", "section 5 of this
   act", "as defined in chapter 3") and resolve each to a provision ID. Unresolved and repealed
   targets are flagged as **dangling references**.
2. **Amendment application (comparative print).** Bills usually say "amend § X by striking Y and
   inserting Z." Forum applies those instructions to the current code and shows **the law as it
   would read**, as a redline against current law. Many states require such a comparison by rule.
   For readers it's the single most useful view.
3. **Definition graph.** Map every defined term to its scope. Flag **term collisions** where the bill
   defines "tenant", "employee" or "small business" differently from the chapter it amends, and
   flag undefined terms used as if they were defined.
4. **Structural checks.** Single-subject and title-match rules (many state constitutions require
   both), effective-date and sunset consistency, penalties without an enforcing agency, duties
   without funding (some states have unfunded-mandate rules), and numeric inconsistencies between
   sections.
5. **Related-law retrieval.** Embedding plus keyword search over the corpus finds provisions on
   the same subject that the bill doesn't cite: overlap and duplication, or an implied-repeal risk.
6. **Conflict and preemption review.** For each candidate pair, ARIA classifies the relationship
   with both texts side by side: *direct contradiction* (shall vs. shall not), *preemption* (federal
   over state, state over local, including express state preemption statutes and constitutional
   limits), *overlap*, or *no conflict*. It cites both provisions.
7. **Judicial signals.** Through CourtListener, show where nearby or similar provisions have been
   interpreted, narrowed or struck down, and on what grounds.

**Output is a Conflict Report**, attached to each provision and to the bill as a whole:

| Severity | Example |
|---|---|
| **Blocking** | References § 12-110, repealed in 2019 |
| **Review** | "Tenant" in § 4 is broader than the definition in Civ. Code § 1940 that it amends |
| **Review** | State law (Gov. Code § 7060) preempts local rent control on units built after 1995. § 4(a) covers all units |
| **Info** | Similar language in § 22-301 was narrowed by *Smith v. City* (2021) |

The report is visible privately to the office first. When the office publishes, the public sees the
report for that version (an office can't hide a Blocking item, only respond to it, which follows
§6's rules). Constituents' proposed wordings run through the same checks before they're
shortlisted, so the public can't push language that breaks something else.

**Guardrail:** the report flags *areas for review*; it is not a legal opinion. Every item says why
it was flagged and links the provisions, and legislative counsel resolves it. Deterministic checks
(1–4) can say "this is wrong." Retrieval and ARIA checks (5–7) can only say "a lawyer should look
at this."

### 8.3 Cross-jurisdiction comparison and real-world outcomes

This is where the Law Library connects to the live-data engine (§7).

- **Similar-law finder.** Text-reuse detection across all 50 states' bills and codes finds laws
  substantially similar to the draft, including model legislation copied between states. That's a
  well-documented pattern; USA Today and the Arizona Republic's 2019 "Copy, Paste, Legislate"
  investigation found 10,000+ bills largely copied from model text.
- **What happened there.** For each similar law that was enacted, line up its effective date with
  the same indicators bound to the draft's provisions: rents, permits, wages, enrollment, health
  outcomes. "Three states adopted a 5% cap between 2019 and 2022; here is median rent and
  permitting in each, before and after, next to comparable states that didn't."
- **Method, stated.** Comparisons run as event studies or difference-in-differences against
  comparison jurisdictions, with the method, the comparison set and the caveats shown on the
  panel. Where data is too thin, the panel says so rather than drawing a line. ARIA narrates the
  computed result and follows the §7 causal-language rule.
- **Implementation record.** Pull agency reports, audits and fiscal notes from those states when
  available. That shows what implementation actually cost, compared with what was estimated.

---

## 9. Public hearings, meetings and discussion boards

The same engine hosts the public-facing work of governing bodies: city council and county
commission meetings, planning and zoning hearings, school boards, legislative committee
hearings, agency rulemaking comment periods, and town halls. A hearing on a bill is just a
meeting whose agenda items point at provisions, so testimony lands on the clauses it is about.

### 9.1 Meetings

| Piece | What it does | Reuses |
|---|---|---|
| **Notice and agenda** | Agenda items link to bills, provisions, Law Library sections, staff reports and maps. Posting time is recorded on the ledger, which proves the notice met the legal deadline (for example 72 hours under California's Brown Act for regular meetings) | Tela documents, Registry log |
| **Livestream and archive** | Hybrid in-room plus remote broadcast, captions, ASL interpreter picture-in-picture, translation. The archive is cut into chapters by agenda item. It can also feed a public-access (PEG) or FAST channel | Live Hub/Mux, Ambo, Fabula lower-thirds, `captionSidecar`, FAST |
| **Public comment queue** | Sign up per agenda item: in person (QR at the door), remote video/audio, or written. Speaker order and time limits are enforced by the same rules for everyone, with a visible timer. The clerk runs the queue from one console | LiveTalk/WebRTC, live-TV QR |
| **Remote testimony** | Speakers join from the queue into a green room, then go live when called. Their testimony is transcribed and attached to the agenda item, and to the clause if the item is a bill | LiveTalk, `audioTranscription` |
| **Roll-call votes** | The body's own votes are recorded per member and per motion, and anchored on the ledger | Registry log |
| **Minutes** | A live transcript with speaker labels feeds a draft of the minutes from ARIA. The clerk edits and approves it, and only the approved version is official. Every line links back to the video timestamp | ARIA, transcription |

### 9.2 Discussion boards

- Each body has persistent boards for each topic, agenda item and bill, so the conversation keeps
  going between meetings. Posts can quote and anchor to provisions or agenda items, exactly like annotations.
- Board activity feeds the consensus engine (§5) and comment synthesis. Staff can post official
  answers, which work like office responses (§6).
- **Limited public forum.** A government can limit a forum to its subject matter, but moderation
  has to be reasonable and viewpoint-neutral. Forum enforces published rules (on-topic, no
  threats, no doxxing) and logs every removal with the rule it cited.

### 9.3 Open-meetings guardrails

- **No serial meetings.** If a quorum of a body discusses business outside a noticed meeting,
  including by replying to each other online, that can be an illegal meeting. California's Brown
  Act explicitly covers social media. Members of a body therefore have a restricted role on
  boards: read, plus official posts that can't be replied to by other members. The system blocks
  any thread from reaching a quorum of members interacting.
- **Records retention.** Meeting video, comments, chat and board posts can be exported in the
  formats and on the schedules the jurisdiction's records law requires.
- **Accessibility and language access.** WCAG 2.1 AA, captions on every stream, and translation of
  agendas and summaries. Many jurisdictions have language-access requirements for public notices.
- **Rules vary by state.** Notice periods, remote-participation rules and comment requirements are
  configuration, set per jurisdiction, not hard-coded.

### 9.4 Other uses of the same machinery

- **Planning and zoning:** hearings with parcel maps, plans and notices to nearby property owners. Comments attach to the map.
- **Budget hearings and participatory budgeting:** line items become provisions, and allocation
  ballots reuse ranked choice.
- **Agency rulemaking:** notice-and-comment periods for regulations, similar to regulations.gov,
  using the same comment, deduplication and response-ledger tools.
- **Town halls:** a legislator's district town hall, with a verified-constituent question queue.

---

## 10. ARIA's jobs

| Job | Input | Output | Guardrail |
|---|---|---|---|
| Plain-language explainer | Provision text plus cross-references | Grade-8 summary, translations | Cites the provision. "Read the actual text" is always one tap away |
| Cross-reference and conflict check | Provision plus existing code (USLM/municipal code) | "This amends §12-104; conflicts with §12-110(c)?" | Flags only; a human resolves it |
| Ambiguity and drafting lint | Provision | Undefined terms, "shall/may" drift, dangling references | Suggestions go to the suggestion layer, never applied directly |
| Comment synthesis | Annotations plus the consensus output | Themes with counts and representative quotes | Counts come from code, quotes are verbatim, every theme links to its sources |
| Steelman both sides | Contested provision plus the debate | The strongest case for and against | Labelled AI-generated |
| Response drafting | A top item from §6 | A draft office response | Staff must edit and sign |
| Debate judging | Existing `debateAria.ts` rubric | Verdict | Unchanged |

**Provenance:** any language that originated with ARIA keeps an `aiAssisted` flag on its Tela
operation through to the final text. Offices will be asked about it.

---

## 11. Integrity, law and moderation

- **Government forums carry First Amendment duties.** When an official runs the space, viewpoint-based
  deletion or blocking can be unconstitutional (*Lindke v. Freed* and *O'Connor-Ratcliff v.
  Garnier*, 2024). Moderation must therefore be **content-neutral and rule-based**: spam, threats,
  doxxing, off-topic, and legally unprotected speech. It reuses `FAIR_PROCESS_POLICY.md` and the content
  safety pipeline. Offices **cannot** delete annotations. They can only respond.
- **Public records and open meetings:** comments submitted to an office may become public records,
  and a quorum of a body "deliberating" on the platform may trigger open-meetings law. Display a clear
  notice, offer export for records retention, and keep official-to-official discussion off the
  public surface.
- **Accessibility:** the DOJ ADA Title II web rule (2024) requires state and local government web content to
  meet WCAG 2.1 AA, with compliance dates in 2026 and 2027. Government customers need this from day one.
- **Coordinated campaigns:** cluster near-duplicate comments (MinHash) and show "1 form letter ×
  2,300 signers" as one item with a count. That is legitimate organizing, presented honestly. Bot and
  sybil detection comes from the anti-bot playbook. Verified-district tallies (§4.3) are the
  backstop.
- **Lobbying disclosure:** Tier 3 organizations disclose their funders. Evidence from registered lobbyists
  is labelled.
- **Data minimization:** verification PII is held by the vendor or encrypted at rest, kept apart from
  signals, and deleted on schedule. Separate Firestore rules file (pattern: `firestore.phi.rules`).

---

## 12. Data model sketch

```ts
// services/forum/types.ts (Phase 0)
type ProvisionId = string;            // stable, e.g. "sec-3.b.ii"
type BillVersionId = string;

interface Bill {
  id: string;
  jurisdiction: { level: 'municipal'|'county'|'state'|'federal'|'org'; code: string };
  districtIds: string[];              // whose constituents' tallies are headline
  sponsorOfficeId: string;
  stage: 'concept'|'open_draft'|'comment'|'markup'|'introduced'|'enacted'|'monitoring'|'closed';
  visibility: 'concept_only'|'checkpoint'|'live';
  responseCommitment: { endorsementThreshold: number; topConsensus: number; dueBy?: string };
  privateDraftDocId: string;          // Tela working copy, office ACL only, never indexed
  publicVersionIds: BillVersionId[];  // immutable published snapshots, hash-anchored
  currentPublicVersionId?: BillVersionId;
}

interface OfficeMember { officeId: string; uid: string;
  role: 'member'|'chief_of_staff'|'staff'|'counsel'|'committee_staff'|'cosponsor'|'viewer' }

// Law Library (§8): existing law in the same provision graph
interface LawCorpusDoc { id: string; jurisdiction: string;
  kind: 'constitution'|'code'|'regulation'|'municipal_code'|'charter';
  source: { name: string; url: string; retrievedAt: string; license: 'public_domain'|'partner'|'restricted' } }

interface LawProvision { id: string; corpusDocId: string; path: string; text: string;
  effectiveFrom: string; effectiveTo?: string; definesTerms?: string[]; citesIds?: string[] }

interface ConflictFinding { id: string; billVersionId: BillVersionId; provisionId: ProvisionId;
  otherProvisionId?: string;
  kind: 'dangling_ref'|'term_collision'|'contradiction'|'preemption'|'overlap'|'structural'|'judicial_signal';
  severity: 'blocking'|'review'|'info';
  method: 'deterministic'|'retrieval_aria';   // §8.2: only deterministic may say "wrong"
  explanation: string; citations: string[]; resolution?: { by: string; note: string } }

// Hearings, meetings, boards (§9)
interface Meeting { id: string; bodyId: string; kind: 'regular'|'special'|'hearing'|'town_hall'|'rulemaking';
  scheduledAt: string; noticePostedAt: string; noticeLedgerLeaf?: string;
  streamId?: string; agendaItemIds: string[]; minutesStatus: 'none'|'draft'|'approved' }

interface AgendaItem { id: string; meetingId: string; title: string;
  links: { billId?: string; provisionIds?: string[]; lawProvisionIds?: string[]; docIds?: string[] };
  commentRules: { perSpeakerSeconds: number; remoteAllowed: boolean; writtenAllowed: boolean } }

interface SpeakerSlot { id: string; agendaItemId: string; uid?: string; displayName: string;
  mode: 'in_person'|'remote'|'written'; status: 'queued'|'green_room'|'live'|'done'|'no_show';
  transcriptRef?: string; videoTimestamp?: [number, number] }

interface RollCall { meetingId: string; motion: string;
  votes: Record<string, 'aye'|'nay'|'abstain'|'absent'|'recused'>; ledgerLeaf?: string }

interface Provision { id: ProvisionId; versionId: BillVersionId; path: string; text: string;
  heading?: string; parentId?: ProvisionId; indicators: IndicatorBinding[] }

interface Annotation { id: string; billId: string; provisionId: ProvisionId; versionId: BillVersionId;
  span?: [number, number]; kind: 'question'|'concern'|'evidence'|'story'|'support';
  authorId: string; tier: 0|1|2|3; body: string; mediaRefs?: string[]; orphaned?: boolean }

interface ProposedWording { id: string; provisionId: ProvisionId; versionId: BillVersionId;
  telaOps: unknown[]; rationale: string; authorId: string; endorsements: number;
  status: 'open'|'shortlisted'|'adopted'|'adopted_in_part'|'declined'|'out_of_scope' }

interface Signal {                     // stance / ballot / statement vote
  billId: string; provisionId?: ProvisionId; statementId?: string; versionId: BillVersionId;
  kind: 'stance'|'ranked'|'statement';
  value: 'support'|'oppose'|'amend'|'unsure'|'agree'|'disagree'|'pass'|string[];
  population: 'district_verified'|'verified_elsewhere'|'unverified'|'organization';
  nullifier: string;                  // Phase 1–3: hash(verifiedId, scope); Phase 4: zk nullifier
  proof?: string;                     // Phase 4: Semaphore proof
  ledgerLeaf?: string;
}

interface OfficeResponse { id: string; targetId: string; targetKind: 'wording'|'statement'|'theme';
  outcome: 'adopted'|'adopted_in_part'|'declined'|'out_of_scope'; reason: string;
  redlineRef?: string; signedBy: string; aiDrafted: boolean }

interface IndicatorBinding { id: string; label: string; source: 'acs'|'bls'|'fred'|'cdc'|'socrata'|'ckan'|'upload';
  seriesRef: string; geography: string; baselineAt?: string; scenarioModelId?: string; caveats: string }
```

New Registry `LedgerStatement` kinds: `forum.bill_version` (text hash per version),
`forum.signal`, `forum.annotation_hash`, `forum.office_response`, `forum.tally_epoch`,
`forum.meeting_notice`, `forum.roll_call`, `forum.minutes_approved`. Private Draft content is never
written to the log.

---

## 13. Roadmap

| Phase | Scope | Exit criterion |
|---|---|---|
| **0 Foundation** | `services/forum/types.ts`, Akoma Ntoso import → Tela, provision IDs, redline, Private Draft / Publish split | Import a real city ordinance, render it with stable IDs, publish v1 from a private draft |
| **0.5 Law Library seed** | One state's constitution and code plus one city's municipal code, point-in-time versions, citation parser, comparative print | A real bill shows "the law as it would read" and its dangling references |
| **1 Pilot: low stakes, real text** | Annotations, proposed wordings, Tier 1 plus postcard Tier 2, split tallies, response ledger, ARIA explainer and synthesis | One real drafting body runs a full cycle. Best first customers: **student government** (Academia), **church/nonprofit bylaws** (Elevate), an **HOA**, or a **city councilmember's office** via Elevate Mobilize relationships |
| **2 Consensus** | Statements, clustering, opinion map, ranked choice, form-letter dedup | Sponsor cites the opinion map in a public decision |
| **2.5 Meetings** | Agenda, notice, livestream, speaker queue, remote testimony, draft minutes, boards with open-meetings guardrails | One real public body runs a meeting end to end on Forum |
| **3 Live data and analysis** | Indicator bindings, scenario sliders, monitoring dashboards (reuse Museion adapters), full conflict report, similar-law finder, cross-state outcome comparisons | One enacted measure with a live post-enactment scorecard. Counsel confirms the conflict report caught a real issue |
| **4 Ledger** | Signals into the Registry log, OpenTimestamps anchoring, public audit tool, Semaphore credentials | A third party recomputes a tally from the public log |
| **5 Government grade** | WCAG 2.1 AA audit, records export, SOC 2, state voter-file integrations, procurement packaging | First paid municipal contract |

**Business model:** free for constituents always. Paid by **offices and bodies** (SaaS per
seat or per jurisdiction), **advocacy organizations** (private drafting rooms for model
legislation), and **universities** (civics curriculum on Academia, with mock legislatures using the real
engine). Candidates can use it during campaigns to co-write platform planks, which is a natural
on-ramp through Elevate Mobilize.

---

## 14. Open questions for product

1. First pilot target: student government, church/nonprofit bylaws, or a real municipal office?
2. ~~Live drafting vs checkpoints~~ **Decided:** Private Draft plus published Public versions (§2.1).
6. Which state and city should seed the Law Library first? It should match the pilot jurisdiction.
7. Could meetings (§9) be the wedge product? Cities already buy meeting software (agenda,
   streaming, minutes), so it may be an easier first sale than drafting.
3. Which verification vendor for Tier 2, and is voter-file matching acceptable in launch states?
4. Do unverified and out-of-district participants get stances at all, or only annotations?
5. Is this a Plajah-branded surface or a white-label product governments embed on `.gov` sites?
   Government buyers usually require the latter.
