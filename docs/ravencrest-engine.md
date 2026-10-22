# Ravencrest engine (art-matched rebuild)

Status 2026-10-20 (round 2): **arrival → gatehouse → courtyard → Grand Hall is walkable end to end.** Supersedes the rendering approach in `components/taleo/HauntedCastleExhibition.tsx`. The rebuild brief is in `docs/halloween-ravencrest-art-assessment.md`.

## Decisions (made with the user, 2026-10-20)

- **Engine:** stay in the browser. three.js r184 `WebGPURenderer`, with TSL post-processing (SSR, bloom, SMAA, TRAA opt-in). The engine is a standalone module in `games/ravencrest/`, not the 5,700-line React component. Unity/Babylon were rejected because they can't be authored end to end by script and would mean a rewrite.
- **Floor plan authority:** the fortress plan, `creation_3752884004` (courtyard, chapel, five levels). It matches the gate, moat and walls in the exterior art.
- **Characters:** image-to-3D from the turnaround sheets, auto-rigged. Piloted on Jack Thorne first; the other six need separate approval for credits.

## Running

```bash
node node_modules/vite/bin/vite.js --config games/ravencrest/vite.config.mjs
```

Open `http://127.0.0.1:4330/`. Optional query flags:

- `?ref`: start in the reference shot.
- `?q=low|medium|high`
- `?ssr=0`, `?bloom=0`, `?aa=0`, `?taa=1`
- `?debug`: TSL stack traces.

Controls:

- **Mouse steers:** click to capture the mouse, or click and drag where pointer lock is refused, as in the desktop app's browser pane. Moving the mouse orbits the camera, and WASD moves relative to where the camera looks.
- **Movement:** WASD to move, Shift to run, mouse wheel to zoom, Esc to release the mouse.
- **Review keys:** **R** for the reference shot with the art overlay (opacity slider, split view), **F** for the free camera, **C** to toggle the collision wireframe.
- **Start points:** `?start=hall` spawns inside the Grand Hall.

The CC0 assets aren't committed. Re-create them with `node scripts/ravencrest/fetchPolyhaven.mjs` (about 250 MB at 2k).

## How the 1:1 match works

`src/artAnchor.ts` calibrates a camera to the master painting (`creation_3752929161`, 1280×724 pixel space: eye 1.6 m, horizon y=415, vanishing x=657, 36.2° vertical FOV). Every landmark is placed by **the pixel where it appears in the art**:

- `onY` intersects the ground or water plane.
- `onFacade` and `heightAt` intersect the gate's facade plane.
- `atDistance` places the crag and castle, about 430 m out.

Seen from the reference camera, the render registers with the painting by construction; from anywhere else it is a consistent 3D place. Anchors are listed inline in `src/arrival.ts`, with the pixel coordinates beside each element.

## Review gates (art / music / game / animation councils)

The councils are applied as **review criteria with captured evidence**, not as local LLM runs; those overloaded this laptop before. A slice passes a gate only with paired captures in `games/ravencrest/review/` (`*_pair.jpg`: art on top, engine below).

- Dev endpoint: `ravencrest.capture(name, frames, heldKeys)` renders offscreen and POSTs to `/__capture`, which writes to `games/ravencrest/review/`.
- `window.ravencrest.setMode('ref' | 'play' | 'portrait' | 'free')`. Portrait mode adds a neutral key light for character review.
- Capture advances the node frame itself. Pass nodes only re-render when `frameId` advances, and a hidden browser pane doesn't tick `requestAnimationFrame`. Without this, every capture repeats a stale frame.

## Levels, movement and collision (round 2)

- **Levels:** `outside` (road, moat, gatehouse and courtyard) and `hall` (Grand Hall). Each level has its own scene, post-processing chain and collision BVH. Door triggers fade between them on simulation time; browser timers stall in background tabs.
- **Player** (`src/player.ts`):
  - Moves relative to the camera, with acceleration and deceleration.
  - Turns along the shortest arc, so there are no 180° snaps.
  - Physics is a capsule against a BVH (`src/collision.ts`, three-mesh-bvh), with a step-up of up to 0.4 m that probes ahead of the capsule's leading edge.
  - Falling into the moat respawns you on the last safe ground.
  - The camera boom is collision-checked so it never clips into walls, and it drifts back behind Jack after 1.2 s without mouse input.
