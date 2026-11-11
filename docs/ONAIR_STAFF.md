# Plajah On-Air Staff — virtual hosts, DJs and artists

Status 2026-11-10: foundation built (`services/onair/`, `tests/onair.test.ts`). Not wired into
RadioView or the FAST player yet. Voices are briefs only; nothing calls a model or a TTS service.

## The roster

### Plajah FM hosts (6)

| Host | Show | When | Sound | Format |
|---|---|---|---|---|
| **Mari Vega** (she/her, 34) | The Wake-Up Call | Mon–Fri 6–10 | pop, hits, throwbacks, Latin pop | host, callers |
| **Kit Brennan** (they/them, 41) | The Deep Cut | Mon–Fri 10–2 | indie, alt, rock, jazz, lo-fi | host, callers |
| **Juno Park** (he/him, 27) | Rush Hour | Mon–Fri 2–7 | hip-hop, pop, afrobeats, dance, K-pop | host, callers, chat votes |
| **Dez Hollow** (he/him, 52) | Low Light | nightly 10 p.m.–2 a.m. | R&B, quiet storm, neo-soul | host, callers |
| **Nova Sinclair** (she/her, 30) | Afterglow | nightly 2–6 a.m. | ambient, deep house, melodic techno | DJ, chat only |
| **Uncle Ray** (he/him, 63) | The Sunday Kitchen | Sat & Sun 8–noon | gospel, classic soul, family | host, callers |

- **Mari**: a former track coach and stadium PA announcer. Coach energy, birthday board, "that already counts as a win."
- **Kit**: ran the record shop Second Spin until it closed. Liner-note storyteller who champions Plajah creators with low play counts.
- **Juno**: a former esports caster. Runs request battles that chat decides, plus Five at Five. Real play counts only.
- **Dez**: a former merchant mariner who listened to the radio on night watch. Velvet baritone; does Night Letters and dedications.
- **Nova**: a former planetarium projectionist. Long key-matched blends and a sky fact on the hour. Barely talks.
- **Uncle Ray**: a retired choir director and pitmaster. Recipe Corner, shoutouts to choirs and Elevate orgs, the family request line.

Unhosted slots are weekday 7–10 p.m. and weekend hours outside 8–noon (06–08 included). The
station plays music with idents only in those slots. An evening host would make it seven.

### Virtual artists (3)

| Artist | Genre | Made with (Chora) | Era 1 |
|---|---|---|---|
| **VYRA** | EDM: melodic bass, progressive house | MEKA, drum synth, sampler, AURA, Airwindows, Mastering | *Night Market*: 5 neon-colour singles |
| **Orsolya Wren** | Composer: cinematic, choral, horror score | LYRA, KERA, Session Band, SOMA, Mastering, Album Arranger | *The Keeper's Log*: a 12-piece weather suite |
| **Remi Lux** | Pop: synth-pop, pop-R&B | Session Band, KERA, MEKA, LYRA, Note FX, Harmony, Mastering | *Spin Cycle*: a 5-song debut EP, each song posted with its voice memo |

The cross-links are in-fiction relationships, and they give each persona something to post about:
- Nova premieres VYRA.
- Kit discovered Orsolya.
- Juno premieres Remi.
- VYRA is remixing Remi's lead single.
- Orsolya is arranging a hymn for Ray.

## Architecture

```
services/onair/
  types.ts        PersonaSheet schema plajah.onair.persona/1 (+ validatePersona)
  hosts.ts        the 6 host sheets
  artists.ts      the 3 artist sheets
  roster.ts       ALL_PERSONAS, hostOnAir(day, hour), weeklyGrid, findOverlaps, validateRoster
  policy.ts       STATION_RULES, checkLine, scrubListenerText, needsSafetyHandoff, WPS
  segments.ts     planLink (between / talk-up / into-break / out-of-break / top-of-hour / caller),
                  hostBreak (voices a FAST breakPlan), shouldTalk
  callers.ts      CallerDesk state machine + pickChatMentions
  prompt.ts       buildPersonaPrompt: the live mind's brief (model lane is the caller's choice)
  accounts.ts     personaAccountDoc, persona_<id> uids, PERSONA_CAN / PERSONA_NEVER
  artistStudio.ts release pipeline with human gates (producer-review, rights-check)
```

### How a host runs a show

