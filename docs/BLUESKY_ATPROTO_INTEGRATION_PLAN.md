# Plajah × Bluesky / AT Protocol — Deepening Plan (research + plan, no code yet)

*2026-08-05. Goal: make Plajah a first-class citizen of the **Atmosphere** (the AT-Protocol app
ecosystem beyond Bluesky) so a Bluesky/ATP user can move into Plajah and use it natively — one identity,
their follows and content coming with them — and so Plajah's social features are natively compatible with
ATP. This document is a plan only; nothing here is implemented.*

## 1. Where Plajah is today (verified against the code)

**What already works (production):** a "fediverse mesh" — a user LINKS external Bluesky / Mastodon /
Threads accounts and reads, posts, likes, reposts, follows, and DMs through them from inside Plajah.
- Protocol-abstracted adapters in `services/fediverse/` (`types.ts` `FediverseAdapter`, `bluesky.ts`,
  `mastodon.ts`, `threads.ts`); orchestration in `service.ts`; server-only credential vault in `auth.ts`
  (AES-256-GCM at rest, Mastodon OAuth2, DID-keyed session cache).
- Bluesky is spoken as **hand-rolled XRPC over `fetch`** (`bluesky.ts`) against real lexicons
  (`app.bsky.feed.getTimeline`, `com.atproto.repo.createRecord` for posts/likes/reposts/follows,
  `chat.bsky.convo.*` for DMs). The `@atproto/api` `BskyAgent` paths in `server.ts` are vestigial/duplicated.
- UI: `FediverseContext`, `FediverseHub`, `FediverseSettings`, `FediversePostCard`; opt-in
  **cross-post** Plajah → external via `broadcast` (with Bluesky byte-facets + external embed cards).

**What does NOT exist (the gap this plan closes):**
- **No DID identity.** Plajah login is Firebase Auth. Bluesky linking uses **app passwords**, not ATP OAuth.
  There is no "Sign in with Bluesky."
- **No native federation of Plajah's own content.** Plajah posts/music/video live only in Firestore. The
  mesh only pulls *external* accounts inward; nothing of Plajah's is published as ATP records or readable
  by other Atmosphere apps. No AppView, no firehose, no custom feed generator.
- **No account portability / "move to Plajah."** No CAR import, no PDS, no `did:plc`.
- **Creator Passport is design-only.** `docs/creator-passport/{SPEC,LEXICONS,RECOVERY}.md` specify a
  `did:plc` self-sovereign identity with `app.plajah.creative.*` lexicons; the shipped
  `services/creatorPassport.ts` is an explicitly non-cryptographic Firestore attribution stamp
  (`passportIdFor(uid)` → `plajah:<uid>`, the designated swap-point to a real DID).

## 2. The AT Protocol landscape to build on (2026)

- **OAuth is complete.** ATP OAuth shipped with **permissions + permission sets** and granular scopes
  (e.g. `transition:email`), full SDK support, and overhauled docs. "Sign in with Bluesky" without ever
  seeing a password is production-ready **now** — this obsoletes the app-password linking Plajah uses today.