- **Locomotion:** idle, walk and run play together, with weights driven by ground speed and playback rate matched to speed. Walk and run stay phase-synced through the blend.
- **Head-flip fix:** the retarget's facing correction is now a pure rotation about +Y. `setFromUnitVectors` on opposed vectors rotated about X, which put Jack's face on the back of his head.
- **Collision:** anything tagged `collide(obj)` goes into the BVH.
- **Verified walk** (automated, `ravencrest.simulate`): road → bridge → gate passage → around the well → Great Hall doors → hall → 30-step stair → landing (5.4 m) → west gallery and back → down → out the doors → courtyard.

## Courtyard (`src/courtyard.ts`)

Built from the fortress plan's entrance and defence floor:

- **SW stable:** open timber arcade, stalls and hay.
- **SE carriage house:** iron-strapped doors and a cart.
- **NE guard room:** barred, lit windows.
- **NW chapel:** lancets and a belfry.
- **N Great Hall portal:** braziers and raven banners.
- **Centre:** a well, a fire pit, and Poly Haven props.

Every roofline stays below the curtain-wall sightline from the road camera, so the arrival shot is unchanged.

**Plan exceptions:**

1. The chapel moved from N to NW, so the north range can hold the Great Hall portal.
2. The Great Hall is its own interior level behind that portal. The plan puts it on the second floor, and its painted view out of the doors shows the hilltop castle, which can't be reconciled with the walls seen from the road. It is reached by a door transition.

## Grand Hall (`src/grandHall.ts`)

Anchored to `creation_3752887346` through `HALL_SHOT`. That painting uses a **shift lens** (level camera, horizon at row 497, verticals stay vertical), which `ArtAnchor` models with `setViewOffset`.

Placed from art pixels:

- Near piers, knights, floor braziers.
- Carpet edges and stair foot. The landing height is solved from the stair-top row: 30 risers of 0.18 m make 5.4 m.
- Chandeliers, near banners.
- Door leaves, positioned so their slivers match the art's frame edges.

The stair, landing and both galleries are walkable. The interior uses a soft PMREM `RoomEnvironment` (intensity 0.07) so the plate armour, brass and iron read.

**Materials:** `castle_brick_07` is red clay brick and `medieval_blocks_02` is rubble, so both are wrong for this castle. The fortress now uses `castle_wall_slates` (grey coursed stone). Hall piers and walls use `marble_01` (large cut ashlar), desaturated with `StoneOpts.desat`.

**Post-processing:** SMAA's shader fails to build once two post chains exist (r184), so FXAA is the default.

## Performance (round 3)

Measured with `ravencrest.bench()` (GPU-inclusive). **WebGPU on this laptop selects the Intel Arc iGPU (`xe-lpg`), not the RTX 4070.** Windows Chrome ignores `powerPreference`. To use the 4070:

1. Windows Settings → System → Display → Graphics.
2. Add the browser and set it to "High performance".

Fixes:

- **Light pool** (`lights.ts`): all authored point lights are virtual. The K most relevant to the camera (6 on medium, 10 on high) drive a fixed pool, so shader light counts never change.
- **Packed textures** (`scripts/ravencrest/pack_textures.py`): AO, roughness and displacement in one RGB file (`ard.jpg`). Bump comes from screen-space derivatives of the sampled height. Triplanar fetches dropped from 18 to 6 per pixel.
- **Static batching** (`optimize.ts`): merges by material, shadow flags and collision flag. Hall 595 → 30 meshes; exterior 374 → 61. CPU submit fell from 22 to 11 ms.
- **Presets:** auto-detected (an integrated GPU gets `medium`: no exterior SSR, 2048 shadows). Dynamic resolution holds about 60 fps by adjusting render scale.
- **Cheaper shading:** fewer sky and fog noise octaves and fog cards. Dense scans (more than 20k triangles) don't cast shadows.
- **Results:** exterior on the iGPU went from 222 ms to about 57 ms at 1600×900, and about 35 ms at 0.7 render scale.

