# Meetings on an SFU (LiveKit)

Huddles, group calls and scheduled meetings (including guest links) can run through a LiveKit SFU
instead of the full mesh. 1:1 chat calls stay peer-to-peer on `services/rtcCore.ts` (TURN via
`routes/rtcIce.ts`). It all sits behind a flag. With the flag off, nothing changes: every call stays on the mesh.

Decided 2026-11-12. LiveKit won over Cloudflare's SFU because it has the meeting features we need
(rooms, simulcast, active speaker, Egress for recordings) and an open-source path to hosting it ourselves.
We start on **LiveKit Cloud** and move to **self-hosted** once the monthly bill clearly exceeds what
self-hosting would cost. The move is only a URL and key change.

## Why

A mesh sends your camera once to *every* other person. That works up to about 5–6 people and then
uplinks and CPUs give out. With an SFU, you upload once and the server forwards your video. Each viewer
picks the quality layer they need.

## How a call picks its engine

```
useRtcSession(config, { sfu: { purpose: 'huddle' | 'meeting' } })
      │  (meeting paths only: chat_rooms/{id}/meeting_rtc/{scope}, public_meetings/{id}/rtc/main)
      ▼
MeetingSession.join()  ──POST /api/meetings/sfu/token──▶  routes/meetingsSfu.ts
      │                                                     │ membership (= firestore.rules)
      │                                                     │ 1:1? flag off? SFU down? → { mode: 'mesh' }
      │                                                     │ caps vs live occupancy (RoomService)
      ▼                                                     ▼
 mode 'sfu'  → LiveKitSession (services/meetings/livekitSession.ts)
 mode 'mesh' → RtcSession     (services/rtcCore.ts, unchanged)
 403 refused → MeetingRefusal: "room full / needs a plan / start a live broadcast"
```

The server decides once for each room, so everyone in a call lands on the same engine.
`LiveKitSession` exposes the same surface as `RtcSession`: local and remote `MediaStream`s,
participants, peer state, data messages, mute and camera toggles, device and camera swaps, external
(composer / voice FX) tracks, screen share and desktop audio. Because of that, `VideoChat`, `HuddleDock`,
`CollabCall` and `MeetingJoinPage` changed only a few lines each. LiveKitSession also writes the
same Firestore presence doc the mesh writes, so huddle banners and rosters keep working.

`livekit-client` loads lazily, as its own chunk (about 160 KB gzipped). Nobody downloads it until they join an SFU room.

## Room caps

They live in one file: **`services/meetings/sfuCaps.ts`** (`MEETING_CAPS`). The server enforces them in
the token route and never trusts the client for them.

| Room | Cap | Who |
|---|---|---|
| Huddle (chat audio dock) | **50** | everyone |
| Meeting (full call screen, scheduled meetings, guest links, Collab call) | **100** | everyone |
| Large meeting | **300** | org plans and Plajah+ only |
| Over 300 | no meeting room | the person is offered **Start a live broadcast** (Go Live) |

Rules:

- **Who unlocks 300.** A room counts as an org room when its `orgId` points to an existing
  `organizations` doc. The same rule as Content HQ: an org identity *is* the org plan. A room also gets 300 when an
  active Plajah+ subscription (`plajahPlusSubscriptions`, status active / trialing / past_due) belongs to
  the room owner, the meeting host, or the registered person starting the call. An anonymous guest's
  plan never counts. `hasPlajahPlusSub()` in `server.ts` is now shared with Fan Vote.
- **The first joiner fixes the cap.** The token route creates the LiveKit room with
  `max_participants = cap`, and LiveKit enforces that too. A room that started as a 50-person huddle
  stays at 50 until it empties out (LiveKit closes a room about 20 seconds after the last person leaves).
- **What the refusal says.** A full huddle points to a meeting. At 100 without a plan the message is `NEEDS_PLAN`, which offers Plajah+ or a broadcast.
  At 300 the message is `USE_BROADCAST`. The client gets
  `{ code: 'MEETING_ROOM_REFUSED', reason, message, cap }`.
- **Huddles never go past 50**, whatever the plan.

## Membership (same as the Firestore rules)

