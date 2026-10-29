# Chora Rights Association — scope and schema

**Status:** design + typed schema only. Nothing deployed, no token, no smart contract.
**Schema:** [`services/rightsDao/types.ts`](../services/rightsDao/types.ts)
**Date:** 29 October 2026.
**Builds on:** [`services/registry/types.ts`](../services/registry/types.ts) and
[`PLAJAH_IDENTIFIER_LEDGER_BLUEPRINT.md`](PLAJAH_IDENTIFIER_LEDGER_BLUEPRINT.md) (works, recordings, parties,
claims, the transparency log), [`services/ledger/licenseLedger.ts`](../services/ledger/licenseLedger.ts) +
[`routes/ledger.ts`](../routes/ledger.ts) (per-work licence chains), the contribution ledger in
[`services/chora/contrib/`](../services/chora/contrib/) (who-did-what per project, SEALED authorship records),
and [`BITCOIN_BLOCKCHAIN_STRATEGY.md`](../BITCOIN_BLOCKCHAIN_STRATEGY.md) + [`blockchain/`](../blockchain/).

---

## 1. What this is, and what it is not

Chora is an independent music ecosystem. Artists upload directly, keep control, and agree splits with
each other directly. Plajah hosts, takes a fee on direct sales and Plajah+, and keeps the record.

The **Chora Rights Association** is the member-run layer that does, *for music made and played on Chora*,
the jobs the industry spreads across five bodies:

| Industry body | Job | Association equivalent | Schema |
|---|---|---|---|
| ASCAP / BMI (and SESAC, GMR) | Register compositions, hold writer/publisher performance shares, pay performance royalties | Work registration, PERF shares | `WorkRegistration`, `ShareLine` |
| The MLC | Mechanical shares for reproduction / interactive streams | Same registration, MECH shares | `WorkRegistration` |
| SoundExchange | Recording-side money: master owners + featured and non-featured performers | Recording registration, MASTER + NEIGHBOURING shares | `RecordingRegistration` |
| U.S. Copyright Office | Registration, public record, date | Tamper-evident proof of authorship and date — **evidence only** | `AuthorshipProof` |
| Luminate | Play counts and charts | Chora's own play tallies, Merkle-rooted per month | `PlayPeriodReport`, `PlayTally` |

It is **not**:

- **A replacement for statutory systems outside Chora.** When a member's song is streamed on Spotify or
  played on SiriusXM, U.S. law routes that money through bodies Congress or the Copyright Office designated:
  the §115 blanket mechanical licence is administered by The MLC, and the §114 statutory licence for
  non-interactive digital transmissions is paid to SoundExchange (which splits it 50/45/5 between owner,
  featured and non-featured performers under §114(g)(2)). The association cannot opt members out of those.
  Members should stay registered with them for money earned elsewhere.
- **A copyright registration.** An anchored hash proves a file existed at a time; it does not register
  anything. Under 17 U.S.C. §411(a), a U.S. work must be registered by the Copyright Office before its owner
  can sue for infringement, and *Fourth Estate v. Wall-Street.com* (2019) held that means the Office has acted
  on the application, not merely that it was filed. §412 ties statutory damages and attorney's fees to timely
  registration. `AuthorshipProof` therefore has an `OUTSIDE_REGISTRATION` variant, and the product should prompt
  members to file (including the Office's group options for albums) rather than imply the anchor replaces it.
  This corrects the "copyright registration that costs $10" line in `BITCOIN_BLOCKCHAIN_STRATEGY.md` §Strategy 4.
- **A court.** Disputes inside the association are resolved by agreement, mediation and peer panels (§5);
  any party can still go to court, and money stays held until a court order.
- **A token sale or an investment.** See §6.

### Why direct licensing is possible at all

Inside Chora, members licence their own works and recordings to Plajah directly in the upload agreement.
That is what lets the association pay them without a PRO in the middle. Two limits follow:

1. **Outside affiliations.** ASCAP and BMI take *non-exclusive* rights from writers and publishers under their
   consent decrees, so a member can also licence directly. Some other societies and many publishing-admin deals
   are exclusive. `OutsideAffiliation.exclusive` records this; where a right is exclusively granted elsewhere, the
   association does not licence or pay it, and Plajah must obtain that licence the ordinary way.
2. **Non-member repertoire.** A cover of a non-member's song, or a sample from a non-member's record, is not the
   association's to licence. Chora still needs a mechanical licence (direct or via The MLC blanket licence as a
   digital music provider) and public-performance licences for that repertoire. `WorkRegistration.uses[]`
   records what a work embodies so these are visible, not hidden.

Legal review before launch must confirm both points against Plajah's actual licences. This document is a design,
not legal advice.

---

