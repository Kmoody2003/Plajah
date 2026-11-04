# Argilla: Plajah's 3D stack

Working name. Argilla is Latin for potter's clay.

Goal: approachable like clay, with a path to high-end animation and simulation. It is not a smaller
Blender. Status as of 2026-11-01: clay, picture reading and the creature pipeline are built; what is left is listed under each.

## The one idea: everything shares one field

Most 3D tools keep separate representations for modelling (a mesh), collision (a BVH or proxy),
simulation (particles or grids) and rendering. Much of their complexity is the work of converting
between them: retopology, UVs, collision proxies, caches.

Argilla keeps one sparse signed distance field as the source of truth.

| Job | How the field does it | Status |
|---|---|---|
| Sculpting | Brushes edit distance samples on the GPU. There is no topology. | Built |
| Prompting | A prompt becomes a recipe of parts, baked into the field. | Built |
| Viewport | Ray march the field. An idle sculpt uses no GPU. | Built |
| Export | Surface nets to GLB. Triangles exist only on the way out. | Built |
| Collision | A distance lookup is already what a solver asks of a collider, so no proxy is needed. | Planned |
| Fluids and snow | MLS-MPM on a matching grid, with the clay as the boundary. | Planned |
| Hair and fur | Roots placed on the surface, shells extruded along the field's gradient. | Planned |

That is why physics can be "just built in": a new solver gets collision and attachment from the
sculpt without any setup step.

## What is built

- `services/argilla/engine.ts`: sparse bricks in a 3D atlas, compute brushes, ray-marched viewport,
  pointer pick, readback.
- `services/argilla/shaders.ts`: all WGSL.
- `services/argilla/brickPool.ts`: slots and copy-on-write undo. Undo swaps page entries and needs
  no readback.
- `services/argilla/bake.ts`, `recipe.ts`: prompt to parts to field.
- `services/argilla/voxelize.ts`: any GLB to clay.
- `services/argilla/surfaceNets.ts`, `document.ts`: GLB export and the `.argilla` file.
- `services/argilla/store.ts`: on-device file, Creative Cloud record (kind `argilla`).
- `components/argilla/ArgillaStudio.tsx`: the room. Lab: `argilla-lab` on port 3214.
- Tela: a sculpt lands in a document as a `MODEL_3D` media device with `argillaProjectId`, which
  shows a "Keep sculpting" button. Any document surface that shows GLBs shows it.

### Design decisions worth keeping

1. **No brush adds a constant or unions a primitive into the stored field.** The band is only 3
   voxels wide. A wide smooth blend against saturated samples treats far space as if it were surface
   and swells everything nearby. Brushes move the distance profile (semi-Lagrangian) with a soft
   falloff. Wide blends happen only in the bake, where every part's true distance is known.
2. **A 3D texture cannot be copied onto itself in WebGPU**, because the whole mip is one subresource.
   Brick moves go through the scratch atlas.
3. **Per-brick JS calls are the cost, not the GPU work.** Copies moved from thousands of
   `copyTextureToTexture` calls to one dispatch. CPU per stamp fell from about 50 ms to 3-15 ms for a
   normal brush.
4. **`powerPreference` is ignored on Windows** (crbug.com/369219127). Chrome in the lab lands on the
   Intel iGPU. The desktop app passes `--force_high_performance_gpu`, so it should reach the NVIDIA.

## Measured (Intel Arc iGPU, Meteor Lake, driver 32.0.101.9150, lab at 951x729)

Not yet measured: the RTX 4070, the desktop app.

| Measure | Result |
|---|---|
| Viewport pass, sculpted head filling about a third of the frame | 1.2-2.4 ms (timestamp query) |
| Bake a starter form | 117-316 ms |
| Stamp, CPU submit, radius 0.04-0.09 | 3-15 ms |
| Stamp, radius 0.25 | about 107 ms: too slow, see below |
| Read field and build mesh (head, half resolution) | 0.7 s + 1.2 s, about 300k triangles |
| Save | 2 s, 10.8 MB |
| Import a 60k-triangle GLB | 52 s in JS, see below |

Known limits, in order of importance:

- **Large brushes are slow on the iGPU.** A large stamp copies about 10M samples. Options: copy only
  surface-adjacent bricks, or stamp large brushes at a lower internal rate.
- **GLB import runs in JS.** It should become a compute pass over a per-cell triangle list.
- **No colour.** Imports lose their textures and there is no paint brush yet. The old mesh sculptor
  still has vertex paint for Merch.
