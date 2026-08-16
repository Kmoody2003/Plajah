# Plajah Identifier Registry & Rights Ledger — Blueprint

**Status:** design + research. Nothing wired. Phase 0 typed foundation lands with this doc
(`services/registry/types.ts`, `services/registry/identifiers.ts`).
**Date:** 14 August 2026.
**Scope:** Chora (music), Lorea (books/comics), Taleo (film/TV) — plus the label/studio/publisher
on-ramp for bringing an existing catalogue onto the platform.

---

## 0. The thesis

Plajah is currently excellent for one independent artist with no paperwork. The moment a real
rights-holder shows up — a label with 4,000 masters, a publisher with 900 ISBNs, a studio with
a slate — the platform has nothing to say to them, because it has no concept of a **work**,
a **recording**, a **product**, a **party**, or a **share**. Everything is `Track`, `Album`,
`Book`, flat strings, one owner UID.

Two things are being built here, and they must stay separable:

1. **The parallel system (the point).** A free, content-derived, cryptographically verifiable
   registry of works, recordings, products, parties and rights claims, running on an
   append-only transparency log anchored to Bitcoin — costing effectively **$0 per record** at
   any scale. This is Plajah's own standard, and it is the thing that is actually novel.
2. **The traditional bridge (the price of admission).** ISRC/ISWC/ISBN/UPC/EIDR/DDEX/ONIX/CWR
   import and export, so a label can arrive with what it already has, and leave with what the
   rest of the industry demands. This is a plugin layer, not the core.

**Design rule #1: never invent a number where an ISO one exists.** Plajah's identifiers are
*keys and hashes*, not a competing numbering authority. The registry's value is the graph and
the proof, not the digits.

