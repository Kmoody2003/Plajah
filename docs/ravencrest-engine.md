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

## Round 5: the movie collection and the minigame (2026-10-22)

### Cinema Mile billboards and hall paintings (`src/cinema.ts`)

- The approach road now runs 110 m behind the art's frame (v < 0 is never in the reference shot). The spawn is at its far end, closed off by woods and a fallen trunk.
- Twelve lit billboards alternate sides along the road, with the Pumpkin Patch premiere board last and largest. Each has steel posts, a catwalk and gooseneck lamps (one pooled light per board).
- **Artwork:** each film's **Plajah Cinema cover** from `public/games/ravencrest/films.json`. Regenerate it with `npx tsx scripts/ravencrest/exportFilms.ts`, which reads `CURATED_HALLOWEEN_FILMS` and `PUMPKIN_PATCH_HERO_ALBUM`.
  - The Pumpkin Patch cover comes from Firebase Storage (CORS `*`), with a local fallback.
- The Grand Hall's gilt frames (aisles plus galleries) hang the same covers. The first frame on the left is the hero Pumpkin Patch frame.
- Walk up to a board or painting and press **E** (or tap the prompt) to open the film card. **Watch full movie** posts `{type: 'ravencrest:watch', id}` to the parent page.
  - `RavencrestGameFrame` (same-origin check) calls `onWatch`.
  - `MoviesTVView` routes `onWatch` to the Pumpkin Patch album or the matching `CURATED_HALLOWEEN_FILMS` archive video in the Cinema player.

### Combat, monsters, encounters (`src/game.ts`, `src/mobs.ts`, `src/encounters.ts`)

- **Jack's moves:** the grindhouse survivor's bushido set (high cleave, low sweep, mid combo, kata finisher, molotov throw, ready stance), retargeted onto Jack at load.
  - The grindhouse skeleton's `_L`/`_R` names are mirrored relative to its mesh. `RigSpec.mirror` mirrors the motion so the katana stays in Jack's right hand.
  - The katana is procedural and mounted on the `RightHand` bone.
- **Controls:**
  - **Double-tap and hold** a move key to sprint (Shift also works).
  - **Left click** (or **J**) is the basic attack. Pressing again in the back half of a swing chains up to 3 hits. With the pointer uncaptured, a quick click attacks and press-and-drag still looks around.
  - **Right click** (or **Space**) rolls: a procedural forward tumble with i-frames.
  - **1/2/3** pick the HIGH/MID/LOW stance. Each stance has a weak-point target: HIGH vs werewolf and Stitch, MID vs ghost, LOW vs zombie.
  - **G** throws a molotov: 3 max, refills every 25 s and on level-up.
  - Attacks soft-lock onto the nearest monster in front.
- **Progression:** HP, XP and levels (+15 max HP per level), a reward feed, callouts, a damage vignette, and monster HP bars. If Jack falls, he respawns at the last door.
- **Monsters:**
  - Zombie, werewolf and ghost come from `monsters_enemy_rigs.glb`, and their motion is retargeted from the grindhouse monster clips. The pack's own clips only key three finger bones.
  - Placement: the Cinema Mile has 7, the bailey 4, the viaduct 2 and the hall 6, with ghosts on the galleries.
  - AI cycle: wander → chase → strike (hit frame at 45%) → hurt/knockback → sink → respawn after 35 s.
  - They are culled by distance and frustum in `game.ts` because skinned meshes skip three's own culling.
- **Pumpkin Patch encounters** (ported `SPARSE_ENCOUNTERS`): each fires once, shows its comic panel, script line and timecode, and has a "Watch this scene" button.

  | Encounter | Where | What happens |
  |---|---|---|
  | Tank | Cinema Mile | Drives the road; its turret clears monsters |
  | Miriam | Before the bridge | Cameo with the witch-laugh SFX |
  | Pumpkin Patch | Bailey | Joins as an ally for 75 s |
  | Stitch | Viaduct terrace | 320 HP boss |
  | Commander Crane | Hall foyer | Cameo |
  | Lil' Boo | Galleries | A light-orb companion |

  The cast rigs come from `pumpkin_patch_cast_rigs.glb`.

### Character drop-in contract (Meta Muse)

The cast and monster models here are stand-ins. Art-matched replacements drop in without code changes beyond the URL/node names in `KINDS` (`src/mobs.ts`) or `JACK_URL` (`src/character.ts`).

- **Format:** one GLB per character. Y-up, metres, **facing +Z**, feet at the origin, scale applied, no 0.01 armature tricks.
- **Skeleton (either form):**
  - Mixamo-style names: `Hips, Spine, Spine1, Spine2, Neck, Head, LeftShoulder, LeftArm, LeftForeArm, LeftHand, …, LeftUpLeg, LeftLeg, LeftFoot, LeftToeBase`.
  - Or the 17-joint set: `Hips, Spine, Chest, Neck, Head, UpperArm_L/R, LowerArm_L/R, Hand_L/R, UpLeg_L/R, LowLeg_L/R, Foot_L/R`, with `_L` on the character's **anatomical left** (+X when facing +Z).
- **Budget:** heroes 40–70k triangles, monsters 15–30k. One skinned mesh, at most 3 materials, 2k PBR (base colour, normal, ORM).
- **Clips, if supplied** (otherwise the engine retargets its library): `idle, walk, run, attack_1, attack_2, attack_3, hit, death`. Monsters add `chase`. Clips are in place: no root motion on the hips' horizontal axes.
- **Output:** `public/games/ravencrest/assets/characters/<name>.glb`, then review with `?ref` and portrait captures against the sheets.

Still missing: hit and death clips (death is a sink-and-fade), hand poses, the survivor gender choice (waiting on Elise), and Meta Muse models for every monster and cast member.

## Round 6: feel, fights, the upper wing, sound and looks (2026-10-22)

### Combat
- **Fight animations** (`src/fightClips.ts`): katana moves authored as key poses (sword-hand position + blade direction in character space, torso twist and lean, hip drop and lunge, whole-body spin) and baked onto Jack's own skeleton at load.
  - Two-bone IK drives both arms, with the left hand riding the grip, and both legs in a planted stance.
  - Moves: `combo` (flat cut), `backhand` (rising), `cleave` (overhead), `sweep` (crouching), `kata` (whirlwind finisher), `throw` (left-hand molotov).
  - This replaces the grindhouse retargets, whose mirrored source rig flipped Jack's head backwards.