- **Detail is capped by the atlas.** A sculpt the size of the ball uses about 39% of the standard
  tier. Long sessions hit the limit, and the studio says so. Bricks are shared with undo history,
  which is dropped first.
- **Fine detail stops at the voxel:** 768 or 1024 across the domain, with no pore-level displacement.
  A surface detail layer on top of the field is the planned answer.
- **No WebGPU, no Argilla.** There is no fallback on older browsers.
- **Field resolution is fixed per tier.** A sculpt made on the high tier reopens on the high tier
  even on a weaker GPU, and may not fit.

## What the frontier offers (researched 2026-11-01)

Licences below come mostly from secondary sources. Check each repo's LICENSE before adopting.

**Prompt and image to 3D**
- TRELLIS.2: reported MIT with separately licensed DINOv3, sparse voxels, PBR. Reported at 24 GB VRAM,
  so it does not fit this laptop's 8 GB. Cloud or high-end desktop only.
- Hunyuan3D 2.x: Tencent community licence, excludes EU, UK and South Korea. Hunyuan-mini is already
  installed locally and is the best character route tested so far ([Tela 3D runtime]).
- SAM 3D: reported permissive for commercial use. Not evaluated.
- Procedura (arXiv 2608.26238): agentic procedural modelling. Same instinct as our recipes: the AI
  produces editable structure, not a frozen mesh.

**SDF sculpting**
- Rooms (wgpuEngine): open WebGPU SDF sculpting with a sparse, GPU-driven bake. Closest prior art;
  read it before building the detail layer.
- Reinder Nijhoff's WebGPU SDF editor (January 2026): practical notes on WebGPU's limits.

**Simulation**
- Blender 5.2 made cloth and hair experimental node assets over one declarative XPBD solver, with
  composable effectors filtered by tags. The lesson to copy: simple assets over a general solver,
  with the asset choosing the solver.
- Newton (on NVIDIA Warp, Apache 2.0 per a secondary source) has an XPBD cloth and soft body solver,
  but targets robotics and Python/CUDA, so it is a reference and not a dependency.
- WebGPU MLS-MPM: webgpu-ocean (MIT; reports about 100k particles on integrated graphics, 300k on
  mid-range), Splash (1.6M on a branch), WebGPUMPM (fluids, jelly, snow). This is proven in our exact
  runtime and is the obvious first solver.
- unified-solver (Unity) and CRESSim-Neo run many materials through one PBD kernel, which supports
  the plan below.

**Rigging**
- UniRig (SIGGRAPH 2025): skeleton and skin prediction, listed at 8 GB VRAM or more, permissive per a
  secondary source.

**Not found in this pass:** a good open source for strand hair simulation, text-to-motion, and
part-level mesh generation. These need their own research before phase 4 and 5.

## GPU and NPU together

Status: **Start from a picture runs on the NPU (first feature, below).** The laptop has
an Intel AI Boost NPU (Meteor Lake, driver 32.0.100.4724). OpenVINO 2026.4.1 lives in
`D:\Plajah Runtime\npu-py`. It lists the CPU, Arc, RTX 4070 and NPU.

Measured 2026-11-01 with U2-Net (the 176 MB cut-out model, 320x320, random input, one run each):

| Device | Median per image | First load |
|---|---|---|
| NPU | 79 ms | 35 s once, then 0.5-2.8 s from the driver's cache |
| Arc iGPU | 43 ms | 88 s |
| CPU | 1684 ms | 4 s |

Sculpting on the Arc and running that model on the NPU at the same time, with 15 s windows confirmed
to overlap by timestamp:

| Measure | Alone | Together |
|---|---|---|
| NPU median | 79.2 ms | 79.6 ms |
| Brush stamp, CPU median | 1.1 ms | 1.0 ms |
| Frame through GPU completion, median | 8.0 ms | 8.2 ms |

So the two did not slow each other in this test. Limits: one model and one short run, scripted strokes
that mostly reuse bricks (hence lower stamp times than the table above), and no power, thermal or RTX
4070 measurement. The stamp timing ran in the browser, while the NPU ran in a separate Python process,
which is not yet how the app would call it.

Still true:
- WebNN is not production-ready in browsers, so the NPU lane must be desktop-only for now.
- Microsoft lists Windows ML's OpenVINO NPU support as Arrow Lake and newer. Direct OpenVINO works on
  this older chip, as measured. Ship the lane through it, and detect the device instead of assuming one.