- **Custom Lexicon tooling matured.** The TS SDK's `lex` tool resolves published lexicons and generates
  types; `goat` works with lexicon schemas. Defining and shipping `app.plajah.*` record types is a
  supported path (records live in the user's PDS repo alongside `app.bsky.*`).
- **Permissioned / private data is the 2026 focus (in progress).** Non-public data with explicit access
  control (private posts, DMs, group chats, encryption) — teams Blacksky/Northsky/Habitat, design sketch
  published, AtmosphereConf discussions. Plan for it; don't block on it.
- **Account experience improving.** PDS reference implementation gaining account management + **data
  export**, standardized login/signup, stronger 2FA — the substrate for portability/migration.
- **Explicitly a "collective endeavor"** welcoming non-Bluesky ("Atmosphere") apps. Plajah is exactly the
  kind of app the roadmap invites.

## 3. The vision — Plajah as an Atmosphere app

Two directions of native compatibility:

- **Inbound (a Bluesky/ATP user moves in):** sign in with your ATP identity (DID) — no new account. Your
  handle, profile, and follow graph come with you; the people you follow who are on Plajah light up
  immediately; your Bluesky timeline is a native tab (already is). You are at home on arrival.
- **Outbound (Plajah's work lives in the Atmosphere):** your Plajah posts — and, uniquely, your **music,
  video, film, and books** — are written as ATP records under `app.plajah.*` lexicons in *your* repo. Any
  Atmosphere app can read them; sign into a second app and your catalogue is already there. Plajah becomes a
  publisher *into* the network, not just a reader *of* it. This is the Creator Passport, realized.

## 4. Phased plan

### Phase B0 — OAuth + SDK consolidation *(small, high-value, do first)*
- Replace Bluesky **app-password** linking with **ATP OAuth** (authorization-code + DPoP) in
  `services/fediverse/`. Reuse `auth.ts`'s encrypted-state + DID-session-cache infra.
- Consolidate the two Bluesky code paths onto **`@atproto/api`** (already a dependency; `@atproto/lexicon`
  is in the tree) and delete the vestigial/duplicated `BskyAgent` routes in `server.ts`.
- Request only the scopes we use (timeline read, post/like/repost/follow, DM). Outcome: safer linking, no
  stored passwords, and one Bluesky implementation.

### Phase B1 — "Sign in with Bluesky" = the onboarding ramp *(the "seamless move in")*
- Add ATP OAuth as a **Plajah login method**, mapping a verified `did:plc` ↔ a Plajah account
  (`creatorPassport.passportIdFor` becomes the real DID; keep the Firebase account underneath at first for
  data continuity — link, don't fork).
- On first sign-in: import the ATP **profile** (handle, display name, avatar, bio) and **follow graph**;
  surface "N people you follow are on Plajah" and their content; make the Bluesky home timeline a first-run
  native tab. This is the concrete **Bluesky-artist/user onboarding ramp**: arrive with your identity and
  audience intact, zero setup.
- Handle resolution + verification via `com.atproto.identity.resolveHandle` / DID docs.

### Phase B2 — Publish Plajah content as ATP records *(native compatibility, outbound)*
- Finalize + **register `app.plajah.*` lexicons** (start with `post`; then `track`, `album`, `video`,
  `film`, `series`, `book`, `credit` from `LEXICONS.md`). Use the SDK `lex` tooling for types.
- On create, dual-write: Firestore (as today) **and** an ATP record via `com.atproto.repo.createRecord`
  into the user's repo (their linked PDS in B1; a Plajah-hosted PDS in B4). Media addressed by CID (CDN
  now → IPFS/Arweave later per SPEC). Cross-post to `app.bsky.feed.post` stays the interop bridge for reach.
- Result: a creator's Plajah catalogue is portable ATP data — the "sign into another app and your work is
  already there" promise.

### Phase B3 — Feed interop / AppView *(native compatibility, two-way)*
- **Inbound feeds:** ship a Plajah **custom feed generator** (an ATP feed the user can pin in Bluesky) and
  richer ingestion of `app.bsky.feed.*` into the native feed (beyond the current separate sub-tab).
- **Outbound AppView:** a read service that indexes `app.plajah.*` records across repos so Plajah content is
  discoverable network-wide and other Atmosphere apps can render it. This is where Plajah stops being a
  client and becomes infrastructure.

### Phase B4 — Portability, PDS hosting & the Creator Passport *(the flagship, largest)*
- Stand up (or partner for) a **Plajah PDS** and implement **`did:plc`** minting + the key hierarchy from
  `RECOVERY.md` (device passkeys / signing / threshold rotation) with social/threshold recovery.
- **"Move to Plajah":** CAR-file **import** of an existing repo and PDS **migration**, so a user can host
  their identity on Plajah while keeping their DID and history.
- Adopt **permissioned data** as it lands (2026) for private posts / DMs / memberships-gated content —
  aligns Sanctuary gating with ATP access control rather than a Plajah-only ACL.
- Provenance: OpenTimestamps/Bitcoin anchoring per the existing passport spec.

## 5. Feature-compatibility matrix (Plajah social → ATP)

| Plajah surface | ATP mapping | Phase |
|---|---|---|
| Login / identity | ATP OAuth + `did:plc` (link to Firebase acct first) | B1 |
| Text post | `app.bsky.feed.post` (interop) + `app.plajah.post` (rich) | B0/B2 |
| Follow / like / repost | `app.bsky.graph.follow` / `feed.like` / `feed.repost` | B0 |
| DMs | `chat.bsky.convo.*` now → permissioned data later | B0/B4 |
| Music track / album | `app.plajah.creative.track` / `.album` | B2 |
| Reello video / Taleo film | `app.plajah.creative.video` / `.film` / `.series` | B2 |
| Lorea book | `app.plajah.creative.book` | B2 |
| Sanctuary-gated content | ATP permissioned data / access control | B4 |
| Discovery | Plajah custom feed generator + AppView | B3 |

## 6. Reuse / seams (so this isn't greenfield)
- `services/fediverse/auth.ts` — AES-GCM vault, OAuth-state handling, DID-keyed session cache → extend for ATP OAuth.
- `services/fediverse/bluesky.ts` — already does `com.atproto.repo.createRecord`; the write path for `app.plajah.*`.
- `services/creatorPassport.ts:passportIdFor` — the single swap-point from `plajah:<uid>` to a real DID.
- `docs/creator-passport/{SPEC,LEXICONS,RECOVERY}.md` — the identity/lexicon/recovery design to execute.

## 7. Risks & constraints
- **PDS hosting** is real infra (storage, availability, abuse/moderation, cost) — B4 is a commitment, not a weekend.
- **Key management / recovery** is the hardest UX in the space; lean on passkeys + social recovery, ship read-first.
- **Lexicon standardization / moderation** — `app.plajah.*` is ours to define, but interop value grows if
  others adopt; engage the Atmosphere community (AtmosphereConf) rather than designing in a vacuum.
- **Don't fork identity prematurely** — link DID ↔ existing Firebase account so nobody loses data mid-migration.
- **Private data timing** — B4's gating depends on permissioned data shipping; keep a Plajah-side fallback.

## 8. Recommended first step
Phase **B0 + B1**: ATP OAuth login ("Sign in with Bluesky") with profile + follow-graph import. It's the
highest ratio of "seamless move-in" to effort, obsoletes the app-password path, and turns the existing mesh
from *linked accounts* into *native identity* — the foundation everything else builds on.