- **Mash chain:** each press is buffered and cuts into the next angle once the current cut has landed.
  - The stance picks the opener; then backhand → cleave → sweep → combo; the whirlwind finisher comes every sixth press.
  - Attacks pick the best target (close, and in the steering or look direction) and close the gap with a lunge.
  - Rolling (right click or Space) cancels any swing.
- **Monster tactics:** only the two closest engaged monsters may attack; the rest circle at about 3 m. Bodies push apart from each other.
- **Defeats:**
  - Each monster type dies its own way (`gore.ts`): zombies and Stitch fall apart into rigid skinned chunks; werewolves are beheaded and bleed from both stumps; ghosts dissolve in an ectoplasm vortex; vampires and the Unknown crumble to ash; wolves play their death clip.
  - All deaths add a shockwave ring, embers and a light flash. Effects run as single-draw particle batches (`vfx.ts`).
- **Feel:** hit-stop on impact, slow-motion orbiting "slice cam" close-ups on finishers and some kills, a camera kick on each hit, and blade trails.
- **Power:** +5% damage per defeat (capped at ×3), plus a kill-streak bonus.
  - Tier callouts: Blade awakens, Ember edge, Inferno edge, Hellfire, Wrath of the Pumpkin King.
  - The blade glows hotter with power, from steel to ember to white-hot.
- **Helper orbs:** will-o'-wisps that orbit Jack, light the scene through the light pool, dart out to zap monsters, and heal him slowly when he drops below 45% HP. Another joins every fifth defeat, up to five.

### Movement, camera, collision
- **Nimble movement:** walk 2.0 m/s, run 5.6 m/s; acceleration 20 and deceleration 26 m/s²; turning 16 rad/s; Jack banks into turns.
- **Sprint:** double-tap and hold a move key.
- **Camera:**
  - It never turns while the player is steering. Turning it then bent camera-relative movement into circles.
  - It eases behind Jack only when he walks straight ahead with the mouse idle.
  - Combat framing re-aims only while the player stands their ground, then pulls back and tilts down.
- **Collision:**
  - Movement is sub-stepped (≤12 cm per step) so sprints, rolls and lunges can't tunnel into thick stone.
  - Velocity slides along walls.
  - An anti-stuck net returns Jack to a recent safe spot if he is wedged on six or more of eight sides.
  - Stuck-scans of the hall (about 1,100 points) and the fortress exterior (about 1,900) found no traps.

### The castle
- **Look-at lock-on:** hold your view on a billboard or painting; it brackets, and locks after 0.6 s. Enter or a click then plays the film; in a fight, a click stays an attack.
- **Cards:** the film card and the comic encounter panel are side panels that never take control.
- **Preloading:** encounter assets (cast rigs, tank, comic panels) preload in the background, which removes the hitch when a card popped up.
- **Entrance cutscene:** press E at the Great Hall doors.
  1. The doors groan open with an echo.
  2. The camera cuts to the far end of the hall and cranes down as Jack walks in.
  3. The doors slam behind him.
  4. The camera flies in to settle behind Jack, and control returns.

  The doors swing open again when you walk back toward them, and the cutscene can be skipped.
- **Upper wing** (`grandHall.ts`): doorways in the back wall at landing level lead to a cross corridor, a library, a projection room and a banquet hall.
  - The projection room has a screen showing the Pumpkin Patch cover; it plays like the other posters.
  - The wing is furnished with Poly Haven props and lit by sconces and chandeliers.
  - Monsters: a werewolf in the corridor, zombies in the library, a ghost in the cinema, and a vampire and a zombie in the banquet hall.
  - A full walk circuit was verified: stair → landing → east door → banquet → cinema → library → west door → galleries.
- **Hall spawn:** moved 4 m deeper so the follow camera is never left behind the shut doors.

### Rendering
- **Reversed float depth buffer, near/far 0.15–4000 m:** fixes the z-fighting ("texture tearing") on close layers.
- **Anti-aliasing:** FXAA now runs before FSR1, and RCAS sharpening is gentler (0.6 with denoise); before, it amplified texture sparkle.
- **Looks** (`looks.ts`):
  - **LUTs:** Plajah's `CINEMATIC_LUTS` are baked to a 33³ 3D texture and graded by `lut3D` in the post chain, after an explicit `renderOutput` (tone map and sRGB).
  - **Lenses:** Silent film, Grindhouse, VHS, Found footage, Night vision and Heat run through `services/lenses/lensEngine` on a 960 px copy of each frame, drawn over the game.
  - The ML lenses (comic, pixel, ASCII, matrix, face filters) are left out, because their models would sink the Intel baseline.
  - Controls: V cycles lenses, B cycles LUTs, and the LOOK chip opens both lists.

### Sound (`audio.ts`, `sfx.ts`)
- **Score:** the Dracula overture (Lorea book score, Chora render) loops, loudness-normalised, as `public/games/ravencrest/audio/dracula-overture.ogg` (5.5 MB Vorbis), at 0.38 outside and 0.32 inside.
  - `public/games/ravencrest/music.json` can point it at a Chora HLS stream (`{ "hls": "…m3u8" }`) once the overture is published as a Chora track.
- **Ambience:**
  - Outside: gusting two-layer wind, owls, crickets, ravens, distant wolves and thunder.
  - Inside: room tone, fire crackle, drips, timber creaks and chains.
  - Interiors send into a 3.5 s stone-hall reverb.
- **Footsteps:** heel and toe strikes per surface (wet asphalt, planks, flagstone with echo); running is harder and quicker.
- **Combat and magic voices:** all layered synthesis — swing, hit (per creature), kill boom, slice-cam drop, the per-type deaths, orb zap, power-tier choir and bell, level-up bells, molotov, roll and hurt.

### Meta Muse delivery (`Ravencrest Assets/`)
- **Monsters:** the zombie, werewolf, vampire, wolf (quadruped) and the Unknown ship to the contract with baked clips (idle, walk, run, chase, attack_1..3, hit, death). They now replace the stand-ins and play their own clips.
  - Their textures were cut to 1k WebP (about 3 MB each, down from 14 MB) in `assets/characters/muse/`.
- **Quality:** they are procedural blockouts (primitive shapes, painted faces), so they read as the right creatures but are not art-matched.
- **Jack and Elise:** Muse's Jack is a mannequin next to the Tripo/Meshy Jack, so the existing Jack stays, and Elise is not used yet.
- **Tank:** the tank model still needs an art-matched rebuild (deferred by the user until the rest is at par).

