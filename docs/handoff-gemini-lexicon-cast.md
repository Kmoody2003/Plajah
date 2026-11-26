# Handoff: Lexicon villagers through the Character Forge (for Gemini in Antigravity)

Paste everything below the line into Gemini. Written 2026-11-25 by Claude at the point it stopped.

---

You're picking up the Lexicon villager work in the Plajah repo (`C:\Users\Kenne\plajah`, branch `feat/apex-elohim`).
Kenne will run character **rigging on Google Colab cloud GPUs**; you run everything else locally and hand Colab what
it needs. Read this whole brief before touching anything.

## The game and the goal

*Lexicon: The Unwriting* (`games/lexicon`, dev server `node node_modules/vite/bin/vite.js --config
games/lexicon/vite.config.mjs`, port 4392) is a word-and-math adventure: Zelda-style, with Tomb Raider traversal, open
world. Kenne's direction is in `docs/lexicon-direction.md`; read it. The task now is **the 12 villagers as rigged,
painted 3D characters** made from Kenne's art, the same way the hero (the Scribe) and Era Clash's Haru were made: the
**Character Forge**, Plajah's own spec-driven, scored pipeline.

## Rules from Kenne (non-negotiable)

1. **Characters are built in Plajah, by the Forge, not by hand in Blender.** Every improvement goes into the process
   (a stage, a wardrobe piece, a spec field), never a constant for one character. "We are building the engine that many
   will use."
2. **Score against the art from every view; ≥95% overall is the gate.** Under 95% is not done; say so plainly with the
   per-view and per-part numbers (the Forge writes them to `scripts/eraclash3d/characters/<id>/report.md`). Before
   changing anything, look at `D:\Plajah Runtime\eraclash3d\forge\<id>\fidelity\delta_<view>.png` and
   `fidelity_<view>.png`.
3. **The art is the reference.** Tolo is a blacksmith's apprentice and Oren an archivist (the game's `content.ts` calls
   them baker and ferryman; the art wins).
4. **Never push.** Pushing `master` deploys to production. Commit only when Kenne asks, only your own files
   (`git add -- <files> && git commit -- <files>`, with the index clean first). Never run `tsc` over the whole app.
5. Temp files, npm/pip caches and big outputs go on **D:** (`D:/plajah-tmp`, `D:/Plajah Runtime`), not C:.

## What exists now

