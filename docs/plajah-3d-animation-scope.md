# Plajah 3D: the animation scope

Written 2026-11-04. Plajah 3D is the new name for Argilla (UI text only; files, ids and events keep `argilla`).
Companion to [argilla-3d-stack.md](argilla-3d-stack.md), which records what is built and measured.

## The goal in one line

Get anyone from an idea to a told story. 3D, 2D, anime, Disney- and Pixar-style looks and generative video are
not separate tools here: they are ways to render the same shot.

## What "approachable" means here, as rules

1. **Direct, don't operate.** The user says what happens ("she runs to the door, the curtain blows in"), draws
   where it happens (a path on the ground, a camera line), and adjusts what's wrong. Panels of numbers exist
   only behind "More".
2. **Materials carry the physics.** Pick "silk", "denim", "honey", "water", "campfire smoke": the settings come
   with the material. This already exists in `understand/materials.ts` (behaviours like stiff cloth, rigid);
   simulations read it instead of asking for stiffness and damping.
3. **Every automatic thing is editable by hand.** Prompt-made motion lands as keys on a timeline; a simulated
   cloth can be pinned, painted stiffer or baked and nudged. Traditional 3D is the same document, opened up.
4. **Real time while directing, best quality on render.** The viewport always plays at frame rate on the
   baseline GPU; a final render can take longer, run more substeps, or hand off to a video model.
5. **Honest about the machine.** Each feature says where it runs (browser, desktop GPU, linked cloud account)
   and what it costs, before it runs.

## One shot document, many renderers

The core decision. A **Shot** is the unit of storytelling, shared by Plajah 3D, Anima (2D) and Fabula (edit):

```
Shot
  stage        3D scene: objects (clay, meshes, characters), lights, ground, sky
  layers       2D cels and drawings (Anima's DrawingCel, plates) placed in the stage as cards or overlays
  cast         characters, each with a rig, a look and a performance (tracks of motion)
  camera       a path with framing keys (lens, focus), or several cameras for coverage
  timing       length, fps, beats (from script lines or music)
  sims         cloth, hair, liquid, smoke, fire, rigid bodies: setups plus baked caches
  look         how it renders: Toon, Anime, Storybook 2D, Stylized (Pixar-like), Real, or Generated
```

