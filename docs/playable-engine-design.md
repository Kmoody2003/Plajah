# Plajah Playables — design (draft 1, 2026-10-25)

Goal: a creator turns content they already uploaded (covers, art, tracks, films, comics, 3D) into a small playable
"vertical slice" using **pictures and plain language**, with no engine knowledge. Deeper editing is a later second
view of the same document.

Non-goals for v1: a general-purpose engine, multiplayer, user-written code, a full level editor.

Status of this doc: proposal. Facts about Ravencrest come from `docs/ravencrest-engine.md`, project notes and a skim of
`games/ravencrest/src`; items marked **(verify)** have not been checked in code.

---

## 1. Principles

1. **The document is the product.** Everything (chat, UI, publish, remix, validation) reads and writes one JSON
   *Experience*. The runtime never sees chat, the chat never touches the renderer.
2. **The LLM edits through typed tools, never writes code.** Reliable, undoable, safe to run on other people's devices.
3. **Templates, not freedom.** A template fixes camera, controls, rules and perf budget. The creator fills slots.
   Three templates eventually; one in v1.
4. **2D-first, 3D as an upgrade.** Most creator content is flat art. The default path must work with zero 3D models.
5. **The 60 fps iGPU baseline is non-negotiable** (`game-dev-canon` (project memory)). The runtime enforces budgets; creators can't
   tune.
6. **Platform content is first-class.** Every slot can be filled from the creator's library (cover, track, film,
   comic page), and credits/paywall rules ride along (`content-access-model` (project memory)).

---

## 2. Architecture

```
 Chat / Build UI ──tool calls──▶  Experience (JSON, versioned)  ◀──reads── Player shell (iframe)
        │                              │                                        │
   Asset services                 Validator + budget                       playkit runtime
 (depth, segment, img→3D,        (schema, refs, perf, rights)        (renderer, player, collision,
  autoRig, library)                                                    input, audio, behaviours)
```

Three deliverables:

| Piece | What | Lives in |
|---|---|---|
| `playkit` | Headless runtime library: renderer/post/tiers, player, collision, input, audio, behaviours, template loaders | `playkit/` (new, vite lib) |
| Experience schema + validator | Types, JSON schema, `validate()`, `budget()` | `playkit/schema/` |
| Build surface | Chat-first authoring UI, asset pipeline glue, publish | `components/playables/` + `services/playables/` |

Ravencrest becomes the first *consumer* of `playkit` (kept as a bespoke 3D game), not something creators edit.

Home in the product: the **project container is an Anima project** (it already has `plate`, `character`, `camera`,
`audio` layer types and a timeline that can drive cutscenes). **Tela is the asset front door** (img→3D, sculpt, cleanup).
The **Build surface** is a chat-first view launched from either. An Experience is stored next to the Anima project, so
cutscenes authored on the Anima timeline are referenced by id from triggers.

---

## 3. Experience schema (v1)

TypeScript is canonical; JSON Schema is generated from it. All ids are short strings unique within the document.