## 2. The model

### 2.1 Works vs recordings

The registry already models this (`RegistryWork` = composition, ISWC; `RegistryManifestation` of kind
`SOUND_RECORDING` = master, ISRC). The association never re-describes them; it registers **shares** in them.

- A **work registration** lists `ShareLine`s for `PERF` and `MECH` (and optionally `PRINT`, `SYNC`), each with a
  `side` of `WRITER` or `PUBLISHER`. The industry's habitual 50/50 writer/publisher split is a convention, not a
  rule; a self-published writer simply holds both sides. Publisher lines can carry `onBehalfOf` to show which
  writer's share they administer, mirroring `WorkContributor.publisherChain`.
- A **recording registration** lists `MASTER` lines (owners) and `NEIGHBOURING` lines (featured and non-featured
  performers, producers who hold points). It also lists which works it embodies (`embodies`, with portions for
  medleys) and the credits.
- Shares are integer **basis points** (10 000 = 100 %), validated to sum to 10 000 per right per territory. The
  registry's `RightsShare.percentage` stays the display form.

### 2.2 Where splits come from

`SplitBasis` records why the numbers are what they are:

- `CONTRIB_SUGGESTED` — the contribution ledger's `derive.ts` proposes credits and splits from who actually
  recorded, wrote lyrics, programmed, mixed, mastered. The proposal cites the SEALED entry (`ContribSealRef`) so
  anyone can re-derive it.
- `AGREED` — collaborators typed a split themselves.
- `CONTRACT` — an off-chain agreement between collaborators; only its hash is recorded.

Whatever the basis, **every share-holder countersigns the same canonical split** (`ShareConfirmation.splitHash`).
Until all have signed, the registration is `PENDING_CONFIRMATION` and nothing pays out. This keeps the
association out of the agreement itself: the collaborators agree; Plajah records.

### 2.3 Registration states

`DRAFT → PENDING_CONFIRMATION → REGISTERED`, with `CONFLICTED` when a registration overlaps another
(shares over 100 %, two owners of one master, an uncleared sample). As in the registry (`ClaimStatus.CONFLICTED`),
**money is held, never guessed**. `SUSPENDED` follows an adverse ruling or takedown; `WITHDRAWN` is the owner's choice.

### 2.4 Proof of authorship

A registration carries `AuthorshipProof[]`:

- `CONTRIB_SEAL` — the SEALED entry fixing the exact audio hashes and chain head a release was cut from.
- `LICENSE_LEDGER` — a `RIGHTS_DECLARED` or `VERSION_PUBLISHED` entry in the per-work licence chain.
- `ANCHORED_STATEMENT` — the association-log statement, with the epoch whose root was anchored.
- `OUTSIDE_REGISTRATION` — a Copyright Office (or other office) registration number and effective date.

The first three are strong evidence of *who had what, when*. Only the fourth is a registration.

### 2.5 Play tracking

Chora counts its own plays; it does not buy or estimate anyone else's.

- A `PlayRule` (minimum seconds, per-listener daily repeat cap, fraud exclusion) is fixed by governance
  (`PLAY_RULE` proposals) *before* a period starts, so a period's counts cannot be redefined after the money is known.
- Raw play events (listener, IP, device, timestamp) stay in Plajah's analytics store under its normal retention.
  Only per-recording, per-surface, per-territory **aggregates** (`PlayTally`) are hashed into the period's Merkle
  root. Each tally publishes `excluded` as well as `counted`, so fraud filtering is visible.
- `listenersApprox` is rounded down to the nearest 10 so small numbers cannot identify a listener.
- Each member receives a `DistributionStatement`; amounts are off-chain, its hash goes into the log.

Streaming fraud is an open regulatory topic. The Federal Register listed a Copyright Office notice titled
"Music Streaming Fraud" on 2026-10-07 (document 2026-20537); the music-law library's live feed tracks it. The play
rule should be revisited against whatever the Office publishes.

---

## 3. Disputes and their resolution

Grounds (`DisputeGround`): split, authorship ("I played on that and I'm missing"), ownership, uncleared sample,
infringement, play fraud, identity.

Stages (`DisputeStage`), each one a statement in the log:

1. **Filed.** Payouts on the subject are held immediately (`holdsPayouts`).
2. **Negotiation, 14 days.** The parties see each other's evidence and can settle directly — a new split,
   countersigned. Most split disputes between collaborators should end here, because the contribution ledger
   usually shows who did what.
