# Plajah Gamer Network

One gamer profile, one history and one score that belong to the player, not to a store. Started 2026-11-09
with Cyber Tic Tac Toe as the first game on the network.

## The idea

Xbox Live and PSN keep your gamerscore and history inside their walls, and Steam keeps it inside Steam. On
Plajah, everything you do is written to **your own hash-chained ledger**. The score is a pure function of that
ledger, so anyone holding the entries can check the chain wasn't edited and recompute the score themselves.

* **Refereed play.** First-party online matches run on the server through each game's rules
  (`services/gamerNet/registry.ts`). A result exists only because the server saw the moves. No self-reporting.
* **Trust by source.** Every ledger entry says where it came from, and the score weights it:
  `first-party` 1.0 · `partner` (signed results from a third-party game) 0.8 · `linked` (pulled from another
  platform's API with the player's consent) 0.6 · `self` (typed in, local play) 0.0, which is kept as history only.
* **Recalculable.** Change the formula in `services/gamerNet/score.ts` and `POST /recalculate` (or `GET /verify/:uid`)
  replays each chain from the first entry. Incremental updates and a full replay must give the same numbers (tested).
* **Anti-farming.** Matches against the same opponent count for at most 5 per UTC day.
* **Kids.** Child accounts appear as "Player" with no photo and stay off public leaderboards.

## Code map

| Piece | File |
|---|---|
| Tic Tac Toe rules + CPU (easy/medium/unbeatable) | `services/gamerNet/games/ticTacToe.ts` |
| Game registry (add a game here) | `services/gamerNet/registry.ts` |
| Match state machine (move, clock, resign, rematch) | `services/gamerNet/match.ts` |
| Matchmaking (skill window widens with wait) | `services/gamerNet/matchmaking.ts` |
| Elo rating | `services/gamerNet/rating.ts` |
| Gamer ledger (hash chain) | `services/gamerNet/ledger.ts` |
| Score fold + first-party achievements | `services/gamerNet/score.ts` |
| HTTP API (`/api/gamer`) | `routes/gamerNet.ts`, mounted in `server.ts` |
| Browser client | `services/gamerNet/client.ts` |
| Game UI | `components/games/CyberTicTacToe.tsx` |
| Gamer card + leaderboards | `components/games/GamerHub.tsx` (Games → Leaderboards tab) |
| Tests | `npm run test:gamer` · `npm run typecheck:gamer` |
| Realtime rooms (WebSocket server, tickets, referee) | `services/realtime/`, API side `routes/gamerRealtime.ts` (see **Realtime** below) |
| Lab (real router, memory store, `?as=` sign-in) | `npx vite --config games-lab.vite.config.mjs` → `http://127.0.0.1:3234/?as=alice` (open a second tab with `?as=bob` to play online) |

Storage (plajah-prod, written only by the server through the service account, so no client rules are needed):
`gamerProfiles/{uid}`, `gamerLedger/{uid}_{seq}`, `gamerMatches/{id}`, `gamerQueue/{game}__{uid}`,
`gamerLinks/{uid}__{platform}`, `gamerLinkClaims/{platform}__{accountId}`, `gamerLinkStates/{nonce}`.
Leaderboards use a `<=` bound plus an order on the same field, so they run on Firestore's automatic indexes.

## API (v0)

All responses are JSON. Writes need `Authorization: Bearer <Firebase ID token>`.

| Method | Path | What it does |
|---|---|---|
| GET | `/api/gamer/games` | games on the network |
| GET | `/api/gamer/me` | my profile (created on first call) |
| GET | `/api/gamer/profile/:uid` | public profile: score card, per-game stats, achievements, linked platforms, ledger head |
| GET | `/api/gamer/history/:uid?limit=30` | newest ledger entries |
| GET | `/api/gamer/verify/:uid` | re-walk the chain and recompute the score from the first entry |
| POST | `/api/gamer/recalculate` | store my recomputed score |
| GET | `/api/gamer/leaderboard?game=all\|ttt` | top players |
| POST | `/api/gamer/local` | log a same-device or vs-CPU game (history only) |
| POST/GET/DELETE | `/api/gamer/queue` | join, poll or leave matchmaking |
| POST | `/api/gamer/private` · `/api/gamer/join` | invite code (friendly match) |
| GET | `/api/gamer/match/:id` | match state (an expired move clock is applied here) |
| POST | `/api/gamer/match/:id/move` · `/resign` · `/rematch` | play |