### Intel 720p baseline (`?prof=1&dynres=0`, this round)
| Area | GPU | CPU |
|---|---|---|
| Cinema Mile | 10.5 ms | 5.0 ms |
| Bailey | 12.8 ms | 6.4 ms |
| Grand Hall | 4.0 ms | 6.6 ms |

## Round 7: the storm, the nightmare, Dracula, daybreak (2026-10-22)

- **Weather** (`weather.ts`):
  - The night starts clear. From 60 s the storm builds over 90 s: the cloud deck thickens and races (sky `uStorm`), the wind rises, and rain falls.
  - **Rain:** one instanced draw, positioned on the GPU in a box that travels with the camera, slanted by the wind, with splashes on the collision floor.
  - **Lightning:** branching bolt ribbons, 2–3 flash pulses on the sky (`uFlash`), the moon/fill/hemisphere rig, a hall fill light and the rain itself. Thunder arrives after distance ÷ 343 m/s: close strikes crack, far ones rumble.
  - **Sound:** the rain bed and the wind follow the storm.
- **The nightmare** (`nightmare.ts`): if no film has been chosen 120 s in (`?nightmare=N` shortens the wait; `ravencrest.nightmare.trigger()` starts it):
  1. **Toll:** the tower clock bell tolls four times; "Dracula Is Here" starts. The world dims toward silhouettes: light-pool scale, the light rig, environment intensity, exposure, billboard and painting glow, and the sky (`uDim`). The orbs brighten to become the main light.
  2. **Stalk:** laughs come from all around, closing from 30 m to 5 m; a heartbeat quickens. The figure darts across the edge of the frame (14–32° off centre), sometimes caught by lightning, and once stands right behind Jack until you look.
  3. **Reveal:** Dracula walks out of the dark; a low camera beside Jack, an organ sting, lightning, and the title card.
  4. **Boss:** 1600 HP, with a life drain on every hit he lands. Every 7–10 s he teleports through mist behind you and strikes. His bat summons are real bats (`bats.ts`) that wheel around Jack and dive, and every bat can be cut down. At 2/3 and 1/3 HP he turns to untouchable mist and calls two wolves.
  5. **Defeat:** "The Count claims Ravencrest"; you rise and the reveal plays again.
  6. **Victory:** ash, bats and lightning, then "Dracula defeated".
- **Dracula's look:** the Muse vampire, darkened, with a faint cold fresnel rim, burning red eyes and a dim red aura light. A primitive blockout; it needs a real model.
- **Daybreak** (`daybreak.ts`, `grass.ts`), 2.5 s after victory and lasting 15 s:
  - The storm dies away for good (`weather.calm`), and the sky blends to a blue morning with a sun and fair-weather cumulus (`uDay`).
  - The key light swings from moon to warm sun; the hemisphere goes from sky blue to grass; the environment, exposure and fog lift to a pale haze; the firs turn green.
  - Birdsong replaces the night creatures, and the orbs fade to soft motes.
  - Grass and wildflowers grow back in a ring spreading out from where Dracula fell: one instanced draw, six tapered blades per card, swaying.
- **Music:**
  - `public/games/ravencrest/music.json` lists `{ id, title, mood, lead?, gain?, hls?, url? }`; `games/ravencrest/score.json` is the source list.
  - Exploring: the lead track (the Dracula overture) always opens; then "Ombra di Trombone" and "Ombra di Trombone (Alt)" play in random order, crossfading 4 s before each ends.
  - "Dracula Is Here" is the dread track: it starts with the bell and carries the stalk and the fight, played louder for the boss.
  - Per-track `gain` level-matches the tracks to about −19 dB RMS.
- **Chora HLS:** `scripts/ravencrest/publishScore.ts`, run with `PLAJAH_AGENT_EMAIL` and `PLAJAH_AGENT_PASSWORD`.
  - It uploads each master to `users/{uid}/ravencrest-score/` and calls `/api/chora/transcode` (trackId `ravencrest_{id}`).
  - It then writes the `hls` URLs into `music.json`; the game streams them through hls.js and falls back to the bundled files.
- **Camera:** the follow camera is the default. It sits centred behind Jack; the mouse and A/D turn him, W moves forward and S backs up. Rolls sidestep without swinging the camera. O toggles the orbit camera, which keeps camera-relative movement.

- **Controls (after user feedback):**
  - Default movement: W/A/S/D go where you press on screen, Jack turns fast to face that way, the mouse looks (sensitivity 0.003).
  - The camera is centred, swings in behind Jack only while he runs straight ahead, and never turns itself toward fights.
  - O toggles tank mode.
  - Combo lock: the target is kept for the whole combo and tracked through each swing until the blow lands; a lunge closes to 1.15 m; the locked target is hit even slightly off-arc; reach +0.4 m.
- **Image quality:** temporal AA (TRAA) is on by default (`?taa=0` turns it off), and Intel dynamic resolution won't go below 600p. This addresses crawling and shimmering jaggies while the camera turns.
- **Jack is now Meta Muse's model** (`assets/characters/muse/jack_thorne.glb`, 1k WebP): contract bones and its own baked idle/walk/run.
  - The fight moves bake onto it through a role alias (`Spine02→Spine`, `Spine01→Spine1`, `Spine→Spine2`, `neck→Neck`).
  - `?jack=meshy` brings back the Tripo/Meshy model, which has a face baked onto the back of its head.
- **Orbs against Dracula:** they turn purple-iridescent and fire celestial beams at him every 1.5–2.3 s each. Each beam is a hue that flows along it, a white core and violet stardust, for 10 × power damage.
- **Peace:** the daybreak removes every monster in both levels (smoke), nothing respawns, and the Stitch encounter is skipped; the castle is free to explore and to pick films.

## Round 8: Jack's head, combo comic, horde + tank (2026-10-22)

- **Jack** is back on the Tripo model (the Muse Jack was rejected; `?jack=muse` still loads it). The face Tripo baked onto the *back* of his head is removed offline by `scripts/ravencrest/fixJackHead.py` (ray-cast the triangles visible from behind, pull the back of the skull onto a fitted ellipsoid, Laplacian-smooth, repaint the texture with his hair colour). Source kept untouched at `games/ravencrest/assets-src/jack_thorne.tripo.glb`:
  `python scripts/ravencrest/fixJackHead.py games/ravencrest/assets-src/jack_thorne.tripo.glb public/games/ravencrest/assets/characters/jack_thorne.glb`