3. **Mediation.** A trained volunteer mediator from a roster the members approve. No power to rule.
4. **Panel.** A panel of 3, 5 or 7 members rules by majority (`JuryPanel`, `Ruling`):
   - drawn by a verifiable lottery seeded from the hash of a named future Bitcoin block, so neither Plajah nor
     the parties can choose the panel;
   - conflicted members (co-writers, same label, prior disputes with a party) are excluded before the draw;
   - panelists are named to the parties, not publicly; the public record shows roll commitments only;
   - reasons are written in plain language and published with names removed, so a body of precedent builds up.
5. **Appeal.** Once, to a larger drawn panel, on the record.
6. **Closed** with an outcome: settled, upheld, rejected, withdrawn, or **referred to court** — the association
   steps back and money stays held until a court order.

**Infringement claims by outsiders** are different. If a third party says a Chora upload infringes their work,
that is a notice to Plajah as a service provider under 17 U.S.C. §512(c), handled by Plajah's DMCA process
(takedown, counter-notice, repeat-infringer policy). The association records the outcome; it does not replace §512.

Evidence (`DisputeEvidence`) is stored privately and shown only to the parties and the panel; the log holds its hash.

---

## 4. Chain and anchoring — the decision

### 4.1 Decision

**Keep one Merkle tree per epoch over the heads of every Plajah chain, and anchor only its root to Bitcoin
through OpenTimestamps. Put governance on-chain as committed hashes (proposal text hash, electorate snapshot root,
ballot root, tally) inside that same anchored root. No token, no gas for members, no smart contract required
for v1. An EVM mirror (Polygon, where `blockchain/` already targets) is optional and may be added later
for public readability, never as the source of truth.**

`AnchorEpoch` (schema) is the unit: its leaves are the association-log head, the registry root, a root over
changed licence-chain heads, a root over changed contribution-chain heads, a governance root and a play-report root.
Any one record — a split, a seal, a ballot, a tally — is then provable with an inclusion path back to a Bitcoin block.

### 4.2 Why

- **It is already the plan.** The registry blueprint chose an append-only transparency log anchored via
  OpenTimestamps (`LedgerAnchor.kind = 'OTS'`); `licenseLedger.ts` says its heads "can later be anchored
  externally". One anchoring pipeline for every chain is cheaper and simpler than one per feature.
- **Cost is flat.** OpenTimestamps aggregates many roots into one Bitcoin transaction, so one anchor per epoch
  costs effectively nothing however many songs, seals or ballots it covers. Per-record transactions (an NFT per
  track, a contract call per vote) cost per record forever.
- **Bitcoin for the timestamp.** The value of an anchor is that nobody — including Plajah — can backdate it. The
  most widely witnessed chain is the strongest witness. Smart-contract features are not needed to timestamp a hash.
- **Members never need a wallet or gas.** Ballots are signed with the Creator Passport key (passkey-held) and
  counted off-chain by deterministic, re-runnable code; anyone holding the published ballots can recount and check
  the anchored root.
- **Privacy and erasure.** Anything written to a public chain is permanent. Personal data must never be there,
  even hashed without a salt (a hash of an email is re-identifiable). Keeping records off-chain and anchoring only
  roots lets Plajah honour deletion requests: deleting a record leaves a root that no longer opens, which is fine.
- **Lessons from the 2021–2024 music-Web3 cohort** (blueprint §0): platforms where the token was the product died
  with the token cycle; infrastructure under a product people want survives.

### 4.3 What goes where