| Target | LiveKit room | Allowed when |
|---|---|---|
| `chat_rooms/{roomId}/meeting_rtc/{scope}` | `cr.{roomId}.{scope}` | the person is in `participants`. For `CLASSROOM_MEETING`, the class session must also be `LIVE`. `meetingScope`: not in `removedIds`, assigned to this scope, and the scope is `main` or an existing breakout |
| `public_meetings/{id}/rtc/main` | `pm.{id}` | the person is a member of the meeting's chat room, or has an `ADMITTED` lobby entry (guests are anonymous Firebase users) |

LiveKit identity is the Firebase uid, the same one the presence and lobby docs are keyed by. A token
grants `roomJoin` for exactly one room, with publish, subscribe and data, and expires after 6 h. It never grants `roomAdmin`.

**One identity per room.** If the same account joins from two tabs, LiveKit drops the older
connection, and that tab shows "You joined this meeting from another tab or device." The mesh
already behaved this way, because both tabs fought over the same presence doc.

## Bandwidth and cost model

What the camera sends: 720p at up to 1.2 Mbps, plus 360p and 180p simulcast layers. Dynacast turns
off any layer nobody is receiving. Audio uses Opus with DTX, so a silent mic costs about 0, and RED for loss resilience.

What each person receives (`setVideoPolicy`, driven by the paged grid in `VideoChat`):

- **Pages.** One page shows 8 remote tiles plus you on desktop, or 3 plus you on a phone. Video for people on other pages is **not received at all**. Their audio still plays.
- **Quality per tile.** The loudest speaker is kept on page 1 and gets the HIGH layer. With 2 or fewer others,
  everyone gets HIGH. With up to 4 others, the rest get MEDIUM (360p). In bigger grids, everyone besides the speaker gets LOW (180p). Screen
  shares are always HIGH.
- **Why the choice is explicit.** LiveKit's element-based `adaptiveStream` can't see our tiles, which bind raw
  `MediaStream`s. So the policy above *is* the adaptive stream: layers follow tile size and who is on screen.

Rough downstream use per participant:

| Layout | Received | ≈ GB/hour |
|---|---|---|
| 1:1 / 3-person (HIGH ×2) | ~1.8 Mbps | 0.8 |
| 5-person (HIGH + MEDIUM ×3) | ~2.1 Mbps | 0.95 |
| full page (HIGH + LOW ×7) | ~1.75 Mbps | 0.8 |
| audio only (huddle) | ~0.03–0.1 Mbps | 0.02–0.05 |

**Planning numbers: about 0.7–1 GB per participant-hour at $0.05–0.10/GB.** That works out to about
**$0.04–0.10 per participant-hour**. For example, a 100-person, one-hour meeting is about 85 GB, roughly $7 at
$0.08/GB. Upstream use (each publisher sends about 1.6 Mbps across the three layers) may be billed differently
on your LiveKit plan. Check the live price sheet when you sign up and set `SFU_USD_PER_GB` to match.

### Usage ledger (metering from day one)

LiveKit sends webhooks to `POST /api/meetings/sfu/webhook`. The route checks the signature against the
exact body bytes: an HS256 JWT signed with our API secret, whose `sha256` claim must match the body. Clients
can't write the ledger, because neither collection has a Firestore rule. Only the server writes.

- `meetingSfuSessions/{roomSid}__{participantSid}`: an open session, written on `participant_joined`.
- `meetingUsage/{roomSid}__{participantSid}`: one immutable record per participant session, written on
  `participant_left`, or on `room_finished` for anyone whose leave never arrived. Fields:
  `{ room, roomSid, identity, ownerKind: 'org'|'user', ownerId, ownerKey, kind, joinedAt, leftAt, seconds, minutes, month }`.
  The record is written with create-once, so LiveKit's retries never double-count.
- Attribution comes from the room metadata stamped when the room is created (`ownerKind/ownerId/kind/cap`).
  If that's missing, it falls back to `meetingSfuRooms/{room}`. Org rooms bill to the org. Everything else bills to the room owner or meeting host.