| GET | `/api/gamer/links` | my linked platforms + which platforms can be linked |
| POST | `/api/gamer/links/steam/start` `{returnPath}` | Steam sign-in URL (one-time state, 10 min) |
| GET | `/api/gamer/links/steam/return` | Steam's OpenID redirect lands here: verify, link, first import, redirect to `returnPath?gamerLink=steam&status=ok\|error&reason=` |
| POST | `/api/gamer/links/steam/sync` | import the change since the last sync → `{ imported, hours, achievements, more }` |
| DELETE | `/api/gamer/links/steam` | unlink (history and baseline stay) |
| | `/api/gamer/rt/*` | realtime games: queue, room codes, join tickets, signed results (see **Realtime**) |

Ledger entry shape: see `GamerEventBody` in `services/gamerNet/ledger.ts`. Each entry has `seq`, `prevHash` and
`hash` = sha-256 over the canonical JSON of every other field.

## Linked platforms

History from other platforms lands on the same ledger as `EXTERNAL_IMPORT` entries with `source: 'linked'`
(trust 0.6), `platform`, `externalGameId`, `hours` and `achievementsUnlocked`. Card: `components/games/LinkedPlatforms.tsx`
(under the gamer card). Platform list: `services/gamerNet/links/platforms.ts`.

**Scoring imports.** Playtime scores `4·√(total hours)` per game, plus 2 per achievement, × trust. The fold keeps each
game's running total (`fold.extGames`, keyed `source:platform:gameId`), so an import adds only `√(new total) − √(old total)`.
Syncing daily or once a year gives the same score. (Summing √ of each delta would reward frequent syncs.) Entries
without `externalGameId` keep the old one-shot formula.

### Steam (live)

* **Proof of ownership: Steam OpenID 2.0.** `POST /links/steam/start` stores a one-time state
  (`gamerLinkStates/{nonce}`: uid, returnPath, 10-minute expiry) and returns Steam's sign-in URL with
  `return_to = <VITE_APP_URL>/api/gamer/links/steam/return?state=<nonce>`. When Steam redirects back, the server
  checks `op_endpoint`, that `return_to` matches exactly, the claimed id format (`…/openid/id/<17 digits>`) and that
  the key fields are signed. Then it asks Steam to confirm the signature (`check_authentication` → `is_valid:true`).
  Nobody types an ID.
* **One Steam account feeds one ledger.** `gamerLinkClaims/steam__{steamId}` = `{uid}`. The claim is kept on unlink, so a
  library can't be moved from account to account to collect its playtime again (support can release it by hand).
* **Reading the library.** Server-only env `STEAM_WEB_API_KEY` (never `VITE_`): `GetPlayerSummaries` (is the profile public?),
  `GetOwnedGames` (`playtime_forever`, minutes), `GetPlayerAchievements` per game. Steam answers 400 for games with no stats,
  which counts as "no achievements". A private profile, or private game details, gets a 422 telling the player
  to set both to Public. With no key, `/links` reports Steam unavailable and `start`/`sync` answer 503. Nothing is mocked in production.
* **Idempotent, delta-only sync.** `gamerLinks/{uid}__steam` holds a per-game baseline `games: { appid: { m, a, c } }`
  (minutes and achievements already imported, plus whether achievements were checked). Each pass imports `max(0, now − baseline)`.
  Baselines only go up (`max`), so a refund, a hidden game or a lower number from Steam never re-counts playtime.
  Each entry's key is `steam:<steamId>:<appid>:s<sync>:m<totalMinutes>:a<totalAch>`. If a pass is interrupted
  after writing entries but before saving the baseline, the retry reuses the same sync number and gets the same keys, and
  `appendEvent` drops them (tested). It only advances a baseline once the entry is on the chain.
