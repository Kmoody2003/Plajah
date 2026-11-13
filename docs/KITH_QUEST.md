# Kith Quest — 2D platformer (Kith Party)

An original side-scroller starring the Kith cast. It mixes the movement feel of the classic platformer greats: tight jumping and bloom boxes, speed and rolls, a whip-style lash with sub-weapons, a glide, wall jumps, dash and bash. It uses no names, characters, art or levels from any existing game.

- **Code:** `components/kithParty/quest/` (`level.ts` builder + stages, `sim.ts` deterministic sim, `render2d.ts` Canvas 2D renderer, `sfx.ts`, `QuestSession.tsx`, `quest.css`)
- **In Kith Party:** gallery card "Kith Quest" (`QUEST_GAME` in `catalog.ts`, filter *Party*). Single player, using player 1's Kith.
- **Lab:** `labs/kith-quest` on :3254 (`kith-quest-lab` in `.claude/launch.json`); `?kith=<id>` picks the hero.
- **Tests:** `npm run test:quest` (11 tests, about 3 s). `tests/kithQuestBot.ts` is a simple run-right bot that must clear stages 1–2 and reach the boss in stage 3, so it proves each stage can be traversed.
- **Visual check without a dev server:** `node scripts/kith-quest-shots.mjs <outDir> [kith]` bundles the lab with esbuild and screenshots every stage and the boss in headless Playwright Chromium. `window.__kithQuest` exposes live state for that script.

## Phones (touch)
- On phones and tablets (coarse pointer, or the first touch) the game goes full screen (`.kq-mobile`). It asks for fullscreen and landscape where the browser allows it (Android). It shows a "turn your phone sideways" prompt in portrait, with a "Play anyway" button.
- Controls (`quest/touch.tsx`):
  - A floating thumbstick on the left half: analog left/right; down rolls, up aims the lash.
  - Jump, Lash, Dash/Bash and the sub-weapon on the right.
  - Multi-touch with pointer capture, and you can slide your thumb between buttons.
  - Pause button in the HUD, short vibration on hits.
- Tutorial signs name the on-screen buttons on phones (`touchSign`).
- The renderer keeps about 540 world px of height visible and caps the internal width at 1280 px on touch devices.
- Phone check: `node scripts/kith-quest-mobile.mjs <outDir>` emulates a landscape phone with real multi-touch through CDP. It checks movement, jumping while holding the stick, Lash, Pause and the portrait prompt, and saves screenshots.
- Playtest page: `node scripts/kith-quest-playtest.mjs <out.html>` builds one self-contained page with every stage unlocked. It was published as a private claude.ai artifact (Phone playtest 1).

## Movement kit (tuning in `MOVE`)
| Move | Input | Notes |
|---|---|---|
| Run with momentum | ←/→ | 280 px/s, rising to 430 after 0.7 s of sustained running; slopes push you along |
| Jump | Space / Z / Ⓐ | Variable height (~105 px held, ~66 px tapped), with coyote time 0.1 s and a 0.12 s jump buffer; running speed adds height |
| Double jump | Jump in air | Resets on ground, wall, stomp or bash. Luma gets a triple jump |
| Glide | Hold Jump while falling, after the double jump | Fall capped at 105 px/s for 1.6 s (Pippa ×1.5, Nori ×1.25) |
| Wall slide / wall jump | Hold toward a wall while falling, then Jump | Input locks for 0.16 s after the kick |
| Dash | Shift / V / Ⓑ / RB | 720 px/s for 0.17 s, once per airtime |
| **Bash** | Dash near a bash lantern, an enemy or an enemy shot | World slows, you aim with the stick and launch on release. Shots are flung back for 3 damage; enemies are flung into others |
| Roll | ↓ while running | Smaller hitbox, smashes enemies and bricks, speeds up downhill |
| Spin charge | Hold ↓ while standing, tap Jump to rev, release ↓ | Launches a roll at 480–910 px/s |
| Lash | X / J / Ⓧ | 74 px reach; ↑ aims up, ↓ in the air pogos. Breaks bricks, opens boxes, **parries shots** |
| Sub-weapon | C / I / Ⓨ | Costs 1 spark (lanterns drop +3). The shot depends on the Kith's type: Ember Arc, Spark Bolt, Echo Ring (boomerang), Tide Runner (ground wave) |

