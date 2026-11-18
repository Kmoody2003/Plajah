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

### Phase 0 as built (2026-11-17, uncommitted)

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

**Why Rift Realm pilots it:** it's the newest game (one arena, uncommitted), its world is already built from
parametric pieces (`StaticKit`, `geom.ts`), and arena-shooter logic is small. That makes it the cheapest game
to prove the full loop on. Era Clash Chapter I (the earlier proposal) stays the pilot for picture → level and
mocap in phase 3.

## 8. Decisions for Kenne

1. **Pilot game:** Rift Realm (recommended) or Era Clash Chapter I.
2. **Name** of the Studio workspace (working name "Game Studio", in a new **Play** group).
3. **Creator access:** open to everyone in phase 5, or behind Plajah+ / a creator tier at first.
4. **Asset hosting** for published games (the ~100 MB question): Firebase Storage by default, per the B2 rule.
5. **Script behaviours for creators:** at launch, or team-only until the sandbox has been reviewed.
