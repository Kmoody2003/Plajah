# Plajah × OCME — Interoperability Proposal

**Plajah joining the ecosystem as a technology provider.**
Prepared for the Open Commercial Media Ecosystem (OCME) · Industry Advisory Council
From: Kenneth Moody — Plajah (and OCME member)

---

## 0. The one-paragraph version

OCME is an ecosystem: a governance framework, a media registry, and a set of standards that participants implement — DIDs, W3C Verifiable Credentials, governance-set revenue splits. Plajah is a platform: a multi-format creator system spanning music, books, film/TV, video, live, podcast, classrooms, clubs and commerce, shipping to web, Android/iOS, Roku, Tizen, Fire TV and Chromecast, with a working FAST-channel playout engine that already emits as-run logs.

Both run today. This proposal is that they **interoperate** — that Plajah implements OCME's identity and registry the way it implements any other standard it supports, and that work, identity and records move across in both directions. OCME remains the registry and the governance authority. Plajah remains a platform, joining the ecosystem as a **technology provider and distribution surface**: its creators can carry an OCME identity, its catalogs can feed OCME curation, and its playout can return verifiable play records into the registry.

---

## 1. Why this is a fit, specifically

This is not a generic "let's integrate" note. Four things line up almost exactly:

| OCME has | Plajah has | Where they connect |
|---|---|---|
| Media Registry keyed on **DIDs + W3C Verifiable Credentials** | An identifier registry whose scheme enum *already includes* `DID`, `ISCC`, and `C2PA` (`services/registry/types.ts`) | An OCME DID drops into Plajah's registry with **zero schema migration** |
| Verifiable ownership at upload | `services/creatorPassport.ts` — a provenance record that ships with an explicit honesty note: *"not a signature — no keypair exists yet, no DID… when the real Creator Passport lands, `passportId` becomes a real DID"* | OCME **is** that missing DID. The swap point is already isolated to one function, `passportIdFor()` |
| "Real-time play record verification so creators see every stream" | A FAST channel playout engine with `buildAsRunLog()` / `playoutPosition()` (`services/fastChannelTimeline.ts`) | Plajah can emit **signed as-run play records** into OCME's registry — the hardest part of royalty verification is already computed |
| **The AI Music Video Show (AI MVS)** on Apple TV + Roku via Alchemy | Fabula (AI film NLE), Pixels (VJ/render core), Chora (music), and a shipped Roku/Tizen/Fire TV app family | Plajah can be an AI MVS **production pipeline** *and* an additional **carriage platform** |

The short summary: **OCME brings verifiable trust to Plajah's catalog. Plajah brings supply and reach to OCME's ecosystem.**

---

## 2. The independence principle (read this before the feature list)

Every integration below is designed against five non-negotiables, so that neither organization becomes dependent on the other's roadmap or survival.

