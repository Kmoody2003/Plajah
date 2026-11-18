# Plajah Game Studio: one creator DCC for games (plan, 2026-11-17)

**Owner's direction (Kenne, 2026-11-17):** the games we make are also how we build the tools. Anyone on Plajah
should be able to build their own game here. People who only have an idea should find it easy, and
professionals should still find it usable. Prompts can drive it, but the game's setup and logic have to be
readable and hand-editable. Models and levels have to be editable by hand. The 3D tools we have (Plajah 3D /
Argilla, Character Forge, the rig builder, mocap) are scattered and need to become one DCC.

This plan **merges** three earlier docs. It doesn't replace them; it says how they fit together and in what order to build:

- `docs/playable-engine-design.md`: the Experience schema, `playkit` runtime, Picture Walk, and the OSS licence survey (§10 still applies)
- `docs/game-studio-and-mocap.md`: the Studio rooms, Level document, picture → level, and mocap
- `docs/plajah-3d-animation-scope.md`: the Shot document and animation looks
- `docs/plajah-unified-game-studio-architecture.md` is a stub and is superseded by this file.

---

## 1. The problem today

| Symptom | Evidence |
|---|---|
| Every first-party game is hand-written code with its own copy of the engine | `games/era-clash-3d/src/core/` copies Ravencrest's core; `games/rift-realm/src/{collision,post,controls}.ts` and `games/forth-horizon/src/physics.ts` are separate again |
| Levels are code, not documents | `rift-realm/src/shrine.ts`, `era-clash-3d/src/otsu.ts`, the Forth Horizon region builders: a creator can't open them |
| 3D tools are separate rooms with separate stores | Plajah 3D rooms (`components/argilla/*`), Character Forge (CLI, `scripts/eraclash3d/forge.ts`), rig builder (`services/vtuber/rigBuilder`, run from a lab), mocap (`components/mocap/CaptureRoom.tsx`, its own lab) |
| Game logic lives in TypeScript only | waves, triggers, scoring and AI are functions in each game's `main.ts` |
| `playkit` exists only as a stub | `playkit/character/*` (5 files); the rest of the extraction in Playables §4 hasn't happened |

The result: each new game costs us a full build, and none of that work can be reused by a creator.

## 2. The rule that fixes it: dogfood

> **From here on, a first-party game is a Game Project made in the Studio.**
> If we need something the Studio can't do, we add it to the Studio (a room, a kit, a behaviour, a playkit
> module). Then we use it. No new per-game engine copies.

Bespoke code is still allowed, but only as a **playkit module** or a **script behaviour** (§5.3) that ships
inside the project and that a creator could also use. Every game we make therefore leaves the platform
better for creators.

## 3. The four parts everything shares

```
            ┌──────────────── Game Studio (one Tela workspace, rooms as tabs) ────────────────┐
  Prompt ─▶ │  Idea · World · Props · Characters · Motion · Logic · Look · Story · Sound · Test │ ◀─ hand edits
  (Aria)    └──────────────────────────────┬───────────────────────────────────────────────────┘
                                           │ every change is a typed op (same ops for UI and Aria)
                                           ▼
                            Game Project document (JSON, versioned, co-edited)
                    project · levels · assets · cast · motion · rules · looks · story
                                           │
                                           ▼
                        playkit runtime (one engine; editor and published game)
```

1. **One document: the Game Project.** It is the Playables Experience schema with the Level document
   (Studio §3.4) and the Shot document (animation scope) folded in. Everything in it is parametric (objects
   with parameters, never baked meshes), and every derived asset keeps its source (`refs`) so "regenerate"
   keeps your edits. It is cloud-autosaved with versions, co-edited through `services/coedit`, and carries
   rights metadata on every asset.
2. **One ops layer: `services/gamestudio/ops.ts`.** It works the way `components/tela/telaOps.ts` does for
   Tela: `placeInstance`, `drawSpline`, `paintTerrain`, `addRule`, `setLook`, `assignMove`, and so on. Every
   op can be undone and serialised, and it is the **only** way to change a project. The UI calls these ops,
   Aria calls the same ops as tools, and the history panel shows them as readable sentences. This is what
   makes prompt-driven editing and manual editing the same thing.
3. **One runtime: `playkit`.** The Playables §4 extraction gets done for real: renderer, tiers and post;
   collision; player and input; camera rigs; audio; foliage and scatter; character (already started); and
   behaviours. It also carries the Ravencrest Canon budgets (Arc iGPU at 60 fps). Play-in-editor is one key,
   and the published game uses the same runtime in the `public/games/<id>/play` iframe shell.
