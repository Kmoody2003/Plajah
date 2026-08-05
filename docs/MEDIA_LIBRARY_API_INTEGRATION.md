# PlayGround.api → Plajah Integration Proposal

*Created 2026-07-06. Analysis of the separately-developed `playground.api` codebase and how it plugs into Plajah. Companion to the new `components/ContentAssetManager.tsx` (the DAM UI) and [[creator-passport]].*

## 1. What PlayGround.api is

From its own `metadata.json`: **"A universal digital asset management system and decentralized database for independent artists to host, standardize, and federate their media content to external platforms via API."**

It's a small Express + Firestore service exposing:
- `POST/GET /api/media` — `mediaAssets` documents: `{ artistId, title, type, status, originUrl, releaseDate, playCount }`
- `POST/GET /api/artists` — artist profiles
- `POST/GET /api/news` — news items
- `GET /api/health`

Its `security_spec.md` sets the invariants: **artists own their own assets; `mediaAssets` are public-read; `playCount` is server-only; `artistId` is immutable; types/titles are validated.** In short: a **standardized, ownership-scoped, publicly-readable, federatable catalog** — one normalized record per work, addressable by API.

## 2. The integration thesis

Plajah already stores content across many collections — `albums` (MUSIC/VIDEO/BOOK), `videos` (Reello), `personal_*`, book chapters, etc. The new **ContentAssetManager** normalizes those *at read time* into one categorized view (Chora/Taleo/Lorea/Reello). **PlayGround.api is the missing persistence + API layer under that view**: a single canonical `mediaAsset` record per work, plus a public API to syndicate a creator's catalog to the outside world.

> Plajah = where you make and host the work. ContentAssetManager = where you manage it. **PlayGround.api = the standardized index + the outbound API that lets your Plajah catalog live anywhere (the Creator-Passport promise: your work follows you).**

`mediaAsset.originUrl` is the linchpin: it points back to the canonical Plajah asset (or an external host), so the record is portable and self-describing.

## 3. Where it plugs in (mapping)

| PlayGround.api concept | Plajah home |
|---|---|
| `mediaAsset` (normalized record) | a new `mediaAssets` collection = the canonical cross-service index (mirrors the `Asset` shape ContentAssetManager already computes) |
| `type` / `status` | Chora/Taleo/Lorea/Reello + Public/Draft/Private/Scheduled (already modeled) |
| `originUrl` | the Plajah asset URL (album/video/book) — the passport-addressable link |
| `playCount` (server-only) | Plajah's existing analytics; write via Cloud Run, never client |
| `artists` | Plajah `users` + [[creator-passport]] identity |
| federation API | a public, rate-limited read API on Cloud Run |
| `security_spec` invariants | Plajah `firestore.rules` (owner-write, public-read) + authMiddleware |

## 4. Phased plan

- **Phase 1 — Canonical index (persist what ContentAssetManager computes).** On publish (`publishToCloud`, `uploadVideo`, book/film flows), upsert a `mediaAssets/{id}` record `{ artistId, title, type, status, service, originUrl, releaseDate, playCount }`. This turns the read-time normalization into a durable, queryable catalog and makes the Asset Manager instant (one collection instead of N fetches).
- **Phase 2 — Public federation API.** Expose `GET /api/artists/{id}/media` on the Plajah Cloud Run server (rate-limited, optional API key), returning that creator's public `mediaAssets`. This is the "federate to external platforms" promise — external apps/sites embed a creator's Plajah catalog. Pairs with [[creator-passport]] (the portable identity that owns the catalog).
- **Phase 3 — Standardization + inbound.** Adopt the PlayGround schema as the interop contract; let creators **register external media** (a work hosted elsewhere) into their Plajah catalog via `originUrl`, so the Asset Manager shows their *entire* footprint, not just Plajah-hosted work. True "host, standardize, and federate."
- **Phase 4 — Syndication targets.** Use the standardized records to push to external platforms (RSS/podcast feeds already exist; extend to a generic "publish to X via API" using `mediaAsset` as the source of truth).

## 5. Security (reuse its spec)

Adopt PlayGround's "Dirty Dozen" as the `firestore.rules` test matrix for `mediaAssets`: owner-only create/update, immutable `artistId`, public read, server-only `playCount`, validated `type`/`title` size, reject shadow fields. This matches Plajah's existing rules discipline ([[plajah-firestore-gotchas]]).

## 6. Recommendation

Don't run PlayGround.api as a *separate* service — **fold its model + endpoints into Plajah's existing Cloud Run server** (`server.ts`) and Firestore, so it shares auth, rate limiting, and the deploy pipeline ([[plajah-ci-deploy]]). The value is the **standardized `mediaAsset` schema + the public federation API**, not a second backend. Start with Phase 1 (the canonical index) — it directly upgrades the Asset Manager from N-collection reads to one, and everything else builds on it.
