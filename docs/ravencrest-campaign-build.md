# Ravencrest campaign: build order (v0.1, 2026-11-10)

Companion to [ravencrest-campaign.md](ravencrest-campaign.md). The story will keep
changing, so this order builds **systems and spaces first, story last**: anything
story-specific (names, lines, cutscenes) goes in as late and as data-driven as
possible.

Guiding rules:
- **Playable at the end of every phase.** Each phase ends with something you can
  play and judge, not a pile of half-systems.
- **Prove the feel in a greybox before building art.** Combat, traversal and the
  survival loop get tuned in a test space first, the same way the slice taught us
  (ask what feels wrong before reworking controls).
- **Never break the Horror Classics slice.** It stays shippable at every step.
- **Perf gate on every level:** 60 fps on the Arc iGPU in the browser at the
  baseline tier, measured per pass (game-dev canon).
- **No paid credits without approval;** local character pipeline first.

Size: S = a session or two, M = several sessions, L = a big multi-session block.

---

## Phase 0: Split the slice from the campaign (M)

Today `src/main.ts` (1.5k lines) wires everything (levels, films, events) in one
place, and `game.ts` (1.7k) holds film encounters next to the combat. The campaign
needs levels that load one at a time.

1. **Level interface.** One contract every level implements: build, enter, update,
   exit, dispose, plus its spawn points, sanctuaries and Hexstone. Move arrival,
   viaduct, courtyard and Grand Hall behind it.
2. **Two entry points.** `slice` (today's experience, unchanged) and `campaign`.
   Film systems (`cinema.ts`, encounter scene cards, the tank horde, Pumpkin Patch
   barks) are imported only by the slice.
3. **Level sequencer + checkpoints.** Load/unload levels, carry the player state
   across, checkpoint on entering a level or sanctuary.
4. **Save system.** Campaign progress, inventory, relics, freed regions. Local first,
   cloud-synced through the account later (sync-everywhere rule).
5. **Regression check.** The slice plays end to end exactly as before (simulate
   walk + Dracula fight + daybreak), and its build output is unchanged in behaviour.

**Done when:** the slice still plays identically, and `?mode=campaign` loads the
road → bridge → castle as separate levels with checkpoints between them.

---

## Phase 1: The systems gym (L)

A greybox test level, `gym`, with no art, where every new mechanic is built and
tuned. Three tracks, which can run in parallel because they touch different code:

**1A. Combat refinement** (in `game.ts`, `fightClips.ts`, `player.ts`)
- Move list: light/heavy strings, launcher, air combo, ground slam, charged draw-cut.
- Perfect dodge (slow-time window) and parry (timed block → stagger).
- Readable enemy tells: wind-up poses + a light/sound cue per attack.
- Lock-on with target switching; camera rules kept.
- Style rank meter; executions on staggered enemies.
- Weapon switching hooks (blade now, chain and crossbow later).

**1B. Traversal** (new `traverse.ts`, `collision.ts`, animation clips). The biggest
engine addition and the biggest risk, so it starts early.
- Ledge detection and grab, climb up, shimmy, drop.
- Balance beams, short wall-run/jump gaps, rappel points.
- Swimming (needed for the Undercroft).
- Grapple/swing points (for the Rosary Chain later).
- Animation: authored key-pose clips baked with IK (the `fightClips.ts` method), with
  mocap where CMU has usable takes.

**1C. Survival layer** (new `inventory.ts`, `sanctuary.ts`, `items.ts`, UI)
- Grid satchel, item pickup, combine, use, key items.
- Resource economy: ammo, holy water, tinctures; drop tables tied to executions and
  style rank.
- Sanctuary: save, reliquary chest, hero swap, its own music.
- Doors, keys, crests; documents and a journal screen.
- Enemies that rise again unless burned or blessed.

**Done when:** in the gym you can climb a wall, fight a group with dodge/parry/style,
pick up and combine items, unlock a crest door and save at a sanctuary, and it feels
right to you. **Your review gate:** play the gym and tell me what feels off before
anything moves into real levels.

---

## Phase 2: Act II as the first campaign chunk (M)

The cheapest real playable: the levels already exist.
1. Convert the road, drawbridge, courtyard, Grand Hall and upper wing to campaign
   versions: billboards → province signs, paintings → portraits, slower and more
   dreadful pacing, crests and documents, sanctuaries.
2. Drawbridge: troll always on the first crossing; the kraken rescue becomes a host
   of angels (the built angel model and wing rig flying the monkey squad's strafing
   paths, with light beams) and the "Heaven answers." card.
3. The Count's Night with the **new escape ending** and the "Ravencrest is not
   free" pull-out.
4. Grand Hall Hexstone + the first proper liberation (fortress-only daybreak).
5. Hordes on the Dead Road without the tank: survivable with the new combat.

**Done when:** a ~15 minute run from the road to Dracula's escape, start to finish,
using the Phase 1 systems.

---

## Phase 3: Elise and the partner (M)

Needed before any level written around two heroes.
1. Elise's moveset: crossbow (aim, bolts, reload), holy-water flasks, the lantern.
2. Partner AI: follow, take cover, fight, revive, stay out of the sightline
   (the Melvin lessons from the slice, generalised).
3. Hero swap at sanctuaries; scripted solo stretches.

**Done when:** Act II plays as either hero with the other as partner.

---

## Phase 4: Vertical slice of a new level, St Brennan's Mission (M)

The smallest new level that proves the new kind of game: horror (silence), a crypt
puzzle, a Hex-warden, a Hexstone and a liberation.
1. Layout greybox → play → art pass.
2. The **silence curse** (sound as light through the lantern).
3. Mirror/light crypt puzzle.
4. Hex-warden: Abbot Hollow (character via the local pipeline).
5. Liberation daybreak over the mission.

**Done when:** St Brennan's is finished to final quality and holds 60 fps on the Arc.
It becomes the quality bar for every later level.

---

## Phase 5: Act I (L)

1. **Prologue: the Lantern Office** (small set, training drill, relic pickup).
2. **Hollow Pines:** the aircraft escape set piece and the crash forest (reuses the
   ez-tree woods and mist), falling-sky curse, first sanctuary.
3. **Ashmoor Crossing:** the interconnected town, the stutter-loop curse, the
   Bellwright.
4. Link Act I → Act II through the sequencer.

**Done when:** a ~33 minute run from the prologue to Dracula's escape.

---

## Phase 6: Act III (L)

1. **The Undercroft** from the fortress floor plan: upward-rain curse, swim/climb
   rooms, Vesper's laboratory, the Drowned Choir stalker, Rosary Chain relic (turns on
   grapple/swing from 1B).