```ts
interface Experience {
  v: 1;
  id: string;
  title: string;
  template: 'picture-walk';                  // v1; later 'explorer-3d' | 'sidescroll'
  owner: string;                             // uid
  tone?: 'cozy' | 'eerie' | 'bright' | 'noir' | 'dreamy' | string;  // drives look + audio defaults
  scenes: Scene[];
  startScene: string;
  hero: HeroRef;
  assets: Record<string, AssetRef>;          // every external thing, by local key
  audio?: { score?: AudioBinding[]; ambience?: AudioBinding[] };
  goal: Goal;                                // what "done" means
  rules?: { lives?: number; timeLimitSec?: number; saves?: 'checkpoint' | 'none' };
  meta: { createdAt: number; updatedAt: number; authoredBy: 'chat' | 'ui'; rev: number };
}

interface Scene {
  id: string;
  name: string;
  plate: PlateRef;                           // the picture the scene is built from
  layers?: LayerOverride[];                  // manual depth/cut fixes (post-v1 UI, tools in v1)
  walk: WalkSpec;                            // where the hero can go
  spawn: { x: number; z: number; face?: number };
  things: Thing[];                           // everything placed in the scene
  exits: Exit[];
  mood?: { light?: 'day'|'dusk'|'night'|'storm'; fog?: number; look?: string };
  onEnter?: Action[];
}

interface Thing {
  id: string;
  kind: 'prop' | 'npc' | 'pickup' | 'door' | 'sign' | 'screen' | 'poster' | 'hazard' | 'chaser' | 'zone';
  asset?: string;                            // key in Experience.assets
  at: { x: number; z: number; y?: number };  // scene-space metres on the walk plane
  size?: number;                             // metres, tallest dimension
  face?: number;
  behaviour?: Behaviour;                     // one of the fixed verbs (§4)
  label?: string;                            // shown on interact
}

type Behaviour =
  | { do: 'interact'; actions: Action[]; once?: boolean; needs?: Cond }
  | { do: 'pickup'; item: string; actions?: Action[] }
  | { do: 'talk'; lines: { who?: string; text: string; voice?: string }[]; actions?: Action[] }
  | { do: 'patrol'; path: [number, number][]; speed?: number; hurts?: boolean }
  | { do: 'chase'; range: number; speed: number; hurts?: boolean }
  | { do: 'trigger'; shape: 'circle'|'box'; size: [number, number]; actions: Action[]; once?: boolean }
  | { do: 'play-media'; asset: string };     // screen/poster: opens platform player

type Action =
  | { a: 'say'; text: string; who?: string }
  | { a: 'give'; item: string } | { a: 'take'; item: string }
  | { a: 'set'; flag: string; value: boolean | number }
  | { a: 'goto'; scene: string; spawn?: string }
  | { a: 'unlock'; thing: string } | { a: 'show'|'hide'; thing: string }
  | { a: 'music'; track: string; fadeSec?: number }
  | { a: 'cutscene'; id: string }            // Anima timeline id
  | { a: 'win' } | { a: 'lose' } | { a: 'checkpoint' };

type Cond = { item: string } | { flag: string; is?: boolean | number } | { all: Cond[] } | { any: Cond[] };
type Goal = { type: 'reach'; thing: string } | { type: 'collect'; item: string; count: number }
          | { type: 'flag'; flag: string } | { type: 'survive'; sec: number };

interface AssetRef {
  kind: 'image' | 'cutout' | 'model3d' | 'audio' | 'video' | 'film' | 'album' | 'comic';
  src:
    | { platform: 'library'; id: string }     // creator's uploaded content (preferred)
    | { platform: 'catalog'; id: string }     // films.json-style platform entries
    | { generated: string }                   // storage path of a generated derivative
  derived?: { depth?: string; mask?: string; glb?: string; rig?: string };  // cached pipeline outputs
  rights: { owner: string; license: 'own' | 'platform' | 'cc0' | 'cc-by'; credit?: string };
}

interface WalkSpec {                          // produced by the picture pipeline, editable
  ground: { y: number; polygon: [number, number][] };   // walkable area on the walk plane
  blockers: { polygon: [number, number][] }[];
  heightfield?: string;                       // optional depth-derived asset key
}
```

Rules:
- **Closed vocabulary.** New verbs/actions require a schema version bump; the runtime ignores nothing silently — the
  validator rejects unknown ones.
- **No scripts, no URLs.** Assets resolve only through `assets` keys → platform ids. Prevents injection and keeps
  moderation/rights on the platform.
- **Flags and items are just strings** scoped to the experience; save state = `{flags, items, scene, pos}`.
- Documents are small (a slice is a few KB). Heavy data (depth, masks, GLBs) lives in Storage as derived assets.

Validator (`validate(exp)`) checks: schema, every ref resolves, every scene reachable from `startScene`, goal is
satisfiable (graph walk over items/flags/doors), no dead-end soft-locks, rights present on every asset. This replaces
"is it beatable" bots for v1; a simulate-based bot comes later.

Budget (`budget(exp)`): per-scene triangle/draw/texture-memory estimate against the Arc iGPU tier; returns pass/warn
with the exact thing to cut ("scene 2 has 14 animated NPCs; limit 8").

---

## 4. What to extract from Ravencrest into `playkit`

Triage by file (line counts as of 2026-10-25; coupling from imports):

**Lift almost as-is (leaf modules, no game imports):**
- `collision.ts` (97) — BVH capsule world.
- `post.ts` (143) — post chain with the sized-RTT helper that fixed the 1080p-everywhere cost.
- `lights.ts` (99) — virtual→real light pool. `optimize.ts` (61) — static batching.
- `materials.ts` (306) — texture tiers, PBR helpers (strip Ravencrest-specific wet-asphalt/moat bits).
- `samples.ts` (79), `audio.ts` (466), `sfx.ts` (580) — audio engine and SFX bank. Split "engine" from the Ravencrest
  score/cue lists.
