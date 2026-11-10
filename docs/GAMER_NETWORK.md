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
`gamerProfiles/{uid}`, `gamerLedger/{uid}_{seq}`, `gamerMatches/{id}`, `gamerQueue/{game}__{uid}`.
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

Ledger entry shape: see `GamerEventBody` in `services/gamerNet/ledger.ts`. Each entry has `seq`, `prevHash` and
`hash` = sha-256 over the canonical JSON of every other field.

## Next

1. **Linked platforms.** Steam (Web API: owned games, playtime, achievements, public profiles) first, then Xbox
   and PSN through their consented APIs, and RetroAchievements. Each import becomes `EXTERNAL_IMPORT` entries with
   source `linked`.
2. **Partner API keys.** Third-party games register, get a signing key, and post results as `partner` entries;
   their games join matchmaking through the same registry contract.
3. **Ledger export + anchoring.** Download your whole chain as a file. Periodically anchor chain heads externally,
   the same plan as the rights ledger.
4. **Realtime.** Polling (1.2 s while waiting on the opponent) is fine for turn-based games. Real-time games will
   need the WebSocket/RTC path.
5. More first-party games registered on the network, and friends and parties on the gamer profile.
