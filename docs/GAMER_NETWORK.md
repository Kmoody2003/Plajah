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

## Next

1. **More linked platforms.** RetroAchievements (above), then Xbox once partner access is settled.
2. **Partner API keys.** Third-party games register, get a signing key, and post results as `partner` entries;
   their games join matchmaking through the same registry contract.
3. **Ledger export + anchoring.** Download your whole chain as a file. Periodically anchor chain heads externally,
   the same plan as the rights ledger.
4. **Realtime.** Polling (1.2 s while waiting on the opponent) is fine for turn-based games. Real-time games will
   need the WebSocket/RTC path.
5. More first-party games registered on the network, and friends and parties on the gamer profile.