**Art** (Kenne's, in `D:/plajah game assets deign from promtps/Word gaem/Nov 24 - 22_56`): a design sheet per villager.

**Turnarounds** (made from those sheets, same painted style): `D:/Plajah Runtime/forge/lexicon-cast/<name>_turnaround.png`,
3392×5056, a 2×2 grid: front, three-quarter / side, back. Names: mira, bram, thorne, kaelen, maya, nico, zora, tolo,
oren, pip, selene, lyra.

**Forge sheets** (all 12 done): `D:/Plajah Runtime/forge/<name>-ref/sheet.png` (front, side mirrored to face left,
back; cut out on white; soles on one line) and `front.png` (the head, for MediaPipe face landmarks). Made by
`python scripts/lexicon/prep_cast_art.py [name ...]`.

**The Forge**:
- Specs live in `scripts/eraclash3d/characters/<id>/forge.json`. Look at `scribe/` and `mira/`. The schema is in
  `scripts/eraclash3d/forgeSpec.ts`.
- Run it with
  `FORGE_SPEC=scripts/eraclash3d/characters/<id>/forge.json node node_modules/tsx/dist/cli.mjs scripts/eraclash3d/forge.ts [stage...] [--force]`.
- Stages, in order: `intake context build fit-head parts fit-body fit-armour paint score`.
- A full run takes about 30 minutes on Kenne's PC. `fit-head` and `fit-body` are the slow ones.
- A `forge.lock` in the work dir allows one run per character. If a run is killed, delete the lock.
- Docs: `docs/character-forge.md`.

**Added for the villagers this session (uncommitted, see the list at the end)**:
- `human.ts`: `body.sex` (0 male … 1 female) shapes the shoulders, pelvis, waist, bust, neck and arms.
- `hairSystem.ts`: `braids()` gives a hair shell standing off the scalp, a swept layer, a crown braid, front plaits
  and loose hair at the back. Spec: `hair: { style: 'braids', frontPlaits, length, crown }`.
- `wardrobe.ts`: village pieces sized from the body's joints (`kH = height / 1.74`), so any height fits:
  - `gown`, `overrobe` (bell sleeves, trim), `capelet` (hood down, brooch), `wideSash`, `beltPouch`, `keys`, `tome`,
    `spectacles`.
  - The preset `elder-chronicler` dresses Mira.
  - Trims on cloth garments are cloth (`Cl('trim')`), so they skin with the garment. Rigid trims floated off when the
    pose moved.
- `forgeLook.ts`: materials `gown`, `robe`, `capelet`, `trim`, `parchment`.
- `codex.ts`:
  - An `elder` archetype with a gentle body range. Without it, the context stage guessed "samurai warrior" and searched
    warrior muscle.
  - A `fantasy-village` tradition with no arms.
  - Specs can force both: `"context": { "archetype": "elder", "tradition": "fantasy-village" }`.
- `forgeBuild.ts` / `forgeSpec.ts`: the `braids` style is wired in.

**Elder Mira scores**:

| Pass | Overall | Head |
|---|---|---|
| 1 | 60.5% | 49.6% |
| 2 | 74.0% | 67.0% |

Pass 2 by view (shape / colour):

| View | Shape | Colour |
|---|---|---|
| Front | 62.5% | 91.1% |
| Side | 54.0% | 80.4% |
| Back | 63.2% | 92.9% |

Weakest parts: feet 39%, shins 40%, torso ("do") 42%, skirt ("hakama") 47%, arms 49%, head 59%.

Pass 3's fixes are **in the code but not scored**; the run was stopped mid-way:
- trims made cloth;
- narrower skirt hem and sleeve bells;
- fuller hair at the sides and back;
- a bigger hood.

Rerun Mira first, from `build` with `--force`, and compare with pass 2.

**Known faults to look at for Mira:**
- The side view is weakest: the hood and the hair mass behind the head are short of the art.
- The robe's A-line is too wide at the hem.
- The bell sleeves tear and look ragged at the hands.
- Feet and shins: the art stands with the feet wider apart.
- The part names (`do`, `hakama`) are the samurai scorer's; the scorer still works, but village part names would read
  better.

## What to do, in order

1. **Get Mira over the gate.** Iterate: change a wardrobe piece, hair or body parameter, rerun, read the deltas, and
   keep a short table of scores per pass in `scripts/eraclash3d/characters/mira/report.md` or the handoff notes.
2. **The other 11**: one `forge.json` each (copy Mira's, set the body, kit, hair, palette and context). Many need new
   wardrobe pieces; the table in `docs/lexicon-direction.md` lists what each villager reuses and what to add. Build the
   pieces generically (joint-relative, any height) and add a preset per villager. Order: Pip (a child: big head, short
   body, needs child proportions in `human.ts` keyed off `age`), Tolo, Oren, Thorne, then the rest.
3. **Rigging on Colab (Kenne's cloud GPUs).** The Forge already writes a skinned GLB with the game's skeleton, so
   Colab is for the GPU-heavy rigging upgrades Kenne wants. Whatever runs there must:
   - keep the **Forge skeleton and bone names** (`HUMAN_JOINTS` in `services/argilla/creature/human.ts`: `Hips`,
     `Spine`, `Spine1`, `Spine2`, `Neck`, `Head`, `LeftShoulder`, `LeftArm`, `LeftForeArm`, `LeftHand` + fingers,
     `LeftUpLeg`, `LeftLeg`, `LeftFoot`, `LeftToeBase`, eyes, and the Right side), because the game retargets CMU
     mocap onto exactly these (`games/lexicon/src/scribe.ts`, `games/era-clash-3d/src/core/character.ts`
     `retarget` / `CMU_TO_CONTRACT`);
   - keep the GLB's **`extras.forge`** block (springs, cloth sims, capsules, sockets like `socket_hand_R`, `hold`,
     `stance`). `playkit/character/forgeRig.ts` reads it for spring bones, cloth and grips.
   - Good jobs for the GPU:
     - better skin weights (e.g. a learned auto-skinning model) baked back onto the same bones;
     - corrective blend shapes for the elbows, shoulders and knees;
     - cloth pre-simulation for the long robes;
     - running the Forge's slow fit searches (`fit-head`, `fit-body`) on Colab CPUs/GPUs in parallel.
   - Put Colab notebooks in `scripts/lexicon/colab/`, take inputs from the Forge's outputs (the GLB in
     `public/games/lexicon/assets/characters/` and the work dir), and write results back in a form a Forge stage can
     read, so it becomes part of the process and isn't a one-off.
4. **Into the game**: load each villager like the Scribe (`games/lexicon/src/scribe.ts` shows loading, retargeted
   mocap and `forgeRig`). The villagers' stand-in figures are built in `games/lexicon/src/world.ts` (`personModel`), and
   their data is in `games/lexicon/src/content.ts`.

## Uncommitted files from this session (yours to commit when Kenne says)

Modified:
- `scripts/eraclash3d/forgeBuild.ts`
- `scripts/eraclash3d/forgeLook.ts`
- `scripts/eraclash3d/forgeSpec.ts`
- `services/argilla/creature/hairSystem.ts`
- `services/argilla/creature/human.ts`
- `services/argilla/creature/wardrobe.ts`
- `services/argilla/heritage/codex.ts`

New:
- `docs/lexicon-direction.md`
- `docs/handoff-gemini-lexicon-cast.md`
- `scripts/lexicon/prep_cast_art.py`
- `scripts/eraclash3d/characters/mira/`
- `public/games/lexicon/assets/characters/mira.glb` (pass 2 output)

Other people's uncommitted work is on this branch too (`games/apex/...`, `scripts/video/...`, `mocks/...`). Leave it
alone.

## Also open (Kenne's asks, not part of the cast task)

- A fuller guided walkthrough of the first steps.
- "Combat triggers after the word": the meaning isn't confirmed yet. Ask Kenne.
- The lasso that catches wild letters and words.
- Academia math and physics puzzles.
- The grand waterfall up the creek with a cave behind it.

The HUD guide (goals, beacon, tip card, How to play) is committed as `21f5d584`.