`GET /api/meetings/sfu/usage?month=YYYY-MM` (platform admins only) returns participant-minutes and hours,
estimated GB and dollars, a per-owner breakdown, `selfHostBreakEvenParticipantHours` and
`shouldConsiderSelfHost`. You can tune the model with server env vars (defaults in `services/meetings/sfuUsage.ts`):

| Env | Default | Meaning |
|---|---|---|
| `SFU_GB_PER_PARTICIPANT_HOUR` | 0.85 | middle of the 0.7–1 range above |
| `SFU_USD_PER_GB` | 0.08 | LiveKit Cloud bandwidth price |
| `SFU_SELFHOST_MONTHLY_USD` | 900 | all-in cost of running our own cluster (VMs, egress and upkeep time) |

### When to self-host

Break-even = `SFU_SELFHOST_MONTHLY_USD / (GB per participant-hour × $/GB)`. With the defaults that's
about **13,200 participant-hours a month**, or about $900 a month on Cloud. `shouldConsiderSelfHost` turns on at **1.5×**
that (about $1,350 a month). The extra 0.5× covers on-call and upgrade work, and the risk of running it ourselves. Below that line, stay on Cloud.

## Setup (LiveKit Cloud)

1. Create a LiveKit Cloud project in the region closest to `plajah-api` (us-west). Copy the project URL
   (`wss://<project>.livekit.cloud`), an API key and an API secret.
2. In the project settings, add a webhook with URL `https://<plajah-api host>/api/meetings/sfu/webhook`,
   signed with the same API key.
3. On Cloud Run `plajah-api`, put the keys in Secret Manager (never in the client bundle) and grant the
   service account `secretAccessor`, the same as the Threads secret:
   - `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`
   - `MEETINGS_SFU=1` turns it on. Leave it unset to keep every call on the mesh.
4. Redeploy. Pushing to master is production, so ship it through the usual flow.
5. Check it: start a group call. The token route should answer `mode: 'sfu'`, and the LiveKit dashboard should list
   the room `cr.<roomId>.main`. After everyone leaves, `GET /api/meetings/sfu/usage` should show the
   minutes.

**Status (2026-11-13).** Steps 1–3 are done. The project is `wss://plajah-4oni0hov.livekit.cloud`, the
webhook points at `https://plajah-api-6zybxwxfqa-uw.a.run.app/api/meetings/sfu/webhook`, and the three
secrets exist in Secret Manager with `secretAccessor` granted to the plajah-api runtime account. They are
**not bound** to plajah-api yet. Bind them, with the flag, when this branch reaches master:

```bash
gcloud run services update plajah-api --region us-west1 --update-secrets=LIVEKIT_URL=LIVEKIT_URL:latest,LIVEKIT_API_KEY=LIVEKIT_API_KEY:latest,LIVEKIT_API_SECRET=LIVEKIT_API_SECRET:latest --update-env-vars=MEETINGS_SFU=1
```

The multi-tab lab passed against Cloud on 2026-11-13: 4 people on the SFU, paged grid (off-page = audio
only), data messages, leave updates, member/guest/stranger checks, and 1:1 staying on the mesh. To rerun
it, put the keys in a git-ignored `.env.livekit.local` at the repo root; the lab uses it in place of the
local server. Cloud webhooks can't reach 127.0.0.1, so the lab's ledger stays empty in that mode.

**Turning the flag on or off mid-call.** Calls that are already running keep their engine. People who join after the change
get the new engine, so a call can briefly split in two. Flip the flag when traffic is low.

**Fallbacks.** If LiveKit is unreachable, the token route answers `{ mode: 'mesh', degraded: true }` and the
call runs on the mesh. That's fine for small rooms and no worse than today. If the token request itself fails, the client also uses the mesh, and the Firestore rules still gate it.

## Self-host path

Our code doesn't change: point `LIVEKIT_URL`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` at our own server.

1. Run `livekit-server` (open source, Apache-2.0) on 2 or more VMs in us-west1, network-optimized with public IPs.
   Use host networking, open UDP 50000–60000 and TCP 7881, and put a Redis between the nodes so a room can live on any node.
2. Turn on the built-in TURN (TLS on 443 with a cert for `turn.plajah.com`, plus UDP 3478) for
   locked-down networks. Serve the API and WS behind TLS at `wss://sfu.plajah.com`.