- D: was 99% full (44 GB free) when this was installed.

### Start from a picture

Pipeline: the page resizes the picture and posts raw RGB to `engines/argilla-npu/argilla_npu.py`
(loopback :51125, numpy and OpenVINO only, refuses other web origins). U2-Net gives the cut-out and
Depth Anything V2 Small (Apache-2.0, 99 MB, `D:Plajah Modelsdepth-anything-v2-small`) gives depth.
`services/argilla/pictureClay.ts` bakes them in a worker:

- The body is a Poisson solve inside the outline. Its square root gives every limb a round section sized
  to its own width, which a plain distance-based inflate does not.
- Thickness is stored squared and extended negative past the outline. Thickness itself turns vertical at
  the rim and came out as a ribbed seam from any map; the squared form runs straight through.
- Depth pushes only the front, with broad shape and features under separate gains. The back is invented.

Measured 2026-11-01 on the Dracula portrait, Arc viewport, 10 s of scripted sculpting alongside:

| Measure | Alone | With the other running |
|---|---|---|
| Depth on NPU, median | 115.3 ms | 116.0 ms |
| Cut-out on NPU, median | 70.9 ms | 73.9 ms |
| Brush stamp, CPU median | 0.3 ms | 0.4 ms |
| Frame, median (capped by the display) | 16.7 ms | 16.6 ms |

The frame figure hits the 60 Hz cap, so it shows no dropped frames, not spare GPU time. Stamps mostly
reused bricks. First compile of both models on the NPU took about a minute and a half, then the cache
answers (163 MB in `D:Plajah Runtimecacheopenvino`). A bake takes 2-5 s in the worker.

Limits:
- It makes a confident relief, not a full 3D model. The back is a pillow, and a portrait cropped by the
  frame gets a flat cut where the crop was.
- Cut-out quality decides the outline: the werewolf portrait lost its shoulders.
- A picture can take half the clay budget (54% on Dracula at the standard tier).
- The engine, env and model are only on this PC. Other PCs get the transparent-PNG path, which is outline
  only, until they ship with an installer. The desktop service compiles but has not run in the real app.
- Loading the bake into the GPU still blocks the page for up to about 0.9 s.

What the NPU is good for: small, static-shape models running continuously at low power, while the GPU
does sculpting and simulation. Candidates: depth and cut-outs from a reference image, a render
denoiser, and tracking for face and hand capture. Not good for: generating meshes (too large) or
anything in the brush path, where a round trip costs more than the stamp.

## Creatures: from what it is to a living model

The body is built from the inside out, so nothing is guessed afterwards: services/argilla/creature/codex.ts holds what it knows, natomy.ts turns a plan into skeleton, muscle and clay, inish.ts skins it in a worker, motion.ts moves it, stage.ts runs it live, exportCreature.ts writes the GLB.

- **Understanding:** eight body plans (human, wolf, werewolf, vampire, zombie, troll, bear, big cat). Words name one, and two named together (or `bear man`) blend into a hybrid. Film lineages are hand-written direction: posture, weight and gait, never anyone's design.
- **Rig:** 33 bones in one topology for every plan. A bone only claims a vertex it can reach without leaving the solid.
- **Muscle:** 25 muscles, each both clay and a live influence. A shorter muscle bulges, on a spring so it overshoots. This is a surface model, not a volumetric simulation. Export carries 14 morph groups, baked into each clip.
- **Fur:** shell layers driven by a per-vertex length and direction, bare at eyes and nose, dragged by body motion, and raised by arousal. Plajah's stage draws it. Other engines get the data as `_FURLENGTH` and `_FURDIR` and need their own shader.
- **Motion:** gait numbers plus IK, so it fits any proportions. Every upright plan with `runsOnAllFours` tips over and uses its arms as forelegs.
- **Reactions:** looks at the pointer, tenses at fast movement, recoils when poked.

Measured on the Arc iGPU, in the lab:

| Measure | Result |
|---|---|
| Re-bake a body | about 0.4 s (2.3 s before classifying cells against nearby parts only) |
| Finish, field read to model (52k triangles, 2048 texture) | 2.4 s in a worker |
| Frame with 18 fur layers, 1225x1204, pose + render forced to finish | 9 ms (2.4 ms with no fur) |
| Pose and muscle, CPU | 2-3 ms |
| Export GLB (37k-triangle wolf) | 7.2 MB, reads back with 33 bones, 14 morphs, texture, 4 clips |