Known engine limits in r184:

- `shadow.autoUpdate = false` crashes.
- SMAA breaks once two pipelines exist.
- An offscreen output target occasionally never allocates. `capture()` falls back to copying the canvas.

## Round 4: two targets from one codebase

### Browser (first impression): Intel Arc iGPU at 60 fps is the baseline

Verified on the Arc iGPU (`xe-lpg`), production build, 1080p window, 720p internal render:

| | GPU (timestamps) | CPU (render + sim) |
|---|---|---|
| Exterior | 10.4 ms | 6.9 ms |
| Courtyard | 7.4 ms | 4.2 ms |
| Hall (SSR at 0.35) | 14.8 ms (measured at 0.5) | 4.3 ms |

What it took:

- **720p internal render with FSR1** (EASU upscale + RCAS sharpen) to the display. XeSS isn't reachable from browsers; FSR1 is the vendor-neutral equivalent. Dynamic resolution moves between 480p and 720p. Flags: `?res=`, `?fsr=0`, `?prof=1` (GPU timestamps).
- **CPU was the real bottleneck**, at about 0.1 ms per draw in r184:
  - The moon shadow map is off on the baseline (about 6 ms); a contact shadow sits under Jack.
  - All flames are one draw: GPU-billboarded quads with per-flame seeds (`fx.batchFlames`).
  - Identical triplanar materials are shared (cached), so batching merges across modules.
  - FXAA is dropped under FSR.
  - **Lean glow** replaces the 12-pass UnrealBloom on low/medium: threshold plus one quarter-res Gaussian, 3 passes.
  - Result: exterior CPU went from 26 to 6.9 ms.
- **G-buffer:** the extra targets are only allocated when SSR or TAA need them. **Gotcha:** materials using `setReflect` must not write `metalrough` when the pass has no such target, or they render flat. `setReflectEnabled()` handles this per level.
- **SSR is composited additively,** so reflections only add light. Replace-blending punched black blobs into wet roads.
- **Textures:** the 1k tier (`*_1k.jpg`, made by `pack_textures.py`) is for browser and iGPU tiers. Only diffuse, ARD and normal are loaded; the unpacked rough/ao/disp maps no longer upload.

### Windows desktop: `windows-native/Plajah.WinUI` (the only live Windows project)

- WebView2 is launched with `--force_high_performance_gpu` and WebGPU, so the game gets the discrete RTX GPU.
- The game detects the desktop app via `chrome.webview` on its own or the top frame, plus a discrete adapter, and selects **ultra**:
  - native-res internal render (cap 2160p), SSR at 0.75, 4096 shadows, 14-light pool, full bloom, 2k textures.
  - Smoke-tested with `?q=ultra`: no errors.
- `windows/PlajahApp.csproj` ("Plajah.App") is a stale older shell, superseded. Retiring it is pending the user's go-ahead.

### Shipping

- `node node_modules/vite/bin/vite.js build --config games/ravencrest/vite.config.mjs` → `public/games/ravencrest/play/` (about 1.1 MB JS, 320 KB gzipped).
- The main app mounts it in `components/taleo/RavencrestGameFrame.tsx` as a same-origin iframe in the Halloween "Haunted Exhibit". It defaults to the game when WebGPU exists, with one click to the classic exhibition.
- **Open:** the CC0 asset cache is gitignored. Production needs:
  - 1k textures (17 MB) and/or 2k textures (127 MB);
  - the used props;
  - `jack_thorne.glb` (6 MB).

  Deploy decision pending: commit vs. Storage/CDN. The desktop app could also bundle the 2k assets via WebView2 `SetVirtualHostNameToFolderMapping` for offline/instant loads.

## Round 3 additions