- `physics.ts` (425), `ktx2.ts`, `assets.ts` (50) — loaders and dynamic physics.
- `artAnchor.ts` (142) — generalise from hard-coded calibration to `Anchor.fromPlate(plate, depth)`.
- `looks.ts` (147) — LUT/lens looks, tied to `tone`.

**Lift with decoupling:**
- `player.ts` (484) — depends only on `collision` + `character`; keep. Parameterise camera mode.
- `character.ts` (464) + `fightClips.ts` + `hair.ts` — keep loading/retarget/locomotion blend; remove Jack/Elise
  specifics, expose `loadHero(ref)`. Combat clips stay in Ravencrest.
- `input.ts` (163) — imports `game`; invert so it emits intents (`move`, `interact`, `jump`) and `game` subscribes.
  Keep gamepad + touch. Remember the dev laptop is a touchscreen: never detect phones by touch points.
- `cinema.ts` (305) — imports `arrival`/`grandHall`. Split into `MediaSurface` (billboard/frame bound to a platform
  media id → `postMessage` open-player) and Ravencrest placement. **This is the proto "play-media" thing.**
- `main.ts` bootstrapping (loading bar, tiers by GPU, dynamic resolution, level fades on sim time, `postMessage`
  contract) → `playkit/shell.ts`.

**Stay in Ravencrest:** `game.ts` (1,730), `mobs`, `encounters`, `nightmare`, `bridgeBattle`, `kraken`, `weather`,
`daybreak`, `gore`, `angel`, `arrival`, `courtyard`, `grandHall`, `viaduct`, forest/foliage/grass set dressing.
Mine them *later* for behaviours (§4.2) rather than moving them now.

### 4.1 Rules for the extraction
- Move, then re-point Ravencrest at the package; **Ravencrest must still build and play identically** (capture pair
  checks + `simulate()` walk) before anything new is built on playkit.
- Runtime hard rules carry over: sim-time (not timers) for sequencing; BufferGeometry + InstancedBufferAttribute, no
  InstancedBufferGeometry; `If` only inside `Fn`; reverse-depth + FXAA-before-FSR; single `nodeFrame.update()` per
  capture render.
- No full-repo `tsc` (OOMs): give `playkit` its own `tsconfig`.

### 4.2 Behaviours module (new)
`playkit/behaviours/` implements exactly the §3 verbs as small systems driven by a fixed-step sim:
`interact/pickup/talk/trigger` (v1), `patrol/chase/hurts` (v1.1). Chaser AI can start as Ravencrest `mobs.ts`'s simplest
state machine — **(verify)** how separable it is.

---

## 5. First template: **Picture Walk**

*Make a small walkable world out of 1–5 pictures.* Chosen because it needs no 3D, is cheap to render on an iGPU, and
maps directly onto what creators already have (album art, posters, comic panels, concept art, photos).

### 5.1 What the player sees
A third-person (or side-on) hero walks through a scene that looks like the picture, with real parallax and depth:
foreground props in front of the hero, background behind, light and fog from the mood. Walk to things, press interact,
read a line, pick something up, open a door to the next picture, reach the goal. 3–10 minutes.

### 5.2 Picture → scene pipeline (runs once per plate, cached in `AssetRef.derived`)
1. **Depth:** monocular depth map from the plate. Adopt Depth Anything V2 **Small** (Apache-2.0) through Transformers.js
   — same model in the browser (WebGPU) and on the desktop engine (see §10). Nothing local is wired in the repo today.
2. **Layers:** split into depth bands + subject segmentation (SegFormer is already used by the colourise remaster) →
   3–6 cut-out layers with inpainted gaps. Inpainting reuses Tela generative fill when available.
3. **Walkable ground:** fit a ground plane from the lowest-depth band; produce `WalkSpec.polygon` + blockers from
   large near-ground objects. Low confidence → ask the creator ("is the path here?") instead of guessing.
4. **Scene build at runtime:** layers become depth-displaced cards/relief meshes at their depth (the "relief
   displacement" approach in the Game Council notes), walk plane collision from `WalkSpec` (2D polygon test, no BVH
   needed), `Anchor.fromPlate` for placing things "where the picture shows them".
5. **Hero:** default **cut-out puppet** built from one character image (segment → bones via the Anima auto-rig /
   VTuber rig builder lineage). Upgrade: Tela img→3D GLB + `autoRig` for creators on the desktop engine.

Hero and NPCs from pictures: same cut-out path. Props: cut-outs from the plate or extra uploads.

