# Terra Civic — Session Notes (12 Nov 2026)

Notes from the design conversation. These cover what was decided, what is still open, and what to
build first. The detailed designs are in:

- `docs/TERRA_CIVIC_FORUM_BLUEPRINT.md`: legislation engine, Law Library, meetings, revenue share
- `docs/TERRA_CIVIC_PROGRAMS_BLUEPRINT.md`: grant and program administration for governments
- `docs/TERRA_CIVIC_PRICING.md`: government pricing tiers with market research

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

## 5. Build order (when back at the computer)

1. `services/terra/civic/forum/types.ts` and `services/terra/civic/programs/types.ts`: the data models from the blueprints.
2. TerraHub: a **"For government"** tab with Terra Civic cards marked "coming soon", plus resident-facing Civic cards under "For residents".
3. **Zoning amendment impact prototype:** `ZoningRule` diffs, then `envelopeEngine` run over Detroit parcels, then a before-and-after summary. This is pure functions, so it's unit-testable like the existing engine.
4. Law Library seed: a citation parser plus a Detroit City Code Chapter 50 import into the provision graph with stable IDs.
5. Programs eligibility engine (pure, tested like `services/grants/readiness.ts`) and templates.
6. Private Draft / Publish flow on Tela.

## 6. Git status and how to recover the work

- The branch `claude/playerterra-live-legislation-4qc9h5` has **7 local commits that were never pushed**. GitHub refused the push (403) because the Claude GitHub App doesn't have access to `Kmoody2003/Plajah`.
- **Fix:** reconnect GitHub at https://claude.ai/connect-github and install the Claude GitHub App on the repo. Then ask this session to push, or run `git push -u origin claude/playerterra-live-legislation-4qc9h5` from here.
- **Backup:** `terra-civic-session.patch` (sent to you in the app; session copy at `/tmp/claude-0/-home-user-Plajah/361040f8-384f-5269-8940-80df11960751/scratchpad/terra-civic-session.patch`) contains all 7 commits. On your computer:
  ```bash
  git checkout -b claude/playerterra-live-legislation-4qc9h5
  git am terra-civic-session.patch
  ```
