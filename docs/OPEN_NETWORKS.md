# Open networks

Plajah stays home (Mux playback, comments, master copies). Open networks are places people can follow, find or
mirror Plajah work. Built 2026-11-10. Uncommitted at time of writing.

Run everything: `npm run test:opennet` (77 tests, no network) and `npm run typecheck:opennet`.
In this checkout `node_modules/.bin` is missing, so use `node node_modules/tsx/dist/cli.mjs --test tests/<name>.test.ts`
and the `plajah-node` launch config instead of `npm run dev`.

## What each piece does

| Piece | Files | Routes |
|---|---|---|
| **ActivityPub server**: every opted-in user/org is `@handle@plajah.com` on Mastodon, Threads, Pixelfed, Lemmy… replies, likes and boosts come back | `services/activitypub/*`, `routes/activitypub.ts`, `components/networks/FediverseIdentityCard.tsx` | `/.well-known/webfinger`, `/.well-known/nodeinfo`, `/nodeinfo/2.1`, `/.well-known/host-meta`, `/ap/actor`, `/ap/users/:handle` (+ `/outbox`, `/followers`, `/following`, `/inbox`), `/ap/inbox`, `/ap/posts/:id`; owner: `/api/activitypub/me`, `/api/activitypub/replies/:postId` |
| **Podcasting 2.0**: value splits (Lightning, paid straight to the creator), chapters, transcripts, live items, persons, funding, Podcast Index pings | `services/podcast20/*`, `services/podcastRSSService.ts`, `routes/podcast20.ts`, `components/PodcastRssSettings.tsx` | `/podcast/:albumId/feed.xml`, `/podcast/:albumId/chapters/:trackId.json`, `/podcast/:albumId/transcript/:trackId.(vtt\|srt\|json)`, `/api/podcast20/:albumId/settings`, `/api/podcast20/:albumId/notify` |
| **Nostr** (opt-in): link a pubkey, NIP-05 `name@plajah.com`, publish posts/tracks, zaps paid creator-direct (NIP-57), public music/notes feed | `services/nostr/*`, `routes/nostr.ts`, `components/networks/NostrPanel.tsx` (also exports `ZapButton`, `publishToNostr`) | `/api/nostr/*`, `/.well-known/nostr.json` |
| **PeerTube / Funkwhale publish**: Reello video → creator's PeerTube; Chora album → creator's Funkwhale | `services/peertube/publish.ts`, `services/funkwhale/*`, `routes/openPublish.ts`, `components/networks/{PeerTube,Funkwhale}PublishModal.tsx` | `/api/open-publish/*` |
| **Bridges**: Mobilizon (events), Lemmy (forums), BookWyrm (shelves, read-only), Owncast (live status, chat, ingest config), Matrix (chat) | `services/openNetworks/*`, `routes/openNetworks.ts`, `components/networks/OpenNetworksPanel.tsx` | `/api/open-networks/*` |

## Where it shows up

- Settings → Social Networks: fediverse identity card, Nostr panel, open-networks panel (under the existing Bluesky/Threads/Mastodon block).
- Reello video studio header: **PeerTube** button (owner, public videos only).
- Music Distribution hub: **Funkwhale** button next to each album's Audius button.
- Podcast RSS settings → Distribute: **Podcasting 2.0** section.

## How posts get out

Posts are written to Firestore by the browser, so `createPost`/`deletePost` (services/backendService.ts) call
`services/openNetworks/federateClient.ts` → `POST /api/federate/post/:postId`. The server re-reads the post, checks the
author, then fans out to ActivityPub followers and runs Nostr auto-publish (server key only). Delete only fires once the
post is really gone. Failed deliveries retry on a 2-minute timer (backoff 1 min → 24 h).

## Rules every piece follows

- Never federate private, followers-only, list, org-internal/department, paywalled, exclusive, sanctuary-gated, unreleased or rights-held content.
- Child accounts can't turn any of it on. Church, school, nonprofit (and similar) orgs are off by default and need an admin opt-in.
- No held money: Lightning value splits and zaps go to the creator's own address. Plajah never takes a cut and never holds funds.
- Tokens are stored encrypted (`ENCRYPTION_KEY`); passwords are never stored. Every user-entered server URL goes through an SSRF guard (https only, private IPs blocked).
- UI tells creators that federated copies may survive deletion.
- All new collections are server-only (`ap_*`, `nostr_*`, `podcast20Feeds`, `openPublish*`, `openNetwork*`). No `firestore.rules` changes.

## Deploy notes

- `firebase.json` rewrites send `/podcast/**`, `/.well-known/{webfinger,nodeinfo,host-meta,nostr.json}`, `/nodeinfo/**`, `/ap/**` to Cloud Run.
- `VITE_APP_URL` must be `https://plajah.com` in prod: actor IDs, podcast GUIDs and NIP-05 names are built from it and
  must never change once people follow / subscribe.
- Optional env: `PODCASTINDEX_API_KEY` / `PODCASTINDEX_API_SECRET` (pings), `NOSTR_TICKET_SECRET`.

## Not verified / known gaps

- Nothing has been tested end-to-end against a live Mastodon follow, a real PeerTube/Funkwhale/Mobilizon/Matrix account, or a real Lightning payment. Public reads were checked live: Nostr relays, lemmy.world, an Owncast server.
- The Settings panels compile but haven't been looked at signed in.
- Funkwhale has no documented password login: creators approve Plajah on their pod and paste a code (or an app token). Its upload field names come from 1.x source, not checked against a live pod.
- PeerTube imports from a Mux MP4 rendition (not the original upload); HLS-only videos are refused. Long uploads run in-process and may stall under Cloud Run CPU throttling.
- Mobilizon GraphQL schema written from memory (`geom` format, `joinOptions: EXTERNAL`).
- Nostr music goes out as kind-1 notes with `imeta` tags, not the Wavlake track kind. No in-browser NIP-46 bunker.
- Matrix: no end-to-end encryption; room aliases not resolved; huddle mirroring not wired.
- SSRF guards check DNS then fetch resolves again (small DNS-rebinding gap; needs an undici dispatcher to pin).
- Podcast chapters come from owner settings (tracks have no chapter field); transcripts come from time-coded lyrics only.