1. **Who is on air.** `hostOnAir(day, hour)` reads the station-local clock. Low Light (10 p.m.–2 a.m.) belongs to the day it started.
2. **Between songs.** `shouldTalk` decides whether the host speaks at all; DJs and quiet hosts skip links. `planLink` then builds the line.
   - Facts come from the track itself (title, artist, plays) plus one Music Intelligence `HostCard`, any request or dedication, and the time.
   - The live mind may write a better line. It airs only if `checkLine` passes with that link's facts and the line fits its time. Otherwise the longest template line that fits is used.
   - Talk-ups end before the vocal, using `introSec` from the song map.
3. **Commercial breaks.** `services/fast/breakPlan.planBreak` already leaves Plajah FM (`fm`) segments and an up-next card. `hostBreak` places the host's voice on them:
   - into the break on the first FM segment;
   - a talk-up over the up-next card;
   - the welcome back, timed to land right before the next song.
   - Spots and idents are never talked over, and the FM bed ducks under the voice.
4. **Callers.** `CallerDesk` is the producer and the delay, with these states: `requested → screening → ready → on-air → done`, plus `declined`, `dumped` and `safety`.
   - Callers must consent to air and choose whether their first name is said.
   - Under-18 callers are never on air with their voice.
   - Only one caller is on air at a time, with a 90 s limit and a 7 s broadcast delay. The dump button discards the delay buffer.
   - A crisis phrase never airs. It goes to the safety path.
   - The audio path is planned to reuse the huddle and meeting stack (not wired yet).
5. **Chat.** `pickChatMentions` only reads messages whose authors opted in, one per listener. Dedications come first, then requests.
   - Text is scrubbed of emails, numbers, addresses and profanity.
   - Minors are read as "a listener".
   - Safety messages are pulled aside.
6. **Voice.** The plan is the same split the Session Band uses:
   - fixed lines (station IDs, show opens, break bumpers) are pre-rendered with the designed voice;
   - live lines use the on-device Kokoro fallback until a voice is cast;
   - captions always show.

### Virtual accounts

- Each persona is an ordinary `users/{persona_<id>}` doc carrying a `virtualPersona` block (`personaAccountDoc`). There is no sign-in; nobody logs in as a persona.
- Posts and replies are written server-side by the persona runtime, and each one passes `checkLine` first.
- Follower counts start at **0**. Engagement is never seeded with fake numbers (Elevate truth rules).
- Personas may post, reply to comments, like, go live on Stage, host listening parties, and publish a track once it is approved.
- Personas never:
  - start a DM;
  - message a minor;
  - ask for or take money;
  - follow back automatically;
  - change settings or delete user content.
- **Decision needed:** hosts are seeded as `accountType: 'BRAND'` for now. Artists are `'ARTIST'`.

### How artists make music

`artistStudio.ts` moves a release through these stages:

```
brief → sketch → arrange → produce → mix → master → producer-review → rights-check → scheduled → released
```

- The persona runtime may move a release through the making stages in Chora.
- **producer-review** and **rights-check** need a person.
- Rights-check also needs every rights answer true: no real samples, no sound-alike voice, original lyrics, and owner approval.
- Credits read "AI-assisted — made in Chora", owner Plajah.
- Sales use the normal store and checkout. The persona never asks for money (no held money).

## Rules every persona follows (STATION_RULES)

- Always disclosed as an AI character on air and on the profile, and never claims to be human.
- Never claims to have met a real artist.
- States only the facts it is given: no invented play counts, chart positions or vote results.
- Uses first names only, never private details, never money.
- No medical, legal, financial or political advice, and no ranking of faiths.
- No profanity and no romance with callers.
- Safety concerns are handed off, never aired.

## Wired (2026-11-10)

- **Server is the station brain** — `routes/onair.ts`, mounted at `/api/onair`:
  - `GET /now` returns who's on air in station time (US Eastern) and who's next.
  - `GET /roster` and `GET /schedule` return the public cards only. Prompts and voice ids never leave the server.
  - `POST /link` writes the host's line **once per moment**. It's cached (LRU, with in-flight dedupe), so every listener gets the same line, and the model cost doesn't grow with the audience.
  - The live mind (Gemini) is off unless `ONAIR_MIND=1`. Its model is set by `ONAIR_MODEL`. Without it, every line is a grounded template.
