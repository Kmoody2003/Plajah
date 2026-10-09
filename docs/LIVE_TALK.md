# Live Talk — architecture, limits, next steps

Live Talk is Plajah's live audio rooms product (an X Spaces / Clubhouse competitor). This page covers how it works today, the limits on the current peer-to-peer design, and how to scale it later.

## Files

| Concern | File |
|---|---|
| Pure logic (caps, roster, permissions, phases), unit-tested | `services/liveTalk/liveTalkCore.ts` → `tests/liveTalkCore.test.ts` |
| Firestore operations | `services/liveTalk/liveTalkService.ts` |
| UI | `components/LiveTalkView.tsx` (discovery cards also in `components/FeedView.tsx`) |
| WebRTC backbone | `services/rtcCore.ts` + `hooks/useRtcSession.ts` ('stage' topology, `liveness: true`) → `tests/rtcLiveness.test.ts` |
| TURN credentials | `routes/rtcIce.ts` (GET `/api/rtc/ice`) + `services/iceConfig.ts` |
| Rules | `firestore.rules` (match `/liveTalks`, `/rtc_sessions`) and `docs/rules-patches/live-talk.rules.snippet` for the live rule set |
| Index | `firestore.indexes.json`: `liveTalks (isActive ASC, timestamp DESC)` |

Run the tests with `npm run test:livetalk`.

## Data model (named database `plajah-prod`)

```
liveTalks/{talkId}                 the host owns this doc
  hostId, hostName, hostPhoto, title, topic, category, isActive, timestamp
  lastHeartbeat   serverTimestamp, written by the host every 20s
  cohostUids[]    the moderators (the rules check this list)
  speakerUids[]   who is on stage (max 10); also the rtc publish allow-list
  kicked[]        uids who may not rejoin
  memberCount     seats taken (max 20); kept exact by the join/leave batches
  speakers[], listeners[], listenerCount, speakerCount, raisedHandCount   roster copy kept for discovery
  isRecording, recordingStartedAt, sharedAssets[]
  members/{uid}   role host|cohost|speaker|listener, name, photo, joinedAt, lastSeen,
                  handRaised, mutedByHost, selfMuted
  chat/{id}       senderId, senderName, senderPhoto, text (≤500), timestamp, type:'TEXT'
  reactions/{id}  uid, emoji, count (1–30), at, expireAt
rtc_sessions/talk_{talkId}         WebRTC signaling (participants/, signals/{from}__{to}/candidates/)
```

### Who writes what
- **Joining.** The member writes its own doc and adds 1 to `memberCount` in a single batch. The rules use `existsAfter`/`getAfter` to reject the write if the room would go over 20, if the user is in `kicked`, or if the user and the host have blocked each other. A new member always starts as a `listener`; the only exception is the host joining their own talk.
- **Leaving.** The member deletes its doc and subtracts 1 from `memberCount`, again in one batch. On `pagehide` this is attempted on a best-effort basis.
- **Self-updates.** A member can update its own presence (`lastSeen`), raised hand, and self-mute. It can only change its own role downward, to `listener`. It cannot clear `mutedByHost`.
- **Host and co-hosts.** They promote and demote members, mute them (`mutedByHost`), lower hands, kick (`kicked[]`, which also deletes the member doc and frees the seat), and delete chat messages. Only the host can create or remove co-hosts.
- **Roster upkeep (host only).** About 700ms after the member list changes, and again every 30s, the host recalculates the roster copy on the talk doc (`deriveDenorm`). In the same pass it deletes member docs that have gone stale (no `lastSeen` for 90s), which repairs any drift in `memberCount`.

### Lifecycle
- **Host heartbeat.** The host writes `lastHeartbeat` every 20s. Discovery (`isTalkAlive`) hides any talk whose heartbeat is older than 60s. Legacy docs with no heartbeat field are trusted for only 10 minutes after creation.
- **Host disappears for more than 60s.** The first co-host in `cohostUids` who is still present takes over by writing `hostId`. The rules allow this only when the heartbeat really is stale (they compare against `request.time`). If there is no co-host, everyone sees a "host lost connection" banner. Once the heartbeat has been silent for 5 minutes, any signed-in user may set `isActive: false`.
- **Host leaves.** The host chooses one of two options: **End for everyone**, or **Leave — {co-host} keeps hosting**. The hand-off updates `hostId`, and the new host then promotes its own member doc to `host`.

## Audio path

All audio uses rtcCore's `stage` topology:
- **Speakers** are in `speakerUids` and publish to everyone.
- **Listeners** only receive.
- `allowedPeerIds` limits who connects to whom: a listener connects only to `speakerUids`, and a speaker connects only to people with a member doc. Kicked uids are excluded.

The rtc presence role is derived from `speakerUids` on the talk doc. That is the same field the rules check, so a listener cannot publish.

Liveness mode (`liveness: true`, opt-in, so meetings and other rtcCore users are unchanged):
- Every join gets a new `nonce`. It is written to the participant doc and stamped on every SDP and ICE candidate. Signals from an earlier join on either side are ignored, which fixes the old "stale SDP replay → signaling failed → speaker auto-muted" bug.
- If a peer's nonce changes (it rejoined), the old connection is torn down and rebuilt.
- Participants send a heartbeat every 15s. A peer silent for 45s is dropped. Staleness is measured on the local clock, so clock skew between devices does not matter.