### 5.3 Authoring flow (chat-first)
1. **Pick sources.** "Use my album *Moon Door* cover and these 3 tracks." The Build UI shows the library; chosen items
   become `assets`.
2. **Interview, briefly.** The assistant proposes a *premise card* (title, tone, goal, 2–3 scenes) the creator can
   accept or reword. No blank-page prompts.
3. **Generate a draft Experience** via tool calls (§5.4). The preview plays immediately in an iframe.
4. **Iterate by talking and pointing.** "Move the key to the lamp." "Make the guard slower." "Add a locked door that
   needs the key." The creator can also click a spot in the preview to give the assistant a coordinate.
5. **Fix-ups with sliders, not tools:** depth strength, walk area brush, layer cut brush (second view; post-v1).
6. **Publish.** Validator + budget pass → publish to a creator page / feed card / embed. Remix = fork the Experience.

### 5.4 Tool API for the assistant
Pure functions on the document, each returning a diff and an undo token:

`create_scene(plateAsset)`, `set_walk_area(scene, polygon|"auto")`, `add_thing(scene, kind, asset?, at|near)`,
`move_thing`, `remove_thing`, `set_behaviour(thing, behaviour)`, `add_exit(scene, thing, toScene)`,
`set_goal(goal)`, `set_mood(scene, mood)`, `bind_audio(role, asset)`, `attach_cutscene(trigger, animaId)`,
`rename`, `validate()`, `budget()`, `undo()/redo()`.

Placement language: `near`, `behind`, `left of`, `at the picture's {top-right}` resolve to `at` via the plate
anchor, so the model never does coordinate math.

Guardrails: the model may only reference asset keys that exist; rights metadata is copied, never invented; any
tool error is returned to the model verbatim so it can retry. Model choice: Aria/Gemini like other creative roles; no
local LLM batches (`feedback-no-local-llm-batch` (project memory)).

### 5.5 Repurposing defaults (zero-config content mapping)
| Creator uploads | Becomes |
|---|---|
| Album/single cover | Plate for scene 1, or a `poster` on a wall |
| Tracks | Score by scene tone; or each track = one zone's ambience |
| Film/trailer | `screen` Thing (`play-media`) like Cinema Mile |
| Comic pages | Scenes (page = plate) with `talk` from captions, or cutscenes |
| Character art / avatar | Hero or NPC cut-out |
| 3D model (GLB) | `prop` or hero (desktop-only to start) |

### 5.6 Out of scope for the slice
Combat, multi-room 3D, dynamic lights per prop, user audio recording, saving across devices (local only), mobile
store packaging.

---

## 6. Storage, publish, runtime shell

- **Docs:** Firestore `playables/{id}` holds the Experience (and `rev`); derived binary assets in Storage under the
  creator's folder, referenced by key. Autosave with version history through `services/creativeCloud` (same as other
  creative tools; quota not enforced yet).
- **Shell:** one generic player route loads `playkit` + an Experience id, resolves assets, and speaks the existing
  `postMessage` contract (`exit`, `achievement`, `watch`) so the host can reuse `RavencrestGameFrame`'s plumbing.
- **Rights:** a Playable can only reference the creator's own library or platform-licensed catalog. Paywall follows
  the owner's setting; open/external catalog is never gated.
- **Perf:** tier selection and dynamic resolution as Ravencrest; shell reports frame-time buckets so we can spot slow
  published slices.
- **Prod asset hosting** for the Ravencrest build is still undecided; Playables must not depend on that decision
  (assets are per-experience in Storage).
- **Licensing gates:** Hunyuan excludes EU/UK/KR; SF3D is free under $1M revenue. Hide or disable those backends for
  public-facing creator use until cleared.

---

## 7. Phasing

**Phase 0 — Extract (≈ 1 week).** `playkit` with the leaf modules + shell; Ravencrest re-pointed; capture-pair and
`simulate()` parity. *Exit:* Ravencrest unchanged to the eye, `playkit` builds as a lib.

**Phase 1 — Schema + runtime (≈ 1–2 weeks).** Types, JSON Schema, validator, budget, behaviours (v1 set), Picture Walk
loader that plays a hand-written Experience from 2 pictures. *Exit:* a checked-in sample experience plays at 60 fps
on the Arc iGPU baseline.

**Phase 2 — Picture pipeline (≈ 2 weeks).** Depth + layers + walkable ground + cut-out hero, cached derived assets,
confidence prompts. *Exit:* 10 real creator images, ≥ 7 yield a walkable scene without manual fixes.