| On-chain (via the anchored root) | Off-chain (Plajah's database / storage) |
|---|---|
| Epoch Merkle roots | Legal names, emails, addresses, tax and payout details |
| Hashes of registrations, split confirmations, seals | IP addresses, devices, raw play events |
| Proposal body hashes, electorate snapshot roots, ballot roots, tallies, pass/fail | Ballots themselves (published to members for recount, not to the chain) |
| Play-report roots (aggregate tallies) | Audio, stems, session files |
| Dispute stage changes (hashes), ruling hashes | Contract text, evidence files, messages |
| Salted member-roll commitments (count + inclusion, no identity) | The salts |

### 4.4 Relation to `blockchain/`

`blockchain/contracts/` holds undeployed Solidity (PLAJToken, MusicNFT, RoyaltyDistributor, LicenseRegistry…).
None is needed for the association. In particular:

- **Governance must not be weighted by `PLAJToken` holdings.** A tradable token as voting weight makes votes
  purchasable, concentrates power, and risks the token being treated as a security. Weight comes from membership
  facts in the ledger (§6).
- **RoyaltyDistributor** could later pay out on-chain stablecoin splits for members who opt in; it would read
  `DistributionStatement`s, not decide them.
- Any future on-chain contract mirrors outcomes already decided and anchored here; the anchored log stays the source of truth.

---

## 5. Governance — who votes on what

### 5.1 Members

A **member** is a verified Plajah account with at least one `REGISTERED` work or recording (`Member`, `MemberRole`).
Verification (identity checked by the payouts provider) is required to vote, which is the Sybil defence: one person,
one membership, however many accounts. Members can leave at any time; the timelocks below give them time to.

### 5.2 Proposal classes and weighting

Each class has its own electorate, weighting, quorum and threshold (`GOVERNANCE_RULES`):

| Class | Decides | Weighting | Quorum | Pass | Timelock |
|---|---|---|---|---|---|
| CHARTER | The constitution, member rights, dissolution | One member, one vote | 20 % | ⅔ | 30 days |
| DISTRIBUTION | How play money is divided (pro-rata vs user-centric; work vs recording ratio) | **Bicameral**: writers/publishers house *and* recording-side house must both pass | 15 % | 60 % each | 30 days |
| PLAY_RULE | What counts as a play, fraud thresholds | 1 + capped √plays | 10 % | majority | applies next period |
| FEES | Plajah's fee, within a cap the charter sets | One member, one vote | 15 % | 60 % | 60 days |
| DISPUTE_POLICY | Panel sizes, deadlines, mediator roster | One member, one vote | 10 % | majority | 14 days |
| MEMBERSHIP | Suspending or expelling a member, only after a dispute finding | One member, one vote | 10 % | ⅔ | none |
| TREASURY | Spending the association's own fund (legal defence, grants) | 1 + capped √plays | 10 % | majority | 7 days |

Why these weightings:

- **One member, one vote** for anything about rights and rules of the game. A breakout artist and a first-time
  uploader have the same stake in fair rules.
- **Capped square-root of plays** only where activity is relevant (play rules, spending): a member's weight is
  `1 + min(4, √(counted plays over 12 months) / 100)`, so a large catalogue counts up to five times a small one,
  never a thousand times.
- **Bicameral** for money division, because the writer side and the recording side have opposed interests in exactly
  that question; neither can impose a split on the other.
- **Plajah's veto is legal-only**, public and reasoned (`operatorVeto: 'LEGAL_ONLY'`): the operator can block a
  proposal that would make it break the law, not one it dislikes. Membership decisions have no operator veto.

### 5.3 Mechanics

1. A member drafts a `Proposal`; its full text is stored off-chain and its `bodyHash` committed.
2. It needs sponsors (spam guard), then a discussion period.
3. When voting opens, the eligible electorate and weights are snapshotted; the snapshot root is committed.
4. Members cast `Ballot`s signed with their Passport key; a later ballot replaces an earlier one until close.
5. At close, the `Tally` (with the ballots' Merkle root) is computed and committed. Each voter can check their
   ballot's inclusion path; anyone with the published ballots can recount.
6. After the timelock, the proposal is `ENACTED` and the change takes effect.

---

## 6. Why no token

- Voting weight that can be bought is not governance by creators.
- A token whose value depends on Plajah's efforts invites securities treatment and the regulatory burden that comes with it.
- Members would need wallets, gas and exchange accounts to participate; most never will.
- Nothing in the association's job — registering, proving, counting, deciding — needs a transferable asset.

If members later want on-chain payouts, that is an opt-in payout rail (`RoyaltyDistributor` reading statements), not a governance instrument.

---

## 7. Build order (when it is green-lit)

1. **Association log** — `AssociationStatement` append + verify, same pattern as `licenseLedger.ts` (pure half) and
   `routes/ledger.ts` (server half). Server-only writes in rules.
2. **Registrations** — work + recording registration from the existing upload flow, with countersigned splits
   prefilled from `services/chora/contrib/derive.ts`.
3. **Epoch anchoring** — one job that builds `AnchorEpoch` over all chain heads and submits the root to
   OpenTimestamps; store `.ots` proofs; upgrade them once Bitcoin confirms.
4. **Play periods** — monthly `PlayPeriodReport` from Chora analytics under the current `PlayRule`.
5. **Disputes** — filing, hold, negotiation and mediation first; panels after there are enough members to draw from.
6. **Governance** — proposals and ballots last, once there is a membership to govern.

Each step ships behind the honesty rule from the registry blueprint: no UI says "verified on the ledger" or
"registered" until the signing and anchoring code for that step exists and has run.

---

## 8. Open questions for legal review

- Confirm the upload agreement grants the direct licences §1 assumes, and how it interacts with members' existing
  PRO, MLC and SoundExchange registrations (double-claim prevention).
- Whether the association should be a separate legal entity (e.g. a member-owned non-profit or cooperative) so that
  its fund and its decisions are not simply Plajah's.
- Which territories' collective-management laws (for example the EU Collective Rights Management Directive,
  2014/26/EU) would treat the association as a collective management organisation, and what that requires.
- Retention periods for raw play events and dispute evidence.
