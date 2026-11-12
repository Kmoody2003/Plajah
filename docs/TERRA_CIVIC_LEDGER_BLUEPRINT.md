# Terra Civic — The Civic Record Ledger and Open Code Hosting (Blueprint)

**Home:** Plajah Terra → Terra Civic. Companion to `TERRA_CIVIC_FORUM_BLUEPRINT.md` (§4.2 and §8),
`TERRA_CIVIC_PROGRAMS_BLUEPRINT.md` (§7) and the Registry design it extends
(`docs/PLAJAH_IDENTIFIER_LEDGER_BLUEPRINT.md`, `services/registry/types.ts`).
**Status:** design only. Nothing wired.
**Date:** 12 November 2026.

---

## 0. The thesis

Laws, codes and the process that produces them should be **public, permanent and checkable by
anyone**, not just "trust us, this is what the city passed." Terra Civic hosts every participating
jurisdiction's code and legislation openly and free to read. Every official act (a bill version, a
vote, an enactment, a code amendment, a meeting notice, a program award) is written to a **public
transparency log** that nobody can quietly rewrite, Plajah included.

The technology is a **transparency log**, the same design that secures every HTTPS certificate on
the web (Certificate Transparency, RFC 6962/9162) and the software supply chain (Sigstore Rekor,
the Go checksum database). It's anchored to Bitcoin only as a **public clock and notary**. It
involves:

- **no token, coin, NFT or anything to buy or sell**
- **no wallet, gas fees or crypto knowledge** for residents, staff or officials
- **no mining or speculation**, and Plajah holds no crypto
- **no "blockchain voting"** (Forum §0 rule 1)

What people can get behind: *"Every law on this site is signed by the official who certified it,
timestamped by an independent public clock, copied by libraries and universities, and checkable on
your own phone. If anyone, including us, changes a word after the fact, it shows."*

---

## 1. Why this design and not "a blockchain"

| Option | Verdict |
|---|---|
| **Put records on a public smart-contract chain** (Ethereum etc.) | No. Gas fees, wallets, a token association, and public-chain immutability is a problem for personal data that must later be corrected or expunged. Governments also can't easily hold or spend crypto |
| **Private or permissioned blockchain** (a Hyperledger-style network run by Plajah) | No. If Plajah runs all the nodes, it proves no more than a signed database. It's cost and complexity with no added trust |
| **Transparency log + Bitcoin timestamp anchoring + independent witnesses** | **Yes.** Proven at internet scale, nearly free, append-only, verifiable by anyone, mirrorable, and needs no token. Bitcoin gives an independent clock no one can backdate. Witnesses (libraries, universities, newspapers, other cities) give independence within minutes instead of hours |

This was already the Registry's plan (append-only Merkle log, epoch tree heads, OpenTimestamps).
The civic ledger is a **second log on the same machinery**, with its own signers, record types and
witnesses.

**One change from the Registry plan:** the civic log **drops the optional EVM mirror**. It adds no
trust over Bitcoin timestamps plus witnesses, and it invites exactly the crypto association we
want to avoid. Keep the civic stack fully separate from `blockchain/contracts/*` (`PLAJToken.sol` and
the rest).

---

## 2. How it works

```
 Official act (e.g. clerk certifies Ordinance 2027-14)
        │  signed with the clerk's own key (passkey / hardware key)
        ▼
 Civic statement  {kind, jurisdiction, subject, contentHash, signer, signature, time}
        │  appended — never edited, never deleted
        ▼
 Merkle tree (tile-based transparency log)
        │  every few minutes
        ▼
 Checkpoint (signed tree head: size + root hash)
        ├─► co-signed by independent witnesses (library, university, press, other cities)
        ├─► timestamped to Bitcoin via OpenTimestamps (free, aggregated, ~hours to confirm)
        └─► published as static files on a CDN + mirrored by anyone
                         │
 Resident's phone / any auditor: verify signature → inclusion proof → checkpoint → witnesses → Bitcoin
```

- **Statements** are small, canonical JSON (JCS, as the Registry already specifies), signed by the
  **official who performed the act**, not by Plajah. The clerk signs enactments, the chair signs
  roll calls, the program manager signs awards. Plajah signs only checkpoints, as the log operator.
- **Content** (bill text, code sections, agendas, minutes, video) is stored in content-addressed
  storage and referenced by hash. Public legal text is published in full. Anything personal is
  never put in the log, only a salted commitment (§6).