Generic hardening, which applies to all rtcCore users:
- ICE restart when a connection reaches `failed`, or after it has been `disconnected` for 4s. Only the side that sent the original offer restarts.
- ICE candidates that arrive before the remote description are queued instead of dropped.
- A stray answer received while signaling is already `stable` is ignored.
- Signaling errors are reported through `onSignalWarning` and no longer treated as media errors.
- `leave()` runs on `pagehide`, can safely be called more than once, and deletes our outgoing ICE candidates.
- A role change (re-key) waits for the previous `leave()` to finish, so presence is no longer deleted by mistake.
- A page restored from the back/forward cache rejoins automatically.
- Opus bitrate is 48 kbps for stage and mesh (voice) and 256 kbps for broadcast and collect. Callers can override it with `audioBitrate`.

Mute: the mic track is enabled only if the user is on stage, has not muted themselves (`selfMuted` false) and has not been muted by a moderator (`mutedByHost` false). In P2P, mute is **enforced by the client**: a modified client could still send audio to the speakers it is connected to, and listeners would still not hear it. Only an SFU can enforce mute on the server.

TURN: `/api/rtc/ice` returns short-lived credentials from the provider configured on the server. On the client they are fetched in parallel with mic capture, cached, and given a 1.5s timeout before falling back to the static list.
- `CLOUDFLARE_TURN_KEY_ID` + `CLOUDFLARE_TURN_API_TOKEN` (Cloudflare Realtime TURN), or
- `METERED_API_KEY` + `METERED_APP_DOMAIN`
- optional `RTC_TURN_TTL_SECONDS`

With neither configured, it falls back to `VITE_TURN_*`, or failing that the public openrelay server, which is not reliable enough for production.

## Capacity: the 20-person cap

**Owner decision (2026-10-08): every talk is capped at `LIVE_TALK_MAX_PARTICIPANTS = 20` people in total** (host + co-hosts + speakers + listeners), with at most `LIVE_TALK_MAX_SPEAKERS = 10` on stage. The cap stays until P2P has been proven on real devices.
- It is enforced in the client join path (`joinBlocker`) **and** in the rules (`memberCount <= 20`, checked against the same batch as the member doc).
- When a room is full, the user sees "This talk is full (20/20)". "Notify me when a spot opens" watches the talk doc and shows **Join now** as soon as `memberCount` drops below 20. This works only while the page is open; there is no push notification yet.
- The room header and the discovery cards show the count as `12/20`.
- To raise the cap, change the constant **and** the literal `20` in the rules snippet together, and only after the SFU work below.

### Why 20? The cost of P2P

Each speaker uploads one Opus stream per connected peer:
- At 48 kbps, 1 host + 19 listeners means the host uploads about 0.9 Mbps.
- With 10 speakers and 10 listeners, each speaker holds 19 connections.

CPU (encryption and packetization per connection) and mobile uplink run out well before Firestore does. The practical ceiling for P2P stage is **about 25 listeners with a few speakers** on good networks. Twenty people with 10 on stage is already close to the limit on phones.

Firestore cost scales with roughly N²:
- Every member listens to the members collection, and each member writes a heartbeat every 30s.
- At 20 people that is about 800 reads a minute.
- Chat and reactions add 1 read per message per member.

## Expansion path (SFU only once usage justifies it)

Move to an SFU only when real rooms regularly hit the cap.
1. **LiveKit Cloud** (has a free tier). Rooms, speaker/listener permissions and server-side mute map directly onto members. Token minting is a small server route, similar to `routes/rtcIce.ts`.
2. **Cloudflare Realtime (Calls) SFU.** This pairs with the Cloudflare TURN already wired in. It is lower level (you manage sessions and tracks yourself) and costs per GB.

Plan:
- Add an `'sfu'` topology to rtcCore behind the same `useRtcSession` API.
- Keep `members/` as the source of truth for roles.
- Mint SFU tokens from the server with publish rights only for `speakerUids`.
- Then raise `LIVE_TALK_MAX_PARTICIPANTS`. Thousands of listeners become possible, with the speaker cap unchanged.

## Not built yet / next steps

- **Scheduled talks** (`scheduledFor` + a "Remind me" reminder doc). Not built.
- **Reaction TTL.** Set up a Firestore TTL policy on the `reactions` collection group, field `expireAt` (in the console or with `gcloud firestore fields ttls update expireAt --collection-group=reactions --database=plajah-prod`).
- **Background throttling.** When a host's tab is hidden and has no peer connections, Chrome can throttle timers to once a minute after 5 minutes. That can make the 60s heartbeat look stale. Consider a Web Worker timer, or a 90s threshold, if this shows up in testing.
- **Moderation.** Chat is not run through the content-safety classifier, and there is no slow-mode yet.
- **Multiple mounts.** `PersistentChatDrawer` can mount a second `LiveTalkView`. Two rooms open in one tab would share one rtc peer id.
- **Recording.** Recording saves a podcast episode only (`saveStudioEpisode`, with the real duration). A recording made in one browser tab hears only what that tab receives.
