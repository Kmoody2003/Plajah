# Terra Civic — Session Notes (12 Nov 2026)

Notes from the design conversation. These cover what was decided, what is still open, and what to
build first. The detailed designs are in:

- `docs/TERRA_CIVIC_FORUM_BLUEPRINT.md`: legislation engine, Law Library, meetings, revenue share
- `docs/TERRA_CIVIC_PROGRAMS_BLUEPRINT.md`: grant and program administration for governments
- `docs/TERRA_CIVIC_PRICING.md`: government pricing tiers with market research
- `docs/TERRA_CIVIC_LEDGER_BLUEPRINT.md`: the public Civic Record ledger and open code hosting/codification
- `docs/TERRA_CIVIC_DESK_BLUEPRINT.md`: Civic Desk, the government CRM

---

## 1. The idea in one paragraph

Turn Plajah **Terra** into the place where local governance happens. Legislators draft privately,
then publish public versions that verified constituents can read clause by clause, annotate, reword
and signal on. ARIA explains the text and summarizes what people said. A Law Library of existing
constitutions, codes and ordinances lets every draft be checked for conflicts and compared with
similar laws elsewhere. Live data, mostly Terra's own civic records, shows what each clause is trying
to change. The same system runs public meetings and hearings, and lets governments run grant programs.
Governments pay a flat subscription, and a share of that revenue funds Plajah's creators, charities
and small businesses.

## 2. Decisions made

| # | Decision |
|---|---|
| D1 | **It lives in Terra, not a new vertical.** Name: **Terra Civic** (Forum, Law Library, Meetings, Programs). TerraHub gets a **"For government"** audience tab |
| D2 | **Private Draft + Public Draft.** The office drafts privately with the full analysis suite. "Publish" creates immutable, hash-anchored Public versions. The public never sees edits made between versions |
| D3 | **Constituent signals are advisory, not binding votes.** Never market it as "blockchain voting" |
| D4 | **Blockchain is an invisible audit log.** It reuses the Registry transparency log anchored to Bitcoin. No token, no gas, no wallet. Anonymous district credentials come later (Phase 4) |
| D5 | **ARIA explains; it never decides.** Code computes tallies, eligibility and scores, and ARIA narrates them. It never votes, ranks applicants, or edits the bill without a person accepting the change |
| D6 | **Law Library + conflict analysis.** Rules-based checks (dangling references, the bill applied to current law, conflicting definitions, structural rules) can say "this is wrong". AI checks (related law, contradiction or preemption, court rulings) can only say "a lawyer should look". A cross-state similar-law finder ties to real-world outcome data |
| D7 | **Meetings, hearings and discussion boards** run on the same system, with open-meetings guardrails (no serial quorum on boards, notice proof on the ledger) |
| D8 | **Coverage follows Terra's ladder:** Detroit, then Wayne, Oakland and Macomb, then Michigan. The Law Library starts with the MI Constitution, Michigan Compiled Laws and the Detroit City Code (Chapter 50 zoning) |
| D9 | **Strongest Terra feature: zoning amendment impact.** Proposed zoning text runs through `envelopeEngine` across affected parcels, and the map shows who gains or loses buildable area |
| D10 | **Revenue model:** a flat government subscription, so no per-seat pricing and never a percentage of grant dollars. The government pays Plajah like any vendor; a share of that revenue going to creators is Plajah's own policy. **Governments never pay a fund directly** (gift-of-public-funds, budget-purpose and procurement problems) |
| D11 | **Community Revenue Pool:** charities and creators weighted most (starting 40/40), small businesses next (20). Call it a "community revenue share", not dividends or profit sharing. Pool-wide formula only. Officials of paying governments and their families are excluded. The formula is published |
| D12 | **Programs Desk:** self-serve grant administration any government can plug into. Plajah supplies the infrastructure and the government decides. Open to all eligible applicants without joining Plajah. By default Plajah never holds public money; it exports a payment file |
| D13 | **Pricing (proposal):** Village $450/mo · Town $1,150 · City/County $2,950 · Metro $6,500 · State from $12,500. Unlimited users, pooled storage, video and AI allowances, opt-in overage at cost plus 20%, increases capped at 3% a year |

| D14 | **Open code hosting:** every participating jurisdiction's code is free to read, with point-in-time history, bulk download and an open API. Ideally the city's contract designates it official. **Codification runs on the platform:** enacted amendments are applied automatically, then the clerk or codifier signs |
| D15 | **Civic Record ledger = a transparency log** (the Certificate Transparency / Sigstore model): statements signed by officials, a Merkle log, checkpoints cosigned by independent witnesses (libraries, universities, press), and timestamps anchored to Bitcoin via OpenTimestamps. **No token, wallet, gas, NFT or EVM mirror.** Kept separate from `blockchain/contracts/*`. See `TERRA_CIVIC_LEDGER_BLUEPRINT.md` |
| D16 | **The ledger also logs data governance and AI provenance:** sensitive-data access, records disposal, and which ARIA model produced each published analysis. No personal data goes in the log, only salted commitments that can be crypto-shredded |