- **The log format** follows the open C2SP *tlog-tiles* and *checkpoint* specs, with the witness
  cosigning protocol. The log is just static files, so it's cheap to serve, trivial to mirror, and
  easy for anyone to verify. Recommended implementation: Trillian **Tessera** (the
  transparency-dev project's tile-based log library) as a small Go service writing to Cloud
  Storage, or a TypeScript implementation of the same specs if we'd rather stay in one language.
- **Witnesses** are independent organizations that run a tiny open-source program. It checks that
  each new checkpoint extends the last one (a consistency proof) and cosigns it. If Plajah ever
  showed different histories to different people, witnesses would refuse to cosign and the split
  would be visible. Target witnesses for Michigan: university law libraries, the Library of
  Michigan, civic groups such as the League of Women Voters, local newsrooms, and other
  participating cities.
- **Bitcoin anchoring** uses OpenTimestamps calendar servers, which bundle hashes from everyone into
  one Bitcoin transaction. It costs nothing per record, needs no key or wallet, and Plajah holds no coin.

---

## 3. What gets recorded

| Area | Statement kinds (examples) | Signed by |
|---|---|---|
| **Codes** | `code.section_version` (the section's text hash, effective dates, the ordinance that produced it), `code.amendment_applied` (before hash → after hash, from ordinance X), `code.edition_published` (the hash of the whole compiled code on a date), `code.official_designation` | City clerk / codifier |
| **Legislation** | `bill.public_version`, `bill.sponsor_signed`, `committee.action`, `rollcall.vote`, `enactment.certified`, `executive.signed` / `executive.vetoed`, `effective_date.set` | Sponsor office, committee chair, clerk, mayor |
| **Meetings** | `meeting.notice_posted` (proves the legal deadline was met), `agenda.published`, `minutes.approved`, `recording.published` | Clerk |
| **Participation** | `signals.tally_epoch` (counts plus a Merkle root of the anonymous signals), `office.response`, `moderation.removal` (the content hash and the rule cited, never the content) | Office / moderator |
| **Programs** | `program.rules_version`, `award.decision`, `award.payment_exported` | Program manager |
| **Data governance** | `access.sensitive_data` (a staff account, which may be pseudonymous, opened applicant PII, and why), `export.records_request`, `retention.disposed` | System, on behalf of the actor |
| **AI provenance** | `analysis.run` (which ARIA model and version, a prompt-template hash, the input and output hashes) for every conflict report and comment synthesis published | System |
| **Corrections** | `erratum` and `supersedes` (a new statement points to the old one; nothing is ever deleted) | Original signer |
| **Keys** | `key.registered`, `key.rotated`, `key.revoked` (who holds signing authority, and when it changed) | Jurisdiction admin plus a Plajah co-signature |

The **data-governance and AI-provenance rows** are what make this more than a document notary.
The public can see *that* sensitive data was accessed, by whom and why, how often records were
disposed of under the retention schedule, and exactly which AI produced which published analysis.
None of the private data itself is exposed.

---

## 4. Open code hosting and codification on the platform

**Goal:** every participating jurisdiction's code is hosted on Terra, free to read with no account,
with full point-in-time history, bulk download and an open API. Ideally the city's contract
designates it as an official publication. The law is public domain (*Georgia v.
Public.Resource.Org*, 2020). Plajah's structure, plain-language summaries and annotations are
published under an open license (CC BY).

**Codification workflow (on the platform, end to end):**

1. A bill is enacted in Forum (`enactment.certified`).
2. Its amendment instructions ("strike … insert …") are applied to the current code by the
   comparative-print engine (Forum §8.2 step 2). The result is a **proposed code update** with a
   redline against current law.
3. The **clerk or a codifier partner** reviews editorial matters (numbering, cross-references, codifier's notes)
   and signs `code.amendment_applied` for each changed section.
4. The new code edition is published: `code.edition_published`, with every section's hash and its effective date.
5. Point-in-time views ("the code as of 1 March 2027") are rebuilt from the log, so history can't be
   rewritten.

This turns codification from a slow vendor supplement cycle, often paid per page and months behind,
into same-week updates. It replaces the earlier note in the pricing doc that "we don't replace
codification". **We provide the tooling; a human with legal authority still signs.** Cities can keep
their codifier as the editorial reviewer, on the platform.

**"Decentralized" in practice:**

- **Open formats:** the code is exported in Akoma Ntoso and USLM-style XML, JSON and PDF, and the full log
  is published as static tiles.
- **Anyone can mirror** the code and the log, including competitors. The city always holds a complete
  copy (contractual exit guarantee plus escrow).
- **Independent witnesses and mirrors** mean the record survives Plajah.
- **Many jurisdictions in one graph,** so cross-references between city, county and state law resolve
  across jurisdictions (Forum §8).

**Official status and UELMA.** The Uniform Electronic Legal Material Act, adopted in a number of
states, requires that *official* electronic legal material be **authenticated** (verifiable as
unaltered), **preserved** and **publicly accessible**. That is almost exactly what this ledger
provides: an official's signature, a hash, an independent timestamp and mirrors. Check whether
Michigan and each later state has enacted UELMA. Either way, it's the right standard to design to,
and a strong procurement argument. Until a city formally designates Terra's copy as official,
pages say **"Unofficial copy, verified to match the version certified by the City Clerk on [date]"**.

---

## 5. Verification UX

Every code section, bill version, vote, notice and award has a small **record badge**:

| Badge | Meaning |
|---|---|
| **Certified · Anchored** | Signed by the named official, included in the log, cosigned by witnesses, and its checkpoint timestamped in Bitcoin block N |
| **Certified · Witnessed** | Signed and cosigned by witnesses; the Bitcoin timestamp is still confirming (usually a few hours) |
| **Fingerprinted** | Content hash recorded, but not yet signed by an official. Same honest wording Terra's Open Listing Record already uses |
| **Unofficial** | Hosted copy, not certified |

Tapping the badge shows who signed, when, the witness names, the Bitcoin block, and a **"Verify on
this device"** button. That runs the checks in the browser: hash the text, check the signature,
check the Merkle inclusion proof against the checkpoint, check the witness cosignatures, and check the
OpenTimestamps proof against Bitcoin block headers. It shows each step passing. An open-source
command-line verifier does the same for auditors and journalists.

A public **Civic Record explorer** in Terra lets anyone browse by jurisdiction, bill, code section or
date, see the full history of any section, and download proofs.

---

## 6. Privacy: permanent proof, removable content

A permanent public log and personal data don't mix, so:

- **No personal data goes in the log.** People-related records (comments, applicants, accessed files)
  are logged only as **salted commitments**. The salt is stored separately, and deleting the salt
  ("crypto-shredding") makes the entry unlinkable forever while the log stays intact.
- **Removed or expunged content leaves only a tombstone:** "a comment was removed under rule 3 on
  [date]", with no text and no linkable hash.
- **Retention schedules apply to content.** The log proves something existed and was disposed of
  on schedule (`retention.disposed`).
- **Anonymous signals** (Forum §4.2) enter the log only as nullifiers inside a tally root.
- **Public law text is published in full,** since it's public by definition.

---

## 7. Governance of the ledger itself

Trust comes from people as much as from math:

- **A public ledger charter:** what gets logged, who can sign, how corrections work, and what Plajah
  can and can't do as operator.
- **A witness council:** independent organizations, with a published list and no payment tied to
  outcomes.
- **Open source:** the log server configuration, the verifier and the witness software.
- **A published key ceremony** for each jurisdiction's signing keys, with officials' keys held on
  hardware or passkeys and recorded in the log (`key.*` statements).
- **An annual third-party audit**, with results published, and public incident disclosure.
- **An exit guarantee:** the government owns its data, has a full export at any time, and its records
  stay verifiable from mirrors even if Plajah disappears.

---

## 8. Cost

| Piece | Cost |
|---|---|
| Bitcoin timestamps (OpenTimestamps) | Free |
| Log storage and serving (static tiles on a CDN) | Cents to a few dollars per jurisdiction per month |
| Witness software | Free and open source; runs on a tiny VM or even a Raspberry Pi |
| Content storage | Already in the pricing allowances (`TERRA_CIVIC_PRICING.md`) |

It fits inside every pricing tier without changing prices.

---

## 9. Build order

1. **Statement schema** for civic kinds, extending the Registry's `LedgerStatement` with
   `jurisdiction` and `kind`, plus canonical JSON and hashing (pure and testable).
2. **Official signing** with passkeys/WebAuthn and a key registry (`key.*` statements).
3. **The log service** (Tessera or a TypeScript tile log) plus checkpoints, and OpenTimestamps
   anchoring of each checkpoint.
4. **Verifier** in the browser and on the command line, plus the record badges in Terra.
5. **Witness program** and the first witness partners in Michigan.
6. **Codification workflow** (Forum §8.2 comparative print, then clerk sign-off, then a code edition).
7. **Civic Record explorer,** bulk exports and mirrors.

---

## 10. Open questions

1. Has Michigan adopted UELMA? This affects how "official" Terra-hosted codes can be on day one.
2. Which Michigan institutions should we approach first as witnesses?
3. Should we run our own Bitcoin timestamp calendar server as well as the public OpenTimestamps
   ones, for redundancy?
4. Tessera (Go) or a TypeScript tile log?
5. Should codifier partners sign alongside clerks, or only review?