**Phase 3 — Chat authoring + publish (≈ 2 weeks).** Tool API, premise card, live preview, undo, library picker,
publish + embed. *Exit:* a non-technical person (not the dev) builds and publishes a 3-scene slice in under 20
minutes.

**Phase 4 — Upgrades.** 3D hero/props via Tela runtime, Anima cutscenes as actions, chasers/hazards, second template
(`explorer-3d`, from Ravencrest), deeper editor view.

Estimates are rough, assume one focused builder, and exclude the licensing review.

---

## 8. Risks and open questions

1. **Depth quality on stylised art** (flat illustration, comics) may be poor → keep a "flat parallax" fallback and
   let the creator paint depth later.
2. **Auto walk area is the likeliest first-run failure.** The confidence prompt and a brush are required, not nice-to-have.
3. **Cut-out hero from a single image** may look stiff; may need 2–3 pose images or a simple idle/walk bob first.
4. **Local depth/segmentation on web.** Everything heavy runs on the desktop engine today; web users need a
   server/cloud path and a cost model.
5. **LLM drift** — the assistant proposing impossible puzzles. Mitigation: validator's solvability check + templates
   for goals ("find 3 things", "reach the door").
6. **Moderation.** Published slices carry creator text and images; reuse existing content-review hooks
   **(verify which)**.
7. **Hardware heat/RAM.** Img→3D loads the 4070 to 85 °C and hit paging-file limits; keep it single-job, desktop-only,
   and optional.
8. **Where it surfaces** (Anima tab vs Tela vs own tile) is a product call; the architecture above is indifferent.

## 9. Decisions needed from the owner

- Confirm **Picture Walk first** (vs. extracting a 3D explorer template first).
- Confirm **Anima project as container**, Build surface as chat-first view.
- OK to **retire the "bespoke game" Ravencrest build from creator scope** (it becomes the reference consumer).
- Which depth model/service to adopt for Phase 2 (local-first per `feedback-desktop-first-ai` (project memory), never the owner's
  cloud accounts).

---

## 10. Build vs adopt (open-source survey, checked 2026-10-25)

Licences below were read from the projects' own pages/LICENSE files on 2026-10-25. "Not confirmed" means the page did
not show it. **Code licence and weights licence are separate; re-read both at adoption time and record the result in
`docs/third-party-models.md` (to create).**

### 10.1 Adopt (clean licence for a commercial platform)

| Job | Project | Licence (verified) | Notes |
|---|---|---|---|
| Depth | **Depth Anything V2 Small** (ONNX: `onnx-community/depth-anything-v2-small`) | Apache-2.0 | **Only Small is Apache.** Base/Large/Giant are CC-BY-NC-4.0. Repo's last dated news is Jan 2025 (not obviously active). Runs in Transformers.js. |
| Depth, newer | Depth Anything 3 — `DA3-SMALL`, `DA3-BASE`, `DA3METRIC-LARGE`, `DA3MONO-LARGE` | Apache-2.0 (those four); `DA3-LARGE`, `DA3-GIANT`, nested variants are CC-BY-NC-4.0 | Released 2025-11-14. Only a community ONNX port of the small model showed up for Transformers.js — benchmark vs V2 Small before switching. |
| Browser ML runtime | **Transformers.js** (`@huggingface/transformers`) | Apache-2.0 | `depth-estimation` and `image-segmentation` pipelines; `device: 'webgpu'` option, noted experimental. This is the web fallback. |
| Promptable cut-outs | **MobileSAM** | Apache-2.0 | ~9.7M params; ONNX export supported; browser demo exists (third-party). Upgrade path: SAM 2 (Apache-2.0, from memory, **not re-checked**). |
| Background removal | **BiRefNet** (code) | MIT | ONNX weights published; runs with ONNX Runtime Web. **Weights licence not stated on the page — confirm on the HF card.** Do **not** use RMBG-2.0 (non-commercial). |
| Inpaint behind cut-outs | **LaMa** | Apache-2.0 (LICENSE read) | No official ONNX; community ports exist (Lama Cleaner). Converting is a task. |
| Navmesh (3D template, chasers) | **recast-navigation-js** (+ `@recast-navigation/three`) | MIT | Release recency not shown — check npm. |
| Dialogue | **ink** (inkle) | MIT | Engine reference. |
| Dialogue runtime in JS | **inkjs** | Not confirmed on page (believed MIT) | Community-maintained, usually one version behind ink. Confirm LICENSE.md before adding. |
| Auto-rig, 3D upgrade | **UniRig** | Code MIT; HF weights card says MIT | Needs CUDA GPU with > 8 GB (HF) / ≥ 8 GB (GitHub): borderline on the 4070 Laptop (8 GB), alongside Hunyuan. Desktop-only, optional. |
| Image→3D (clean licence) | TripoSR, TRELLIS, InstantMesh | MIT / MIT / Apache-2.0 (from memory, **not re-checked**) | Prefer TripoSR for public creator use; see §6 on Hunyuan/SF3D gating. |
| Asset optimise | glTF-Transform, meshoptimizer | MIT (from memory, **not re-checked**) | Needed at publish to hit budgets. |