| D17 | **Pricing is the Civic Rate:** $2,400 a year + 30¢ per resident (15¢ above a million). One public formula for the whole government, every department and employee included (pricing doc §3D) |
| D18 | **Civic Desk = the government CRM:** one record per resident, business and organization; cases routed by service and ward against response targets; duplicate detection; redacted public view. Preview built (`components/terra/civic/CivicDesk.tsx`), see `TERRA_CIVIC_DESK_BLUEPRINT.md` |

| D19 | **Civic Notices:** Plajah users follow their address, ward, parcel, case, law sections or topics and get government updates in-app, by push and by email, with per-channel consent, quiet hours, digests and their language. Statutory notices (e.g. MCL 125.3103) are checked, never replaced |
| D20 | **Tela Sign:** a native DocuSign-class signing product in the Tela document layer: envelopes, routing order, ESIGN consent, drawn or typed signatures, a hash-chained audit trail, a certificate, and UETA/ESIGN exclusion checks. See `TELA_SIGN_BLUEPRINT.md` |

## 3. Legal issues flagged (take to counsel)

- Gift of public funds and appropriation purpose. This is why governments pay Plajah, not a fund (D10).
- Officials' conflicts of interest in contracts (for example California Gov. Code §1090), so pool exclusions are needed.
- First Amendment limits on government-run forums (*Lindke v. Freed*, 2024), so moderation must be viewpoint-neutral and offices can't delete comments.
- Open-meetings laws (Michigan OMA; serial quorums on boards), public records (Michigan FOIA), records retention.
- Whether unpublished drafts are exempt from records requests varies by state, so the office's counsel decides.
- ADA Title II web rule: WCAG 2.1 AA.
- Securities risk if payouts are called dividends or tied to `PLAJToken.sol`.
- Religion clauses and Blaine-style state rules, because Elevate churches are on the platform.
- Federal grant rules (2 CFR 200, Single Audit $1M threshold, FFATA), plus CDBG and ARPA rules, for Programs.
- Law text is public domain (*Georgia v. Public.Resource.Org*), but Municode and American Legal terms restrict bulk copying.

## 4. Open questions for you

1. First Forum pilot: a Detroit zoning amendment or Community Benefits Ordinance engagement (recommended), a councilmember's office, or a low-stakes rehearsal (student government, church bylaws)?
2. First Programs tenant: an Elevate church/nonprofit coalition fund (easiest), a Detroit façade or home-repair program (best Terra fit), or a small tri-county city?
3. Plajah-branded, or white-label embedded on `.gov` sites?
4. Which ID-verification vendor (shared by Forum Tier 2 and Programs)?
5. What percentage of civic revenue goes to the pool, and what formula splits it inside each category?
6. Should Programs ever disburse money itself (fiscal-agent mode)?
7. Should Meetings be the wedge product, since cities already buy meeting software?
8. Validate the video cost line with real Mux usage before publishing prices.
9. ~~UELMA in Michigan~~ **Answered:** yes, 2018 PA 488 (see §7). Still open: which Michigan institutions should be the first witnesses?

## 5. Build order (when back at the computer)

1. `services/terra/civic/forum/types.ts` and `services/terra/civic/programs/types.ts`: the data models from the blueprints.
2. TerraHub: a **"For government"** tab with Terra Civic cards marked "coming soon", plus resident-facing Civic cards under "For residents".
3. **Zoning amendment impact prototype:** `ZoningRule` diffs, then `envelopeEngine` run over Detroit parcels, then a before-and-after summary. This is pure functions, so it's unit-testable like the existing engine.
4. Law Library seed: a citation parser plus a Detroit City Code Chapter 50 import into the provision graph with stable IDs.
5. Programs eligibility engine (pure, tested like `services/grants/readiness.ts`) and templates.
6. Private Draft / Publish flow on Tela.
7. Civic ledger: statement schema, then official passkey signing, then the tile log with OpenTimestamps, then the in-browser verifier and record badges, then witnesses (Ledger blueprint §9).

## 7. Research: Michigan law sources (12 Nov 2026)

Found by web search. The legislature's site was blocked from this session, so these details still
need to be checked by hand.

- **Michigan Compiled Laws (MCL):** the Legislature publishes per-chapter **XML** files in a
  public directory (`legislature.mi.gov/documents/mcl/`), plus an archive folder with yearly
  snapshots from 2013 to 2026, and per-section and per-chapter PDFs. No single zip bulk download was
  found; we'd crawl the chapter XML files politely.
