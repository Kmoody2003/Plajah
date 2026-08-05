# Creator Passport — Phase 0 Specification

**Status:** Draft v0.1 · Phase 0 (data model + identity method)
**Goal:** A portable, self-sovereign creator identity whose entire body of work — albums, tracks, posts, videos, films, series, books, images, and on-platform creative projects — follows the creator across any platform, fediverse instance, or app, with **no re-upload**. Plajah is the birthplace and reference implementation; it does **not** own the identity.

> Locked decisions (2026): build on **AT Protocol**; **centralized (CDN) content storage first**, decentralize (IPFS/Arweave) later; **spec the data model first**.

---

## 1. Principles (non-negotiable)

1. **Identity ≠ account.** The root is a keypair + a portable DID. Platforms get a *view* of the creator's repo; they never own it.
2. **Plajah births, never captures.** The DID must be migratable off Plajah. If a creator can't leave with their identity and work intact, the spec has failed.
3. **Reference, don't copy.** Works are signed records that point at content by hash (CID). Signing into a platform fetches records + streams content by CID — no upload.
4. **On-chain holds only hashes + timestamps.** Never media, never PII. Keeps it cheap, private, and survivable under GDPR/DMCA.
5. **Public = signed; private = encrypted.** Public works are signed for verifiability (not hidden). Private works are end-to-end encrypted with capability-based sharing.
6. **Compose, don't reinvent.** DIDs/VCs + AT-Proto repo + ActivityPub + IPFS/Arweave + OpenTimestamps + OIDC. Our novel contribution is the **creative-works lexicons** and the **creator UX**.

---

## 2. Identity & keys