Fabula receives a Shot as a clip that can be re-rendered in another look without redoing the work. Anima
already sends to Fabula (phase 3 of Anima); Plajah 3D does the same, and Anima's 2D layers can live inside a
3D stage (cel planes, parallax multiplane like Disney's camera). The Shot schema should stay compatible with
the Playables Experience JSON (docs/playable-engine-design.md) so the 2027 engine can open shots as scenes.

**Looks**, all from the same Shot:

| Look | How | Runs |
|---|---|---|
| Toon / Anime | cel shading with ramp textures, inverted-hull or screen-space outlines, rim light, flat shadows; held poses on twos for anime timing | real time, iGPU |
| Storybook 2D | Anima cels on cards in the stage, multiplane parallax, painted plates | real time |
| Stylized (Pixar-like) | PBR with soft area-light look, SSS skin approximation, ambient occlusion, depth of field | real time on desktop; higher quality on render |
| Real | PBR + reflections (RoomEnvironment today), better GI later | desktop |
| Generated | the Shot renders guide passes, a video model renders the final frames | desktop GPU or linked cloud |

## The generative path: 3D as storyboard and guide

What people do today by hand in Blender (block the scene, set the camera, render depth or clay passes, feed a
video model) becomes one button: **Render with a video model**.

1. The Shot renders guide passes from its camera, frame for frame: **depth**, **normals**, **pose skeletons**
   (OpenPose-style from the rigs, so no estimation needed), **object/part ids** (we already have named parts
   and materials), a **clay pass** for composition, and optionally a **style frame** (a first frame painted or
   generated in the chosen look).
2. Plajah writes the prompt from what it knows: the build sheet (police officer in a 1947 wool tunic, brass
   medals), the action, the look, the camera move. The user edits it.
3. A video model follows the guides. Candidates, licence first:
   - **Wan 2.2 (Apache 2.0)**, 5B variant reported to run from 8 GB with offloading, plus VACE-style control
     (depth/pose). VACE for 2.2 comes from Alibaba's Fun team, not the official release: licence to verify.
   - **LTX-2.x** has the strongest built-in depth/pose/edge control (IC-LoRA) and audio, but a community
     licence with a revenue threshold. **Kenne's decision** whether that's acceptable.
   - **Linked cloud accounts** (Kling and others) through the Fabula generation agent pattern
     (docs/fabula/GEN_AGENT_PLAN.md): the user's own account, never a platform key.
4. Results land in Fabula's bin and timeline next to the Shot, so a bad take is re-run, not rebuilt.

The open-source **Blockout** previs project and community ComfyUI "3D movie" pipelines do exactly these passes
(depth, clay, mouth masks) for Wan and LTX; they're references for which passes matter, not dependencies
(no ComfyUI, per standing rule).

## Simulation: one GPU layer, shared

Anima already has CPU engines for particles, Verlet hair, XPBD soft bodies and Stam fluids
(`services/anima/physics.ts`, `fluids.ts`). Plajah 3D must not grow a second set. Build **one WebGPU compute
simulation layer** that both use (Anima in 2D, Plajah 3D in 3D), with the CPU versions kept as fallback.

| Need | Technique (realtime-proven) | Notes |
|---|---|---|
| Rigid bodies, collisions, ragdolls | **Rapier** (Rust → WASM, official npm packages; licence believed Apache-2.0/MIT, verify) | colliders from the clay SDF and from meshes; characters get ragdoll on hit |
| Cloth | **XPBD** on GPU, small substeps (several open WebGPU implementations exist) | garments from the build sheet: a "uniform top" in poly-twill is already a stiff-cloth part; collide against the body SDF |
| Hair and fur | Strands: GPU Verlet/XPBD guide hairs with interpolated children; render by **software rasterization of strands** (Frostbite-style; a WebGPU port exists) | today's shell fur stays as the cheap tier |
| Soft bodies, jelly, flesh jiggle | XPBD volume constraints, or shape matching | mascot squash and stretch; Anima's mass profiles (`jelly_mascot`, `organic_flesh`) map straight onto it |
| Liquids | **Position-based fluids** (PBF) particles, screen-space fluid rendering | a three.js r184 WebGPU PBF library exists (liquids, soft bodies, cloth, smoke): evaluate before writing our own |
| Smoke and fire | Eulerian grid: semi-Lagrangian advection, buoyancy, vorticity, pressure solve; raymarched volume | three.js's own WebGPU volumetric fire example is the reference design |
| Sparks, dust, rain, magic | GPU particles with curl noise | Anima's effect kinds (rain, snow, fireflies, smoke) become shared presets |

Rules that come from the Ravencrest Canon and apply here:
- Baseline is the Intel Arc iGPU in a browser at 60 fps with the simulation running; the desktop GPU gets more
  particles, finer grids, more strands. Each sim has tiers, chosen by the adapter.
- Measure per pass on the target GPU, frozen frames, driver noted.
- **Simulate live, bake for render.** Directing runs the sim live; a final render bakes caches (per-frame
  positions/volumes) so playback is exact and a video model sees the same motion every take.
- The clay SDF stays the collider for everything, as decided when Argilla began.

## Characters: full animation, three ways in

1. **Prompt and path.** "Walk to the tree, look back, wave": the planner turns it into beats; locomotion follows
   the drawn path with foot IK on the ground (the creature pipeline already has gait and IK); gestures come from
   a motion library; the timing lands as editable keys.
2. **Act it.** Webcam or phone performance capture to the rig, live (the VTuber perfect-sync face pipeline
   exists, `vtuber_rig_builder`), or video-to-motion from the user's own footage.
3. **Keyframe it.** Pose with handles, timeline, dope sheet, graph editor. Anima already has these for 2D; they
   should become shared components, not rebuilt.

Faces and voices: visemes from the line (Anima has lip-sync and dialogue synthesis), blinks and eye darts
procedural, expressions from the script's emotion.

**The licensing gap, stated plainly.** Good text-to-motion and video-to-motion models mostly can't be used
commercially:
- NVIDIA **Kimodo**: code Apache-2.0, but the SMPL-X weights are research-only; the SOMA variants are under
  "NVIDIA Open Model" terms that still need reading.
- **GVHMR** (video to motion) is research/education only, and the **SMPL-X** body model needs a commercial
  licence from Meshcapade.
- **GMR** retargeting is MIT.

So the first release uses what's clean: a commercial-safe mocap shelf (CMU, already chosen in the Motion Lab
brief), procedural locomotion and gestures, and physics-based reactions. Prompt-to-motion from a model waits
until a licence checks out or we train on our own captures (the Motion Lab capture program). A third path is
cheap and legal today: generate a short reference video with a permissive video model, then track it, only
once a commercial-safe pose tracker is confirmed.

## Where it lives in the product

- **Tela**: "Sculpt in 3D" today; becomes "Plajah 3D" with Model, Animate and Shot modes.
- **Fabula**: Shots appear as clips; "Open in Plajah 3D" round-trips; Anima and Plajah 3D share the
  Send-to-Fabula path.
- **Anima**: 2D characters and cels can be placed into a 3D stage; a 3D shot can render in the Storybook 2D look.
- **Stage** (live production) later: real-time characters and sims as live scenes.
- **Playables 2027**: Shots open as scenes; the sim layer and character rigs become playkit modules.

## Phases, each with a gate

