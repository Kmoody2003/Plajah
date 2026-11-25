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
| **Invite from anywhere** | **Party** on someone's profile header and the invite icon in a 1:1 chat. Starts a party for you if you aren't in one, sends the invite, opens the dock. |
| **Teams** | Each member row has a team chip (– → A → B). Pick your own; the leader can move anyone. Team members get a **Team A/B chat** and can switch voice between party voice and their team's voice. |
| **Party search** | Leader: **Find matches for everyone**. Every member's dock joins matchmaking for the party's game and opens its own match when paired (members can meet each other or anyone else). Anyone can **Stop my search**; the leader can stop it for all. |
| **Party voice on stream** | A member taps **Put party voice on my stream**. Nobody is heard until they tap **OK, include me**, and **Take me off** removes them within ~3 s. The streamer's dock mixes only those voices and the phone streamer lays them under the mic as the **Party voice** source (Go Live → Sound). Kids are never included. Starting/stopping resets everyone's consent. |
| **Proximity voice (realtime rooms)** | `rt_<matchId>` voice for the players of a realtime room (up to 12). With `useGameVoice(scope, name, { spatial: true })` each voice is placed in 3D (HRTF) and fades with distance, silent past 120 units; the game calls `voice.spatial.setListener(pos, forward)` and `setPeer(uid, pos)` from its state. |
| **Mute / Report** | Per-line menu: mute that player on this device, or report the line (stored with 5 lines of context for moderation). Account blocks hide people everywhere. |

## Safety

* Every free-text line is cleaned (control characters, length 200) and profanity-masked on the server (`profanityLexicon`).
* **Child accounts**: quick chat only (no typing), appear as "Player", see other people's free text as "(message hidden)", and never get a voice token — party or match. An adult's match voice is also off when the opponent is a child.
* Rate limit: 5 lines per 10 s and 30 per minute per person per room.
* Blocks: a blocked person can't join a party with you or be invited by you, their lines are hidden from you, and match voice is off between you.
* Voice tokens are minted only by the server, for one room (`gparty-<id>`, `gteam-<id>-<0|1>`, `gmatch-<id>`, `grt-<id>`), only for members/players. The grant lists the people this listener has blocked (`exclude`), and the client never plays them.
* Party voice reaches a stream only for members in `streamOk`, which only they can set for themselves.

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
| Proximity voice (Web Audio HRTF, distance gate) | `services/gamerNet/spatialVoice.ts` |
| Game voice without React/Firebase (for games on their own page) | `services/gamerNet/gameVoiceCore.ts` (`GameVoiceSession`) |
| Plajah Motorsport Apex race voice | `games/forth-horizon/src/onlineMultiplayer.ts` (`startVoice`, positions in `step`) + **🎙 Voice** in `onlineLobby.ts`; in the race a chip bottom-left, **M** mutes. Clear within ~25 m, silent past 180 m. |
| Party voice → stream (consenting voices only) | `services/gamerNet/partyStreamBus.ts` → `LiveAudioMixer` source `'party'` (`services/liveAudioMixer.ts`), subscribed in `MobileLiveStreamer`, shown in `LiveSoundSheet` |
| Invite button | `components/games/together/InviteToPartyButton.tsx` (in `GlassDockProfileHeader`, `ChatWindow`) |
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
  token routes (party, team, match, realtime room, blocks) are unit-tested.
* The stream mix wasn't heard on a real broadcast (needs two people in voice and a live stream).
* Proximity voice in a real race wasn't heard: the realtime lab has no LiveKit unless you start it with
  `MEETINGS_SFU=1 LIVEKIT_URL=… LIVEKIT_API_KEY=… LIVEKIT_API_SECRET=… npm run realtime:lab`.
* Team voice for realtime team modes: party teams work today; realtime rooms have no teams yet.
* Party search pairs people one by one; a whole party entering one realtime room together needs the realtime branch's private rooms.