- **Combo comic** (`comic.ts`) replaces the slice cam (which framed far-off things in close-up). Each landed hit snapshots the next rendered frame (cropped around Jack); on the 3rd hit of a chain, or a finishing kill, the last three hits slam in as a slanted three-panel strip with SFX lettering for 1.7 s (6 s cooldown). The game camera never leaves the fight. `afterRender` must run in the same task as the render (WebGPU canvas is only readable before presentation).
- **Horde + tank** (`game.ts` `updateHorde`): on the Cinema Mile, outside any scripted event, with no peace, and with a 100 s first cooldown, 12 mixed monsters (aggro ×4, `horde=true`) charge down the road. When they close in, Jack rolls to the roadside and Pumpkin Patch roars up the road at 12 m/s with Melvin and Lil' Boo laughing, flattening everything within 4.2 m, turret every 0.45 s. Real-time cut: over-the-shoulder in the ditch, then tracking, then wide. Afterwards stragglers die, control returns, and the next horde is 120 s off. The tank never appears outside a horde.

## Round 9: the bridge battle (2026-10-22)

`bridgeBattle.ts` + `kraken.ts`. Stepping onto the drawbridge from the near end rolls a 50% chance (`?bridge=1` makes it every time). Each crossing rolls once, with a 4-minute cooldown after a battle. It never starts during the nightmare, a horde, or after peace. The nightmare's two-minute countdown holds while the battle runs, and hordes don't start.

- **Entry:**
  - **rumble:** the deck shudders and water boils under the edge.
  - **flip:** the troll somersaults up from under the bridge onto the deck about 6.5 m ahead of Jack.
  - **roar:** title card, then control returns.
  - The camera is a real-time cutscene over Jack's shoulder.
- **Troll** (`KINDS.troll`): 900 HP, 3.2 m.
  - The stand-in is the Muse werewolf re-dressed as wet slate-green with a cold rim and amber eyes, until `bridge_troll.glb` arrives (brief: `docs/ravencrest-muse-brief-troll-kraken.md`).
  - Its blows shake the camera hard and split the planks (`game.onTrollSlam`).
  - When it dies it topples off the deck into the moat.
- **Kraken** (4 s in): eight procedural 14 m arms, placed four a side around the fight. Each is a FABRIK chain re-skinned every frame, with sucker rows on the inner side and teal seam freckles. They:
  - **slam** at Jack: they rear up and whip down; roll out of the way. A hit deals 18 damage and splits the deck.
  - **rip** out rail spans with the posts and fling them into the moat.
  - **swat** at flying monkeys, knocking them into the water; they respawn.
  - **slap** the water.
- **Bridge damage:** the deck is 3.4 m wide. Holes bite only the edges, and a middle walkway stays whole, with Jack pushed out of holes. Torn-out rails keep their collision, so there is no falling into the moat.
- **Miriam + monkey squadron** (11 s in): they arrive from over the castle.
  - Miriam rides her hover broom like a surfboard, with a green levitation ring and light. She casts green witch-lightning bolts that make the arms recoil.
  - The 12 flying monkeys are instanced (3 draws), with flapping wings and rifle bursts as tracers.
- **Finale** (troll under 25% HP): the squad drops low and strafes the troll, and Miriam blasts it. Helper damage stops at 6% HP, so Jack lands the kill.
- **Victory:** the arms sink and the squad wheels away. **Jack down:** the troll slinks off, the arms sink, and the event re-arms.
- All timing runs on sim time (`later()`), not setTimeout, so `ravencrest.simulate` drives it. Debug: `ravencrest.bridgeBattle.trigger()` while on the bridge.
- **Mobs** now hold their ground inside 80% of their reach instead of shoving Jack while their swing cools down.

## Round 10: grand stone bridge, controls, Melvin, local character pipeline (2026-10-22)

- **The bridge** (`arrival.ts`):
  - The moat now lies in a rock gorge (`WATER_Y = -12`; the road and apron banks fall away with `gorge()`). The fortress, gate plinth and banners are measured from `WATER_Y`, so they extend down with it.
  - The plank drawbridge is now an 8.5 m stone viaduct: four round arches (an extruded elevation with arch holes), arch rings, a cornice band and corbel table, and cutwater buttresses at the piers.
  - It has a carved balustrade in 4.4 m sections, which the kraken tears out (lantern columns are `fixed` and never ripped), plus newel posts and lantern columns every 8.8 m with iron cages and real flames.
  - The bridge mouth is a stone bastion with parapet walls on its gorge edges.
  - Kraken arms are now 22 m so they still tower over the higher deck. The troll hangs under the deck edge before its flip.
- **Camera:** whenever the mouse rests, it settles behind Jack: quickly running straight, gently on diagonals, also standing and fighting. It stays put only on a pure sidestep or when backing up. `faceThreat()` makes it hurry behind after a hit from behind.
- **Jump:** Space jumps (6.4 m/s, with 0.12 s of coyote time). Roll moved to C, L or right-click.
- **Turn to face the attacker:** a blow from behind or the side turns Jack to face the attacker within about 0.2 s and locks his swings onto it.
- **Courtyard door steps:** they are now solid, with a hidden collision ramp over the noses. Verified: 0.15 m to 0.75 m with no snag.
- **Melvin (Pumpkin Patch):** allies follow a slot beside and ahead of Jack (camera-right). `clearSightline()` pushes them out of the camera-to-Jack line every frame. `game.summonMelvin()` brings him into the Dracula boss fight 4 s in.
- **Local character pipeline** (no credits): `scripts/ravencrest/autoRig.py` and `posePreview.py`.
  - Concept sheet views are cut out with rembg, then shaped with Hunyuan3D-2mini on the Tela 3D runtime (`127.0.0.1:51124`), then painted from the views (`engines/tela-3d/paint_from_views.py`).
  - `autoRig.py` fits the Muse contract skeleton into the new body (slice clusters for limbs, cross-sections for the spine) and computes envelope weights. It keeps Muse's baked clips: rotations stay, bone translations are replaced, hip motion is scaled.
  - Tested on Jack with the vampire rig.
  - The troll (werewolf rig) and Dracula (vampire rig) are pending a Hunyuan run. The first attempt failed with "paging file too small" while another session had the 4070 and RAM busy.

## Round 11: Muse's troll, Dracula and kraken arms in-game (2026-10-23)