4. **One asset library.** Cast, prop kits, motion clips, looks, materials and sounds are shared across a
   creator's projects (and their org's). It can later be shared publicly or sold through the store, with
   creator splits and the 5% direct-sales rule.

## 4. The rooms, and which existing tool moves into each

The Studio is a **workspace in `services/workspace/workspaces.ts`** (a new `play` group) hosted by
`WorkspaceShell`. That gives it the Simple/Pro switch, the guide path and the Ask Aria panel. Per the unified
Tela vision, it is not a standalone app.

| Room | Simple (idea people) | Pro | Existing tool it absorbs |
|---|---|---|---|
| **Idea** | Describe the game, pick a genre template, drop in reference art → playable blockout | Edit the generated project directly | Playables "Picture Walk" flow, Aria game lens + Game Council |
| **World** | Paint ground, drag roads and rivers, click to scatter, drop props | Gizmos, numeric transforms, snapping, terrain tiles, nav and zones, 2.5D play band | Era Clash `ground/grassField/otsu`, Forth Horizon region tools, picture → level (Studio §4) |
| **Props** | "Make me a stone lantern" or upload a picture, then tweak sliders | Plajah 3D modeling: SDF clay, poly, hard surface, UVs, LODs | `components/argilla/ModelingRoom`, `engines/tela-3d`, `services/argilla/{hardSurface,poly}`, Plajah Build CAD import |
| **Characters** | Upload a portrait or turnaround → rigged, dressed character | The Forge stages one by one, weights, face shapes, wardrobe | Character Forge (from CLI to a room), `rigBuilder` (face), `autoRig.py`, `argilla/creature` (multi-legged), `playkit/character` |
| **Motion** | Record yourself on camera, or pick from the library | Clip trim, foot lock, retarget, blend trees, state machine | `CaptureRoom` + `services/mocap`, two-phone capture, CMU library |
| **Logic** | Rules written as sentences (§5) | Node view of the same rules, variables, script behaviours | new (the main gap) |
| **Look** | Pick a mood: dusk, raid, fog, toon | Sky/HDRI, grade/LUT, post stack, weather, quality tiers | Era Clash `look.ts`, Rift Realm `post.ts`, Ravencrest post |
| **Story** | Chapters, dialogue, cutscenes from a script | ink dialogue, camera rails, Shot timeline | Shot document + `SceneRoom`, Fabula / Story Intelligence |
| **Sound** | Per-zone mood and SFX picks | Cue graph, Chora score stems | Chora, Era Clash audio manifest |
| **Test / Publish** | Play, share link, publish to Arcade | Perf HUD per pass, bot runs, Canon review, builds per tier | Canon + Game Council, `IframeGameFrame`, Gamer Network ledger |

The Plajah 3D rooms keep working on their own for film and animation. In the Studio they appear as rooms over
the same document, not as a separate app.

## 5. Logic people can describe and read

This is the core of "prompt-driven but describable".

### 5.1 Rules are data, shown as sentences
```json
{ "id": "r12", "when": { "event": "enter", "zone": "shrineGate", "who": "player" },
  "if":   [{ "var": "wave", "op": "==", "value": 1 }],
  "do":   [{ "action": "startWave", "wave": 2 }, { "action": "playCue", "cue": "drums_up" }] }
```
The Studio renders it as: **When the player enters Shrine Gate, if wave is 1, start wave 2 and play "drums up".**
Every word in the sentence is a chip you can click and change. Pro mode shows the same rule as nodes. Aria
writes rules from plain speech ("after the boss dies, open the north door and save"), and the user sees and
edits the sentence it produced.

### 5.2 Behaviours are reusable building blocks
These are the Playables §4.2 behaviours on XState: patrol, chase, flee, guard, wave spawner, pickup,
door/lever, checkpoint, race lap, scoring, dialogue trigger. Each one has a parameter panel and a sentence
form. Genre templates are bundles of behaviours, rules, a camera and a HUD:

| Template | First-party proof game |
|---|---|
| Arena shooter (1st/3rd person) | Rift Realm |
| Racer (circuit / open region) | Apex (Forth Horizon), Kith Racing |
| Fighter (2.5D / 3D) | Era Clash |
| Platformer (2D/2.5D) | Kith Quest |
| Adventure / horror walk | Ravencrest |
| Picture Walk (2.5D from art) | Playables slice |
| Party / sports | Kith Tennis, live party games |

