# Playing together: parties, game chat and game voice

Built 2026-11-21 on the Gamer Network (`docs/GAMER_NETWORK.md`). Reuses the platform's LiveKit SFU
(`docs/MEETINGS_SFU.md`) for voice. Everything else is new and server-refereed.

## What people can do

| | How it works |
|---|---|
| **Party** | Games home → *Play with friends* → **Party**, or a `game-party:<id>` invite notification. One party per person, up to 8. The party dock (bottom-left pill) follows you around the app. |
| **Join** | By the 6-character party code, or **Join party** on an invite. Invites last an hour. Joining a new party leaves the old one. |
| **Leader** | Picks the game, starts matches, can remove or promote members. When the leader leaves, the longest-standing member takes over; the last one out closes the party. |
| **Play** | The leader picks a member and taps **Play**: a friendly (unrated) match opens for both. Their docks jump into it. The core router referees it like any other match. |
| **Party chat** | Text + quick chat, system lines for joins, leaves and matches. |
| **Match chat** | Under every online board (Cyber Tic Tac Toe screen and the overlay's match panel): players-only chat while playing; everyone else gets a separate **Spectators** room. Players see spectator chat once the match ends. |
| **Voice** | **Party voice** (whole party) and **Match voice** (the two players, while the match is live). Mute, push-to-talk (hold V or hold the button), speaking rings in the party list. Audio only. |
| **Mute / Report** | Per-line menu: mute that player on this device, or report the line (stored with 5 lines of context for moderation). Account blocks hide people everywhere. |

## Safety

* Every free-text line is cleaned (control characters, length 200) and profanity-masked on the server (`profanityLexicon`).
* **Child accounts**: quick chat only (no typing), appear as "Player", see other people's free text as "(message hidden)", and never get a voice token — party or match. An adult's match voice is also off when the opponent is a child.
* Rate limit: 5 lines per 10 s and 30 per minute per person per room.
* Blocks: a blocked person can't join a party with you or be invited by you, their lines are hidden from you, and match voice is off between you.
* Voice tokens are minted only by the server, for one room (`gparty-<id>` / `gmatch-<id>`), only for members/players.

## Code map

| Piece | File |
|---|---|
| Chat rules (scopes, quick chat, masking, rate limit, kids, access) | `services/gamerNet/chat.ts` |
| Party rules (join, leave, leader, invites, matches, voice) | `services/gamerNet/party.ts` |
| API `/api/gamer/party` + `/api/gamer/chat` (incl. `POST /chat/voice`) | `routes/gamerTogether.ts`, mounted in `server.ts` next to `/api/gamer/social` |
| Browser client, local mutes, dock opener, `game-party:` links | `services/gamerNet/togetherClient.ts` |
| Chat panel | `components/games/together/MatchChat.tsx` |
| Voice hook + button (LiveKitSession, audio only) | `components/games/together/useGameVoice.ts`, `VoiceButton.tsx` |
| Chat + voice under a board | `components/games/together/MatchTogether.tsx` (used by `CyberTicTacToe` and `GameParts` `MatchPanel`) |
| Party dock (self-mounting) | `components/games/together/PartyDock.tsx` — `ensurePartyDock()` from `GamesView`, `showPartyDock()` from the Games home, `App.tsx` handles `game-party:<id>` |
| Tests | `npm run test:gamer-together`, `npm run typecheck:gamer-together` |
| Lab | `npx vite --config games-lab.vite.config.mjs` → `http://127.0.0.1:3234/?as=alice&view=concourse` and a second tab `?as=bob&view=concourse`. Party matches open in a lab sheet. No LiveKit in the lab, so voice says "Voice is off right now". Names starting with `kid` are child accounts. |

Storage (plajah-prod, written only by the server through the service account): `gamerParties/{id}`,
`gamerPartyOf/{uid}`, `gamerChat/{scope}` (one capped doc of the last 80 lines per room), `gamerChatReports/{id}`.
Equality queries only (`code` + `status`), so automatic indexes cover them.

## How it carries data

Chat is polled (about every 2 s while a panel is open, 8 s collapsed; each poll is one doc read), the party
every 4 s open / 12 s collapsed and only while you're in one. That's fine for turn-based play. When the
realtime game server lands, chat and party updates should move onto its socket.

## Not done yet

* Voice wasn't checked end to end: the lab has no LiveKit. Production has LiveKit + TURN switched on; the
  token route is unit-tested (room, identity, kids refused).
* Team voice for 2v2 games and proximity voice for open-world games (needs the realtime server).
* Queueing as a party into matchmaking (needs group matchmaking).
* Invite from a profile or a chat thread (the API takes any uid; only the code + notification paths have UI).
* Party voice into a live stream with consent (`liveAudioMixer` + call-production consent rules).