1. **OCME is the source of truth for identity, ownership, and governance.** Plajah caches; Plajah never asserts. Any ownership claim Plajah displays carries an attribution: *"per OCME Media Registry, as of <date>."* If OCME and Plajah disagree, OCME wins and Plajah surfaces the conflict rather than silently resolving it (this is already how the registry's `DISPUTED` status works).
2. **Opt-in at every hop, per work, per creator.** Plajah's registry already ships behind `isRegistryEnabled()` / `setRegistryOptIn()`. OCME linkage inherits that gate. No creator is enrolled by side effect of using Plajah, and no OCME member's catalog appears on Plajah without their explicit grant.
3. **No exclusivity, either direction.** A work registered with OCME can still live on Plajah, Audius, Bandcamp, or anywhere else. A Plajah creator can be an OCME member or not. Nothing about the integration is a lock-in.
4. **Clean exit.** Both sides can sever the link and keep operating. Plajah keeps its own internal IDs (`PLJ`, `ARK`) so a de-linked work is still addressable; OCME keeps its registry rows so a de-linked creator loses no ownership record. Exit is a config flag, not a migration.
5. **Separate brands, separate governance.** Plajah does not get a vote in OCME's Ecosystem Governance Framework by virtue of being a technology provider, and OCME does not set Plajah's product roadmap. We interoperate through documented interfaces, not through org chart.

Framed positively: **Plajah wants to be one of many surfaces that honor the OCME framework — a good citizen of the ecosystem, not a channel partner that captures it.**

---

## 3. Integration surfaces

### A. Identity — "Sign in with OCME" and the Creator Passport bridge

- **Sign in with OCME.** An OCME member links their DID to a Plajah account (or creates a Plajah account from it). Plajah stores the DID as a first-class identifier on the account, not a text field. Precedent exists: Plajah already ships third-party identity linking against external networks (Audius OAuth, ATProto/Bluesky app-password linking), so this is a known pattern here, not a research project.
- **Creator Passport upgrade.** Today Plajah stamps every upload with a provenance record and openly documents that it is *not* cryptographic. With OCME linked, `passportIdFor()` returns the member's real DID and the stamp becomes a claim that can be **verified against OCME by anyone** — including people who don't trust Plajah. This is the single highest-value thing OCME gives Plajah creators, and it costs OCME nothing but an issuance endpoint.
- **Verifiable Credentials as member badges.** OCME issues a VC ("OCME Member," "Registered Creator," "Curator," role/tier). Plajah verifies and renders it as a badge on the profile, on stat cards, and on the share/OG preview — with the verification method shown, so the badge is auditable rather than decorative.
- **Registry reconciliation, not registry competition.** Plajah's identifier registry maps the five-layer industry ladder (Party → Work → Manifestation → Product → Claim) across ISWC/ISRC/ISBN/EIDR/UPC/DDEX. It is explicitly *additive* and holds foreign IDs as `ExternalId` objects carrying **who asserted it, when, from what source, and whether it was verified**. An OCME registry entry becomes exactly that: an asserted-then-verified external ID. Plajah's registry becomes a **feeder and mirror** for OCME, filling in the traditional identifiers (ISRC/ISWC/ISBN) that OCME's DID layer intentionally doesn't issue.

### B. Import — OCME → Plajah

- **Catalog import.** A linked member pulls their OCME-registered works into Plajah in one action: videos, music, artwork. Ownership metadata and revenue splits come across as **read-only, OCME-attributed** fields — Plajah renders them, Plajah cannot edit them.
- **Auto live-stream import.** When an OCME member goes live (on OCME infrastructure or a partner surface), Plajah mirrors it as a live entry in the Live Hub, Reello, and their profile — with an OCME badge and a click-through home. Plajah's live layer is a single unified engine on one WebRTC backbone, so a new ingest source is a source adapter, not a new stack. For OCME-hosted streams that Plajah can't ingest directly, an **external-URL/embed source** already exists as a first-class stream type, which means day-one support without waiting on protocol work.
- **AI MVS as a channel on Plajah TV.** The flagship curated channel appears inside Plajah's Live/TV sections on all its TV targets — attributed to OCME, linking back to OCME, counted in OCME's play records. Additional reach for AI MVS at zero engineering cost to OCME.
- **Import is non-destructive.** Imported works keep their OCME origin; Plajah never re-parents them. A work imported to Plajah is still an OCME work that happens to be visible here.

### C. Contribution — Plajah → OCME

- **"Register with OCME" as a publish destination.** In the Plajah publish flow (album, book, video, film), OCME appears alongside the existing destinations as an opt-in checkbox with a plain-language disclosure of what registration means and what the revenue route is.
- **Submit to curation.** A creator can offer a work to OCME curators for channel play. Plajah sends the work plus its full identifier package (ISRC/ISWC/contributor splits/content hash) so the curator receives something already clean, not a bare file.
- **Production pipeline for AI MVS.** Fabula (AI film editor) and Pixels (render core) can carry an **"Export for AI MVS"** target: correct spec, correct metadata, correct provenance stamp, correct AI-disclosure fields, delivered as a submission rather than a raw upload. This turns Plajah into a supply engine for OCME's flagship channel.
- **Bulk on-ramp for labels and catalogs.** Plajah's registry work was built for exactly this — catalog-scale identifier ingestion. It can serve as OCME's **catalog on-ramp tool** for members arriving with a back catalog instead of a single track.

### D. Play records and royalty verification *(the piece nobody else can offer)*

This is the strongest unique contribution and worth its own section.

OCME's promise is that "creators see every stream and payment." That promise needs **trustworthy play data from the surfaces that actually play the content.** Most platforms will never give you that — it's their moat.

Plajah's FAST channel engine already computes, per channel, per day, timezone-anchored: which asset played, at what offset, for how long — `buildAsRunLog()`. That is a broadcast as-run log, the same artifact linear TV has used for royalty and ad reconciliation for fifty years.

**Proposal:** Plajah emits as-run logs to OCME as **signed play records**, keyed on OCME DIDs, on a documented cadence. Extend it beyond FAST to on-demand plays in Chora and Reello for OCME-registered works.

What this gives OCME:
- Independent, third-party play data with a verifiable chain of custody — evidence, not a dashboard number.
- A **reference implementation** of an OCME play-record producer that other technology providers can copy. Plajah is happy for the spec to be public and non-exclusive; that's the point of an ecosystem.
- A concrete answer to the hardest question any creator asks a new royalty system: *"how do I know that number is real?"*

What Plajah gets: creators can point at an OCME-verified statement instead of trusting Plajah's own accounting.

### E. Distribution — carriage and EPG

Plajah ships (or is shipping) to Roku, Samsung Tizen, Fire TV, Android TV, Chromecast, web, and mobile, and has scoped XMLTV/MRSS EPG feed generation and a first-class channel entity.

- **Carriage.** AI MVS and future OCME channels carried inside Plajah's TV apps.
- **EPG interchange.** Plajah generates standards-compliant EPG for OCME channels — the unglamorous plumbing that platform submissions require and that most creator orgs get stuck on.
- **Member-run channels.** An OCME member can program their own 24/7 channel from their OCME-registered catalog using Plajah's playout engine — with every play flowing back as a record. OCME gets a channel farm; Plajah gets content; the creator gets a linear presence they could not otherwise afford.

### F. Membership flow, both directions

- **Plajah → OCME.** An OCME join/learn-more surface inside Plajah, in context: at publish time, in the rights/identifiers panel, on the creator dashboard. Framed as *"OCME is an independent nonprofit that registers your ownership — here's what it does, here's what it costs, here's what it doesn't do."* Honest, not a funnel.
- **OCME → Plajah.** OCME members get a defined benefit on Plajah — e.g. verified badge, catalog import, channel programming, production tools — as a **member benefit OCME can advertise**, not a discount Plajah advertises.
- **Attribution both ways.** Members acquired through either surface are visibly credited to that surface. No ambiguity about who brought whom.

### G. OCME as an organization on Plajah — community management

Plajah has a real organization backbone (`services/organizationService.ts`, `orgPermissions.ts`, `orgAudit.ts`, business templates with predefined roles, employee accounts, RBAC, audit trail). OCME could run real operational surface on it **without moving its identity or registry there**:

- **Member directory and roster** — who's a member, what role, what tier, backed by their VC.
- **Working groups and the Industry Advisory Council** as private rooms with persistent membership, agendas, and recordings. Plajah's rooms primitive covers text, voice, video, and stage/panel formats on one backbone, and sessions can be recorded and auto-published as a podcast — so IAC meetings become an archive by default.
- **Announcements and member comms** — with push notification delivery to members' devices, per-category preferences.
- **Events and calendar** — showcases, curator sessions, onboarding cohorts.
- **Governance transparency** — publish framework versions, decisions, and revenue-split changes to a member-visible changelog. Plajah runs a changelog ledger and "What's New" surface for itself; the same primitive fits a governance framework very naturally.
- **Member support and onboarding** — messaging, guided flows, demo tours for prospective members.
- **Fundraising / sustaining membership** — Plajah's Sanctuary layer (membership tiers, gated content, one-off support) fits a nonprofit's sustaining-donor model directly.

Framing matters here: this is **OCME using a tool**, the same way it would use Slack or Airtable. It's severable, it's not identity, and OCME's data stays OCME's.

### H. Brand and company accounts

Plajah supports organization/business accounts with roles, employee accounts, storefronts, order/inventory spine, and Stripe Connect **direct** payouts (Plajah never custodies funds).

- **Brand accounts for OCME technology providers and industry members** — a real presence, not a logo on a partners page.
- **Curator accounts** as a first-class account type, with channel-programming tools and their play records feeding OCME.
- **Label / publisher accounts** with catalog management, contributor splits, and identifier administration.
- **Sponsorship and brand activation** — OCME channels can carry sponsor slots through Plajah's existing ad/bumper slot types in the playout engine, with revenue routed by OCME's governance-set splits rather than by Plajah.

---

## 4. Money — two settlement rails and the revenue map

This is the largest item in the proposal, and it is an offer rather than a request.

**Plajah is prepared to adopt OCME as the stablecoin and wallet settlement rail for the entire platform**, running in parallel with Stripe Connect. Not a corner of it, not a single feature — the whole transaction surface, architecturally, from day one. A buyer pays by card or by wallet; a creator is paid to a bank account or to a wallet; and where the transaction takes the wallet path, **OCME's infrastructure handles the settlement**.

### 4.1 The invariant that makes this safe

Plajah's non-negotiable position is that **Plajah never custodies funds.** Today that is delivered by Stripe Connect *direct* — money lands in the creator's or business's own connected account, never in a Plajah balance. Plajah may take an application fee; it never holds the principal.

The OCME rail preserves that invariant exactly: funds settle through OCME's smart-contract infrastructure to the creator's wallet. **Plajah is the instruction layer on both rails and the custody layer on neither.**

This matters more than it first appears. Adding a second rail does not change Plajah's regulatory posture — it is the same posture, twice. Plajah instructs; someone regulated settles.

### 4.2 One abstraction, two adapters

Rail is a property of the *transaction*, not of the feature. Every money-moving surface on Plajah routes through a single settlement interface with two implementations behind it:

music and album sales · tips and direct support · membership tiers · store and merchandise orders · kiosk and point-of-sale · tickets and events · auctions and fundraisers · crowdfunding · business orders · sponsorship and advertising revenue · and creator royalty payouts.

Adding the OCME rail is therefore one adapter, not a rewrite of eleven features. That is the whole reason to define the abstraction before building either side of it.

### 4.3 Payer and payee are separate choices

Most "we added a crypto option" integrations quietly conflate these two and spend months untangling it. Naming the four combinations up front avoids that:

| Money in | Money out | Who settles | Note |
|---|---|---|---|
| Card | Bank | Stripe | Today's path, unchanged |
| Card | Stablecoin | Stripe collects → OCME settles | Needs a defined on-ramp |
| Wallet | Stablecoin | OCME end to end | The pure path — cleanest and cheapest |
| Wallet | Bank | OCME collects → off-ramp | Needs a defined off-ramp |

A creator choosing to be paid in stablecoin does not force their audience to hold one, and an audience paying by wallet does not force a creator into crypto. That independence is the point.

### 4.4 Why OCME is the natural home for this

Not merely because they have the infrastructure — because **they already hold the data that settlement needs.**

OCME captures split structure at registration: contributor splits, governance-set revenue splits. Plajah captures splits too — the 90/10 creator split, and per-work performance, mechanical and sync shares.

If OCME's contracts execute settlement, then **the same split object that describes ownership also executes payment.** Registry and settlement stop being two systems that must be reconciled and become one system with two faces. Every other arrangement in this industry keeps ownership data in one place and payment logic in another, and spends its life reconciling them.

### 4.5 Reporting is rail-agnostic — including Stripe

**Settlement and reporting are separate concerns, and they should not be coupled.**

Whichever rail moves the money, Plajah emits a **settlement receipt** into OCME's record for that work and that creator. When OCME settles, it has the record natively. When *Stripe* settles, Plajah reports it — so an OCME member's earnings picture is complete regardless of how their audience paid.

This is the piece that makes OCME's promise literally true. "Creators see every stream and payment" is currently bounded by what OCME itself can observe. With rail-agnostic receipts, it covers a creator's card sales, tips, memberships, merchandise and royalties on a surface OCME does not own or operate.

A receipt carries what reporting and performance analysis need, and nothing more:

- creator DID and work identifier
- event type — sale, tip, membership, order, royalty, sponsorship
- gross amount, fees, net to creator, currency
- the split that was applied
- rail, timestamp
- **the rail's own external reference** — a Stripe charge identifier, or an on-chain transaction hash

Four properties keep it clean:

1. **A receipt is a record, never a payment instruction.** Nothing about reporting to OCME moves money or gives OCME a claim on it. The Stripe rail is untouched by this; it simply becomes observable.
2. **Independently verifiable.** Because the receipt carries the rail's own reference, OCME or the creator can verify it against Stripe or against the chain. It keeps the *evidence, not a dashboard number* property from Section 3D — on both rails.
3. **Idempotent.** Keyed on the rail's transaction identifier, so retries and replays cannot double-count.
4. **Buyer identity never crosses.** The amounts are the creator's own data and travel with their opt-in; the purchaser's identity and payment details are not OCME's business and are not sent.

The natural implementation is that a play record and a settlement receipt are **the same envelope with two event families**, so OCME builds one ingest interface rather than two. Same open, non-exclusive stance as Section 3D — other technology providers should be able to report into OCME the same way.

Worth stating plainly: **this part requires no new financial infrastructure from OCME at all.** It needs an ingest endpoint and a schema. It could ship well before any stablecoin settlement exists, and it would make OCME's reporting the most complete record of a creator's earnings anywhere — which is a strong argument for members to join.

### 4.6 It closes the evidence chain

Section 3D proposed that Plajah return signed play records. Section 4.5 adds settlement receipts on every rail. Together the chain completes:

**play record → split → settlement receipt → payout — all keyed to the same DID, all independently verifiable by the creator, and all rail-agnostic.**

That is the entire promise OCME is making, end to end, with Plajah supplying the first link and consuming the last. No one in this market currently has a verifiable chain that runs from a play all the way to a payment, let alone one that holds across payment rails it does not control. This is the version of the partnership that is genuinely hard to copy.

### 4.7 What Plajah needs OCME to confirm

Offering the whole platform is only responsible if these are settled first. Raised as questions, not conditions:

1. **Who is the regulated entity?** Money transmission and virtual-asset-service-provider status, KYC and AML, sanctions screening, travel-rule compliance. Plajah's role must be contractually a technology and instruction layer only — which works only if OCME or its provider genuinely carries that burden. This is the single question that gates everything else in this section.
2. **Tax reporting** — 1099s and their international equivalents. Who issues them, and on what data.
3. **A hosted wallet option** for creators who are not crypto-native, with a real key-recovery story. Plajah must never hold keys, so this has to live on OCME's side or a provider's.
4. **Which stablecoins, which chains, who pays network fees**, and what the documented behaviour is in a depeg event.
5. **Settlement mechanics** — payout minimums, settlement latency, and refund semantics. Chargebacks do not exist on-chain; refunds therefore need an explicit designed mechanism rather than an assumed one.
6. **Rail independence.** If the OCME rail is paused, degraded or discontinued, Stripe continues untouched. The two rails are parallel, never sequenced, and never a fallback chain — consistent with the clean-exit principle in Section 2.

### 4.8 Rollout

Architecture platform-wide immediately; **activation ordered by how much a mistake would cost.** Recommended sequence:

0. **Rail-agnostic settlement receipts first** (Section 4.5). Reporting carries no financial risk, needs no new infrastructure on either side, and delivers most of the member-facing value on its own. It should ship ahead of any stablecoin settlement, not alongside it.
1. **Tips and direct support** — small amounts, no fulfilment, forgiving of error.
2. **Royalty payouts** from the pilot channel in Section 8 — closes the play-to-payment loop on a controlled cohort.
3. **Memberships and digital goods** — recurring, but nothing ships.
4. **Physical goods and point-of-sale last** — refunds, disputes and fulfilment failures are hardest here, and are exactly where on-chain settlement needs the most design.

### 4.9 What this is worth to OCME

The registry integration makes Plajah a supply and distribution partner. The settlement integration makes **OCME's infrastructure the payment rail for an entire multi-format platform's transaction volume** — music, books, film, video, live, events, merchandise and commerce — rather than for curator plays on OCME's own channels alone.

And rail-agnostic reporting makes OCME's record **the single most complete picture of a creator's earnings that exists anywhere** — spanning a rail OCME does not operate, on a platform OCME does not own. That is a member benefit no competing registry can offer, and it costs an ingest endpoint.

It is also the strongest possible proof of the thesis: an ecosystem whose settlement layer is used by a surface it does not own is a real ecosystem, not a product with a governance framework attached.

### 4.10 The revenue map — what is in scope, and what is not yet decided

A single **90/10** figure appears in Plajah's public material and earlier in this document. It is accurate but narrow: **it is the split on direct purchases of content, not a platform-wide rate.** Being precise about that matters, because an ecosystem revenue arrangement should attach to the right revenue lines rather than to a headline number.

| Revenue line | How it works | State today | Proposed OCME posture |
|---|---|---|---|
| **Direct content purchase** | 90/10 to the creator | Live | **In scope.** Settles on either rail; a receipt reaches OCME either way |
| **Curated channel plays** | OCME's governance-set split | OCME's model | **In scope by definition** — this is OCME's own transaction |
| **Plajah+ subscription** | Pooled subscriber revenue; allocation model not yet chosen | **Not defined** | **In scope**, and proposed for co-design — see below |
| **Advertising & sponsorship** | Not yet designed | **Not defined** | **In scope**; terms set at activation, under the framework |
| **À la carte services** | Per-service fees | Partly live | **Presumed out of scope** — infrastructure, not exploitation of a work. Open to discussion |
| **Storage plans** | Subscription | Partly live | **Presumed out of scope**, same reasoning |

**The line we propose drawing.** Revenue arising from **the exploitation of a creative work** is in scope for ecosystem sharing. Revenue that is **cost recovery for platform infrastructure** is not. A storage plan is what a creator pays Plajah to hold their files; it is not income from anyone consuming their work. Drawing the line on a principle rather than case by case means each new product lands on a known side of it instead of becoming a fresh negotiation.

**The default for anything new is neither in nor out — it is *discussed at activation*.** Plajah commits to bringing each new revenue line to OCME when it switches on, rather than after it has matured and hardened around assumptions.

**Plajah+ is the interesting one, and it is undefined on purpose.** The hard problem in any subscription pool is **attribution**: deciding which works a subscriber's money belongs to. The industry's default — pro-rata by aggregate plays — is criticised precisely because it decouples what a person actually consumed from who gets paid for it.

Plajah has not built that allocation yet, and **would rather design it with OCME than retrofit it afterwards.** OCME's play records are exactly the mechanism a user-centric allocation needs: a verifiable record of what each subscriber actually consumed, keyed to creator DIDs. If the allocation runs on records both parties can verify, Plajah+ becomes the first subscription pool whose distribution a creator can **audit rather than trust.**

The advertising model is likewise unbuilt. Defining it under the governance framework from the start is considerably cheaper than conforming to the framework later.

Plajah is not asking OCME to accept a number today. It is proposing **the map, the principle for drawing the line, and a commitment to return to it as each product activates.**

---

## 5. Blueprint — Chora populating OCME's music goals

**Chora** is Plajah's music service: albums, tracks, artist pages, a player, distribution, a spatial-audio mixer, transcription/notation, and lyric sync.

**Phase 1 — Identity and registration**
- OCME DID linked on the artist account; badge on the artist page.
- In `AlbumCreator`, an OCME registration step alongside the existing license picker and identifier panel.
- At registration Plajah sends: work + recording identifiers (ISWC/ISRC where present), contributor splits (Chora already models `sharePerf` / `shareMech` / `shareSync`), content hash, and provenance. **Contributor splits are the crown jewel here** — most systems get a file and a title; OCME would get the rights structure.
- ISCC computed from the audio file itself, giving OCME a content-derived key that survives re-encoding — the thing that makes duplicate detection and catalog matching actually work.

**Phase 2 — Supply into curation**
- "Offer to OCME curators" on any track or album.
- A curator-facing view of the Plajah pool of OCME-registered music, filterable by genre, mood, tempo, duration, license, and AI-disclosure status.
- Automatic delivery of the assets a curator actually needs: the master, the art, the metadata, the clearance state.

**Phase 3 — Play records back**
- Every Chora play of an OCME-registered work emits a play record.
- Every FAST/radio-style channel play emits an as-run entry.
- Artists see an OCME-verified play statement inside Chora, next to Plajah's own numbers — and can tell the difference between them.

**Phase 4 — Music-native channels**
- Music video channels and audio-only radio channels programmed from OCME catalog (the playout engine already models FM-style programming blocks).
- Listening parties and sync-play sessions around OCME releases, using Plajah's party primitive.
- Chora + Fabula + Pixels as an **AI MVS production line**: a registered track goes in, a spec-compliant, provenance-stamped music video comes out.

**What this gives OCME:** a continuously replenishing, rights-clean music supply with contributor splits attached, plus verified play data on the way back. **What it gives the artist:** their Chora catalog becomes OCME-registered without re-entering anything.

---

## 6. Blueprint — Lorea books into OCME

**Lorea** is Plajah's writing and publishing service: books, screenplays, comics/manga with a full reader, document import (Word/PDF/Fountain/Markdown), and a drawing engine.

Books are a real opportunity for OCME precisely because **the book world's ownership plumbing is worse than music's**. Most self-published ebooks have no ISBN at all — they're identified by a retailer's proprietary SKU. There is no equivalent of a PRO. An author's ownership record is a contract in a drawer.

- **Register books as OCME works.** Plajah's registry already models the book ladder — `ISTC` (textual work), `ISBN13`, `ASIN`, `OLID`, `DOI` — and can mint free, resolvable `ARK` identifiers for works that have no ISBN. Combined with an OCME DID, an independent author gets a **real, verifiable ownership record for the first time**, without paying a registrar.
- **Audiobooks close the loop back to music.** An audiobook is a recording: ISRC applies, Chora's distribution applies, play records apply. An OCME-registered book can generate an OCME-registered audiobook through the same pipeline.
- **Serialized and chapter-level works.** Comics and serials register at chapter granularity, which matters for curation and for per-episode royalty.
- **Books as curated content.** Reading rooms, read-along sync sessions, and author showcases — OCME curation extends past audio/video into text without OCME building a reader.
- **Screenplay → film provenance chain.** A Lorea screenplay that becomes a Fabula film carries an unbroken chain from `ISTC` (text) to `EIDR` (film) to `ISRC` (soundtrack), all hanging off one OCME creator DID. **No existing registry does this across formats.** It's the most differentiated thing on this page.

---

## 7. Unique integrations — things only this pairing makes possible

Ranked by "nobody else can offer OCME this."

1. **Rail-agnostic earnings reporting.** OCME's record becomes complete across a payment rail it does not operate. Costs an ingest endpoint; no other registry has a path to this.
2. **The full evidence chain** — play → split → receipt → payout, one DID, independently verifiable at every link, across rails.
3. **Cross-format provenance chains.** Screenplay → film → soundtrack → book → audiobook, one creator DID, one unbroken lineage. Every other registry is single-vertical.
4. **Independent play verification from a real playout engine.** As-run logs are broadcast-grade evidence, not analytics. Offered as an open, non-exclusive reference spec.
5. **Platform-wide settlement volume.** An entire multi-format platform's transactions available to OCME's stablecoin rail, not just plays on OCME's own channels.
6. **Free identifiers for the un-registered.** Self-minted `ARK` + content-derived `ISCC` mean an independent creator gets a resolvable, content-keyed identifier at zero cost — extending OCME's coverage to creators who can't afford ISRC/ISBN registration.
4. **AI MVS supply line.** Fabula + Pixels + Chora as a production pipeline that outputs spec-compliant, provenance-stamped, AI-disclosed videos for the flagship channel.
5. **Member-run 24/7 channels.** Every OCME member who wants one gets linear carriage, and every play is a record.
6. **Multi-platform carriage.** Roku, Tizen, Fire TV, Android TV, web, mobile — OCME channels reach further without OCME building app teams.
7. **The registry mirror.** Plajah fills in ISRC/ISWC/ISBN/EIDR/UPC around OCME's DID core, so an OCME work is legible to the legacy industry (DSPs, PROs, retailers) that will not accept a DID for another decade.
8. **Contributor splits at registration.** Rights structure captured at upload, not reconstructed later from email.
9. **Governance-as-product.** Framework versions, votes, and split changes published to members through a real changelog + push notification stack.
10. **IAC and working groups as recorded, archived sessions** that become published podcasts — governance transparency as a content byproduct.
11. **C2PA content credentials** already in the identifier scheme — pairing OCME's DID with C2PA manifests gives end-to-end capture-to-play authenticity for AI-era content.
12. **Portable exit.** Plajah's whole design thesis is that work follows the creator. That is OCME's thesis too. The integration can be shut off without a single creator losing a record — which is the strongest possible argument that neither party is capturing the other.

---

## 8. Honest tensions to resolve up front

Raising these now, because a partnership that hides them fails later.

1. **Revenue split disclosure.** OCME pays creators **60% on curator plays**; Plajah pays **90/10** on direct content purchases — which, per the revenue map in 4.10, is one line rather than a platform-wide rate. These are different transaction types — curated broadcast play vs. direct sale — and both can be right. But a creator must see, at the moment of opt-in, **which route a given work's revenue takes and what each pays.** Proposal: an explicit revenue-route disclosure in the publish flow. No dark patterns, either direction. Section 4 makes this easier rather than harder: with one settlement engine expressing both splits, the disclosure can show real numbers for each route instead of prose.
2. **Who is the source of truth?** Answered above (OCME for identity/ownership/governance; Plajah caches and attributes), but it should be written into the agreement, not assumed.
3. **Custody.** Resolved by design rather than negotiated: Plajah never holds funds on *either* rail (Section 4.1). Stripe settles direct to the creator's connected account; OCME settles direct to the creator's wallet. Plajah instructs, never custodies. What remains open is not the principle but the regulatory questions in Section 4.6 — chiefly which entity is the regulated one.
4. **Licensing conflicts.** Plajah has a license gatekeeper that blocks contradictory states (exclusive works can't carry a permissive CC license, etc.). OCME registration must reconcile with a work's existing license, and conflicts should surface rather than resolve silently.
5. **AI disclosure.** AI MVS is explicitly AI-centric; Plajah has AI production tools. Both organizations benefit from a **shared, machine-readable AI-disclosure field** carried in provenance. Worth standardizing early, while it's cheap.
6. **Scope discipline.** Everything above is a menu, not a commitment. The right first step is small and real.

---

## 9. Proposed pilot — the smallest thing that proves it

Not a phased five-year plan. One pilot, four deliverables — none of which requires the stablecoin rail to exist yet:

**Pilot: "Verified Catalog, Verified Play, Verified Earnings," one cohort of OCME member artists.**

1. **Link.** OCME issues DIDs/VCs to the cohort; Plajah links them and renders verified badges. *(Proves the identity bridge.)*
2. **Register.** The cohort's Chora catalogs register to the OCME Media Registry with identifiers and contributor splits attached. *(Proves Plajah as a catalog on-ramp.)*
3. **Report plays.** Plajah programs a channel from that catalog and returns signed as-run play records to OCME for a defined window. *(Proves independent play verification — the part that has never been done.)*
4. **Report earnings.** Plajah emits settlement receipts for the cohort's real Stripe-rail transactions — sales, tips, memberships — into OCME's record. *(Proves rail-agnostic reporting, on live money, with no new financial infrastructure on either side.)*

Deliverable 4 is deliberately last to describe and cheapest to build. It is also the one most likely to convince a member to join, because it is the first time their earnings picture has been complete in one place they control.

Success criteria agreed in advance, results published to OCME members either way. If it fails, both sides learn something publishable and nothing is entangled.

---

## 10. The ask

1. A working session with OCME technical leadership (and Nexartis, as the registry implementer) on the **DID/VC issuance and registry write interfaces**.
2. **Written answers to Section 4.6** — above all, *which entity is the regulated one* on the settlement rail. Everything in Section 4 depends on that one answer, and Plajah would rather hear an uncomfortable answer now than build against an assumption.
3. Access to the **Ecosystem Governance Framework** text, so Plajah's implementation conforms rather than approximates.
4. Agreement in principle that a **play-record producer specification** developed for this pilot is **published openly and non-exclusively** to the ecosystem.
5. Identification of a **pilot cohort** — a dozen willing member artists is enough.
6. Clarity on what OCME wants **from** a technology provider, so the proposal is shaped by their priorities and not only ours.

---

## 11. Closing

Plajah's own code contains a written note that its provenance layer isn't cryptographically real yet, and marks exactly where a real identity system plugs in. OCME is one such system, and implementing it is a small change on Plajah's side.

That's the shape of the whole proposal: **two systems that already run, connected through documented interfaces.** Plajah implements OCME's standards because they're good standards, and returns records into the ecosystem because that's what a participant should do. Everything else on both sides stays exactly as it is.

---

### Appendix — Plajah at a glance

| | |
|---|---|
| **Music** | Chora — albums, artist pages, distribution, spatial audio, notation, lyric sync, private library |
| **Books & writing** | Lorea — books, screenplays, comics/manga, reader, document import |
| **Film & TV** | Taleo (film/TV), Fabula (AI film NLE), Pixels (render/VJ core) |
| **Video & live** | Reello, unified WebRTC live engine (broadcast/mesh/stage), podcast studio, TV switcher |
| **Linear TV** | FAST channel playout with as-run logging, EPG generation, multi-platform TV apps |
| **Community** | Clubs, rooms, Sanctuary memberships, organizations with RBAC + audit, business/employee accounts |
| **Rights** | Identifier registry across the five-layer ladder; Creator Passport provenance; CC licensing gatekeeper |
| **Commerce** | 90/10 to the creator on direct content purchases; other revenue lines mapped in 4.10. Plajah never custodies funds on either rail |
| **Reach** | Web PWA, Android/iOS, Roku, Samsung Tizen, Fire TV, Android TV, Chromecast, Windows |