- **Michigan Constitution (1963):** the Legislature's own PDF publication, supplemented through June 2025
  (`legislature.mi.gov/Publications/MIConstitution.pdf`), plus per-article PDFs in the MCL system.
- **UELMA:** **Michigan enacted it**, as 2018 PA 488, MCL 4.1121–4.1131, effective 28 Dec 2018.
  It covers the 1963 Constitution, public acts, the MCL and administrative rules. Still to check:
  which electronic version is designated official, and how it's authenticated. Our ledger should
  verify against that official source.
- **Copyright:** MCL 4.1204 and 4.1204b say online publication doesn't waive the **state's copyright
  or proprietary interests**. Access must be free, but free access doesn't automatically mean free
  reuse. The Legislative Council has registered copyright in compilation and editorial matter.
  The statute text itself is uncopyrightable, and under *Georgia v. Public.Resource.Org* (2020),
  work produced by a legislature's own agency (the Legislative Service Bureau) in the course of its
  duties is likely uncopyrightable too. **Plan:** host the text, generate our own structure and
  summaries, label pages "Unofficial copy", and **ask the Legislative Service Bureau for a data
  partnership or written permission** before launch. It's low cost and buys goodwill with the people
  who run the official source.
- **Detroit City Code:** check where the official current code is hosted (the city's site and/or a
  codifier such as Municode) and its terms of use. The Detroit contract should grant hosting and
  official-designation rights.

## 8. Built: Law Library preview (12 Nov 2026)

**What's in it:** all of Michigan's Compiled Laws (240 chapters, 3,995 acts, 43,550 sections) and the
1963 Constitution (13 articles, 281 sections), current through PA 114 of 2026. Everything was ingested
from the Legislature's public XML and PDFs.

- **Ingest:** `npm run terra:law:ingest` (= `scripts/terra/ingestMichiganLaw.ts --fetch`) downloads
  the chapter XML and Constitution PDFs (one file a second) and writes gzipped JSON to
  `data/terraLaw/mi/` (~20 MB). The Constitution text comes from MCL "chapter 1" (the Legislature's
  structured XML of it). The PDFs supply the preamble and the "current through" line. `pdftotext`
  (poppler) is required.
- **Parsers:** `services/terra/law/` (`miniXml`, `michiganMcl`, `michiganConstitution`, `lawSearch`,
  `lawTypes`). These are pure functions with tests in `tests/terraLaw*.test.ts` (`npm run test:terralaw`).
- **API:** `routes/terraLaw.ts`, mounted in `server.ts`. Public and read-only: index, search index,
  Constitution, chapter and section.
- **UI:** `components/terra/TerraLawLibrary.tsx`, view `TERRA_LAW`. It has a hero search, a "Running a
  business?" rail (17 topics, each verified to resolve to a real act), a Constitution feature,
  chapter browsing, a reader with Share / Cite / Official text, previous and next section, recently
  viewed, and history and notes labelled as editorial.
- **Access:** the TerraHub card is **admins only (private beta)**. Law pages themselves are public
  and shareable by link: `/?view=law&law=mcl-125.3201`, `/?view=law&law=const-IX`,
  `/?view=law&law=ch-408`.
- **Labelled unofficial everywhere,** with the source and "current through", and a link to the
  official page for every section.

**Legal follow-up before a wider launch:** the Legislature's Constitution booklet says it is
"provided free to Michigan citizens and is not for reproduction for resale or profit", and
MCL 4.1204 preserves the state's claimed copyright in its compilation. We serve the text free, never
paywalled, and label it unofficial. Still, **ask the Legislative Service Bureau for written permission
or a data partnership** before promoting it beyond reviewers.

**Next:** Detroit City Code (needs the city's source and terms); "Explain this section" with ARIA
(plain-language summaries, labelled AI); pending bills (Open States / the Legislature's bill data);
and linking zoning sections to Terra parcels.

## 6. Git status and how to recover the work

- The branch `claude/playerterra-live-legislation-4qc9h5` has **7 local commits that were never pushed**. GitHub refused the push (403) because the Claude GitHub App doesn't have access to `Kmoody2003/Plajah`.
- **Fix:** reconnect GitHub at https://claude.ai/connect-github and install the Claude GitHub App on the repo. Then ask this session to push, or run `git push -u origin claude/playerterra-live-legislation-4qc9h5` from here.
- **Backup:** `terra-civic-session.patch` (sent to you in the app; session copy at `/tmp/claude-0/-home-user-Plajah/361040f8-384f-5269-8940-80df11960751/scratchpad/terra-civic-session.patch`) contains all 7 commits. On your computer:
  ```bash
  git checkout -b claude/playerterra-live-legislation-4qc9h5
  git am terra-civic-session.patch
  ```