2. **Hollowmere:** mirror-town curse, the Dracula standoff, mirror-self duel (reuses
   the player's own move set as an enemy).
3. **Tehom Station:** gravity-flip curse (the riskiest mechanic for collision and
   camera; prototype it in the gym at the start of this phase), the Lance fight,
   the southern liberation.

---

## Phase 7: Act IV and the ending (L)

1. **The Thorn Cathedral:** hell-spill curse, the exterior spire climb, survivors
   holding the doors.
2. **The Hexmother:** three-phase boss, the Dracula turn, the fissure seal.
3. Province-wide daybreak, the liberation map turning gold, the epilogue.

**Done when:** the whole campaign plays start to credits.

---

## Phase 8: Story, sound and polish (L, runs partly in parallel from Phase 4)

1. Lock the story with you: canon names, dialogue, documents (all data files, so
   rewrites don't touch code).
2. Cutscenes, voice for the new cast, music per act from your score folder.
3. Liberation map screen, achievements, NG+, difficulty (and a harder Survivor mode
   if wanted).
4. Full perf pass on the Arc iGPU, Windows app ultra tier, Android tier.
5. Ship: build to `public/games/ravencrest-campaign/play` (slice keeps its path),
   rebuilt from the committed tree.

---

## Parallel track: characters and art

Starts now and runs alongside, because characters take the longest and need you:
| Need | For | Source |
|---|---|---|
| Vesper Calloway sheet | Acts III–IV | your art / Meta Muse, then local pipeline |
| Abbot Hollow sheet | Phase 4 | same |
| Bellwright, Drowned Choir, Lance shades | Phases 5–6 | same |
| Cardinal + survivors | Phases 5–8 | same |
| Elise moveset clips | Phase 3 | authored key poses + CMU mocap |
| Level concept art (mission, Ashmoor, Undercroft, Hollowmere, Station, Cathedral) | each level's art pass | your art; art stays the authority |

---

## Risks

1. **Traversal animation** is the biggest unknown (ledge grabs, climbing poses on our
   rigs). Mitigation: start it first (1B), greybox only, review early.
2. **`main.ts` monolith:** Phase 0 must split it without regressing the slice; do it
   with the slice's simulate tests running after every step.
3. **Perf with more systems:** inventory UI, partner AI and new curses all cost
   frame time on the Arc. Measure per level, keep the light pool and batching rules.
4. **Gravity flip** (Tehom Station) stresses collision and the camera; prototype it
   before committing to the level design.
5. **Story churn:** keep names and lines in data so rewrites stay cheap.

---

## Recommended first steps

1. **Phase 0, step 1–2:** level interface and the slice/campaign split.
2. In parallel: **Phase 1B traversal prototype** in the gym, since it's the riskiest.
3. You: start the character sheets (Vesper and Abbot Hollow first) and concept art
   for St Brennan's.