Traps: `anatomy.bones` must stay in `JOINTS` order, because skin weights index one and skeletons use the other (a mismatch looks fine standing and tears when moving). The hidden browser pane throttles rAF, so read frame cost by forcing a render to finish, not from fps.

Not done:
- **Carved sheets are block-outs.** Arms that touch the torso in every view merge with it, and a head narrower than the shoulders leaves a brim. Sculpt them, or use the GPU route.
- **The GPU sheet route is wired but has never finished.** Its one test ran out of memory with about 6 of 65 GB of commit free. Its look, plan fit and paint alignment on that mesh are unproven.
- **Recognition only knows the codex.** Ghost and angel were misnamed as zombie and vampire: anything not listed gets the nearest plan, with no warning unless it scores under 50%.
- **A single picture gives colour and rough features, not a likeness.** The face comes from the plan.
- **Fitted rigs assume a body plan.** Hands and feet are found on upright forms; a form far from any plan rigs poorly.
- **Quality:** a stylized base to sculpt on, not a film-ready creature. Four-legged plans are the roughest.
- **Not run in the real desktop app or on the RTX 4070**, and no MSIX has been built with this.

## Character sheets

A designed sheet has panels, labels and close-ups, and one cut-out pass over it finds only the biggest figure. So `suggestBoxes` finds framed panels from unbroken lines and proposes Front, Side and Back boxes the person can move, and each is cut out on its own. Carving builds each height as ellipses sized by the front and side runs there; intersecting the outlines directly gave ribbed boxes. Measured on the Bridge Troll sheet: Front and Side panels found to within about 0.5%, Back suggested from the space beside Side, 88% troll from the front panel alone, about 15-25 s to carve, and all three views painted on.

## Recognition and setup

CLIP ViT-B/32 vision (Xenova ONNX, 352 MB, on the NPU, about 23 ms) scores a picture against the codex's phrases, embedded once by `scripts/argilla/embedCodexPhrases.ts` so only the vision half ships. Rerun it after adding creatures. With no words it builds the whole body at 50% or above. Tested on seven Ravencrest portraits: troll, Dracula, vampire, werewolf and zombie right; ghost and angel wrong because they aren't plans.

`ARGILLA_NPU_INSTALL` was run from an empty folder through the real C# service in a small console harness, not the app: about 3 minutes, 1.5 GB with the NPU compile cache, all hashes verified, and recognition matched. `uv.exe` comes from ignored `windows-native/third_party/uv`, so copy it into a clean worktree before packaging.

## The modeling room

Traditional polygon modeling beside the clay. `services/argilla/poly/polyMesh.ts` is a pure kernel (n-gon face lists, every tool mesh to mesh); `components/argilla/ModelingRoom.tsx` is the room: vertex, edge and face selection, move, rotate and scale gizmo, extrude, inset, bevel, loop cut, Catmull-Clark subdivide and smooth preview, merge, mirror, flip, delete, primitives, an adjustable last tool, undo, GLB export, and Sculpt this. Tests hold each tool to a closed solid (Euler 2) and the exact volume it should make.

Still missing for a real DCC: multiple objects and a scene tree, a saved format with cloud sync (it only autosaves one mesh on this device), edge loop select, knife, bridge, snapping, soft selection, numeric entry, GLB import to polygons, UV editing, materials, and a rig or animation editor that works on these meshes.

## From a picture to geometry

`services/argilla/understand/`. A picture now builds from the picture, whatever it shows. The creature plans are for rigging.

1. **Understand.** CLIP on the NPU scores `vocabulary.ts` (about 280 things, each with a real size and a structure). `rankReadings` then checks names against the picture's proportions: a tall thing can't be a snare drum. Typed words always win. Anything unnamed still builds, trying several structures and keeping whichever holds up.
2. **Read depth close up.** Depth runs on a crop of the subject, so all 518 samples land on the thing.
3. **Build by structure.** `round` is a true lathe, `slab` a flat block, `mirrored` repeats its near side, `figure` and `organic` carry broad masses round the back but not features.
4. **Check and correct.** `measure` ray-marches the clay from the camera. `judge` compares outline, depth, one-piece, section, proportion and balance, and `build` corrects thickness and relief from the numbers.
5. **Know the limit.** A plane built this way passed every check and was still a blob. So the `capture` check fails for anything with thin parts, turned at an angle, or with hard parts, and the studio then recommends generated geometry. Hunyuan-mini made the Ford Trimotor painting into a plane with three engines, propellers, gear and tail in 102 s, 60k faces, and 20 s more to clay.