### 5.3 Script for professionals
A **script behaviour** is a TypeScript module that runs sandboxed (worker, typed playkit API only, no DOM or
network). It declares its parameters so it shows up in the rules and panels like any other behaviour. This is
where our own bespoke game code goes, so it becomes reusable instead of locked in one game.

## 6. Easy for idea people, real for pros

- **Same document, two depths.** Simple mode hides gizmos, nodes and scripts but never hides the result:
  everything Aria makes can be clicked and changed.
- **Templates first.** No empty screen: pick a template, then describe the changes.
- **Undo across everything.** The ops history covers prompts and hand edits alike, and each entry reads as a
  sentence.
- **Pro escape hatches.** Numeric fields everywhere; glTF/FBX/VRM/BVH import and export; a script editor;
  the perf HUD; a git-like version compare.
- **Guardrails from the Canon.** The budget meter (draws, triangles, texture memory, per-pass ms on the iGPU
  baseline) warns before the game is slow, not after.
- **Local GPU first, cloud as an option.** Generation follows the desktop-first AI rule, and paid credits are
  never spent without approval.

## 7. Phases (each ends with something Kenne can play)

| Phase | Build | Gate |
|---|---|---|
| **0. Spine** | Game Project schema + validator; `services/gamestudio/ops.ts` with undo; the remaining Playables §4 extraction into `playkit` (collision, player, input, camera, post/tiers, audio); a Studio workspace with World room view-only + Play key | **Rift Realm Shrine Arena** loads from a project file inside the Studio and plays, at the same frame time as the current build |
| **1. World room** | Select/move/rotate/scale, prop kits, scatter, splines, terrain paint, zones; autosave + versions | Re-lay the Shrine Arena by hand in the Studio; the old `shrine.ts` gets deleted |
| **2. Logic room** | Rules (sentence + chips), behaviours, arena-shooter template, script behaviour sandbox | Rift Realm waves, rhythm scoring and spawns run as rules/behaviours, not `main.ts` code |
| **3. Props + Characters + Motion rooms** | Host the Plajah 3D modeling room, the Forge as a room, the rig builder, CaptureRoom; one asset library | A new Rift Realm fighter goes from turnaround art to playable in the Studio, with no CLI |
| **4. Aria over ops** | Every op exposed as an Aria tool; Idea room (prompt + references → blockout project) | "Make a 3v3 arena in a frozen temple" → a playable, fully editable project |
| **5. Open to creators** | Publish to Arcade, sharing, asset library sharing, tiers / Plajah+, co-edit | A non-team account builds and publishes a game |
| **6. Move the other first-party games** | Era Clash, Apex, Kith games, Ravencrest become projects | Each game's bespoke code is now playkit modules or script behaviours |

### Phase 0 as built (2026-11-17, commit 0d78c49b)

