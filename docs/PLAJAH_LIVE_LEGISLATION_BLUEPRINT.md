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
- **Draft visibility controls:** the sponsor decides what is public and when: whole bill, specific
  sections, or "concept stage" (problem statement and goals only). Many offices cannot publish
  pre-introduction text; the concept stage lets them start the loop anyway.

### Lifecycle

| Stage | Who writes | What the public can do |
|---|---|---|
| **0 Concept** | Sponsor posts the problem, goals and constraints | Statements and agree/disagree (Pol.is-style), plus evidence submissions |
| **1 Open draft** | Staff draft; text visible live or at checkpoints | Annotate, propose wording, clause stance, ask ARIA |
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
   statement kinds, §7). Epoch Merkle roots are anchored to Bitcoin via OpenTimestamps, exactly as
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

## 8. ARIA's jobs

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

## 9. Integrity, law and moderation

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

## 10. Data model sketch

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
  currentVersionId: BillVersionId;
  telaDocId: string;                  // the Tela document graph
}

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
`forum.signal`, `forum.annotation_hash`, `forum.office_response`, `forum.tally_epoch`.

---

## 11. Roadmap

| Phase | Scope | Exit criterion |
|---|---|---|
| **0 Foundation** | `services/forum/types.ts`, Akoma Ntoso import → Tela, provision IDs, redline | Import a real city ordinance and render it with stable IDs |
| **1 Pilot: low stakes, real text** | Annotations, proposed wordings, Tier 1 plus postcard Tier 2, split tallies, response ledger, ARIA explainer and synthesis | One real drafting body runs a full cycle. Best first customers: **student government** (Academia), **church/nonprofit bylaws** (Elevate), an **HOA**, or a **city councilmember's office** via Elevate Mobilize relationships |
| **2 Consensus** | Statements, clustering, opinion map, ranked choice, form-letter dedup | Sponsor cites the opinion map in a public decision |
| **3 Live data** | Indicator bindings, scenario sliders, monitoring dashboards (reuse Museion adapters) | One enacted measure with a live post-enactment scorecard |
| **4 Ledger** | Signals into the Registry log, OpenTimestamps anchoring, public audit tool, Semaphore credentials | A third party recomputes a tally from the public log |
| **5 Government grade** | WCAG 2.1 AA audit, records export, SOC 2, state voter-file integrations, procurement packaging | First paid municipal contract |

**Business model:** free for constituents always. Paid by **offices and bodies** (SaaS per
seat or per jurisdiction), **advocacy organizations** (private drafting rooms for model
legislation), and **universities** (civics curriculum on Academia, with mock legislatures using the real
engine). Candidates can use it during campaigns to co-write platform planks, which is a natural
on-ramp through Elevate Mobilize.

---

## 12. Open questions for product

1. First pilot target: student government, church/nonprofit bylaws, or a real municipal office?
2. Is live drafting visible from the first keystroke, or only at checkpoints? (Recommend checkpoints
   by default. Live mode is opt-in for brave offices.)
3. Which verification vendor for Tier 2, and is voter-file matching acceptable in launch states?
4. Do unverified and out-of-district participants get stances at all, or only annotations?
5. Is this a Plajah-branded surface or a white-label product governments embed on `.gov` sites?
   Government buyers usually require the latter.