- **Hall:**
  - Round compound piers: drum core, eight shafts, moulded base, capitals.
  - SSR floor reflections (on in the hall at every preset except `low`).
  - Candle sconces in every aisle bay.
  - Gilt-framed paintings using the supplied concept art as canvases (`ravencrest/*.jpg`).
  - Thinner, darker carpet border; smaller chandeliers.
- **Courtyard:**
  - Plinths, string courses, cornices and quoins.
  - Recessed window surrounds with sills; chapel buttresses; stable knee braces.
  - Reflective puddles; red raven banners.
  - East postern gate.
- **Viaduct** (`viaduct.ts`, art callout "G. Outer wall & viaduct"):
  - Arched stone spans from the postern over the moat, with a corner landing.
  - A 232 m climb north at about 9% grade to a terrace on the crag. Its height comes from raycasting the crag mesh (about 20 m).
  - Lanterns, parapets, and a sealed iron gate to the upper ward. That is the next chapter's start.
- **Road:** sparse world-space puddle patches plus glossier wheel-track bands, replacing the streak mask that read as oil.
- **Audio** (`audio.ts`): reuses `services/halloween/halloweenAudioSfx.ts`.
  - Procedural organ music zones: crossroads, ground halls, upper noble.
  - Footsteps per surface (asphalt, bridge planks, stone, stair), timed to stride length.
  - Brown-noise wind outside and room tone inside.
  - Starts on the first click or key press. `?audio=0` mutes.

## Jack Thorne pipeline

1. Crop front, left and back from the sheet (`creation_3752922038`) and cut out the background: `public/models/halloween/hero_sources/`.
2. Run Tripo 3.1 multiview "detailed": 1.87M tris, 56 MB.
3. Meshy auto-rig: 24-joint humanoid.
4. Run `gltf-transform weld` then `simplify --ratio 0.035`: **65.5k tris, 6 MB** → `public/games/ravencrest/assets/characters/jack_thorne.glb`.
5. Locomotion (idle, walk, run) is retargeted at load from `public/models/halloween/base_rigs/Soldier.glb` (`src/character.ts`). This is a world-space delta retarget with rest-direction alignment and facing compensation.
   - Don't use `skeleton.pose()` on Meshy rigs. The root bone sits under a 0.01-scaled Armature, and `pose()` shrinks the skeleton 100×.

Credits spent on the pilot: 1,289 (cut-outs 9, model 1,160, rig 120).

## Known gaps (next passes)

- **Arrival art match:**
  - The distant castle needs its full spire cluster and the hall facade detail.
  - The crag needs rock and tree breakup.
  - Gate banners don't read.
  - The moat needs torch reflection streaks; the current SSR shows horizontal stepping on the water.
  - The road's SSR streaks reflect dark geometry instead of the fog band.
  - The left bank needs the art's dark rock and dead grass.
- **Jack:** the face is a soft likeness. The stick left over from the katana is still in his right hand. Hand poses aren't done. Katana and bat props and combat clips aren't built. Meshy's own catalog clips (120 credits each) would beat the retarget.
- **TRAA** renders black into the offscreen capture target. FXAA is the default until TRAA is verified in a live window.
- **Grand Hall vs. art:**
  - The piers are square, not round compound columns.
  - The floor reflects too little warm light.
  - The carpet border is too yellow.
  - The chandelier rings are too large.
  - The aisles need more candle pools.
  - The braziers sit behind the door leaves.
- **Courtyard:** the buildings are blockouts with real openings. They need trim, timber detail, windows with depth, and decals. Fog and value need a reference capture against the courtyard cells of the asset sheets.
- **Road:** puddle SSR still reads as dark patches in places.
- **Not started:**
  - Elise, the vampire, werewolf, zombie, wolf and "Unknown" (needs credit approval).
  - Gatehouse interior → courtyard → the five fortress levels (greybox from the floor-plan contract).
  - Music and ambience zones.
  - The minigame loop.
  - Integration back into Taleo's `HauntedCastleExhibition` entry point.
