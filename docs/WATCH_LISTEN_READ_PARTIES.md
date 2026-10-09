# Watch / Listen / Read parties, Rooms, Presence

How Plajah's synchronized parties work (watch-along, read-along, listening party), plus the Rooms and
Presence primitives they sit next to. Updated 2026-10-08.

## Model

One primitive, three surfaces. The host's client broadcasts **state**, not media; every guest plays
the content **locally** through their own access.

| Piece | File |
|---|---|
| Pure sync math (tested) | `services/partySync.ts` · `tests/partySync.test.ts` |
| Firestore I/O | `services/partyService.ts` (re-exports partySync) |
| React glue | `hooks/useParty.ts` |
| Shared chrome | `components/party/PartyBar.tsx`, `PartyToastHost.tsx`, `partyToast.ts` |
| Discovery row | `components/party/PublicPartiesRow.tsx` (top of `LiveHubView`) |
| Watch | `components/VideoPlayer.tsx` (native `<video>` and YouTube) |
| Read | `components/BookReader.tsx` (native chapters, EPUB CFI, parsed PDF/DOCX/TXT) |
| Listen | `components/PlayerView.tsx` (Chora album) |
| Join resolver | `App.tsx` `openPartyByIdRef` (used by `?party=` and `openPartyInApp()` / `plajah:open-party`) |

### Firestore

```
parties/{id}                 kind, hostId/Name/Photo, content{type,id,title,thumbnail,totalPages},
                             playback{isPlaying,positionSec,currentPage,chapterIndex,cfi,parsedChapter,
                             parsedPage,trackIndex,contentId,countdownEndsAt,started,updatedAt,seq},
                             isActive, endedAt, hostHeartbeat, hostAway, coHostIds[], openRemote, visibility
parties/{id}/viewers/{uid}   uid, name, photo, joinedAt, seenAt   (clock probe + "longest present")
parties/{id}/chat/{msg}      uid, name, photo, text<=300, at
parties/{id}/reactions/{r}   uid, emoji (fixed set), at
presence/party_{id}/here/{uid}  avatars / count (usePresence)
```

**Entitlement.** The party doc is public-read, so it holds only a content *reference*. Rules reject
`content.url` / `content.muxPlaybackId`. Every guest resolves the playable item with their own
access (`fetchVideoById`, `fetchAlbumById`). If that fails, the guest gets a toast saying the title
may need a purchase or subscription. Listening-party followers go through `musicAccess.canPlayFull`:
a preview-only priced track they don't own is not followed past `PREVIEW_SECONDS`, and they see a
**Buy** pill that opens the existing support sheet. Videos have no client paywall today. Their only
gate is the `videos` read rule.

## Sync

- **Anchor.** Followers anchor on the host's server write time (`playback.updatedAt`) plus a clock
  offset. The offset comes from a probe: write `viewers/{uid}.seenAt = serverTimestamp()`, read it
  back from the server, and take the midpoint of the bracket (`refineClockOffset`, which keeps the
  smallest-RTT sample). The probe repeats every 30s. Until the first probe lands, followers anchor
  on local receipt time plus a 0.4s fudge.
- **Drift** (`planDriftCorrection`). Up to 0.15s off: rate 1. Under 3s: `playbackRate` is nudged
  within 0.95–1.05. 3s or more: one hard seek, then a 4s backoff, so there are no seek loops. While
  the host is paused, followers seek exactly once they are more than 0.25s off. YouTube only has
  coarse rates, so it uses hard seeks only, with a 1.5s threshold.
- **Host writes.** Leading-edge plus trailing throttle (250ms). The host also refreshes position
  every 3–4s while playing, on any jump of more than 1.5s (a seek, including a seek while paused),
  and on every play/pause.

## Liveness, end, handoff

- Host heartbeat: `hostHeartbeat = serverTimestamp()` every 5s. Control writes count as heartbeats.
  On `pagehide` the host sets `hostAway: true` as a best-effort signal.
- Followers judge liveness on **their own clock**: how long since they saw the heartbeat change. If
  they also have a server-clock estimate, a heartbeat that was already stale when first seen counts
  too. Silent for more than 15s, or `hostAway`: "Host reconnecting…" and everyone pauses where they
  are (`hold`). More than 60s: the host is **gone**.
- When the host is gone, `pickClaimant` chooses the first *present* co-host. With `openRemote`, it
  falls back to the longest-present viewer. A co-host claims automatically after 1.5–3s of jitter;
  an open-remote viewer gets a **Take the remote** button. Rules re-check that the heartbeat is
  stale and that the claimer is eligible.
- **Pass the remote.** The host picks someone under ⚙ → Here now. The old host becomes a co-host.
- **Ended.** `isFollower = isActive && !isHost`. When the host ends the party, followers get a toast,
  "… ended — you're on your own now", and their controls unlock.