3. Set the same `keys:` and `webhook:` blocks as in `labs/meetings-sfu/livekit.yaml`, with production
   values and the production webhook URL.
4. Run Egress (`livekit/egress`) on its own nodes if we're recording (see the next section).
5. Cut over the same way as a flag change: during low traffic. Keep the Cloud project for a month as a fallback.

## Local test

`labs/meetings-sfu` runs the real client (`useRtcSession` → `MeetingSession` → `LiveKitSession`) and
the real token route and webhook ledger against a local LiveKit server. Each tab is a different person.
Firebase is stubbed: `?as=<uid>` sets who you are, and presence writes do nothing.

```
livekit-server --config labs/meetings-sfu/livekit.yaml                 # ws://127.0.0.1:7880, webhooks → :3247
npx vite --config meetings-sfu-lab.vite.config.mts                    # http://127.0.0.1:3247
```

Open three or more tabs:

- `/?as=alice`, `/?as=bob`, `/?as=carol`: members of the lab group, joining the room's call.
- `/?as=guestAnn&target=public`: an admitted guest on the meeting link. `guestWill` is still waiting and is refused.
- `/?as=alice&target=dm`: a 1:1 call, which stays on the mesh. The header shows `engine: mesh`.
- `&page=1` forces one tile per page, to watch off-page video get unsubscribed. `&purpose=huddle` uses the huddle cap.
- **Send 👏** checks data messages. **Ledger** shows `meetingUsage` after people leave.

Each tab exposes `window.lab`, so automated checks can read the engine, participants, remote tracks and the last data message.

## Follow-on: recording and captions through Egress (plan only)

Today, meeting recording (`services/meetings/meetingRecording.ts`) composes the call **on the host's
device** and uploads segments. Captions are per-person and on-device (`useMeetingCaptions`), broadcast
over data messages. Both keep working on the SFU unchanged, because the adapter gives the recorder the same
streams. The server-side upgrade:

1. **Room composite Egress.** When the host presses Record, the server calls
   `EgressService.StartRoomCompositeEgress` (grid or speaker layout, 720p) and writes to a GCS bucket
   through an Egress `GCPUpload`. The `meetingRecordings` doc gets `egressId`. On `egress_ended` (webhook),
   the server attaches the file and starts the existing recap pipeline. The host's device no longer has to stay
   online, and the recording no longer drains a phone's battery.
2. **Track Egress for each speaker's audio.** This feeds per-speaker transcription (Whisper on the GPU lane) for
   accurate "who said what" recaps.
3. **Live captions.** A LiveKit Agent subscribes to the audio, runs ASR, and publishes captions as data
   messages on the `captions` topic. That replaces per-device ASR for people on low-end phones.
4. **Metering.** Egress minutes go into the same ledger (`meetingUsage` with `kind: 'egress'`), because
   Egress is billed on its own.
5. **Consent.** Keep today's notice and opt-out (`RecordingNotice`, caption opt-out). The Egress layout page
   must hide anyone who opted out.

## Files

- `services/meetings/sfuCaps.ts`: caps and the join decision (shared by server and client)
- `services/meetings/livekitServer.ts`: JWT minting and verification, Twirp RoomService, webhook verification (no SDK, only node:crypto)
- `services/meetings/sfuUsage.ts`: ledger maths and cost model
- `routes/meetingsSfu.ts`: token, webhook and usage routes (mounted in `server.ts` at `/api/meetings/sfu`)
- `services/meetings/livekitSession.ts`: client SFU session (the RtcSession twin)
- `services/meetings/meetingSession.ts`: engine picker
- `hooks/useRtcSession.ts`: `sfu` option, plus `engine`, `refusal`, `activeSpeakers` and `setVideoPolicy`
- `components/meetings/MeetingRefusal.tsx`: the over-cap message and its Go Live, Plajah+ and close buttons
- `tests/meetingsSfu.test.ts`: `npm run test:meetings-sfu`
- `labs/meetings-sfu/`, `meetings-sfu-lab.vite.config.mts`, `meetings-sfu-lab.html`: local multi-tab lab
