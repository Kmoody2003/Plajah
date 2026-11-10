# Plajah games in Social

Plajah games you can play right in the Social timeline, built 2026-11-09 on top of the Gamer Network
(`docs/GAMER_NETWORK.md`). Cyber Tic Tac Toe is the first game. Everything stays in the app: nothing links out.

## What people can do

| | How it works |
|---|---|
| **Play in the timeline** | A post with a `gameEmbed` renders `GameEmbedCard` inside `PostCard`. Tap the board to play the CPU right there. |
| **Post a game** | Social header → Create → **Post a game** (`postPlayableGame`). |
| **Match with people on the timeline** | While a game card is on screen it sends a heartbeat to the timeline lobby. The card shows "N on the timeline now" with faces. **Find a match** pairs two seekers (rated, same skill window as the global queue). After 12 s it offers **Widen to everyone**, which uses the global `/api/gamer/queue`. |
| **Challenge** | Tap a face in the lobby strip, **Challenge {author}** on a card, **Challenge** on a profile header, or the swords icon in a 1:1 chat. The person challenged gets a notification (`game-challenge:<id>`), and tapping it opens the game overlay with Accept / Decline. The person who accepts opens as X with a 90 s first-move clock. The challenger's card or overlay polls the challenge and jumps into the match. The challenger also gets an "accepted" notification (`game-match:<id>`). |
| **Go live** | **Go live** on an active match opens the phone streamer (`MobileLiveStreamer`) with the title "Game: A vs B". The board is drawn onto every program frame through the live composer's overlay drawer, so Mux viewers see it over the camera. A floating board lets the streamer keep playing. The stream id is linked to the match (`/social/live`), so spectators get **Watch live** on the match card. |
| **Post / Share to Bluesky** | When a match is done: **Post result** puts a result card on the timeline. **Share to Bluesky** shows the text with a grapheme count, posts the result card, then crossposts it through `/api/fediverse/crosspost-native` (the server plans the Bluesky version). With no Bluesky account it offers Connect in Settings. |

## Trust

* A post only carries ids (`sanitizeGameEmbed`). Result cards read the real board and winner from `/api/gamer/match/:id`, so a hand-written post can't fake a win.
* Lobby, challenge and live docs change only through `services/gamerNet/social.ts` inside a compare-and-swap.
* People blocked in either direction (`blocks`) are hidden from your lobby and can't be challenged. Children appear as "Player" with no photo.
* Challenge limits: one pending challenge per person, at most 5 pending, at most 20 per hour. Challenges expire after 15 minutes.

## Code map

| Piece | File |
|---|---|
| Pure logic: embed, lobby view, challenge state machine, share text | `services/gamerNet/social.ts` |
| API `/api/gamer/social` (lobby, challenges, live link) | `routes/gamerSocial.ts`, mounted in `server.ts` before `/api/gamer` |
| Browser client, post helpers, overlay opener, deep links | `services/gamerNet/socialClient.ts` |
| Feed card | `components/games/social/GameEmbedCard.tsx` (rendered by `PostCard`) |
| Board, match panel, Go live, Bluesky sheet | `components/games/social/GameParts.tsx`, `useOnlineMatch.ts`, `matchOverlayDraw.ts` |
| Overlay for notifications / profile / chat | `components/games/social/GameOverlay.tsx`, `ChallengeButton.tsx` |
| Hooks into the app | `PostCard`, `types.ts` (`Post.gameEmbed`), `App.tsx` (notification links), `SocialHeader` + `FeedView` (Post a game), `GlassDockProfileHeader`, `ChatWindow`, `MobileLiveStreamer` (`initialTitle`, `programOverlay`, `onLive`) |
| Tests | `npm run test:gamer-social`, `npm run typecheck:gamer-social` |
| Lab | `npx vite --config games-social-lab.vite.config.mjs`, then open `http://127.0.0.1:3241/?as=alice` and a second tab with `?as=bob`. It runs the real routers on a memory store, with a pretend Bluesky account and no Firestore. |

Storage (plajah-prod, server-only through the service account): `gamerLobby/{game}__{uid}`, `gamerChallenges/{id}`,
`gamerMatchLive/{matchId}`. Queries use equality filters only, so they run on Firestore's automatic indexes.

## Not done yet

* Live was checked only up to the streamer opening with the match title. The browser pane blocks the camera, so a real broadcast with the burned-in board hasn't been run.
* Bluesky was checked against the lab's stand-in crosspost endpoint. It hasn't posted to a real account.
* Posting a game from inside the full-screen Cyber Tic Tac Toe or the Games hub would need a button in those files. `postPlayableGame()` is ready for it.