- **Re-hosting.** The deterministic id `party_{host}_{content}` is overwritten (no merge), so an old
  `endedAt` never comes back.

## UX

- PartyBar shows: status dot and copy (Following X / X reconnecting… / dropped / ended), viewer
  avatars, emoji reactions (floating overlay, history never replays), chat drawer (blocked/muted
  users hidden), Invite, host ⚙ (List publicly, open remote, co-hosts, pass remote), and End or
  Leave.
- **Start together** (host, before the first play) starts a 3-2-1 countdown that everyone sees. Its
  end instant is stored in server time (`countdownEndsAt`).
- Followers get **Tap to unmute** when autoplay forced a muted start.
- Reading: a follower's page turns are locked, and trying one shows a toast. **Read on my own**
  unlocks them and **Rejoin host** snaps back. EPUB follows through the reader's controlled
  `location` (CFI). Swipes *inside* the epub.js iframe can't be intercepted; the next host turn
  re-syncs them.
- Toasts come only from `partyToast()`, rendered by `PartyToastHost`, which is mounted once in App
  and once per PartyBar with a singleton guard. There are no modals or alerts.
- **Invites.** People you follow and people who follow you, through batched profile fetch. Each gets
  a `createNotification` (`CONTENT`, link `/?party=…`), which also sends a push.
- **Discovery.** "Watch with others now" at the top of the Live Hub lists active, public parties
  whose heartbeat is under 45s old.

## Rooms and Presence (same wave)

- `hooks/usePresence.ts`:
  - uid comes from `onAuthStateChanged`, so a late sign-in still publishes.
  - Staleness is judged against server `heartbeat` with a per-member change tracker (`services/presenceCore.ts`).
  - Docs carry `expireAt` (now + 10min).
  - The list is re-filtered locally every 10s.
  - `pagehide` deletes our doc; `pageshow` and visible republish it.
- `services/roomService.ts`:
  - Member heartbeat (`lastSeen`) plus a stale filter.
  - Hosts can reopen an ended deterministic room.
  - Poll votes moved to `polls/{pollId}/votes/{uid}`, tallied by `services/roomPollCore.ts`.
- `components/RoomBanner.tsx` reads room liveness from the doc.
- `now_active` gets a rule. Before this it was default-deny, so RightNowFeed was always empty.
  `presenceService` also stopped writing `undefined`.

## Deploy checklist (nothing deployed)

1. **Rules.** Apply `docs/rules-patches/parties-rooms-presence.rules.snippet` to
   `.rules-hotfix/firestore.rules`, dry-run, then deploy. The repo `firestore.rules` has the same
   changes but is over 256KB.
2. **Index.** `parties (isActive ASC, visibility ASC, hostHeartbeat DESC)`. It is in the repo
   `firestore.indexes.json`; add it to whatever index file you deploy.
3. **TTL.**
   - `gcloud firestore fields ttls update expireAt --collection-group=here --enable-ttl --database=plajah-prod`
   - Optional, for room members: `... --collection-group=members ...`

## Known limits

- Background tabs throttle timers, so a host who hides the tab for minutes may read as
  "reconnecting" even though playback continues. Audio/video tabs are throttled less.
- The heartbeat lives on the party doc, so each heartbeat is one read per follower: 12/min/follower.
  If audiences grow large, move it to `parties/{id}/live/host`.
- The video paywall (`isPaywalled`/`price`) isn't enforced by the normal player either. Parties
  match that behaviour and add no gate of their own.
- `openRemote` claim eligibility uses `viewers` docs, which can be up to 90s stale.

## Two-client test plan

1. **Basic sync.** A hosts a video party and B joins through the link: B lands in sync, pause/seek
   on A moves B, and a seek while paused also moves B.
2. **Late join.** B joins 2 minutes in and lands within about 0.5s, with no seek ping-pong.
3. **Drift.** Throttle B's network: B nudges rate and makes at most one hard seek every 4s.
4. **Host drops.** Close A's tab: B shows "reconnecting" and pauses within about 1–15s. If A comes
   back within 60s, B resumes. If not, a co-host C auto-claims, or B gets "Take the remote" when
   open remote is on.
5. **End.** A ends: B sees "ended" and the controls unlock.
6. **YouTube.** Repeat steps 1 and 2 with a YouTube video.
7. **Read-along.** EPUB (CFI), parsed PDF (chapter/page) and native book: B's arrows are locked.
   "Read on my own" then "Rejoin" works.
8. **Listening party.** Track changes follow. A preview-only priced album shows B the Buy pill
   after 30s.
9. **Content access.** B without access to a private video gets the toast and no player.
10. **Social.** Chat, reactions and invite (B receives a notification and push that opens the
    party). Public listing appears in the Live Hub row.
11. **Start together.** Countdown shows on both and playback starts together.