- **Muse delivered unrigged base models** in `characters/bases/` (`bridge_troll.glb`, `dracula.glb`) and `creatures/bases/` (`kraken_tentacle_a/b.glb` plus emissive masks, built by `scripts/ravencrest/build_kraken_tentacle.py`).
- **Troll and Dracula:** rigged locally with `scripts/ravencrest/autoRig.py`. The troll uses the werewolf skeleton and Dracula the vampire skeleton, so both keep Muse's idle/walk/run/chase/attack_1-3/hit/death clips. Checked with `posePreview.py`; `glbTurntable.py` renders static turntables.
  - Output: `characters/bridge_troll.glb` and `characters/dracula.glb`, which `KINDS.troll` and `KINDS.dracula` now load.
  - The troll stand-in dress is skipped. The nightmare keeps Dracula's colour at 0.85 (was 0.32) with its rim light and eyes.
- **Kraken:** `Tentacle.useModel()` skins Muse's straight 14 m arm, scaled to 22 m, onto the procedural chain: one bone per chain point, framed like the tube with the suckers on +Z. The emissive pulse runs per arm. If the GLBs fail to load, the procedural tube remains.

## Round 12: enemies fight back, ledge guard, bridge flow, culling (2026-10-23)

- **Guard:** `KINDS[*].guard` sets deflect and evade chances. They apply while a monster is on guard: not swinging, not reeling, and not hit in the last 1.1 s, so combos still flow once they connect. Finishers always land.
  - A **deflect** gives a parry clang and sparks, knocks Jack back with a hit-stop, and the monster answers at once (cooldown 0).
  - An **evade** is a sidestep-and-back hop with a puff of smoke.
  - Profiles: troll 30% deflect; werewolf and wolf 25–30% evade; vampire 15%/30%; Dracula 25%/25%; Unknown 30% deflect; Stitch 20%/10%. Zombies never do either.
- **Troll:** faster (walk 1.9, run 4.6), with a 0.55 s swing cooldown. Every 6–8 s it does a telegraphed ground slam: it rears up roaring with dust and a shudder, then a 5 m shockwave hits for 20 unless Jack is airborne (jump) or rolling.
- **Bridge battle flow:** it rolls only while Jack is running across, 30–50% of the way toward the gate, no longer on the first step.
- **Ledge guard** (`player.step`): a grounded step onto a drop deeper than 2.5 m (or no ground) is refused. This closes the castle wall gaps and the gorge edges, and ends the fall → respawn → fall camera loop.
- **Perf:** monsters more than 48 m away aren't drawn (each Muse monster is about 51k skinned vertices). Note: the iGPU readings swung between 50 and 130 ms while another session was loading the machine. Re-measure on a quiet machine.

## Round 13: the cast built locally (2026-10-23)

- `scripts/ravencrest/buildCast.py` builds each character, one GPU job at a time on the Tela 3D runtime with an 83 °C gate:
  1. Crop the sheet views and cut them out (rembg), upscaling small turnarounds.
  2. Generate the shape with Hunyuan3D-2mini.
  3. Keep the largest connected piece; Hunyuan leaves floaters and a ghost partial body.
  4. Paint it from the views with `paint_from_views.py`.
  5. Rig it with `autoRig.py` onto a Muse contract rig.
  6. Write a pose sheet.