Measured on one set of pictures (8 tested): goblet drum, timpani, early automobile, airplane, tree and werewolf named right. Conga read as a snare drum before the proportion check existed, and Dracula as an ogre: the codex's 85% vampire score now speaks for creature families. Neither fix has been re-measured across the whole set. Vocabulary only names what it lists, and the nearest wrong name can look sure.

### Why generated shapes came apart, and the fix

The detached wings were never the generator's or the clay's fault. U2-Net kept the plane's body and left both wings as faint haze (5.6% of the frame solid, 13.7% haze). Haze above about 3% alpha counts as object, so the generator saw a body and a fog: it built a flat sheet behind the plane and a loose wing. Given a clean input it made one piece on all three seeds, about 11 s each with the model loaded.

- **`wholeSubject.ts`** recovers what the cut-out missed. It grows from the biggest region across smooth depth over the whole frame. It stops at depth jumps, at steep depth beyond 8 samples from the subject, and where a faint depth change meets a colour edge. Low in the frame, pixels at their row's usual depth count as ground. Each recovered piece must stand in front of its surroundings, which rejects walls and backdrops. Second regions at the same depth stay, and if growth runs away the cut-out stands. Tested by eye on 8 pictures: plane whole, bass drum gains most of its shell (patchy), the rest unchanged. Those thresholds are tuned on these 8 only.
- **`cutOut`** samples the mask smoothly and removes haze. The engine's own rembg path does the same.
- **`alignShape.ts`** turns the mesh to the picture. Generators square things to face front. Each turn is drawn with perspective and scored on outline plus depth. Depth counts as much as outline: flat outline alone chose a back view at -158°. Only the vertical turn is applied. `placeOnStage` then puts it in the picture's frame and `voxelizeMesh` keeps it there with `inPlace`.
- **Attempts:** up to 3 seeds, stopping at a score of 0.72, best kept.
- **Finish:** `fine` meshes at stride 2 for generated shapes. Stride 4 melted propellers.
- **Loader:** Hunyuan's `from_pretrained` built a full-precision copy in RAM and crashed in native code (c10.dll access violation) with 12 GB of commit free. It now builds on the GPU in fp16 with plain reads: 4.5 GB VRAM peak.

Measured through the real studio buttons on the Trimotor: 65 s, best of 3, 100% one piece, turned 26°, 73% overlap through perspective, finish 8 s. The nose pointed the right way, but a later scan put the true turn near 40°, so turns can still be 15-20° off. Darbuka: 1 attempt, 95%, depth 0.97 of width. Bongo: 1 attempt, 90%.

Still open: flat clay against a perspective picture overlaps under 60% on the plane, so it takes soft colours, not painted detail. Perspective is a fixed guess.

Limits: paint comes from one view, with a soft copy on the back, and a generated shape only takes sharp paint if it lines up. Generated shapes need Hunyuan's licence gate before public use (excludes EU, UK, South Korea) and several GB of free memory.

## Scenes

`services/argilla/scene/`, `components/argilla/SceneRoom.tsx`. Words or a picture end in the same editable scene in metres.

- **Words:** `parsePrompt` finds things, counts, colours and "on" relations. On the desktop a local model may add what belongs, with its answer treated as untrusted. `layoutScene` places them by real size, `settleScene` fixes floating and overlap, `checkScene` says what it found live as you move things. Shapes are block-outs: chairs and tables read, cars and trees are rough. Any object can be rebuilt from a picture.
- **Picture:** a depth backdrop torn at depth jumps with a far plate behind it, plus each salient subject built as its own object, placed by depth with scale from real sizes. Holes behind subjects are filled so moving one leaves no ghost. About 20 s for the hangar painting. It only finds what the cut-out finds: there the plane, not the people. Objects that depth can't capture now use the GPU route when the engine is available and fall back to depth when it isn't (32 s for the hangar painting). The backdrop is one view deep. Scene placement with the generated plane was measured but not looked at.

## Roadmap

1. **Clay** (built): field, brushes, prompt start, import, export, Tela.
2. **Clay, finished:** colour and paint in the bricks, a detail layer, GPU import, faster large brushes,
   masks, and a measured NVIDIA tier.
3. **Rendering:** an offline path through the same field with real shadows and materials, and
   turntable output into Tela and Fabula.
4. **Motion:** auto-rig with a skeleton placed from the field's medial shape, a pose brush, keyframes.
   Must align with `docs/playable-engine-design.md` and the VTuber rig builder.