Health is 5 petals. Falling into a pit costs 1 petal and returns you to the last safe ground. At 0 petals you lose a life and restart from the checkpoint. 100 motes earn a life. Each stage hides 3 Star Seeds.

## Stages (built with the cursor builder in `level.ts`)
1. **Glowmoss Hollow** (moss, 250 cols): teaches movement, bloom boxes, stomps, the lash and lanterns, rolling down a momentum valley, springs and glide, boost pads, the double-jump wall, a brick vault seed, and spore pods.
2. **Cascade Spires** (falls, 270×40): two wall-jump shafts (an overhang pillar against a cliff), dash gaps, moving platforms over a drop, a 26-tile bash chasm (three lantern nodes), spore pods to bash back, and a crumble bridge over spikes.
3. **Lanternkeep** (keep, 240 cols): candle lanterns, Thornbacks (can't be stomped), a spike corridor with one-way stairs, a brick wall, then the **Hollow Warden** arena (walls close, camera locks).

**Hollow Warden** (30 HP, 3 phases at 20 and 10 HP): attacks with a fan volley (bash or lash the orbs back for 3 damage), a telegraphed swoop, and a rise-and-slam that sends two ground shockwaves. In phase 3 it also summons Duskwings. It takes damage from the lash, stomps (2), rolls, sub-weapons, reflected orbs (3) and flung enemies (3). Beating it opens the Lantern Gate.

## Rendering
Canvas 2D, internal width capped at 1600 px, following the iGPU canon. Each biome has three procedural parallax layers plus a sun or moon, god rays, and animated waterfalls on Cascade. Static terrain is painted once per 16×16-tile chunk (an LRU of 40 chunks) with a moss or stone lip, rims, blades and decorations. Dynamic tiles (bricks, boxes, crumble) are drawn per frame. An additive glow pass covers motes, lanterns, shots, the hero aura and the boss heart. Particles are spawned from sim events, with an ambient layer (fireflies, mist or embers), a foreground silhouette and a vignette. The hero is the Kith portrait with squash and stretch, run bob and lean, a spin ball with arcs, a leaf-parasol glide, an afterimage trail at speed, the lash ribbon and the bash aim arrow.

## Score — Chora-built (one Chora project per cue)
Kenne, 2026-11-12: *"take full advantage of chora instruments … write really great scores … great but catchy … create new classic video game themes"*, *"each get a chora project"*.

- **The written score:** `data/gameScores/kithQuest.ts` holds 12 cues. They are built on one leitmotif, the **lantern motif** (sol · do – re – mi, C5 . F5 G5 A5 in F).
  - It opens the title theme and answers every lullaby in its second pass.
  - The trumpets shout it in the gallops.
  - The Warden's trombones and the danger bassoon play it in minor. The fear cue plays it in phrygian.
  - It is the stage-clear jingle.
  - The three lullabies keep the synth score's melodies note for note.
- **The cues:**
  - The Lantern Road (title, F, 4/4, 108)
  - Lullabies: Glowmoss (F, 64), Cascade (D Lydian, 72) and Lanternkeep (D minor, 58), all in 3/4
  - Gallops: Glowmoss (138), Cascade (144) and Lanternkeep (132)
  - Thorns in the Dark (danger) and One Petal Left (fear, D phrygian, 4/4)
  - The Hollow Warden (battle, D minor war-waltz, 160)
  - Lantern Lit (stage clear) and The Lantern Dims (game over)
- **Music Council pass (2026-11-12/13).** Kenne: *"run these through composer and producer council … more lush, more orchestrated and beautiful, full realised score … lush string and orchestral movements"*, written and composed in Chora with the full suite, including SOMA and the new TONOS plucked strings.
  - The council: `scripts/council/runKithQuestScoreCouncil.ts`. The five Music Council seats (Composer, Orchestrator, Producer, Mix, Master) propose, dispute, then Aria synthesises. It runs on the cloud Gemini lane, never a local model. Output is in `docs/kith-party/score-council/` (`synthesis.md` is the plan). The free-tier key allows 5 requests a minute and has a daily cap, so the script runs one call at a time and resumes from cached seats.
  - Aria's decisions: no key changes in loops (mood crossfades must land); block-chord pads banned in favour of a five-desk divisi string section; TONOS gut and silk colours in every cue; low end mono below 120 Hz; per-mood loudness targets.
- **The Chora projects:** `services/melos/kithQuestChoraProjects.ts` turns each cue into a `GrooveDoc`.
  - Every part is an instrument track on the timeline, and 3/4 cues carry a 3/4 meter.
  - **The string section** (`strings()` in the score): Violins I L35, Violins II L15, Violas R15, Celli R35, Basses centre. `divisiLines` voice-leads every chord into four lines: it searches each section's range for the spacing that covers the chord with the least motion, leans toward each section's singing register, penalises parallel fifths and octaves, adds 4–3 and 9–8 suspensions, and ties held notes.
  - **Figures** (`src: 'figure'`): chord- and scale-relative tokens for ostinatos, waltz picking and cascades. Written lines can be shifted (`shift`) for canons and echoes. Volume automation (`dyn`, `swell`) gives each sustained part its swells and terraces.
  - The suite: the LYRA orchestra; TONOS kora, koto, valiha, guzheng, lute, nyckelharpa, hardanger, bouzouki and qanun; the VELA choir and tremolo strings; CANTUS vault, plainsong and byzantine choirs; ISON drones; PNEUMA breath and shakuhachi; SOMA timpani (two sizes, tuned to each bar's root), taiko, gran cassa, snare, bodhrán, bendir, daf and tar.
  - **No bell-type voices** (celesta, bells, struck glass, glass choir). Kenne heard them as a metallic sheen over the whole score on 2026-11-12. Steel dulcimers (cimbalom, santur, yangqin) stay out for the same reason. The MP3s are encoded at 44.1 kHz, ~200 kbps, because the earlier 32 kHz, ~106 kbps encode added an audible codec haze.
  - **The mix-engineer pass:** `scripts/games/balanceKithQuest.ts` sets levels from solo stems of every track (`node scripts/kith-quest-stems.mjs <cue>`). Each track is judged only on the frames where it plays, and set relative to the tune: string desks −11 dB each, basses −12, figures −8, harp −10, answers and canons −6, choirs −12, drones −15. The trims are written to `data/gameScores/kithQuestMix.ts`. The first stems showed why this is needed: written gains left the strings 10–17 dB and the TONOS figures ~20 dB under the lead.
  - Two send returns: a Spaces hall and a dotted-eighth delay.
  - Chora Studio lists them under **Game soundtracks · Kith Quest**, and each opens as the user's own copy (the `BeatsRoom` `loadGameSoundtrack` branch).
- **Bounce and master:**
  1. `npx vite --config kithquest-score-lab.vite.config.mjs` starts the lab on :3255.
  2. `node scripts/kith-quest-bounce.mjs [cue,cue]` bounces with `renderGroove`, on a fresh page per cue (a dozen orchestra renders in one page went silent).
  3. `node node_modules/tsx/dist/cli.mjs scripts/games/buildKithQuestAudio.ts` masters the bounces: mono-fold below 120 Hz, then integrated loudness (BS.1770) to the mood target (calm −19, title and energy −16, danger and fear −17.5, battle and clear −15, game over −16 LUFS), then a look-ahead limiter at −1.5 dBFS.
  - Output goes to `public/kith-party/quest-music/*.mp3` plus `manifest.json`.
  - For loops, the 2-bar ring-out is wrapped onto the loop start, and the file carries pre-roll and post-roll around `loopStart`/`loopEnd`.
- **In game:** `quest/questMusic.ts` is the director.
  - The title theme plays on stage select.
  - Moods crossfade: calm-/energy-<stage>, danger (fear at the last petal) and battle. Clear and game over play their jingles.
  - It falls back to the synth score when the MP3s can't load.
  - `window.__kithQuestMusicState()` reports which engine and cue are playing.
  - The phone playtest page inlines the MP3s.

## Fallback score — "Lullaby Orchestra" (`score.ts`)
Owner direction (Kenne, 2026-11-12): *gorgeous and soothing orchestration, whimsical and fantasy, like a lullaby for adults, enchanting.*
Original 16-bar themes in a slow 3/4, synthesized live on the Kith Party AudioContext through a 4.2 s generated hall reverb. The instruments are a strings pad, rolling harp eighths, a music box/celesta lead (the flute answers on the second pass), cello, soft choir, and timpani for the boss only.
- **Glowmoss Hollow:** F major, 64 bpm, music box lead
- **Cascade Spires:** D Lydian (the raised G♯ is the magic), 72 bpm, celesta lead, a borrowed Gm6 near the end
- **Lanternkeep:** D minor candlelight, 58 bpm, celesta and choir
- **Hollow Warden:** the Lanternkeep theme at 78/84/90 bpm by phase, with a flute lead, a cello ostinato and timpani. Bells join from phase 2
- **Stage clear:** a harp glissando and music-box cadence, then the score fades. Pausing ducks the music to 35%.
- **Adaptive moods** (Kenne: *"need some with energy and excitement, some to represent danger and fear"*). The score switches on the next bar line, after a 0.9 s settle so it never flickers:
  - **calm:** the lullabies above. They play by default and at each stage start.
  - **energy:** the same stage theme as a galloping adventure, at 138/144/132 bpm. Staccato string ostinato, horn-like lead, brass stabs, frame drum and shaker, harp runs.
  - **danger:** an original 8-bar piece built on the stage's home key. Tremolo strings, a heartbeat, glassy high tones, celesta sighs and creaks.
  - **fear:** danger at full intensity, which raises the tempo and the heartbeat. It kicks in at 1 petal, and at 2 petals while inside a danger zone.
  - **battle:** the Hollow Warden's war-waltz in D minor at 150–170 bpm, with galloping timpani, brass, choir and horn melody. Bells join from phase 2, and a flute and high tremolo from phase 3.
  - Zones are `b.mood(...)` markers in each stage builder (`LevelDef.moods`, `moodAt()`). Glowmoss runs energy through the momentum valley, the boost run and the gap chain, and danger at the spore-pod dip. Cascade runs energy through the dash gaps, the bash chasm and the final run, and danger through the spore gallery and crumble bridge. Lanternkeep runs danger through the spike corridor and the approach to the Warden, and energy through the brick-wall run.
- **Preview WAVs:** `node scripts/kith-quest-score.mjs <outDir> [seconds] [all|calm]` (offline render in headless Chromium; `all` bounces energy, danger, fear and battle).

## Open items
- Sound effects are a placeholder synth layer (`sfx.ts`); swap in recorded CC0 one-shots.
- The Chora score has not yet been heard by Kenne in the game; adjust balance per cue in `kithQuest.ts` (part `gainDb`/`vel`) and re-bounce.
- Single player only; a 2-player co-op ghost would reuse the same sim per player.
- Not yet checked on the real iGPU at 60 fps (the headless software rasterizer gives 13–19 fps, which isn't representative).
