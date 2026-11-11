# Live party games

Party games a host runs on a live stream, played by the audience from the stream **or from the post in their
feed**. Started 2026-11-10 with **Sketch Rush** (draw-and-guess). The server referees everything, so the
answer never reaches a viewer and nobody can invent a score. Results go onto each player's gamer ledger
(docs/GAMER_NETWORK.md).

## How Sketch Rush plays

1. The host opens a room (Games → Plajah Originals → Sketch Rush): word pack, rounds, time to draw, and who
   draws (always the host, or pass the pen to the fastest guesser of the last round). It's posted to the
   host's feed by default.
2. Each round the drawer picks one of three words (12 s, auto-picked if they don't), then draws.
3. Viewers type guesses. The server judges each one: plurals, spacing, the answer inside a sentence and
   aliases ("tv") count. A near miss gets a private "so close!". Wrong guesses show in a public feed (filtered,
   spoiler-free, budgeted to 6 per second per instance).
4. Points: 100–500 by time left, +100/50/25 for the first three. The drawer gets 60 per solver (cap 600).
   Letter hints start at half time and never show the whole word.
5. After the last round every player's result is appended to their gamer ledger as `LIVE_GAME` (≤ 50 gamer
   points each, at most 5 games per UTC day, so a host can't farm with friends).
6. Signed-out viewers play as guests (Firebase anonymous auth) and can pick a nickname. Signing up later keeps the
   uid, so their points come with them. Guests and children can't host; children appear as "Player".
7. If the host goes quiet for 90 s, the game ends itself.

**Go live:** the host taps Go live and gets Plajah's phone streamer. The board, hint, clock and top three are
burned into every program frame, and the drawing pad floats over the camera.

**Why strokes and not video:** a live HLS feed runs 10–20 s behind. If guesses raced a stale picture, the
game wouldn't work, so the drawing travels as small vector batches (every ~150 ms) through Firestore listeners.
That's sub-second, sharp at any size, and tiny.

## Code map

| Piece | File |
|---|---|
| Rules: judging, hints, scoring, strokes, phase machine | `services/liveGames/core.ts` |
| Word packs + aliases | `services/liveGames/words.ts` |
| Referee API `/api/live-game` | `routes/liveGames.ts` (mounted in `server.ts`) |
| Browser client, guest join, feed post | `services/liveGames/client.ts` |
| Realtime (Firestore listeners) / polling stand-in | `services/liveGames/realtime.ts` / `realtimePoll.ts` |
| Board, play screen, host studio, feed card, Live now | `components/liveGames/*` |
| Ledger event + score | `LIVE_GAME` in `services/gamerNet/ledger.ts`, `score.ts` |
| Tests | `npm run test:livegames` · `npm run typecheck:livegames` |
| Lab | `npx vite --config live-game-lab.vite.config.mjs` → `:3247/?as=hana&view=studio` (host), `?as=amy` (feed), `?as=guest-1` (guest) |

## Storage (plajah-ops, written only by the server)

| Collection | Client access |
|---|---|
| `liveGames/{id}` public game doc | read |
| `liveGameStrokes/{id}_{round}_{seq}` | read (query `gid` + `round`) |
| `liveGameFeed/{id}_{at}_{rand}` | read (index `gid` ↑, `at` ↓) |
| `liveGamePlayers/{id}__{uid}` | read |
| `liveGameSecrets/{id}` the word | **none** |

A correct guess writes only the guesser's own player doc, so a burst of solvers never fights over one document.
Round end reads up to 1,000 player docs to pay the drawer and build the top 10. Past that size, the scoreboard
needs a sharded counter.

## Next games on the same room

| Game | Based on | Live twist |
|---|---|---|
| **Brain Rush** | live trivia | 10-second answers, scored by speed; knockout mode |
| **Crowd Says** | survey-guessing shows | the audience's own answers become the hidden board |
| **Impostor Night** | social deduction | host narrates, secret roles, chat argues and votes |
| Charades | charades | reuses Sketch Rush judging; the host acts on camera instead of drawing |

Each needs its own prompts, judge and screen. Rounds, timers, server-judged answers, feed joining, guests,
scoreboard and ledger awards are shared.