5. **Physics you pick by name:** "water", "snow", "silk", "fur", each an asset choosing a solver, with
   the clay as collider. MLS-MPM first, then XPBD for cloth and strands, then fur shells.
6. **NPU lane:** after measuring it on this machine.

## Sources

- [TRELLIS.2 and Hunyuan comparison](https://www.cmarix.com/blog/top-open-source-ai-models-for-3d-image-generation/)
- [AI 3D generators in 2026](https://app.cinevva.com/guides/ai-3d-model-generators)
- [Procedura](https://arxiv.org/pdf/2608.26238)
- [Rooms](https://recercat.cat/handle/10230/74260)
- [WebGPU SDF editor](https://reindernijhoff.net/2026/01/webgpu-sdf-editor-real-time-signed-distance-field-modeling/)
- [Blender: Geometry Nodes physics](https://code.blender.org/2026/07/geometry-nodes-physics/)
- [Newton](https://pyshine.com/Newton-Physics-GPU-Accelerated-Simulation/)
- [webgpu-ocean](https://awesome.ecosyste.ms/projects/github.com%2Fmatsuoka-601%2Fwebgpu-ocean)
- [Splash](https://awesome.ecosyste.ms/projects/github.com%2Fmatsuoka-601%2Fsplash)
- [WebGPUMPM](https://github.com/chetan-parthiban/WebGPUMPM)
- [unified-solver](https://github.com/JohannHotzel/unified-solver)
- [CRESSim-Neo](https://arxiv.org/pdf/2608.25192)
- [UniRig](https://arxiv.org/html/2504.12451)
- [Windows ML execution providers](https://learn.microsoft.com/en-us/windows/ai/new-windows-ml/supported-execution-providers?tabs=winml2)
- [WebNN status](https://blog.openreplay.com/on-device-ai-browser/)

## Parts and materials: from a blue shirt to a police uniform (2026-11-02)

Before this, Argilla cut out one subject and knew nothing about what it was made of. Now a picture goes through:

1. **Find:** SAM 2.1 small (Apache 2.0, `D:\Plajah Models\sam2`, code in `tela3d-src\sam2`) on the Tela 3D engine, `POST /tela3d/parts`. It looks at a close-up of the subject: on the whole frame a small subject gets a handful of grid points. 315 MB of VRAM, loaded per call, and it clears any resident generator first.
2. **Tidy:** `understand/parts.ts`. Keep regions on the subject, drop duplicates, smallest wins where they overlap. SAM rarely outlines the main mass of a thing, so whatever's left over becomes a part of its own.
3. **Know:** `understand/buildSheets.ts` and `materials.ts`: 33 kinds, 29 materials with PBR values and behaviour. Words win, then CLIP on the whole subject, then the on-device model for anything unlisted (answer filtered by `parseSheetAnswer`, remembered in localStorage).
4. **Name:** CLIP on each part alone and in place, restricted to this kind's parts plus common ones. Below NAME_SURE a piece stays "unnamed part". The largest region (40%+) takes the sheet's first line.
5. **Settle:** the expected material stands unless the picture is sure otherwise (0.55 for its material, 0.05 or less for the expected one). Every part records `seen`, `expected` or `yours`.
6. **Carry:** a surface texture in glTF layout (roughness G, metalness B), per-triangle part ids, and a GLB split into named meshes with material, behaviour and evidence in extras. `SceneRoom` gained reflections, without which metal renders black.

Expected parts missing from the picture are only listed, never built. A kind needs 0.5 from CLIP to be used: the right answers measured 0.82, wrong ones under 0.35 (an embroidered jacket read as "backpack" at the old 0.3). Typing in the "This is" box re-reads the sheet.

Measured on the 1947 West Midlands Police uniform photo with no words given: read as "police officer in uniform", 31 s to the panel, finish about 20 s, 24 named parts in the GLB. Trimotor: fuselage aluminium at 88%, tyre rubber, propeller steel.

Limits: small part names are often wrong even when the region is right (a medal as "duty belt"), and the jacket reads as shirt. Materials come from one CLIP pass, so dark pieces tend to read as iron. Thresholds were set on these few pictures. Parts are projected from the front, so they run through to the back. Parts only apply when the shape lines up with the picture; otherwise the object is one material. Depth-built figures are thin from the side. Parts are not yet separate geometry: nothing under the shirt, and nothing is rebuilt part by part. `readSheet` for character sheets and scenes don't use any of this yet.

## Paint on what the picture never saw (2026-11-02)

The picture used to be projected straight through the object, so sides stretched into streaks and the back wore a blurred copy of the front. `scene/finishObject.ts` now decides per texel:

1. **Visible:** a depth buffer from the camera (`visibilityFrom`). Anything behind something else takes no picture.
2. **Facing:** picture weight runs from 0 at a surface normal z of 0.3 to full at 0.62 (`facingWeight`). Past that it would stretch.
3. **Agrees:** generated shapes only. The surface's direction is compared with the picture's depth gradient after fitting one scale (`agreementWithPicture`), full at a cosine of 0.93, none at 0.78. A generated shape is only turned as a whole, so a head looking another way used to wear a scrambled face.
4. **Everything else:** `fillUnseen` carries colour across the surface from the nearest seen vertices, staying inside its own SAM part first, then smooths only what it invented. Seams are welded so colour crosses them.

Measured on the 1947 uniform: finish 6 s on a saved generated shape, 9 s for build and finish on the depth route. Front detail on the depth route is unchanged.

Limits: unseen sides are plain colour with no cloth grain, seams or pockets. A slight skin tone stays under the helmet's rear brim. A faint pink patch from the medals remains on the chest where the agreement check rejects a surface. Generated shapes lose sharp detail wherever they disagree with the picture, such as the helmet badge, so the front is softer than the depth route. Thresholds were set on this one figure. The plane has not been re-run with this paint.

## Where generation time goes (2026-11-02)

Measured on the 1947 uniform, 60,000-triangle mesh. The earlier guess that alignment was the bottleneck was wrong.

| Step | Before | Now |
|---|---|---|
| Engine, cold | 69 to 142 s (142 s on the first load from disk) | same, about 62 s when files are cached |
| Engine, generator already loaded | reloaded after every SAM run | 18 to 19 s |
| Turn to the picture | 2.9 s | 1.4 s, same answer (30 degrees, 90% overlap) |
| Into clay | 23 s on the page | 17 s in a worker |
| Whole Build button, real flow, cold | 204 s and 438 s | 65 s |

Inside a warm engine call: Hunyuan itself about 8 s, reducing 180k faces to 60k 6.5 s. `/tela3d/parts` now keeps a resident generator if 2.5 GB is free after clearing PyTorch's cache; SAM took 17 s beside it. Engine responses now carry `steps` timings.

The 204 and 438 s runs had a hidden lab pane, low memory and other load, so they aren't a controlled comparison. A worker isn't throttled by a hidden tab. The main thread still stalled up to 2.3 s during Build; not traced. A cold first load remains the largest wait. Repeated runs reach about 84 degrees, near the 86 guard. The turn found varies by seed (23, 30 and 38 degrees here), and so does how much of the face passes the agreement check.

## Naming parts: what was measured (2026-11-02)

Regions were hand-labelled from contact sheets, by one person's judgement. A name in `writeSheet` now weighs look (CLIP alone and in place, plus phrases per kind in `kind_part_phrases.json`), position, size, thinness and material fit. A listed name needs 0.05 belief among all 180 names, and an outside name stands at 0.4 and three times the listed one. Leftovers take the main part's name only if that part is 30% or more. Sheet lines take hints: `medal:brass@middle~tiny?`, `^` for thin.

| Picture | Right | Wrong | Unnamed | Note |
|---|---|---|---|---|
| Police uniform, before | 3 | 19 | 2 | |
| Police uniform, now | 15 | 3 | 6 | tuned on this picture, with a long hand-written list |
| Trimotor, with its name typed | 3 | 0 | 11 | part-tuned; cabin windows unnamed and read as iron |
| Ducati, unseen, before the last rules | 5 | 19 | 1 | not re-run after |
| BMW 1929, unseen, final rules | 2 | 10 | 10 | the fair number |

Both motorcycles were recognized as motorcycles with no words. The fair result says the rules help most where a sheet is long and hinted, and CLIP ViT-B/32 on small crops is the limit: top scores on the Ducati were mostly 0.1 to 0.3. A wrong name also carries the wrong expected material (a seat named handlebar became chrome). Only two sheets have hints. The next step is a real vision model asked about each highlighted piece, not more thresholds.

## Naming parts by looking: Gemma 4 E4B (2026-11-03)

`understand/lookAtParts.ts` draws every part's outline on the close-up in its own colour, numbers it at the point deepest inside it, and asks once: what is each number, and what is it made of. The answer is started for the model (`{"parts":[`) and read entry by entry, so stray control characters or a cut-off answer lose only what's broken. In `writeSheet` a looked-at name outranks the crops; its `null` stays unnamed. Outside the desktop app, or with no vision model installed, the crops name things as before.

Desktop path: `NativeLlmService.LookAsync` (bridge message `LOCAL_LLM_LOOK`, web side `nativeLlmLook`) finds a Gemma 4 GGUF with an `mmproj` beside it, in a model folder or a `gemma-4*` folder inside one, and takes the one resident slot. Argilla asks with `unloadAfter`, since SAM and the 3D generator come next. Verified in the real Debug app over its devtools port on 2026-11-03: BMW photo, Vulkan on the RTX 4070, 169 s on the first call in a fresh app (shader setup), then 41.5 s (24 s of it the reload), and the app back to 0.39 GB of memory after. Download: `LOCAL_LLM_DOWNLOAD` with key `gemma-4-vision` fetches both files (6.4 GB) into a `gemma-4-e4b` folder, in the studio's model folder when the PC has one (C: is often short), else the app's. It checks free space first and resumes `.part` files. `VisionModelOffer` in the "Made of" panel offers it, with the size, when parts were named from crops. Verified in the real app on 2026-11-03 by cutting 64 MB off the model: resumed in 9 s, SHA-256 matches Hugging Face. The offer itself wasn't seen on screen: the app's bundled web build predates it.

Model: Gemma 4 E4B instruct, Q4_K_M GGUF (5.4 GB) plus f16 vision projector (0.99 GB), Apache 2.0, from `bartowski/google_gemma-4-E4B-it-GGUF`, in `D:\Plajah Models\llm\gemma-4-e4b`. Run through LLamaSharp 0.30 Vulkan, the desktop app's own runtime, from a scratch console harness. It picked the RTX 4070 by itself. Turn format is `<|turn>user ... <turn|>`, not Gemma 3's. Image budget 1120 tokens.

Same SAM regions, same hand-labelling as above:

| Picture | Gemma right | wrong | unnamed | CLIP (before) |
|---|---|---|---|---|
| Police uniform 1947 | 18 | 6 | 0 | 15 / 3 / 6, tuned |
| BMW 1929 | 12 | 3 | 7 | 2 / 10 / 10 |
| Ducati Monster | 21 | 4 | 0 | 5 / 19 / 1, older rules |
| Trimotor (painting) | 3 | 11 | 0 | 3 / 0 / 11 |

Its misses are named neighbours: helmet badge called helmet, chin strap called helmet, mirror and fly-screen swapped. The Trimotor failed: every window became "fuselage" or "engine", which the prompt's "name the bigger part for a scrap" invites. It named the uniform tunic wool, right for 1947, where the sheet expected poly-twill.

Cost, measured: load 40 to 52 s from D:, then 16 to 43 s per picture warm (image read 1 to 4 s, about 19 tokens/s). The first request ever paid 130 s of Vulkan shader setup. Held in memory it takes about 7 GB of RAM (the test harness reached 7.9 GB during a reload; in the app, unloading gives it all back). With Photoshop open it could not sit beside the SAM engine: allocations failed for lack of commit. The GPU reached 90 °C and 210 MHz on the fourth picture in a row.

Full build in the desktop app, 2026-11-03 (Debug build, `PLAJAH_DEV_SERVER=1` with the Argilla lab served on :5173, driven over the devtools port; the studio's own buttons and file input): 1947 police uniform, cold engines. Finding parts (SAM) 107 s, reading kind and crops 4 s, Gemma looking 52 s with its load, generating 84 s, clay 19 s, finishing 9 s: about 4.5 minutes. Names came from Gemma (police badge, medals, ribbons, collar, wool). The app peaked at 9 GB and was at 0.4 GB before generation, which then had the GPU to itself; the GPU peaked at 82 °C. Result: one piece, 91% outline overlap, depth agreement 0.79, helmet, face, tunic, medal bar and buttons all there. Seen along the way, both fixed the same day: the finished object was labelled "Soldier" (the nearest prior) while the sheet said police officer, so the label now comes from the sheet's kind when there is one; and the room's camera aimed near the ground, cutting off a standing figure's head, so it now aims at the middle of everything and steps back until all of it fits the narrower side of the window (checked in the lab: one 1.8 m figure, and a 10 m tree beside a figure and a chair).

Not done: the Serbian uniform (stopped for heat), any prompt change for windows.