### 10.2 Usable with conditions

- **SAM 3** (`facebookresearch/sam3`): custom **SAM License**, weights gated on Hugging Face. It does not prohibit
  commercial use, but: no ITAR / military / weapons / nuclear / espionage uses; follow trade controls; you must include
  the agreement when you distribute the materials or derivatives; **making it available to a third party counts as
  distribution**; derivatives must stay under the same agreement; licence terminates if you sue Meta over the
  materials; you indemnify Meta. SAM 3.1 announced 2026-03-27. Shipping SAM 3 weights *to users' browsers* triggers the
  distribution terms. Safer: MobileSAM (Apache-2.0) in the browser, SAM 3 only server/desktop-side if ever.
- **Meta Animated Drawings** (drawing → walking character): MIT for code, weights and the Amateur Drawings dataset
  (ChildlikeSHAPES dataset CC-BY-4.0). **Archived 2025-09-03, read-only, unmaintained.** Python 3.8-era stack
  (tested on macOS / Ubuntu 18.04), output is its own MP4/GIF renderer, **no glTF/BVH export** documented. Treat as a
  *design reference and source of the detect→segment→rig→retarget recipe*, not a dependency. We must write our own
  cut-out puppet using Anima's rig.
- **Qwen-Image-Layered** (image → RGBA layers): Apache-2.0, weights released 2025-12-19. Needs a CUDA GPU in bf16;
  VRAM not documented. A candidate for an "enhanced layers" upgrade, not v1.
- **Theatre.js**: `@theatre/core` Apache-2.0, `@theatre/studio` **AGPL-3.0**; development moved to a private repo. Do not
  embed studio in a hosted product. Anima's own timeline stays the cutscene editor.

### 10.3 Do not use for the shipped product

| Project | Why |
|---|---|
| Depth Anything V2 Base/Large/Giant; DA3 Large/Giant | CC-BY-NC-4.0 |
| Apple SHARP (single image → 3D Gaussians) | Weights licence is **research-only**; commercial use, product development and commercial services are excluded |
| RMBG-2.0 | Non-commercial weights |
| Hyperfy | GPL-3.0 (study only, would force our code open) |
| DepthFlow (2.5D parallax) | AGPL (from memory, not re-checked); we build parallax ourselves from depth |
| Godot / Babylon / PlayCanvas as the runtime | Second engine + heavier web build; rejected 2026-10-20. Use as design reference only |

### 10.4 What stays uniquely Plajah (the part we write)

1. The Experience schema, validator, solvability check and budget meter (§3).
2. The assistant's typed tool API and placement language (§5.4).
3. Library/catalog binding and rights propagation (§5.5, §6).
4. Tone → look/audio/lens mapping (Looks, Chora scores, Cinema media surfaces).
5. The cut-out puppet built on Anima's rig and the desktop-first model host (WinUI app, 4070 forced, Arc baseline).
6. Publish, remix, moderation and perf telemetry.

### 10.5 Changes this survey makes to the plan

- Phase 2 depth: **Depth Anything V2 Small via Transformers.js** is the single model for both web and desktop; no cloud depth
  service needed. Add a benchmark task: V2 Small vs DA3-Small vs DA3-Base on 20 real creator images (flat illustrations
  and comic art are the worst case).
- Phase 2 cut-outs: **MobileSAM in-browser first**; BiRefNet for subject matting once its weights licence is confirmed.
- Hero puppet: **write it on Anima's rig**; don't wait on Animated Drawings (archived). Use its pipeline as the recipe.
- Add task: create `docs/third-party-models.md` listing each model, version, licence, weights source, and where it is
  hosted (we should self-host weights rather than pull from HF at runtime).
- Add risk: Depth Anything V2's repo shows no dated activity since early 2025, so budget for pinning the ONNX weights
  and not expecting upstream fixes.