- **Plajah FM page** (`RadioView`): an "On air now" card with the host, show, hours, an AI host chip, and their link into the current song. In an unhosted hour it shows "Music only" plus the next host. It doesn't appear on artist stations.
- **Breaks** (`tv/AdBreakBumper`): when Plajah FM fills a TV channel's break, the host says one fill-in line as a caption over the first FM stretch: "{channel} is back shortly… this is X from Y". Never over spots, idents or the up-next card.
- **Side pillar** (`ads/OnAirBillboard`, App `AdSlot` kind `onair`): the show on air now sits near the top of the rotation. One virtual artist appears further down, a different one each day. Both carry the "AI character" chip, and clicking either opens Radio straight on Plajah FM.
- **Lab:** `onair-lab` (port 3238), with `?t=<ISO>` to set the station clock. Type-check with `tsconfig.onair.json`. `npm run test:onair` runs 13 tests, including the router.
- **Voices:** every line is a caption until voices are cast. The same text feeds TTS: render once on the server, cache the audio by text hash, and serve that file to every listener.

## Voices (ElevenLabs, chosen 2026-11-10)

1. **Design:** `npx tsx scripts/onair/designOnAirVoices.ts` makes 3 Voice Design previews per persona from the sheet's voice brief. They go to `scratch/onair-voices/`.
2. **Pick:** `npx tsx scripts/onair/voicePicker.ts` opens a picker at http://127.0.0.1:3198. "Use this voice" saves it as "Plajah FM · <name>" and writes `services/onair/elevenVoices.json`.
3. **Voice on air:** set `ONAIR_VOICE=1` on the server, alongside `ELEVENLABS_API_KEY`.
   - Each line is rendered once with Flash v2.5 by `services/onair/voice.ts`.
   - It's stored at `onair/voice/<hash>.mp3` in Firebase Storage and returned as `audioUrl` from `/api/onair/link`.
   - Spend is capped by `ONAIR_VOICE_MAX_CHARS` (default 2M a month, counted per server instance).
   - If ElevenLabs refuses, voicing pauses for 10 minutes and lines fall back to captions.
4. **Playback:**
   - Radio speaks each link once when it's tuned in, ducking the music to 30%; the card's "Hear" button replays it.
   - A break plays the fill-in line once over the FM stretch, with the bed ducked.
   - `GET /api/onair/voice` shows which personas are voiced and this month's spend.

**Blocked on 2026-11-10:** ElevenLabs refused design with "Your subscription has a failed or incomplete payment". Once the invoice is paid, run step 1. The key also lacks `user_read`, so the balance can't be checked from here.

## Running cost (estimate, 2026-11-10 list prices)

The basis is about 560 hosted hours a month (129 h/week). At about 15 lines an hour, with roughly 3,000 characters an hour including chat replies, that is about **1.7M characters of speech a month**. Each line is written and rendered once, not once per listener.

| Piece | Lean | Recommended | Notes |
|---|---|---|---|
| Lines (model) | $0 (templates) | ~$5 (Gemini 2.5 Flash-Lite) | ~20k calls × ~1.5k tokens in, ~80 out; batch the next day's links overnight at half price |
| Voice | ~$10–25 (Kokoro on our own CPU) | ~$70–90 (ElevenLabs Flash v2.5, designed voices) | Google Chirp 3 HD ≈ $25–50, but stock voices, less distinctive |
| Audio storage + delivery | <$1 storage | ~$10 via B2/Bunny | Talk adds ~1–2% to the music stream's bandwidth |
| Callers | $0 | $0 | Speech-to-text on the producer's desktop (Whisper), per desktop-first AI |
| **Total** | **~$15–30/mo** | **~$85–110/mo** | Flat whatever the audience size |

Cost levers:
- Pre-render evergreen lines once: station IDs, show opens, catchphrases, and break lines without song names.
- The satellite rotation is deterministic, so tomorrow's song-pair links can be rendered tonight.
- Cap the live mind per hour.

## Next steps

1. **Art:** portraits and turnarounds from each sheet's `look.artPrompt`, saved to `public/onair/<id>.webp`.
2. **Voices (later):** run ElevenLabs Voice Design from `voice.castingNotes` and `auditionLines`, pick in a picker page (same flow as the band voices), then pre-render the fixed lines.
3. **Wire RadioView:** an on-air host card, links between songs, and `hostBreak` in the FAST break player.
4. **Seed the 9 accounts** with an admin script, dry run by default.
5. **Caller audio** through the huddle stack, with the 7 s delay buffer.
6. **First releases:** a Chora session for each artist's first Era 1 title, then producer review.