- **Spine:** `services/gamestudio/schema.ts` (Game Project v1: levels point at a level module; markers,
  zones, look, rules, instances on top; a marker kind the project leaves empty uses the module's own),
  `validate.ts`, `ops.ts` (the edit list: pure `applyOp` returning the undo op, `describeOp` sentences,
  `History` with undo/redo and drag merging), `runtime.ts` (runtimes, Studio ⇄ game messages, starter
  projects, `takeOverOp`). Tests: `npm run test:gamestudio` (13).
- **Rift Realm:** `src/studio/levelModules.ts` (one table of level modules + `exportDefaults` /
  `applyProjectLevel`), `studio.html` + `src/studio/studioMain.ts` (World view: real arena, orbit camera,
  marker gizmos, pick and drag onto surfaces), `src/studio/projectHook.ts` (Play: report defaults, apply
  the project before spawning; 3 lines in `main.ts`, does nothing outside the Studio).
- **Studio:** `components/gamestudio/GameStudioRoom.tsx` (outline, World view / Play, inspector, look,
  history; Simple/Pro; export/import in Pro), registered as workspace `game-studio` in a new **Play** group.
  Lab: `gamestudio-lab` on :3262 (`?game=<rift dev origin>&pro`).
- **Verified:** edits in the Studio reach the running game: spawn moved, control point renamed and resized,
  exposure changed, and enemy spots kept from the module. Outside the Studio the game boots unchanged. The
  hook runs once at boot, so per-frame time is the same.
- **Not done in Phase 0:**
  - the `playkit` extraction (collision/post/input stay in the game for now; doing it would mean
    rewriting files another session is actively changing);
  - cloud autosave (projects save on this device only);
  - `main.ts` still has its own level if-chain (exposure/far) next to `LEVEL_MODULES`. Phase 1 should
    switch it over so the two can't drift;
  - not yet checked inside the full app (needs sign-in);
  - the shipped bundle isn't rebuilt.

### Phase 1, first slice as built (2026-11-17, landed in 7a78b1b1)

- **Props:** `services/gamestudio/prefabs.ts` is the kit as data: 8 parametric Rift Realm pieces (arched
  wall, battlement wall, tower, stone stairs, steel stairs, cover block, pillar, boulder), each with
  parameter specs, clamping (`coerceParam`), and readable sentences in the history.
  `games/rift-realm/src/studio/prefabs.ts` builds them with the game's own builders in world space.
  The World view builds one group per piece; the game merges all pieces into one kit, with collision.
- **World room:** a Props palette (pick, then click to place), props in the outline, a move/turn handle
  (W/E, snapped to 0.25 m and 15°), and a prop inspector showing every parameter (the Pro-only ones in
  Pro). Also duplicate (Ctrl+D) and delete (Del).
- **Cloud:** autosaves through `scheduleCreativeSync` (new creative kind `game`), with the sync indicator
  and version history (restore goes through the validator).
- **One level table:** `main.ts` boots from `LEVEL_MODULES`, so its old if-chain is gone. The Rift Realm
  session added the marsh and celestial levels, and older projects gain new levels automatically
  (`withRuntimeLevels`).
- **Verified:**
  - all 8 pieces build in the World view;
  - placing a prop and editing its parameters produces the right history sentences;
  - in the real game, props merge into one mesh per material and you can stand on them (2.25 m on a
    2 m block, 6.85 m on a tower crown);
  - 32 tests.
- **Still in Phase 1:**
  - scatter, splines (roads/rivers), terrain paint, trigger zones;
  - the gate (re-lay the Shrine Arena by hand, then delete `shrine.ts`);
  - ~~a visual check of the handle~~ done 2026-11-18 (move arrows, selection box, label all draw);
  - cloud save checked while signed in.

**Why Rift Realm pilots it:** it's the newest game (one arena, uncommitted), its world is already built from
parametric pieces (`StaticKit`, `geom.ts`), and arena-shooter logic is small. That makes it the cheapest game
to prove the full loop on. Era Clash Chapter I (the earlier proposal) stays the pilot for picture → level and
mocap in phase 3.

## 7a. Story Intelligence as the game designer's partner

Story Intelligence (SI) already reads films, videos and albums into a `StoryReport` (acts, sequences,
scenes, characters, locations, MacGuffins, dialogue) and files the results into Worlds. The Studio's
**Story room** points that same reading at a game. SI gets one new skill: knowing how games tell
stories, and turning a story into a game the author can play and edit.

**What SI learns (a game-story canon, as data, like the prefab kit):**
- *Structure:* three-act and chapter arcs mapped onto a **level ladder** (teach → test → twist → master),
  rising difficulty matched to rising stakes, a breather after every peak, boss = the act's turn.
- *Telling through play:* environmental storytelling (the room tells it, not a cutscene), the player's
  verb carries the theme, "show the goal before the path", ludonarrative fit (what you do matches
  who you are), optional lore you find, not lore you sit through.
- *Pacing:* minutes per beat by genre (arena shooter, platformer, racer, RPG, puzzle), cutscene budget,
  how often to give a new mechanic, a new place, a reward.
- *Choice:* when a branch is worth it (it changes a later level or ending) versus cosmetic.
- Each pattern is written as a sentence with an example, so the reasoning SI shows is readable and the
  author can turn any pattern off.

**The pipeline (story → playable game):**
1. *Read:* SI reads a story (a Lorea manuscript, a script, a Fabula film, a World, or a typed idea).
2. *Break down:* a **Game Breakdown** document: chapters → levels, each level has a goal, a place (a World
   location), who is there (World characters as enemies/allies/NPCs), the new mechanic, the beat it
   carries, the item/MacGuffin, and the rules as sentences ("Reach the bell tower before the tide").
3. *Pick a template:* arena shooter, platformer (Kith Quest), racer (Forth Horizon), fighter (Era Clash),
   adventure. The breakdown says why ("the story is a chase, so the levels are races").
4. *Build up:* the breakdown becomes **ops** on the Game Project (addLevel, markers, zones, rules,
   props from the kit). It is the same op layer the editor uses, so every generated piece shows up in
   History as a sentence and can be undone, moved or rewritten by hand.
5. *Check:* SI plays it back against the canon: pacing per level, the difficulty curve, "this chapter has
   no new verb", "the boss arrives before the player has learned to dodge". These are notes, not
   automatic changes.

**Where it lives:** a Story tab in the Studio's left rail (beside Level / Props) shows the breakdown as
cards per level; clicking a card opens that level. The breakdown is its own document kind
(`plajah.gamestory`), cloud-saved with the project and linked to the World it came from, so a rename in
Worlds still matches.

**Build order:** (a) breakdown schema + validator + tests, (b) the canon file, (c) story → breakdown via
the Gemini lane (with a no-AI path: a hand-filled breakdown works the same), (d) breakdown → ops for
the arena-shooter template, (e) the playback notes. The first test is Ravencrest: its campaign draft
becomes a breakdown, and the Studio builds level 1 from it.

### Story Intelligence, first slice as built (2026-11-18)

- **Rules as sentences:** `services/gamestudio/rules.ts` is the event/action vocabulary and `ruleSentence`
  ("When Dracula is defeated, win the level and go on to The Undercroft."). History shows rules this way.
- **Game Story** (`services/gamestudio/story/schema.ts`, kind `plajah.gamestory`): chapters → levels with
  beat, place, goal, story, new verb, cast, item, how it's told, minutes, intensity. Stored on the project
  (`project.story`, op `setStory`), so it undoes, cloud-saves and versions with the game; a broken story
  only warns.
- **Canon** (`story/canon.ts`): 12 patterns (hook first, teach before test, something new often, breathe
  after a peak, act builds to its peak, boss is the turn, let the room tell it, goal in sight, verb is
  theme, pacing fits, ending lands, choices matter), pacing per template, `reviewStory` notes.
- **Builder** (`story/build.ts`): one undoable batch of ordinary ops: a level per story level (`st-<id>`),
  intro text, enemy waves, goal rule, item, lose rule, a goal area for reach/escape/explore, look by
  intensity. Rebuilding skips built levels so hand edits survive. Places without a module get stand-in
  arenas (spread across the game's levels) and say so.
- **Idea → breakdown:** `story/prompt.ts` (prompt carries the canon; `parseBreakdown` repairs sloppy AI
  JSON, then validates) and `POST /api/gamestudio/breakdown` (`routes/gameStory.ts`, signed-in, Gemini lane,
  env `GAME_STORY_MODEL`). Not run against real Gemini yet.
- **Example:** `story/samples/ravencrest.ts`, the campaign draft as 4 acts / 13 levels / 60 min.
- **Studio:** Story tab (idea box, example, shape strip, notes, act cards with beat/intensity/time, Build),
  "What happens here" rules panel with on/off, story context on built levels, goal areas drawn and dragged
  in the World view with a size panel.
- **Usability pass:** level picker past 5 levels (game levels / from the story), Start here card, a
  loading state while the level builds, long marker lists collapse, the sync pill no longer squashes.
- **Not yet:** rules don't run in the game (Phase 2 rule player); Ravencrest has no Studio runtime, so its
  levels play in Rift Realm stand-ins; story edits beyond beat/intensity/time are by AI or file.

## 7b. Photo → 3D: scan, look, fix, repeat (Props room)

Full plan: [`docs/game-studio-photo-to-3d.md`](game-studio-photo-to-3d.md). A photo is scanned on the local
GPU (Tela 3D runtime), the scan becomes Argilla clay, and a loop renders the model from the photo's aligned
camera and other angles, scores it (silhouette, colour, materials, props), has a vision model list what is
missing or wrong as a typed gap report, and has Aria's agent fix it with readable, undoable model ops (add or
carve a part, extrude, sculpt, paint, material), one batch per round, until 99% or the gains flatten. A round
that lowers the score is undone. The same doc stays hand-editable. It also writes down the runtime target
for everything the Studio exports: WebGPU on native APIs (D3D12, Vulkan, Metal) with WebGL2 fallback, tiered
bakes (LODs, KTX2, meshopt) for Windows, Android, iOS and Mac. First slice built 2026-11-18
(`services/gamestudio/photo3d/*`, 19 tests, one real run on a conga photo).

## 8. Decisions for Kenne

1. **Pilot game:** Rift Realm (recommended) or Era Clash Chapter I.
2. **Name** of the Studio workspace (working name "Game Studio", in a new **Play** group).
3. **Creator access:** open to everyone in phase 5, or behind Plajah+ / a creator tier at first.
4. **Asset hosting** for published games (the ~100 MB question): Firebase Storage by default, per the B2 rule.
5. **Script behaviours for creators:** at launch, or team-only until the sandbox has been reviewed.