**Design rule #2: the ledger is invisible.** The 2021–2024 music-Web3 cohort (Royal.io — $71M
raised, shut down 2024; most NFT-first platforms) died because the blockchain *was* the
product. Where blockchain is infrastructure under a product people already want, it survives
the token cycle. No token. No gas per record. No wallet required to register a song.
([post-mortem](https://www.chartlex.com/blog/business/music-nft-web3-post-mortem-2026))

**Design rule #3: the ledger records claims, not truth.** The Global Repertoire Database
collapsed trying to produce one authoritative answer for who owns what. Plajah's log stores
*signed assertions*, surfaces conflicts, and lets consumers decide. That is achievable; a
global truth oracle is not.

---

## 1. What the industry actually uses (research)

### 1.1 The five layers — the same shape in every vertical

Every media industry independently converged on the same ladder. Plajah's schema is this ladder,
once, with per-vertical vocabulary:

| Layer | Music | Books | Film/TV |
|---|---|---|---|
| **Party** — who | IPI/CAE, ISNI, DPID, Label Code (LC), GS1 prefix | ISNI, ORCID, publisher ISBN prefix | EIDR Party ID, ISNI |
| **Work** — the abstract creation | **ISWC** (composition) | ISTC (largely dormant), work-level in BIBFRAME | EIDR *Abstraction*, ISAN root |
| **Manifestation** — a specific fixation | **ISRC** (sound recording) | edition/format (ebook/audio/hardcover) | EIDR *Edit*, ISAN version |
| **Product** — the sellable package | **UPC/EAN (GTIN-13)**, GRid, label catalogue number | **ISBN-13** | EIDR *Manifestation*, retailer SKU |
| **Message** — how it moves | DDEX ERN / RIN / MWN / MEAD / DSR | ONIX 3.1 | MovieLabs MMC / IMF / Common Metadata |

The user's question "the numbering system for artists on record labels" is two things that get
conflated: the **catalogue number** (the label's own private sequence — `PLJ-0042` — no
authority issues it, it's just a string the label controls) and the **UPC/GTIN** (issued from a
GS1 company prefix, required by every retailer and DSP).

### 1.2 Music, in detail

- **ISRC** — one per recording, per version. `CC-XXX-YY-NNNNN`. In the US a registrant code is
  a **one-time $95** from the RIAA and lets you assign **up to 100,000 ISRCs/year, for life**;
  most distributors assign them free as part of the service.
  ([usisrc.org](https://usisrc.org/faqs/registration_fees.html))
- **ISWC** — one per composition. **Free**, but there is no direct path: it is allocated by a
  CMO/PRO when the work is registered. ([iswc.org](https://www.iswc.org/creators-publishers))
- **IPI/CAE** — the number ASCAP/BMI/SOCAN/PRS use to identify a *writer or publisher*. This,
  plus ISWC plus splits, is literally how performance royalties get tracked. Obtained by
  affiliating with a PRO.
- **CWR (Common Works Registration)** — the CISAC flat-file format for registering works with
  PROs. Requires a **CISAC sender/submitter code** (numeric for societies, alphabetic for
  publishers). **MusicMark** accepts one CWR file for **ASCAP + BMI + SOCAN simultaneously**;
  **The MLC** (US mechanicals) accepts CWR and will help you obtain a sender code.
  ([MLC CWR guide](https://www.themlc.com/hubfs/CWR%20User%20Guide_May%202024_FINAL.pdf),
  [MusicMark](https://musicmark.com/documents/MusicMark-getting-started.pdf))
- **DDEX** — the delivery standards family. **ERN 4.3** (release notification; UMG, Beggars and
  Spotify committed), **RIN** (studio/session credits), **MWN/MWL** (works), **MEAD** (marketing
  metadata), **DSR** (sales/usage reporting back to the label), and — critically for onboarding —
  **Catalogue Transfer Standard 1.0**, published alongside the ERN 4.3 update, which is
  purpose-built for moving a catalogue from one distributor to another. The **implementation
  licence is free**. ([DDEX](https://ddex.net/ddex-publishes-ern-4-3-update-and-catalogue-transfer-standard-1-0/),
  [licence](https://ddex.net/implementation-licence/))
- 2026 ingestion reality at the majors: complete contributor credits (performers, writers,
  producers, engineers), **no duplicate ISRCs across the catalogue**, artwork ≥ 3000×3000.
  ([rightsHUB](https://rightshub.net/news/music-metadata-requirements-2026))

### 1.3 Books

- **ISBN-13** — per *edition and format*. Hardcover, paperback, ebook, audiobook = four ISBNs.
  US pricing (Bowker, 2026): **$125 for one, $295 for ten, ~$575 for 100**. Free from the
  national agency in Canada, India, New Zealand and others.
  ([pricing](https://books.by/guides/how-to-get-an-isbn))
- **ONIX for Books 3.0 / 3.1** (EDItEUR) — the ONIX feed *is* how a publisher's catalogue reaches
  retailers, wholesalers and libraries. It carries prices qualified by usage rights, which maps
  directly onto Plajah's paywall/licence model. ([EDItEUR](https://editeur.org/files/ONIX%203/Introduction_to_ONIX_for_Books_3.1.1.pdf))
- **BISAC** (US) and **Thema** (international) subject codes, **LCCN**, **DOI** for chapters and
  academic work, **ISSN** for serials, **GTIN** for the physical object, **ISNI/ORCID** for authors.
- Lorea's comic/manga side additionally wants ISBN per volume + ISSN for a serialised run.

### 1.4 Film / TV

- **EIDR** — the universal media identifier; Amazon and most retail pipelines require it.
  Membership is a flat annual fee by revenue: **Contributor 1 = $6,000/yr** (< $100M revenue),
  rising to $30,000, with **unlimited ID creation and unlimited API usage** at every tier.
  ([eidr.org/pricing](https://www.eidr.org/pricing))
- **ISAN** — the ISO equivalent; EIDR and ISAN-IA run a **joint dual-registration service**, so
  one registration can yield both.
- **Ad-ID** for advertising, **IMDb/TMDB IDs** as de-facto keys, **MovieLabs MMC/Common Metadata**
  and **IMF** for delivery packages.
- The film↔music seam Plajah already half-owns: **music cue sheets**. A Taleo production that
  uses a Chora track should be able to emit a PRO-ready cue sheet automatically. Nobody in the
  indie space does this well.

### 1.5 The cross-cutting keystone: ISCC

**ISCC — ISO 24138:2024**, published 15 May 2024. An open, algorithmic content code derived
*directly from the file*: **no registry, no assignment step, no fee**, and anyone can recompute
the same code from the same content. It covers text, image, audio and video, and — the important
part — it **clusters near-identical content**, so a re-encode, a different bitrate, or a
re-delivered master still resolves to a neighbouring code.
([iscc.io](https://iscc.io/), [ISO](https://www.iso.org/standard/77899.html))

This is the single most important external decision in this blueprint. ISCC gives Plajah:
- a free, standards-backed identifier for *every* asset from day one, with no registrar;
- de-duplication across catalogue deliveries (the same master arriving twice from two labels);
- a content-derived join key between Plajah's registry and anyone else's;
- an anchor target that is meaningful without trusting Plajah's database.

**Plajah adopts ISCC as the manifestation-level identifier. It does not invent a substitute.**

---

## 2. The parallel system: the Plajah Registry

### 2.1 Identifier design

```
plj:party:<uuidv7>            → also carries did:plc:… (Creator Passport), ISNI, IPI, DPID
plj:work:<uuidv7>             → abstract; carries ISWC / ISTC when known
plj:manifest:<iscc>           → content-derived, deterministic; carries ISRC / EIDR-edit / edition
plj:product:<uuidv7>          → carries GTIN / ISBN / GRid / catalogue number
plj:claim:<uuidv7>            → an assertion of a right over one of the above
```

UUIDv7 for the abstract layers (time-sortable, collision-free, mintable offline). ISCC for the
one layer where the content itself can define identity. Parties additionally get a **DID** from
the Creator Passport work already specced — which is what makes an artist's registry history
*portable off Plajah*, and is the honest differentiator versus a label-owned system.

### 2.2 The ledger — a transparency log, not a chain

```
statement (JSON, JCS-canonicalised)
   └─ signed by the asserting party's key (Creator Passport / passkey-held)
        └─ leaf in an append-only Merkle tree  ← Certificate-Transparency / Sigstore-Rekor model
             └─ epoch root (Signed Tree Head), every ~10 min, signed by Plajah
                  ├─ anchored FREE to Bitcoin via OpenTimestamps  (aggregated, no fee, no key)
                  └─ optionally mirrored to an EVM L2 (~cents per epoch, amortised → ~$0/record)
```

Why this shape:

- **Cost.** OpenTimestamps calendar servers aggregate hashes from everyone into one Bitcoin
  transaction; anchoring is free and requires no registration or API key, and aggregation gives
  "almost unlimited scalability". One epoch root covers a million statements, so the marginal
  cost of registering a song is zero.
  ([OpenTimestamps](https://petertodd.org/2016/opentimestamps-announcement))
- **Proof.** Anyone holding a statement plus its inclusion proof plus the `.ots` file can verify
  — without Plajah, offline, forever — that this exact split sheet existed at that time and was
  signed by that DID. Rekor proves this model works at ecosystem scale.
  ([Rekor](https://docs.sigstore.dev/logging/overview/))
- **No gas, no wallet, no token.** A songwriter registering a split never touches crypto.
- **Auditability instead of consensus.** Third parties (labels, PROs, a mirror run by a rival
  platform) can replicate the log and witness the tree heads. Misbehaviour by Plajah — a
  retroactive edit — is *detectable*, which is the actual security property that matters.

**Boundary with existing on-chain work.** `services/blockchainContractService.ts` and
`athleteChainService.ts` already model Polygon/USDC contracts for licensing, escrow, NFTs and
royalty distribution. That stays exactly where it is: **money on-chain, metadata on the log.**
Never put a catalogue on an EVM chain — the per-record cost is the reason every prior attempt
stalled.

**Honesty note (carry it into the code, like `creatorPassport.ts` does).** Until statements are
actually signed and anchored, a registry record proves nothing more than "Plajah's database says
so". Phase 3 is what makes the word "ledger" true; don't let UI copy run ahead of it.

### 2.3 Claims and conflict

A `RegistryClaim` is *(party, entity, right type, territory, period, percentage, evidence)*.
Two labels can both claim 100% of a master. The registry stores both, marks them
`CONFLICTED`, exposes both to consumers with their evidence and timestamps, and routes them to
a resolution workflow. Revenue on a conflicted asset is held, not guessed. This is the
difference between a registry that survives contact with the industry and one that doesn't.

---

## 3. The schema

Full TypeScript in `services/registry/types.ts`. Shape summary:

```
RegistryParty        id, kind (ARTIST|WRITER|PUBLISHER|LABEL|IMPRINT|STUDIO|ESTATE|SOCIETY),
                     names[], identifiers: ExternalId[], plajahUid?, did?, orgId?, memberships[]

RegistryWork         id, kind (MUSICAL|LITERARY|AUDIOVISUAL|DRAMATIC), titles[], iswc?, istc?,
                     contributors: WorkContributor[]  (role code, partyRef, ipi, controlled,
                     sharePerf/shareMech/shareSync, publisher chain), derivedFrom[], language

RegistryManifestation id (= ISCC), isrc?/eidr?/isan?, workUses[], kind (SOUND_RECORDING|
                     BOOK_EDITION|AV_EDIT|COMIC_VOLUME), technical{}, credits[] (RIN roles),
                     masterOwners: RightsShare[], pLine, explicit, immersive

RegistryProduct      id, kind (ALBUM|EP|SINGLE|EBOOK|PAPERBACK|AUDIOBOOK|FEATURE|SEASON|…),
                     gtin?/isbn?/grid?, catalogNumber, labelPartyId, items[] (sequence →
                     manifestation), releaseDate, territories, cLine/pLine, artwork, genres[]

ExternalId           { scheme, value, status: ASSERTED|VERIFIED|DISPUTED|RETIRED, source,
                       assertedBy, assertedAt, evidence? }        ← every foreign ID is a claim

RightsShare          party, rightType (PERF|MECH|SYNC|MASTER|NEIGHBOURING|PRINT|LEND),
                     percentage, territories[], from/until, chainOfTitle[]

RegistryClaim        subject, claimant, rights[], status, conflictsWith[], evidence[]

LedgerStatement      seq, epoch, subject, op, payload + payloadHash, signer(did), signature,
                     prevHash, leafIndex, inclusionProof?, anchors[]
RegistryEpoch        epoch, size, rootHash, prevRootHash, signature, otsProof, evmTx?

CatalogueIngestion   source (DDEX_ERN|DDEX_CTS|ONIX|CSV|FOLDER|EIDR|MMC|SPREADSHEET),
                     mappingProfile, dryRun, counts, issues[], resulting entity ids
```

**Two schema decisions worth defending:**

1. **`ExternalId` is never a bare string.** `isrc: "USABC2600001"` is a lie the moment two
   sources disagree. Every foreign identifier carries who asserted it, when, from what source,
   and whether it's been verified against the issuing registry. This one choice is what makes
   the bridge layer possible without corrupting the core.
2. **The registry is additive to existing types.** `Track`, `Album`, `Book`, `Video` get a
   single optional `registryRef` plus cached display identifiers. No migration, no rewrite,
   nothing breaks; the registry is the source of truth where it exists and absent everywhere
   else. (Firestore gotcha stands: never write `undefined` — build the ref object conditionally.)

---

## 4. What a label actually needs to onboard a catalogue

### 4.1 What arrives at the door

In descending order of likelihood:

1. **A folder and a spreadsheet.** WAVs/FLACs named inconsistently, a `.xlsx` with 30 idiosyncratic
   columns, artwork at the wrong size, some ISRCs, no ISWCs. This is 80% of independent labels.
2. **A DDEX ERN delivery batch** — XML + audio + images, from labels who already distribute.
3. **A DDEX Catalogue Transfer Standard 1.0 package** — the purpose-built format for exactly
   this move. Supporting CTS is the single highest-leverage import feature.
4. **An ONIX 3.1 feed** (book publisher) or a MMC/EIDR package (studio).

### 4.2 The pipeline

```
Intake (resumable upload, checksums)
  → Parse & map (per-source profile; spreadsheet column mapper w/ saved profiles)
  → Compute ISCC per asset  → dedup against existing catalogue + within the delivery
  → Validate (identifier check digits, artwork ≥3000², duplicate ISRC, missing splits ≠ 100%)
  → Dry-run report: "4,182 recordings, 3,910 matched to works, 96 conflicts, 41 blocked"
  → Rights capture: masters, publishing splits, territories, chain of title
  → Conflict review queue
  → Publish to Chora/Lorea/Taleo surfaces (respecting release dates + territories)
  → Sign + anchor each registry statement
  → Optional bridge-out: ERN 4.3 to DSPs, CWR to MusicMark/MLC, ONIX to retailers
```

A **dry run that produces a defensible report before anything is published** is the feature that
wins the trust of a catalogue owner. Everything else is plumbing.

### 4.3 The realistic constraints — what Plajah must accept

| Need | Reality | Recommended move |
|---|---|---|
| Put a label's catalogue on Spotify/Apple | Spotify takes no direct uploads; DSP feeds need approved-provider status | **Phase 5.** Sit on a white-label backend (LabelGrid has public pricing/API/sandbox; Revelator from ~$249/mo; SonoSuite/FUGA are quote-based and majors-owned). Until then Plajah is a *destination*, not a distributor — which is a legitimate and much cheaper position. |
| Assign ISRCs to Plajah artists | Needs a registrant code | **$95 one-time** to RIAA → 100k ISRCs/yr, free for every Plajah artist forever. Do this early; it is the cheapest credibility Plajah can buy. |
| Assign UPCs to releases | Needs a GS1 company prefix (annual) | Buy a prefix when Phase 5 distribution starts; before that, accept label-supplied UPCs. |
| ISWC / PRO registration | Requires a CISAC sender code and publisher standing | **Phase 4:** generate valid CWR the label submits under *its own* sender ID (MusicMark = ASCAP+BMI+SOCAN in one file; MLC for US mechanicals, and MLC can help obtain a sender code). Becoming a submitter is a later, deliberate step. |
| ISBNs for Lorea | $125/1, $295/10, $575/100 (US); free in several countries | Run a Plajah imprint block for authors who want it; always accept author-supplied ISBNs; surface the free national-agency route by country. |
| EIDR for Taleo | **$6,000/yr minimum**, unlimited IDs | **Do not buy now.** Store studio-supplied EIDR/ISAN; join when Taleo has paying studio clients — then it's unlimited and cheap per title. |
| DDEX conformance | Implementation licence is **free** | Take the licence at Phase 2. No cost barrier. |
| Storage/compute | 10k WAV masters ≈ multiple TB | Reuse the planned Chora transcode pipeline; ingest → archive original, serve AAC/HLS. |
| Legal | Warranty of ownership, takedown, disputes, territory blocks, DMCA agent | Label agreement + the conflict workflow above. Non-negotiable before the first real catalogue. |
| Access control | A label is not a user | Reuse the existing Organization + RBAC backbone: roles for catalogue admin, royalty admin, A&R; artists linked to the label keep their own Creator Passport. |

**The artist-keeps-their-identity property is the pitch.** In every existing system the label owns
the catalogue record. Here the label owns its *claims*, and the artist's works, credits and
provenance follow the artist's DID when the deal ends. That is a reason for an artist to prefer a
Plajah-native label deal, and it costs nothing to provide.

---

## 5. Scope decision: free-only, and opt-in

**Nothing in this system is universal.** Most accounts should never see it. The registry is an
**opt-in add-on** — a "Rights & Identifiers" surface an account switches on when it wants to go
that far — gated the same way business pages already are (off by default, `accountCapabilities`
+ `featureFlagService`). A hobbyist uploading a song must never be asked for an IPI number.

**And nothing gets built that costs money to run.** Every capability below is free at any scale:
no registrar fee, no membership, no gas, no per-record cost.

### 5.1 The free stack — three identifiers, three jobs

| Job | Free answer | Why it works |
|---|---|---|
| **Who made it** | **DID** (Creator Passport) — `did:plc:…` | Free, portable, follows the creator off Plajah. Identifies the *party*, never the work. |
| **What the content is** | **ISCC** (ISO 24138) | Computed from the bytes. No registrar, no fee, recomputable by anyone, clusters re-encodes → dedup for free. |
| **Which record it is** | **AT-URI** `at://did:plc:…/app.plajah.creative.book/3k…` and/or **ARK** `ark:/NAAN/w-…` | Resolvable, citable, printable. The AT-URI already falls out of the Creator Passport lexicons; an ARK **NAAN is free** for any stable organisation and lets Plajah mint unlimited ARKs, resolvable via n2t.net or Plajah's own resolver. |

A DID alone does **not** cover this — it names a party, not a work. The pair (DID + work record)
does, and ISCC makes the pair verifiable against the file itself.

### 5.2 What the free tier can and cannot do

Free and genuinely useful — **tracking, provenance, rights bookkeeping, dedup, exports**:
work↔recording graph, credits, split sheets, claims and conflicts, ISCC dedup, the transparency
log (OpenTimestamps anchoring is free), storing and validating identifiers the user already owns,
and generating industry files (CWR, ONIX 3.1, ERN 4.3 — DDEX's licence is free) that the user
submits under their own credentials.

Cannot be free, ever — **retail routing**: an ISBN, UPC, ISRC or EIDR is the key a shop, DSP or
distributor uses to sell the thing. Only the issuing authority can mint one. No open-source or
on-platform identifier substitutes for that, and any product copy implying otherwise is a lie
that will strand an author at Ingram. The free layer's honest pitch: *everything except the
retail key* — and for a book sold on Plajah, or an ebook on Kindle, there is no retail key needed.

### 5.3 ISBN specifically — what self-publishers actually do

There is **no open-source ISBN**. Prefixes come from the International ISBN Agency via national
agencies; a self-minted "ISBN" is invalid and gets rejected downstream. What real self-publishers
do, in order of popularity:

1. **Kindle ebook → no ISBN at all.** KDP does not require or assign one; the book is identified
   by its **ASIN**. Adding your own ISBN to an ebook has no practical effect on Amazon.
2. **KDP print → Amazon's free ISBN.** Free, but the publisher of record shows as
   "Independently published", and it is **usable only on KDP** — it cannot travel to IngramSpark
   or a bookshop.
3. **Aggregator-assigned free ISBN** — Draft2Digital assigns free ISBNs for print and ebook, with
   D2D as vendor of record (not publicly displayed).
4. **Buy your own** when the author wants their own imprint and wide distribution: $125/1,
   $295/10, ~$575/100 in the US. Free from the national agency in Canada, India, New Zealand and
   several other countries — worth surfacing by the author's country, since a large share of
   Lorea's authors may qualify for a free one.

**What Lorea should do:** mint an **ARK per work and per edition** (free NAAN), compute an
**ISCC** per file, hang both off the author's **DID**, and treat ISBN as an *optional field the
author pastes in*, with country-aware guidance on the four routes above. Optionally push editions
to **Open Library** (free, open, gives an OLID) so the book has a discoverable catalogue record
without an ISBN. Never sell an ISBN, never imply the ARK replaces one.

## 6. Phasing (free-only)

| Phase | Deliverable | Cost |
|---|---|---|
| **0 — typed foundation** *(done)* | `services/registry/types.ts`, `services/registry/identifiers.ts` (check digits for ISRC/ISWC/ISBN/GTIN/ISNI/GRid/EIDR/ISCC) | $0 |
| **1 — opt-in registry core** | `registryService` + capability gate + "Rights & Identifiers" panel; works/manifestations/products/parties; bring-your-own identifier fields with live validation; `registryRef` on Track/Album/Book/Video | $0 |
| **2 — free identity layer** | ISCC computation on upload (Instance-Code first = exact-dup detection, then Data-Code for near-dup); ARK minting once a NAAN is granted; AT-URI/DID binding | $0 (NAAN request, ~2 business days) |
| **3 — splits & claims** | Split sheets, credits, chain of title, conflict surfacing, per-work contributor shares | $0 |
| **4 — the ledger** | Statement signing with Creator Passport keys, Merkle epochs, OpenTimestamps anchoring, public inclusion-proof verifier | $0 |
| **5 — export bridges** | CWR (MusicMark/MLC-ready), ONIX 3.1, ERN 4.3, cue sheets — generated for the *user* to submit under their own sender ID | $0 (DDEX licence free) |
| **— deferred, costs money —** | ISRC registrant code ($95 one-time), GS1 prefix, ISBN block, EIDR ($6k/yr), white-label distribution | not now |

The $95 ISRC registrant code is the one purchase worth revisiting early — it converts Phase 5
from "export a file" to "Plajah assigns real ISRCs free for every artist" — but it is explicitly
out of scope until the free layers are proven.

---

## Sources

- [DDEX — ERN 4.3 update and Catalogue Transfer Standard 1.0](https://ddex.net/ddex-publishes-ern-4-3-update-and-catalogue-transfer-standard-1-0/) · [DDEX implementation licence](https://ddex.net/implementation-licence/) · [ERN knowledge base](https://kb.ddex.net/implementing-each-standard/electronic-release-notification-message-suite-(ern)/)
- [rightsHUB — music metadata requirements 2026](https://rightshub.net/news/music-metadata-requirements-2026) · [LabelGrid — DDEX feed generation](https://labelgrid.com/blog/guides/ddex-feed-generation-guide/)
- [US ISRC agency — registration fees](https://usisrc.org/faqs/registration_fees.html) · [ISWC for creators and publishers](https://www.iswc.org/creators-publishers)
- [The MLC — CWR user guide](https://www.themlc.com/hubfs/CWR%20User%20Guide_May%202024_FINAL.pdf) · [MusicMark — getting started](https://musicmark.com/documents/MusicMark-getting-started.pdf)
- [ISCC — iscc.io](https://iscc.io/) · [ISO 24138:2024](https://www.iso.org/standard/77899.html) · [ISCC specification](https://iscc.codes/specification/)
- [EDItEUR — Introduction to ONIX for Books 3.1](https://editeur.org/files/ONIX%203/Introduction_to_ONIX_for_Books_3.1.1.pdf) · [ISBN pricing 2026](https://books.by/guides/how-to-get-an-isbn)
- [EIDR pricing](https://www.eidr.org/pricing) · [EIDR–ISAN dual registration](https://www.isan.org/docs/news/Dual_Registration_PR.pdf)
- [OpenTimestamps announcement](https://petertodd.org/2016/opentimestamps-announcement) · [Sigstore Rekor](https://docs.sigstore.dev/logging/overview/)
- [Best white-label music distribution platforms 2026](https://labelgrid.com/compare/best-white-label-music-distribution-platforms/) · [Spotify provider directory](https://artists.spotify.com/providers)
- [Music NFT/Web3 post-mortem 2026](https://www.chartlex.com/blog/business/music-nft-web3-post-mortem-2026)