- **autoRig arm tracker:** it follows the arm only while it is a separate outer limb and stops where that limb ends. The old tracker ran on down the leg, so the legs swung with the arms. When the arms never separate from the body, it falls back to the mapped joints, never below 60% of hip height.
- **Built** (`assets/characters/*.glb`, 17–23k vertices each, against Muse's ~51k blockouts):

| Character | Source | Rig |
|---|---|---|
| zombie | monsters_sheet | zombie |
| werewolf | monsters_sheet | werewolf |
| vampire | monsters_outbreak | vampire |
| unknown | monsters_unknown | unknown |
| stitch | stitch sheet | zombie |
| melvin | pumpkin_patch_sheet | vampire |
| miriam | miriam_sheet | vampire |
| crane | stitch sheet | vampire |
| elise | survivors_jack_elise | vampire |

- **In game:** `KINDS` now loads all of these. Pumpkin, Miriam, Robobones and Stitch moved off the rig17 grindhouse retargets onto baked contract clips. Elise is built but not used in-game yet.
- **Not built:** the wolf (a quadruped; autoRig is biped-only), so the Muse wolf stays, and the tank (a static prop; the existing model is kept). The ghost keeps the rig17 enemy rig.
- **Perf note:** with the whole machine saturated by other sessions (RAM full, CPU busy), iGPU frame times read 55–95 ms, even at 360p. Re-measure on a quiet machine before optimising further.

## Round 14: wolf, war-rig tank, backs, mocap walks, film voice lines (2026-10-23)

- **Wolf:** built from its side profile on monsters_unknown; the mirrored profile paints the far flank. `autoRig.py` now fits quadrupeds: on the Muse wolf skeleton (Pelvis, SpineQ, Chest, NeckQ, HeadQ, ears, four legs, tail), legs go through their quadrant's cross-sections. Left/right weight separation now goes by joint side, not name. `buildCast` options: `flank`, `yaw`, `static`, `mirror_back`.
- **War-rig tank** (`assets/vehicles/war_rig_tank.glb`, 6.45 m, faces +Z): shaped from the side profile and painted from the side, front and back orthographic views. The horde tank run uses it, falling back to the old primitive tank.
- **Backs:** front-only characters (zombie, werewolf, Stitch, Crane) get a synthesised back view, the mirrored front with the head blurred so no face lands on the back of the head.
- **Mocap locomotion:** CMU motion capture (DAZ-named FBX, `assets/mocap/`) is retargeted at load onto the contract skeleton (`CMU_TO_CONTRACT`, `KINDS[*].mocap`). Melvin walks on 35_01, Miriam/Stitch/Crane on 02_01, and all four run on the 02_03 jog. The two walks came from the project's existing source, huggingface gbionics/cmu-fbx. `retarget()` now measures a skeleton-only source's feet from its lowest bone; the empty mesh box had flung the hips off-screen.
- **Voice barks:** `scripts/ravencrest/clipVoices.py` clips 13 lines from the Pumpkin Patch film's Mux stream, using the comic balloons' panel timecodes (short single-speaker windows only), into `audio/voices/*.mp3` + `voices.json`.
  - `game.bark(kind, id?)` plays a line with a subtitle, at most every 8 s per character.
  - Cues: Melvin on the blades encounter, `summonMelvin` and the tank rescue; Miriam on her encounter and the bridge squad; Stitch and Crane on their encounters.
  - The windows are coarse and no speech recognition was available, so each clip should be listened to once.

## Round 15: progression, start menu, achievements, monster mocap, camera (2026-10-23)

- **Progression:** the Dracula nightmare now begins only once the Bridge Troll is beaten (`bridgeBattle.defeated`) and Jack is in the Grand Hall (`NightmareDeps.ready`); the toll comes 10 s in, with `?nightmare=` to override.
  - At 55% life in the hall comes the **blast** phase: wind-up, white flash, Jack knocked back and `eject()` → courtyard.
  - **flyout:** `game.relocate()` moves the Count to the outside level, he swoops down from above the front door, and the storm is forced on. The fight then resumes outside.
  - The troll roll stays 50/50, but the next crossing is certain once Jack has been inside the castle without meeting it. It triggers in either direction across the bridge. `?troll=done` is a debug skip.
- **Escalation:** `Mob.power` and `Mob.haste` give three tiers by life, for the troll (×1/1.25/1.5 damage, ×1/1.12/1.25 speed) and Dracula (×1/1.25/1.55, ×1/1.15/1.32). Slams, teleports and swarms come faster per tier. Jack flinches on every hit (`player.flinch`).
- **Start menu** (`#menu` in index.html):
  - Pick **Jack or Elise** (`loadJack(hero)`; Elise walks and runs on the CMU 02_01/02_03 mocap) and read the brief: films on the road and in the Grand Hall, or cross the bridge, defeat Dracula and break the curse.
  - `?hero=` skips the menu.
  - A one-time Grand Hall hint says the paintings are films.
- **Achievements:** the game posts `{type:'ravencrest:achievement', trigger}`. `RavencrestGameFrame` saves them with `unlockAchievementByTrigger` and shows the toast with `registerAndUnlock`.
  - Triggers `RAVENCREST_TROLL_SLAYER`, `RAVENCREST_DRACULA_SLAIN` and `RAVENCREST_CURSE_BREAKER` are in `types.ts` and `BASE_ACHIEVEMENTS` (now exported).
  - The catalog docs must be seeded once by an admin: `scripts/ravencrest/seedAchievements.ts`.
- **Scene cards:** never during an event (the nightmare, the bridge battle or a horde). Proximity encounters wait; the tank rescue plays without its card.
- **Ghost:** rebuilt from the monsters sheet's banshee, still translucent and floating.
- **Monster mocap** (labelled CMU via `metadata.csv`): zombie 104_41 ZombieWalk / 120_22 Zombie, troll 120_02 Gorilla, werewolf 139_29 Sneaking, Unknown 104_03 Frankenstein walk. `strideCycle()` cuts one clean loop from the steady middle of each take.
- **Camera:** the follow point is smoothed (with look-ahead) and the camera sits exactly on its boom, so Jack stays centred. The boom snaps in at walls and eases out, the fight pull-back is no longer discarded, and the shake is smooth.
- **Perf** (medium tier): no normal/roughness G-buffer when SSR is off; grass 8k, rain 1.8k, 4 pool lights, dynamic-resolution floor 480.
  - Frame cost read 25–46 ms on the iGPU, scene-bound (post adds ~5–10 ms). Readings were too noisy under machine load to attribute finer.
  - Timing method that works with the pane hidden: render + 4×4 canvas readback.
- **Visuals:** the moat water plane is now 9 km, so its edge stays in the fog. All the cinematic LUTs apply; Kodak 2383 shows green-yellow blotches in bright clouds (a library LUT data issue).

## Round 16: woods, road, mist, lens, AI, input, mobile tiers, title screen (2026-10-23)

- **Woods** (`forest.ts`, ez-tree MIT): 11 variants (pine L/M/S, oak, ash, aspen, bare dead oak/ash), each normalised to height 1.
  - Game node materials: bark textures, alpha-cut night-graded foliage, and wind via `positionNode`.
  - Near the road: full 3D instanced trees (~120 + 45, plus "leaners" tipped over the lanes for the overgrown look the user asked for). Behind them and on the crag: crossed-quad impostors baked once into render targets (`bake()`). V is flipped because WebGPU stores render targets top-down; unflipped, the trees hung upside-down.
  - Textures are copied to `assets/trees/` (sources in SOURCES.md). `Forest.density` scales the counts on phones.
- **Road** (`wetAsphalt`): damaged-road scan blended by world noise, macro tone, muddy verges, leaf specks, puddle wheel tracks, and rain ripples (`rainAmount` from weather).
- **Ground:** moss patches (mossy_rock), leaf litter, lighter grade.
- **Mist** (`mist.ts`): noise sheets in the road valley and the gorge that fade near the camera; one layer each on low/medium. The moat water plane is now 9 km.
- **Lens** (`lensSplatter.ts`): blood/dirt splats on the camera when Jack is hit, on close kills and blows, the tank crush, and troll and kraken slams.
- **AI:** inside its reach between swings a monster circle-strafes instead of standing; nimble kinds hop back after attacking. Standing still gets you killed.
- **Input** (`input.ts`):
  - Standard gamepad: LS move/run, RS look, A jump, B roll, X/RT attack, Y molotov, RB use, D-pad/LB stance, R3 recentre, Menu/A start.
  - Touch (coarse pointer): floating joystick, look-drag, Attack/Roll/Jump/Use/Molotov.
  - `PlayerController.stick` / `look()` / `recenter()`.
- **Tiers:**
  - Windows app → 'ultra' (RTX 4070); browser Intel iGPU → 'medium' (main target); discrete browser GPU → 'high'.
  - Phones and the Android app (Capacitor) → 'medium' for Adreno 7/8, Apple and Mali-G7/Immortalis, otherwise 'low'.
  - Phones target 30 fps (`frameTarget`). The dynamic resolution may climb to 1.5× the tier height when there's headroom (`resMax`).
  - Low drops TAA for FXAA.
- **Title screen:**
  - Scarier styling (flicker, fog drift, scanlines, blood-red accents).
  - A live cinematic dolly up the road behind it (`menuCamera`).
  - Hover/select/start sounds (`Sfx.uiHover/uiSelect/uiStart`), Enter starts, and an "awaken" prompt (audio needs a gesture; the score starts on it).
  - The brief and hints say films are on the road and in the Grand Hall.

## Round 17: recorded sound bank, touch-laptop fix, Jack's hair (2026-10-23)

- **Sound bank** (`samples.ts`, `public/games/ravencrest/audio/sfx/`): 154 CC0 recordings in 50 banks, 4.2 MB.
  - Sources: Freesound (CC0 filter, HQ previews), Kenney Impact Sounds + RPG Audio, and rubberduck's "80 CC0 creature SFX" and "75 CC0 breaking/falling/hit" (OpenGameArt). Per-file sources are in `CREDITS.md`.
  - Built by `scripts/ravencrest/buildSfx.py <packs dir>`: trims one-shots to the event, levels them to a per-bank RMS, and crossfades the loops. Add or swap takes by editing `BANK`.
  - `audition.html` in the same folder plays every take.
  - Runtime: the bank is decoded at audio start, and `play()` picks a random take with pitch jitter. The synth layers stay as sub weight, shimmer and magic, and stand in alone until the bank loads.
  - Recorded: thunder (near/far), rain/wind/night beds, owl/raven/wolf, blade swing/slash/body blow/bone/gore, deaths, molotov glass + fire, Jack hurt, troll roar, splashes, masonry breaking, rifles, witch zap, bell toll, laughs (Dracula / cackles), heartbeat, bats, sting, title-screen hover/select, footsteps (stone/wood), door creak, chains.
  - New `Sfx.vocal(kind, idle|attack|hurt)`: monsters snarl while hunting (every 4–11 s within 28 m), bark on attacks and cry when cut (`Game.voiceMob`).
- **Touch laptops:** the dev laptop reports 10 touch points. That made it look like a phone:
  - It got the low tier and half the forest, which dropped the road-arching trees.
  - The touch overlay sat over the canvas and ate the clicks that grab the mouse.
  - Fix: mobile = mobile UA, iPad, or a device with only a coarse pointer. On hybrids the touch controls appear on the first touch and hide on mouse use. Leaning trees are exempt from `Forest.density`.
- **Start:** the player is re-teleported to the spawn on Enter, so the camera snaps behind them facing the castle.
- **Jack's head:** `fixJackHead.py` now continues his real crown hair down the back of the head. Each back-of-head texel copies the hair texel mirrored above it over the hairline, at the same bearing. The nape is shaded and blends into the hood, replacing the flat hair-coloured fill (which read as a balaclava).

## Round 18: smarter monsters, troll strategy, Elise's ponytail, Miriam's exit (2026-10-23)

- **AI** (`mobs.ts`, `game.ts`):
  - **Poise:** heavy kinds (werewolf, Unknown, Stitch, troll, Dracula) only flinch from blows of 30+; others at most once a second.
  - **Combo breaker:** after 2 hits in a flurry a monster is on guard again (deflect or evade).
  - **Provoked:** struck monsters ignore turn-taking for 2.5 s and hit back; werewolves, vampires, the Unknown and wolves almost at once.
  - **Combos:** werewolves chain 2–3 swings, vampires and the Unknown 1–2.
  - **Lunges:** wolves, werewolves and vampires leap in from up to 6 m.
  - **Director:** 3 attack tokens. Waiting monsters take posts behind and beside the player (`Mob.flank`); the troll and Dracula never wait.
  - **Stats:** more life and damage all round; less predictable cooldowns.
- **Mocap strikes:** `KINDS[*].strikes` names a CMU punch-sequence capture (143_23, 144_20, 144_21, 02_05). `strikeCuts()` cuts the three fastest hand blows (wind-up 0.36 s, follow-through 0.4 s) into attack/attack2/attack3. Not yet visually checked in-game.
- **Troll fight:** 3200 HP, `armor` 0.75.
  - Frontal blade hits do 25%.
  - After its ground slam it is `exposed` for 2.6 s (×1.5 damage).
  - From behind ×1.35; molotov fire does 32/s.
  - A kraken slam landing within 3 m of it does 4.5% max HP and stuns it (once per 8 s).
  - A hint is shown at fight start.
  - Measured: 47 s under nonstop perfect attacks with the player kept alive (21 hits taken), before the HP raise to 3200.
  - It now guards every crossing until Dracula is slain (`cleared`); 45 s cooldown after a win.
- **Dracula:** 9600 HP (3× the troll), 26 damage, life drain 1.2% of max HP per landed blow.
- **New Game+** (`Difficulty` in `mobs.ts`, `localStorage ravencrest.ngplus`): each Dracula win sets the next run to monster HP/damage × (1 + 0.35·level), capped at +5. The title screen shows "NIGHTMARE +n".
- **Elise's ponytail** (`hair.ts`): a Verlet chain (9 particles, 120 Hz) hung from the back of the crown in head-bone space.
  - It has shape memory and gravity, follows the storm wind, and collides with the skull, neck and hood/backpack spheres.
  - It is rendered as a 4-strand tapered tube bundle rebuilt every frame.
  - No Muse physics delivery exists in Ravencrest Assets.
- **Elise's jacket:** recoloured oxblood (`scripts/ravencrest/recolorJacket.py games/ravencrest/assets-src/elise.orig.glb public/games/ravencrest/assets/characters/elise.glb [hex]`). Torso and arm texels by 3D position keep their shading and take the new hue; skin, gloves, the backpack and the shirt down the open front are left alone. The original is kept in assets-src.
- **Miriam at the gate:** CMU 137_23 "Graceful Lady Wait" idle (`mocap.idle`; `strideCycle` takes bones and a window).
  - When the player passes she cackles, a broom (`fx.buildBroom`) flares under her and she climbs away over the moat.

## Round 19: hero moves, combat camera, orbs + angel, Melvin, daybreak cutscene, film wiring (2026-10-23)

- **Hero moves** (`fightClips.ts`): key poses gain `flip` (somersault about the body's left-right axis), `air`/`tuck` (feet ride the body), and `kickL`/`kickR` foot IK targets.
  - New moves: `jab`, `hook`, `frontKick`, `roundhouse`, `spinKick`, `flipKick`, `flipCleave`.
  - Mashing attack runs `HERO_STRING[hero]`:
    - Jack: backhand, hook, front kick, cleave, roundhouse, combo, flip-cleave.
    - Elise: jab, backhand, jab, spin kick, sweep, roundhouse, backflip kick.
  - Kicks and flips knock foes back (`KNOCK`); bosses and the Unknown are exempt. `Character.hero`.
- **Camera** (`player.ts`):
  - In a fight the follow point slides up to 0.32 × 2.2 m toward the foe with no turning, pitches down slightly, and follows more softly.
  - `player.wide` (0/1, eased): +6 m boom, +1.4 m height, extra pitch and fov. The bridge battle cycles 7 s medium / 5 s wide once the squadron is up (wide when the arms surface), never during a slam.
- **FX budget** (`vfx.ts FxBudget`): long frames scale particle emission down to 35% and cap flash lights before the dynamic resolution drops.
- **Orbs** (`game.ts`): per-orb material with power `uPow` (red guttering when drained, purple when charged).
  - Attacks spend power; orbiting restores it. Drained orbs hang back and don't heal.
  - In the dark or a boss fight the strongest orb becomes a lantern 6.5 m up (3.2× light, 2.4× range).
  - Dracula blasts an orb every 6–10 s (−0.6 power).
- **Halo** (twice a fight; when hero HP < 35% with ≥ 2 charged orbs; 25 s cooldown):
  - The orbs ring 5.5 m above the boss; a pillar of light deals 4% max HP.
  - `angel.ts` (robe of light, feathered additive wings, halo, lightning sword) dives through him: 12% max HP and a 5 s stun (`scripted` + `exposed`; nightmare skips teleports and swarms while scripted).
  - It then hovers before the hero and fully heals them, then rises away. The orbs come home at 0.3 power.
  - Verified in the browser with a stand-in boss.
- **Melvin:**
  - Orange plasma blades ride his hands (`melvinBlades`).
  - Dracula switches focus to him 40% of the time (every 4–8 s) and his blows knock Melvin back.
  - With the hero below 30% he calls Lil' Boo (90 s cooldown).
  - Boo now zaps the nearest foe every 2.2 s (22, or 0.8% of the boss's HP).
  - Dracula lunges like the fast hunters.
- **Daybreak cutscene** (`main.ts updateVictoryCut`, `birds.ts Flock`, `flowers.ts`, `forest.ts uLeafDay`):
  - Shots: wide over the moat, bridge and castle → canopy leaves turning green → low along the verge as wildflowers rise in the grass wave → the bridge from the gorge side as a 46-bird flock sweeps over.
  - Then over the hero's shoulder, Melvin is walked (scripted) to their side and says `melvin_victory`, about 25 s in total.
  - The line was found in the Pumpkin Patch V4 comic's Melvin balloons, timed with faster-whisper over the Mux audio (12:06.3–12:13.7): "Sorry Penny, they started it. I did not scratch. Come on, little Boo, let's go."
  - Debug: `ravencrest.victory()` / `ravencrest.cut`. It increments NG+; clear `localStorage ravencrest.ngplus` after testing.
- **Films:** clicking a billboard or painting flies the camera into it (fills the frame) and fades to black, then posts `ravencrest:watch`.
  - The host calls `requestAutoplay()` (`services/filmAutoplay.ts`); `MovieUXView` consumes it and presses Watch Now (studio ident → film). Exiting the player lands on the film page.
  - Not verified end-to-end in the host app.

## Round 20: angel model, wing rig, fog puffs, lens blood, road wreckage, voices, idles (2026-10-23)

- **Halo angel model:** built from Muse's sheet (`Ravencrest Assets/halo_angel_sheet.webp`) with `buildCast.py halo_angel`. The armor is lit from within (emissive from its own texture) and plays the idle clip; preloaded 20 s after start.
  - **Wing rig** (`angel.ts rigWings`): root + mid bones per wing on Spine2. Wing vertices (behind z −0.14·H/1.99, between 0.47 H and 0.86 H) are re-weighted along the chain.
  - **Pose families** (`pose(t, strike, wing, dt)`): `closed` (folded, as in the turnaround), `spread` (rolled out and up with a slow beat, as in the front/back flight views), `swept` (pitched back, the side speed pose).
  - The halo dives swept, hovers spread while healing, and leaves swept. The light-feather wings show only if the rig fails.
- **Orbs:** the angel's heal also restores every orb to full (no more coming home drained).
- **Fog** (`fog.ts GroundFog`): camera-facing noise puffs along the road and over the bridge deck, fading at the base and near the eye. They replace the flat road mist sheets, which sliced characters at the ankle. The gorge sheets stay.
- **Lens blood** (`lensSplatter.ts`):
  - Painted on a persistent half-res film: radial core/film/rim, a wet highlight, satellite spray, gravity drips with beads.
  - The film smears (blur + downward creep), browns and wipes away.
  - Drops stay in the outer fifth of the frame; most are small, one in four large.
- **Road wreckage** (`roadObstacles.ts`):
  - Random per load: each kind appears ~55% of the time, and ~12% of loads are clear. `?obstacles=<seed>` pins a layout.
  - Kinds: a log (standing jump), a barrel/sandbag barricade and a burning debris pile (2.4 m deep, running jump; the fire hurts), and the Poly Haven covered car in one lane.
  - Running jumps: vy 7.7 when ground speed > 4.2 (else 6.4).
  - **Tank:** it smashes everything within 4.2 m of its hull. Pieces fly by mass (forward, out to the nearer verge, up, with spin), bounce and settle; fires go out; outdoor collision rebuilds when the wreckage settles.
  - School bus / crashed plane: waiting on model sheets.
- **Voices:** `retimeVoices.py` (faster-whisper word match ±45 s around the comic times) re-cut every line; `melvin_name`, `crane_monkeys` and `crane_assault` were dropped (not found).
  - Ravencrest sets `halloweenAudio.movieVoices = false`: the shared stingers no longer play random film clips over the game's own lines (the "Seriously" over the tank).
  - The combo comic strip never shows during a horde or game event.
- **Monsters:**
  - CMU "wait" idles: zombie Drunk 137_15, werewolf/Unknown/troll Strong Man 137_41, Stitch Gangly Teen 137_19, vampire Graceful Lady 137_23 (Dinosaur and Old Man contorted the rigs).
  - Hunters (werewolf, wolf, vampire) idle under 2 s before prowling.
  - The troll strikes with 02_05.
  - Culling: per-kind bounds, 64 m, and the frustum decides (no near override).
- **HUD** shows the chosen hero's name.

## Known gaps (next passes)

- **Arrival art match:**
  - The distant castle needs its full spire cluster and the hall facade detail.
  - The crag needs rock and tree breakup.
  - Gate banners don't read.
  - The moat needs torch reflection streaks; the current SSR shows horizontal stepping on the water.
  - The road's SSR streaks reflect dark geometry instead of the fog band.
  - The left bank needs the art's dark rock and dead grass.
- **Jack:** the face is a soft likeness. A stick baked into the mesh from the sheet's katana is still in one hand alongside the new katana, so the mesh needs a cleanup pass (a Meta Muse job). Hand poses aren't done (the katana grip is an open hand). The combat retargets come from a low-fi grindhouse rig, so art-matched clips from Meta Muse or Meshy would read better.
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