| Phase | Builds | Done when |
|---|---|---|
| 0. Shot document | Shot schema, timeline in Plajah 3D, Send to Fabula, cameras on paths | a 10 s shot with a moving camera plays, saves, reopens and lands in Fabula |
| 1. Blocking and bodies | Rapier rigid bodies and collisions; characters walk drawn paths with foot IK; prompt-to-blocking ("put a table here, she walks to it") | a beginner blocks a 3-beat scene in under 5 minutes, at 60 fps on the Arc |
| 2. Cloth, hair, soft | shared XPBD layer; garments from build sheets; strand hair; jiggle | the police uniform's tunic and a long-haired character move believably while walking, 60 fps iGPU tier |
| 3. Liquids, smoke, fire | PBF liquid, grid smoke and fire, particle presets | a campfire in wind and a poured glass of water, live in the viewport |
| 4. Generated look | guide passes, prompt writer, local Wan 2.2 lane, linked-cloud lane, results to Fabula | a blocked shot renders through a video model and keeps its camera move and blocking |
| 5. Looks fusion | Toon/Anime shading, Storybook 2D with Anima cels in 3D, Stylized | one shot renders in four looks from one document |
| 6. Performance | webcam/phone capture to rigs, shared keyframe tools with Anima, face and lip-sync | a character speaks a line with matching mouth and a captured gesture |

**Phase 0 status (2026-11-04):** built in `services/argilla/shot/` (shot.ts: camera keys, centripetal
Catmull-Rom path with one ease over the whole move, five ready-made moves; shotStore.ts: on-device save with the
scene, built objects and picture; renderShot.ts: frame-exact MP4/WebM via mediabunny, the renderer builds its own
reflection map; shotToFabula.ts: production on V1 through Fabula's `studio:handoff`) and a timeline bar in
SceneRoom. Every scene is a shot and saves itself; the start screen lists "Your shots". Measured in the lab: a
10 s orbit of a table, lamp and two chairs saved, reopened after a reload with its five keys, rendered to
1920×1080 MP4 in 6.1 s (300 frames, decoded back, still only where the move eases at the ends), and the Fabula
production, hand-off and 0.99 MB of video bytes were written and `OPEN_FABULA` fired. Not yet seen: Fabula
opening it, because the full app needs a real sign-in. Shots are on-device only; no cloud copy yet.

Phase 4 can start in parallel after Phase 0, because guide passes only need a camera and a stage. That gets to
"3D as storyboard for a video model" early, which is the most visible part.

## Decisions (Kenne, 2026-11-04)

1. **LTX-2.x is allowed**, community licence and all. It joins Wan 2.2 as a local lane; its depth, pose and edge
   control make it the likely first choice for guided shots. Re-read its terms when revenue nears the threshold.
2. **The in-app label is "Plajah 3D"**, not just "3D".
3. **Prompt-to-motion waits for a clean licence.** No SMPL-X, Kimodo SMPL-X weights or GVHMR in anything that
   ships. Characters move by the motion-capture shelf, procedural locomotion and gestures, physics and keyframes.
4. **Desktop only to start.** The Generated look runs on the desktop app's GPU. Personal linked accounts (Kling
   and others) come after the local path works for real.

## Open checks before building

- Rapier's licence file; the three.js PBF library's licence and r184 fit; VACE-for-Wan-2.2 licence; NVIDIA Open
  Model terms for Kimodo SOMA.
- Wan 2.2 5B on the 4070 (8 GB) with SAM, Gemma and the 3D generator taking turns: measure, don't assume.
- Heat: the 4070 reached 90 °C on four Gemma pictures in a row. Long sims and video renders need the GPU heat
  guard the 3D runtime already has, and no unattended batches.

## Sources

- Open video models and licences: [Thunder Compute overview](https://www.thundercompute.com/blog/best-open-source-ai-video-generation-models), [LTX-Video repository](https://github.com/Lightricks/ltx-video), [LTX-2 vs Wan 2.2](https://www.linkmodel.ai/blog/ltx-2-vs-wan-2-2), [Wan2GP](https://github.com/suryatmodulus/Wan2GP)
- 3D blocking to video: [Blockout previs](https://github.com/wassermanproductions/blockout/wiki), [ComfyUI 3D movie pipeline](https://www.runcomfy.com/comfyui-workflows/3d-movie-pipeline-in-comfyui-ai-3d-scene-to-video-workflow), [Blender to Seedance cases](https://github.com/cheercheung/Awesome-Blender-Seedance-Workflow-Usecases/wiki)
- Motion models and licences: [Kimodo](https://github.com/nv-tlabs/kimodo), [Kimodo SMPL-X weights](https://huggingface.co/nvidia/Kimodo-SMPLX-RP-v1), [GMR](https://github.com/YanjieZe/GMR), [prompt2rig licence table](https://github.com/blendi-remade/prompt2rig)
- Realtime simulation on WebGPU: [three.js particle fluids](https://github.com/dgreenheck/threejs-particle-fluids), [XPBD cloth](https://github.com/jspdown/cloth), [three.js volumetric fire](https://threejs.org/examples/webgpu_volume_fire.html), [webgpu-vfx](https://github.com/tigerabrodi/webgpu-vfx), [Frostbitten hair WebGPU](https://github.com/Scthe/frostbitten-hair-webgpu), [WebHairSim](https://github.com/SiTronXD/WebHairSim), [Rapier](https://rapier.rs/)