* **Bounded passes.** One request handles at most 40 changed games (most-played first) and makes at most 40
  achievement calls. `more: true` means the card calls sync again right away (there's no cooldown while a sync is pending). After a completed
  sync there is a 10-minute cooldown. A 2-minute lease stops two passes from running at once.
* **Lab.** The games lab swaps Steam for `labs/games/steamStub.ts`, an offline sign-in page plus a fake API with 6 games,
  so `?as=alice&view=hub` → Link runs the full redirect flow with no key and no network.

To switch on in production: create a Steam Web API key (steamcommunity.com/dev/apikey, on a Steam account that
represents Plajah), set `STEAM_WEB_API_KEY` on the Cloud Run service, and make sure `VITE_APP_URL` is the public origin.
That origin is both the OpenID realm and where Steam sends players back. Steam's Web API terms cap use at 100,000
calls a day per key; one first sync of a big library costs about 2 + (played games) calls.

### RetroAchievements (planned: public API, buildable next)

* **API.** `https://retroachievements.org/API/` with a server-side web API key (`y=`) from a Plajah RA account.
  `API_GetUserProfile` (includes the `Motto` and the user's ULID), `API_GetUserCompletionProgress` (per game:
  achievements unlocked, hardcore/softcore, console), and `API_GetGameInfoAndUserProgress` for detail. There's no
  playtime, so imports carry `achievementsUnlocked` (and could carry RA points via `points`) with `hours: 0`.
* **Ownership.** RA has no OAuth. Use a one-time code: we show `plajah-XXXXXX`, the player pastes it into their RA
  profile motto, we read it back with `API_GetUserProfile` and link the stable ULID (not the username, which can change),
  and then they can remove it. Same claim, baseline and delta rules as Steam (`externalGameId` = RA game id).
* **Trust.** Hardcore unlocks are server-validated by RA, so they could earn more trust than softcore ones. That's a
  formula decision for later.

### Xbox (partner access needed)

* The official Xbox services (achievements, gamerscore, title history through XSTS tokens) are for Microsoft partners.
  A general Azure AD app can't request the Xbox Live scope. Paths: (1) apply to the Xbox partner programme for
  Xbox Live access to user data, the only first-party route; (2) a consented third-party proxy such as
  OpenXBL (the player signs in with Microsoft there; it's paid and an extra processor of player data); (3) until then,
  nothing, because typed-in gamerscore would be `self` (trust 0).
* Once access exists, the shape matches Steam: Microsoft account sign-in proves ownership, then per-title
  `achievementsUnlocked` and minutes played become linked imports with a per-title baseline.
* **PSN**: no public API. The unofficial NPSSO-token route breaks Sony's terms, so we won't build it. It waits for an
  official partner programme.

## Realtime (WebSocket rooms for fast games)

Turn-based games poll the API every 1.2 s. Racing, tennis, fighting and shooters need 20–60 updates a second, so they
play in rooms on a separate **realtime service** (`plajah-realtime` on Cloud Run, next to `plajah-api`). Matchmaking, tickets and
the ledger stay in the API. The realtime server never calls Firebase.

```
 browser ──HTTPS──▶ plajah-api /api/gamer/rt   queue · room code · ticket (HMAC, 60 s)
    │                     ▲
    │                     │ POST /api/gamer/rt/result  (HMAC-signed by the realtime server, server-to-server)
    └──WSS──▶ plajah-realtime  room: lobby → ready → countdown → 20 Hz relay → referee → standings
```

**Why `ws` and not Colyseus.** The repo already ships `ws` 8, and a room here is about 300 lines: relay, tick, seats,
grace window and a referee hook. Colyseus would add its schema/state-sync layer and its own matchmaker, which duplicates
`routes/gamerNet.ts`. The protocol is plain JSON, so a Colyseus (or uWebSockets) backend could replace it later without
changing the API, the tickets or the ledger.

| Piece | File |
|---|---|
| Tickets + server-to-server signatures (HMAC-SHA256, canonical JSON) | `services/realtime/ticket.ts` |
| Realtime game registry (tick Hz, seats, countdown, grace, referee) | `services/realtime/games.ts` |
| Server-authoritative result hook (`RaceReferee`) | `services/realtime/referee.ts` |
| Relay room (transport-agnostic, fake-clock testable) | `services/realtime/room.ts` |
| WebSocket server + `/healthz` | `services/realtime/server.ts`, entry `services/realtime/main.ts` |
| Result poster (signed, retried) | `services/realtime/resultPoster.ts` |
| Standings → ledger bodies (multiplayer Elo) | `services/realtime/settle.ts` |
| API: queue, codes, tickets, result intake | `routes/gamerRealtime.ts` (mounted by `routes/gamerNet.ts` at `/rt`) |
| Browser client (tickets, clock sync, reconnect) | `services/realtime/client.ts` |
| First client: Forth Horizon online race | `games/forth-horizon/src/onlineMultiplayer.ts` (`joinServerRace`), `onlineLobby.ts`, `region.ts` |
| Tests | `npm run test:realtime` · `npm run typecheck:realtime` |
| Lab | `npm run realtime:lab` → `http://127.0.0.1:4341/region.html?as=alice` and `?as=bob` |
| Image | `services/realtime/deploy/Dockerfile` (build from the repo root) |

### API (`/api/gamer/rt`)

| Method | Path | What it does |
|---|---|---|
| GET | `/rt/config` | `{ enabled, games }`. `enabled: false` until the secrets are set; the game then falls back to its old local mode |
| POST/GET/DELETE | `/rt/queue` `{game}` | rated 1v1 matchmaking (same rating window as turn-based, `pickOpponent`) |
| POST | `/rt/private` `{game}` → `{ matchId, code }` | friendly room (unrated), up to the game's `maxPlayers` |
| POST | `/rt/join` `{code}` → `{ matchId }` | take the next seat |
| GET | `/rt/match/:id` | roster + status (players only) |
| POST | `/rt/ticket` `{matchId}` → `{ ticket, url, seat, expiresAt }` | signed join ticket, only for a player in the match |
| POST | `/rt/result` | **realtime server only**: `x-plajah-rt-ts` + `x-plajah-rt-sig` headers |

Storage: `gamerRtMatches/{id}` (`players`, `names`, `url`, `code`, `status`, `standings`, `plan`, `settled`) and `gamerRtQueue/{game}__{uid}`.

### Tickets

`ticket = base64url(payload) . base64url(HMAC-SHA256(GAMER_RT_TICKET_SECRET, payload))`, payload
`{ k:'join', room, game, uid, seat, name, min, rated, iat, exp }`, valid for 60 s. The room checks only the signature and
expiry, so a join costs one HMAC and no database read. On `welcome` the room mints a **resume ticket**
(`k:'resume'`, 15 min, same secret) so a dropped player can rejoin without going back to the API.
Seats are bound to uids: another uid can't take a seat, and the same uid can't hold two seats. A second socket for the
same seat replaces the first (close code 4001).

### Room protocol (JSON over WSS)

| Client → server | Server → client |
|---|---|
| `{t:'hello', ticket}` (within 5 s, or the socket closes) | `{t:'welcome', seat, phase, tickHz, serverNow, players, resume, goAt?}` |
| `{t:'ready', ready}` | `{t:'lobby', phase, players, min}` |
| `{t:'state', s:{…}}`, flat, ≤ 24 keys, ≤ 600 B | `{t:'countdown', goAt}` / `{t:'go', at}` (server clock) |
| `{t:'ping', c}` | `{t:'pong', c, s}`: the client keeps its lowest-RTT sample as the clock offset |
| `{t:'leave'}` | `{t:'tick', n, at, s:[{seat,…}]}`: changed states every tick, a full snapshot once a second |
| | `{t:'finish', seat, place, timeMs}` · `{t:'result', result}` · `{t:'recorded', ok}` · `{t:'left', seat}` |

* **Tick:** per game, clamped to 5–60 Hz (`fh-race`: 20). An optional `interestRadius` sends only nearby players' states.
* **Lobby → countdown:** when everyone connected is ready and there are at least `min` players (a queued match: all
  of them). Unreadying or dropping during the countdown goes back to the lobby. Seats that weren't on the grid at GO are removed.
* **Reconnect:** a dropped seat is held for `reconnectGraceMs` (20 s). After that it's freed in the lobby and counts as a DNF in a race.
* **Rate limit:** about 2 messages per tick. A client that keeps flooding is closed (4008). Max frame 8 KB.

### Results are server-authoritative

Clients never send a result. The room passes every accepted state to the game's **referee**, and only the referee decides
finishes. `RaceReferee` (Forth Horizon) reads progress = `lap + splineT` from the car's state. It caps progress at
`maxProgressPerSec` (no lap under 20 s at Ironport) and never lets it go backwards. It counts a violation for a position jump
faster than `maxSpeedMps` and flags a player out after 40 violations. It times each finish on the server clock from GO and gives
everyone else `finishGraceMs` after the first finisher. If everyone else is out, the last car running wins by forfeit.
*Limit:* the server has no copy of the track spline yet, so it checks that progress is plausible, not that it's exact. A
cheater can't beat the progress-rate cap but could report a perfect lap right at the cap. Next step: track splines on the server.

When the referee is done the room posts `{matchId, game, startedAt, endedAt, standings:[{uid, seat, place, timeMs, dnf, progress}]}`
to `/api/gamer/rt/result`, signed with `GAMER_RT_RESULT_SECRET` (`HMAC(ts + '.' + canonical(body))`, ±5 min skew), retrying
after 0 s / 1 s / 4 s / 10 s. The API checks the signature, that every uid is a player in **that** match, and that places are unique.
It then fixes the ledger plan in the match doc, so a retry replays exactly the same entries. Finally it appends one `MATCH_RESULT` per player
(`key: rt:<matchId>`, `source: 'first-party'`, `rank`, `players`, `note: "P1/2 · 3:12.40"`). `rated` comes from the match doc
(queue = rated, code = friendly), never from the posted body. If everyone is a DNF the match is abandoned and gets no entries.

* **Rating:** multiplayer Elo: each player's change is the average of their pairwise results across the field. For 1v1 it equals
  `nextRating` (tested).
* **Anti-farming:** each entry names one opponent (1v1: the other player; a field: the winner names the runner-up and everyone
  else names the player directly ahead). So `score.ts`'s cap applies unchanged: `PAIR_DAILY_CAP` (5) counted matches per opponent per UTC day (tested).
* Leaderboards accept realtime game ids: `/leaderboard?game=fh-race`.

### Deploy (not done: nothing is deployed or pushed)

1. Generate two random secrets (32+ bytes each, e.g. `openssl rand -hex 32`) and store them in Secret Manager as
   `GAMER_RT_TICKET_SECRET` and `GAMER_RT_RESULT_SECRET`. Server-only. **Never** use `VITE_` names: Vite bakes those into the bundle.
2. Build and deploy the realtime service from the repo root:
   ```
   docker build -f services/realtime/deploy/Dockerfile -t gcr.io/$PROJECT/plajah-realtime . && docker push gcr.io/$PROJECT/plajah-realtime
   gcloud run deploy plajah-realtime --image gcr.io/$PROJECT/plajah-realtime --region us-central1 \
     --timeout 3600 --session-affinity --min-instances 0 --max-instances 1 --concurrency 1000 --cpu 1 --memory 512Mi \
     --set-secrets GAMER_RT_TICKET_SECRET=GAMER_RT_TICKET_SECRET:latest,GAMER_RT_RESULT_SECRET=GAMER_RT_RESULT_SECRET:latest \
     --set-env-vars GAMER_RT_API_URL=https://plajah.com --allow-unauthenticated
   ```
   `--timeout 3600` is the longest a Cloud Run WebSocket can stay open (races last minutes). `--max-instances 1` keeps
   every room on one instance, because rooms live in memory.
3. On `plajah-api`, set the same two secrets plus `GAMER_RT_URLS=wss://plajah-realtime-….run.app`. `/rt/config` then reports `enabled: true`.
4. **Scaling out (sticky rooms):** deploy more services (`plajah-realtime-2`, …), each with `--max-instances 1`, and list them all
   in `GAMER_RT_URLS` (comma-separated). The API stores `url = urls[sha256(matchId) % n]` on each match, so both players and
   every reconnect reach the same shard. Adding a shard doesn't move existing rooms.
5. **Restarts:** rooms live in memory. On a deploy (SIGTERM) rooms close and clients reconnect with their resume ticket, which
   recreates the room in the lobby. A race in progress is lost: its match stays open and nothing reaches the ledger.
   The realtime server's posts share `/api/gamer`'s per-IP rate limit (240/min), which covers one post per finished room.

**Inside Plajah** the game runs in `IframeGameFrame`, which answers the same-origin game's `{type:'plajah.gamerToken.request'}`
with the player's Firebase ID token. On a lab host (`127.0.0.1`/`localhost`), `?as=<name>` signs in as the lab's stub user.

**Lab:** `npm run realtime:lab` starts Forth Horizon's dev server, the real `/api/gamer` router (memory store, realtime on)
and the realtime server (`ws://127.0.0.1:4342`) in one process. Open `…/region.html?as=alice` and `…/region.html?as=bob` in **two
windows side by side** (a background tab stops drawing frames, so it stops sending its car). Then Menu → Online Circuit Race → Create room /
Join with the code → Ready in both. `RT_LAB_FAST=1` makes it a 1-lap race. Histories: `/api/gamer/history/<name>`.

## Next

1. **More linked platforms.** RetroAchievements (above), then Xbox once partner access is settled.
2. **Partner API keys.** Third-party games register, get a signing key, and post results as `partner` entries;
   their games join matchmaking through the same registry contract.
3. **Ledger export + anchoring.** Download your whole chain as a file. Periodically anchor chain heads externally,
   the same plan as the rights ledger.
4. **Realtime, round two.** Track splines on the server for exact race refereeing; referees for tennis and fighting
   (hits and score decided on the server) in the same room type; more realtime games in `services/realtime/games.ts`.
5. More first-party games registered on the network, and friends and parties on the gamer profile.