- **DID method: `did:plc`** (AT Proto's portable method). Not `did:web` — that would tie identity to a domain (Plajah-captured). `did:plc` resolves to a key set + service endpoints and supports provider migration.
- **Handle:** a human-readable alias (e.g. `alice.plajah.app` or a creator's own domain via DNS/HTTP verification). The handle is *re-pointable*; the DID is permanent.
- **Key roles:**
  - **Rotation/identity keys** — control the DID document (what can re-point the handle / change the signing key). Held in custody with recovery (below).
  - **Signing key** — signs repo commits + records. Day-to-day.
  - **Device keys (passkeys/WebAuthn)** — hardware-backed, phishing-resistant, per-device; authorize the signing key. This is the real "most secure" lever.
- **Recovery (must ship in Phase 1):** social recovery (M-of-N trusted contacts) and/or MPC/threshold custody. "Lose your key = lose your career" is the failure mode that kills the product. A creator must be able to recover the DID without Plajah's unilateral control.

---

## 3. Sign-in (two on-ramps)

- **Native:** AT Protocol **OAuth** — a protocol-aware platform gets the creator's DID + PDS endpoint + scoped access, then reads the repo directly. Unlocks "the work is just there."
- **Compatibility:** an **OIDC** bridge — Plajah runs an OpenID Connect provider so a normal platform integrates "Sign in with Plajah" exactly like Google/Facebook, receiving a profile + scoped token. Bootstraps adoption; a later upgrade path to native.
- **Scopes** gate what a platform may read/write (e.g. `read:music`, `read:video`, `write:posts`, `read:profile`). Creator-consented, revocable.

---

## 4. The repo (what follows you)

Adopt the **AT Protocol repository**: a signed, content-addressed Merkle Search Tree (MST) of records, hosted on a **PDS** (Personal Data Server).

- **Hosting:** Plajah PDS by default; self-hostable; **migratable** (export the signed repo as a CAR file, import elsewhere, re-point the DID). Migration is proven in Phase 2 — it is the whole promise.
- **Records** live in **collections** keyed by NSID; each record has a stable `rkey`. A record is addressable by **AT-URI**: `at://<did>/<collection>/<rkey>`.
- **Cross-references** (album → its tracks, episode → its series, credit → a collaborator's DID) use AT-URIs, so a work graph travels intact.
- **Blobs** (the actual bytes) are referenced by **CID**, stored in the content layer (§6), not inline.

---

## 5. Lexicons — the creative-works data model (the core contribution)

Namespace: **`app.plajah.*`** for the reference implementation. (For standardization the namespace can later be donated/neutralized; the schemas are what matter.)

### Common fields (mixed into every creative record)
| field | type | notes |
|---|---|---|
| `$type` | string | the lexicon NSID |
| `title` | string | |
| `description` | string? | |
| `createdAt` / `updatedAt` | datetime | |
| `visibility` | enum | `public` \| `unlisted` \| `private` (encrypted, §9) |
| `license` | string? | SPDX/CC id or `all-rights-reserved` |
| `rights` | object? | owner DID(s), territory, terms |
| `collaborators` | ref[]? | `app.plajah.creative.credit` AT-URIs |
| `tags` | string[]? | |
| `provenance` | ref? | OpenTimestamps proof record (§8), added async |
| `external` | object[]? | links to where it ALSO lives (streaming URLs, etc.) |

### Record types
- **`app.plajah.actor.profile`** — creator profile: `displayName`, `handle`, `avatar` (blob), `banner`, `bio`, `pronouns`, `roles[]` (artist/author/filmmaker/…), `links[]`.
- **`app.plajah.creative.track`** — `audio` (blob), `duration`, `isrc?`, `cover?` (blob), `lyrics?`, `album?` (ref), `credits[]`.
- **`app.plajah.creative.album`** — `kind` (album/EP/single/mixtape), `tracks[]` (refs), `cover` (blob), `releaseDate`, `label?`, `upc?`, `credits[]`.
- **`app.plajah.creative.video`** — `media` (blob or `external`), `thumbnail` (blob), `duration`, `captions[]?`, `credits[]`.
- **`app.plajah.creative.film`** — `kind` (feature/short/doc), `media`, `runtime`, `poster` (blob), `rating?`, `cast[]`, `crew[]` (credits).
- **`app.plajah.creative.series`** — `kind` (tv/web), `poster`, `seasons[]` (meta). **`app.plajah.creative.episode`** — `series` (ref), `season`, `number`, `media`, `runtime`.
- **`app.plajah.creative.book`** — `cover` (blob), `isbn?`, `authors[]`, content as `epub`/`pdf` (blob) **or** `chapters[]` (refs to `app.plajah.creative.chapter`).
- **`app.plajah.creative.image`** — `image` (blob, EXIF-stripped), `alt`, `caption?`.
- **`app.plajah.creative.post`** — `text`, `embeds[]` (media/work refs), `replyTo?`, `quote?`. (Maps cleanly to ActivityPub/AT posts.)
- **`app.plajah.creative.project`** — an on-platform creative project: `app` (e.g. `plajah-pixels`, `lorea`), `kind`, `snapshot` (blob, the project file) + `state?`, `collaborators[]`, `openWith` (deep-link/runtime hint). This is how a *Plajah Pixels set* or a *Lorea book draft* travels with the creator.
- **`app.plajah.creative.credit`** — reusable attribution: `role`, `subject` (DID or name), `work?` (ref). Enables a portable, verifiable credits graph across creators.
- **`app.plajah.creative.collection`** — a curated portfolio/grouping of work refs.

### Example — an album + a track
```json
// at://did:plc:alice/app.plajah.creative.album/3k...
{
  "$type": "app.plajah.creative.album",
  "title": "Midnight Neon",
  "kind": "album",
  "cover": { "$type": "blob", "ref": "bafkrei...cover", "mimeType": "image/jpeg", "size": 482113 },
  "releaseDate": "2026-03-01",
  "tracks": [
    "at://did:plc:alice/app.plajah.creative.track/3k...t1",
    "at://did:plc:alice/app.plajah.creative.track/3k...t2"
  ],
  "license": "all-rights-reserved",
  "visibility": "public",
  "createdAt": "2026-03-01T12:00:00Z"
}
```
```json
// at://did:plc:alice/app.plajah.creative.track/3k...t1
{
  "$type": "app.plajah.creative.track",
  "title": "Neon Drift",
  "audio": { "$type": "blob", "ref": "bafkrei...audio", "mimeType": "audio/mp4", "size": 8123004 },
  "duration": 213.4,
  "isrc": "US-XXX-26-00001",
  "album": "at://did:plc:alice/app.plajah.creative.album/3k...",
  "credits": ["at://did:plc:alice/app.plajah.creative.credit/3k...c1"],
  "visibility": "public",
  "createdAt": "2026-03-01T12:00:00Z"
}
```

When Alice signs into a music app, it resolves `did:plc:alice` → her PDS → reads `app.plajah.creative.album` + `track` records → streams audio/cover by CID from the content layer. **No upload.**

---

## 6. Content storage (CID-addressed; centralized now, decentralized later)

- Media bytes are **content-addressed by CID** (AT Proto blobs already are). The CID is stable regardless of where the bytes live — the basis for "universal & persistent."
- **Now (Phase 3a):** Plajah CDN / object store, keyed by CID. Fast, affordable, great UX.
- **Later (Phase 3b):** add tiers behind the same CID — **IPFS** (pinned, content-addressed decentralization) and **Arweave** (pay-once permanence), creator-opt-in per work. Because addressing is already CID-based, this is additive — no schema change.
- A **resolver** picks the closest available source for a CID (CDN → IPFS → Arweave).

---

## 7. Interop (first-class decentralized social)

- The **DID is canonical**; ActivityPub / Nostr / AT are **views/bridges**, not separate identities.
- **ActivityPub:** the passport is an AP `actor`; `app.plajah.creative.post` ⇄ AP `Note`/`Article`, media works ⇄ AP `Audio`/`Video`/`Image`/`Document`. Mastodon et al. can follow the creator natively.
- **Nostr/AT:** bridge events/records so the same identity is reachable in those networks.

---

## 8. Provenance & economy (later phases, specced now)

- **Authorship record:** periodically hash a Merkle root of the repo and anchor it to **Bitcoin via OpenTimestamps** (one cheap timestamp covers thousands of works). A `provenance` record links a work to its timestamp proof. **Bitcoin = the record.**
- **Economy:** **Lightning** for tips/zaps, paid access, and paying for pinning/permanent storage. **Lightning = payments, not the record.**

---

## 9. Encryption & security

- **Public works:** signed by the creator's signing key (verifiable authenticity), stored in the clear (discoverable).
- **Private works:** the blob is encrypted (libsodium / `age`); a wrapping structure grants per-recipient capability keys. Sharing = granting a capability, revocable. Metadata can be selectively encrypted too.
- **Account security:** passkeys/WebAuthn device keys, hardware-backed where available; key rotation; M-of-N social / MPC recovery. "Most secure" is earned by key management, not branding.

---

## 10. Open questions (resolve during Phase 0/1)

1. **Recovery model:** social (M-of-N) vs MPC custody vs both — and Plajah's exact (non-unilateral) role.
2. **Handle strategy:** Plajah subdomains vs creator-owned domains as the default.
3. **Namespace governance:** keep `app.plajah.*` or define a neutral namespace for standardization from day one.
4. **Rights/licensing vocabulary:** how rich (SPDX/CC + custom terms) before it's over-engineered.
5. **Moderation in a portable/decentralized model:** labeling (AT-Proto-style) vs takedown, and how it travels.
6. **Project portability depth:** snapshot-only vs live-runtime handoff for on-platform projects (Pixels/Lorea).

---

## 11. Phase 0 deliverables

- [ ] This spec, reviewed.
- [ ] Lexicon JSON files for each record type (`app.plajah.*`), AT-Proto-validatable.
- [ ] DID-method + handle decision finalized.
- [ ] Recovery model decision.
- [ ] A worked end-to-end example: creator profile + album + 2 tracks + 1 project, as repo records, demonstrating cross-platform render-by-reference.

> Next after Phase 0: identity + passkey auth + recovery (Phase 1), then the PDS + migration (Phase 2). The flagship demo to build toward: **sign into a second app and watch the work appear with zero upload (Phase 4).**
