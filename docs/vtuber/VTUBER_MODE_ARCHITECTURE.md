# Plajah VTuber Mode — Architecture

**Goal:** drive a 3D avatar (a "VTuber") from a person on camera in **real time, high quality, on-device** — track the person's face (and optionally upper/full body + hands), retarget that motion onto a rigged avatar, and **composite the avatar over or in place of the person**. Available as a **mode in the TV Studio video switcher**, in **live feeds**, and as a **per-clip effect in the Fabula editor**.

**🎯 No tracker equipment — a webcam is the only requirement.** This is the headline principle. There is **no mocap suit, no VR/AR headset, no depth camera (no iPhone TrueDepth / Kinect), no face dots, no Leap Motion** — nothing to buy or wear. We achieve this with **markerless RGB tracking**: MediaPipe infers face blendshapes, body pose, and hands *purely from an ordinary 2D camera image*. Any laptop/phone webcam works. (This is also why it must be local + GPU-accelerated — the model does the work the hardware would otherwise do.)

**Local-first, open-source, no cloud inference.** All tracking + rendering runs in the browser on the user's GPU. Model files are self-hosted in `/public`.

---

## 0. One-paragraph architecture

> A **VTuber Engine** takes a `MediaStream` (webcam) in, runs **MediaPipe Tasks-Vision** trackers (face landmarks + 52 ARKit blendshapes, pose, hands, selfie segmentation) on the GPU, **retargets** the results onto a **VRM avatar** (`@pixiv/three-vrm`, already a dependency) with one-euro smoothing, **renders** the avatar to an offscreen WebGL canvas, **composites** it with the camera (segmentation mask / background / overlay), and exposes the result as a new `MediaStream` via `canvas.captureStream()`. That output stream is a drop-in source for the switcher, live feeds, and Fabula clips.

```
 webcam ─► [Tracker: MediaPipe GPU]         (face blendshapes + pose + hands + mask)
              │
              ▼
        [Retarget + smooth]  ─► VRM bones + expressions
              │
              ▼
        [three-vrm render → offscreen canvas]
              │
   camera ────┼─► [Compositor: mode = avatar-only | face-overlay | body-overlay | PiP]
              ▼
        output canvas ─► captureStream() ─► switcher / live / Fabula
```

---

## 1. Modes (what "VTuber" produces)

| Mode | What you see | Tracking used | Compositing |
|---|---|---|---|
| **Avatar Only** | The avatar replaces you, on a chosen background (color / image / transparent / your scene) | face + (opt) pose + hands | avatar canvas over background; person hidden |
| **Face Overlay (AR mask)** | The avatar's head/face is aligned and laid over **your real face** — your body stays | face landmarks (head pose + blendshapes) | avatar head rendered at the face transform, composited on the live camera |
| **Body Overlay** | The avatar is laid over **your face + body**, masked to your silhouette so it moves with you in-frame | face + pose + **selfie segmentation** | segmentation mask cuts you out; avatar composited into that region over the background |
| **Picture-in-Picture** | Avatar in a corner, reacting live (commentary cam) | face (+ hands) | avatar canvas in a draggable PiP box over the main feed |

All four are the **same engine** with a different compositor step. Avatar-Only and PiP are the highest quality / most robust (no per-pixel alignment); the Overlay modes are the "filter on the real person" look.

---

## 2. Tracking stack — MediaPipe Tasks-Vision (open source, on-device)

**Why MediaPipe (Google, Apache-2.0):** the only stack that gives **52 ARKit-equivalent face blendshapes** *and* pose *and* hands *and* segmentation, all running in-browser via **WASM + WebGL/WebGPU GPU delegate**, at 30–60 fps, fully local. Package: `@mediapipe/tasks-vision` + self-hosted `.task` model files + the WASM bundle.

- **FaceLandmarker** — 478 face landmarks + **52 blendshape coefficients** (jawOpen, mouthSmile, eyeBlink, browDown, etc.) + a 4×4 facial transform matrix (head pose). `outputFaceBlendshapes: true`, `outputFacialTransformationMatrixes: true`. This is the heart of VTuber expression.
- **PoseLandmarker** (Lite/Full/Heavy) — 33 body landmarks (shoulders, elbows, wrists, hips…) for upper/full-body avatar motion. Tiered model so weak devices use Lite or face-only.
- **HandLandmarker** — 21 landmarks/hand for finger articulation (optional; cost-gated).
- **ImageSegmenter** (selfie model) — per-pixel person mask for the Body-Overlay compositing.

All run from a single `FilesetResolver` over the WASM bundle. GPU delegate (`delegate: 'GPU'`) is required for real-time. Each tracker runs in **VIDEO mode** (`detectForVideo(frame, timestampMs)`), driven by `requestVideoFrameCallback` for frame-accurate, vsync-paced inference.

**Tiering (quality vs. perf):** Face-only (cheapest, always on) → +Pose → +Hands → +Segmentation. The engine auto-drops tiers if frame time exceeds budget (see §6).

**Alternatives considered:** TensorFlow.js (`@tensorflow/tfjs`, already a dep) has FaceMesh/BlazePose/SelfieSegmentation but **no blendshapes** — weaker for expression. MediaPipe is the right call; tfjs stays available as a fallback path for face mesh on unsupported browsers.

---

## 3. The avatar — VRM via `@pixiv/three-vrm` (already a dependency)

**VRM** is the open standard for VTuber avatars (humanoid rig + standardized expressions + spring-bone physics for hair/cloth). `@pixiv/three-vrm` (`^3.5.2`) and `three` (`^0.184.0`) are **already in `package.json`**, and Plajah already has 3D/avatar surfaces (Avatar Studio, three scenes) to reuse.

- Load a `.vrm` with `GLTFLoader` + `VRMLoaderPlugin`; get `vrm.expressionManager`, `vrm.humanoid`, `vrm.lookAt`, `vrm.springBoneManager`.
- **Expressions:** set `vrm.expressionManager.setValue('aa'|'ih'|'ou'|'ee'|'oh'|'blink'|'happy'|…, weight)` from retargeted blendshapes.
- **Bones:** rotate humanoid normalized bones (`getNormalizedBoneNode('head'|'neck'|'spine'|'leftUpperArm'|…)`) from the facial transform + pose.
- **Per-frame:** `vrm.update(delta)` runs lookAt + spring bones (natural hair/cloth motion).
- Render with a transparent WebGL background so the avatar composites cleanly.

**Avatar library:** ship a few CC0/Plajah-owned VRM avatars in `/public/vrm/`; later let creators upload their own `.vrm` (and tie to Worlds/IZU skins). Reuse Avatar Studio's existing VRM handling where possible.

---

## 4. Retargeting — MediaPipe → VRM (the secret sauce)

A pure module that maps tracker output to avatar controls, frame by frame:

- **Face → expressions:** map MediaPipe's 52 ARKit blendshapes → VRM expression presets. Vowel mouth shapes (aa/ih/ou/ee/oh) are derived from `jawOpen` + `mouth*` for lip-sync; `eyeBlink_L/R` → `blink`; brow/cheek/smile → `happy/angry/sad/relaxed`. Eye gaze → `vrm.lookAt`.
- **Head pose:** decompose the FaceLandmarker 4×4 facial transform matrix → head/neck bone rotation (with a neck/spine distribution so it looks natural, not a bobblehead).
- **Body (pose):** shoulder/elbow/wrist landmarks → upper-arm/lower-arm bone rotations; hips/shoulders → spine lean. Solve in a stable, foot-agnostic way for seated/standing upper-body framing (the common VTuber shot).
- **Hands:** 21 landmarks → finger curl per joint.
- **Smoothing:** a **One-Euro filter** per signal (low latency + low jitter) — critical for "high quality." Blink and lip-sync get lighter smoothing; head/body get more.

This is the same job the open-source **Kalidokit** (MIT) does; we either depend on it or hand-roll a tighter Plajah retargeter (no extra dep, full control). **DECISION — hybrid:** the **face** retargeter is hand-rolled (shipped in `services/vtuber/retarget.ts` — small, precise, no dep), and **pose/hands** use Kalidokit-style solving math (Phase 3). Best of both: tight control on the expression path that matters most, proven math for the limb IK.

---

## 5. Compositing

A small WebGL/Canvas2D compositor that assembles the final frame per mode (§1):
- **Background:** solid color, image, the avatar-only transparent → switcher scene behind, or the live camera.
- **Segmentation (Body Overlay):** ImageSegmenter mask → feather edges → composite the avatar only where the person is (or cut the person out and drop the avatar on the chosen background).
- **Face Overlay:** render just the avatar head at the tracked face transform, alpha-blended over the live frame.
- **PiP:** avatar canvas drawn into a movable/resizable box.
Output to a single canvas; `canvas.captureStream(30)` yields the `MediaStream` consumed downstream.

---

## 6. Real-time pipeline & performance

**Threading:** run trackers + three-vrm render off the main thread where possible — **OffscreenCanvas + Web Worker** for the render, MediaPipe in the worker too (it supports it), main thread only does compositing + UI. Fallback to main-thread if OffscreenCanvas/worker MediaPipe unavailable.

**Pacing:** drive the loop from `video.requestVideoFrameCallback` so inference matches camera fps; never block. Decouple tracker fps (can be ~30) from render fps (can be 60 with interpolation) using the smoothed targets.

**Budget & auto-tiering:** measure per-frame ms; if over budget, drop in order: hands → segmentation → pose → reduce pose model (Heavy→Full→Lite) → face-only. Surface a quality selector (Performance / Balanced / Quality) that sets the starting tier + camera resolution.

**GPU:** MediaPipe GPU delegate + WebGL2 render; **WebGPU** path when available (faster three render + future MediaPipe WebGPU). One-euro smoothing keeps it crisp without buffering latency.

**Targets:** 30 fps face-only on a mid laptop; 60 fps avatar render; <80 ms motion-to-photon. All local — zero network after model load.

---

## 7. Local-first delivery

- Self-host the MediaPipe **WASM bundle** + **`.task` models** under `/public/mediapipe/` (no CDN dependency, works offline, predictable latency). Lazy-loaded only when VTuber mode is enabled (don't bloat first paint).
- VRM avatars under `/public/vrm/`.
- No frames or landmarks leave the device. (Important for the kids/education contexts too — on-device only.)

---

## 8. Module design (the code shape)

```
services/vtuber/
  vtuberEngine.ts     createVTuberStream(input: MediaStream, opts) → { stream, controls, dispose }
  trackers.ts         MediaPipe FaceLandmarker / Pose / Hand / Segmenter init + per-frame detect
  retarget.ts         MediaPipe results → VRM expressions + bones (+ one-euro filter)
  compositor.ts       mode-based final-frame assembly
  oneEuro.ts          one-euro smoothing filter
components/
  VTuberStage.tsx     self-contained preview + controls (avatar picker, mode, quality, calibrate)
public/
  mediapipe/…         self-hosted WASM + .task models
  vrm/…               avatar library
```

**Public API (the seam everything plugs into):**
```ts
const vt = await createVTuberStream(webcamStream, {
  avatarUrl: '/vrm/aria.vrm',
  mode: 'AVATAR_ONLY' | 'FACE_OVERLAY' | 'BODY_OVERLAY' | 'PIP',
  tier: 'FACE' | 'POSE' | 'HANDS' | 'FULL',
  background: { type: 'transparent' | 'color' | 'image', value? },
});
// vt.stream  → MediaStream (drop-in source)
// vt.controls.setMode/setAvatar/setBackground/calibrate
// vt.dispose()
```
Because the output is just a `MediaStream`, the switcher, live feeds, and Fabula all consume it **without knowing anything about VTuber internals**.

---

## 9. Integration seams (mapped to real files)

The output **canvas / `MediaStream` is the universal adapter** — every surface consumes it without knowing VTuber internals. Established patterns to reuse:
- **MediaPipe is already CDN-loaded** in `components/plajahPixels/engine/matting/matteEngine.ts` (`@mediapipe/tasks-vision@0.10.14`, `FilesetResolver.forVisionTasks`, `ImageSegmenter.segmentForVideo`). The face tracker uses the **same dynamic-import pattern** (swap `ImageSegmenter` → `FaceLandmarker` with `outputFaceBlendshapes` + `outputFacialTransformationMatrixes`). (Self-host the WASM/models later per §7.)
- **VRM rendering** exists in `components/AvatarViewer.tsx` (`GLTFLoader` + `VRMLoaderPlugin`, `vrm.update(delta)`, `vrm.humanoid.getBoneNode(VRMHumanBoneName.*)`, `vrm.expressionManager`). AvatarViewer is **R3F (declarative)**; the engine needs an **imperative** offscreen three renderer (`vrmRig.ts`) reusing the same load/update calls so its canvas can be composited. Avatar uploads already flow through `AvatarStudio.tsx` → `AvatarConfig` (`type:'VRM'`, `modelUrl`).

**TV Studio switcher — `services/tvStudioEngine.ts`:**
- `StudioSource` gains `vtuberProcessor?: { canvas: HTMLCanvasElement; setMode/setAvatar; dispose() }`.
- `_drawSource(ctx, src)`: when `src.vtuberProcessor` is set, `ctx.drawImage(src.vtuberProcessor.canvas, …)` instead of `src.videoEl` — the avatar canvas replaces the raw camera in the program/preview composite.
- A method `enableVTuber(sourceId, opts)` wires a camera source's `videoEl`/`stream` into a `VTuberEngine` and stashes its output canvas on the source. Color correction + transitions + overlays still apply on top, unchanged.
- Output already publishes via `getProgramStream(fps)` (`canvas.captureStream`) → recording + WebRTC get VTuber for free.

**Live feeds / WebRTC:** the same camera-source path feeds `rtcCore`/live components; publishing `vtuberProcessor.canvas.captureStream()`'s track in place of the raw `getUserMedia` track puts VTuber on any live room.

**Fabula editor — `components/Fabula/Fabula.jsx` + `services/fabulaRender.ts`:**
- New clip `kind: 'vtuber'` with `{ cameraSourceId | assetId, avatarId, vtuberTracking: { face, pose, hands, segmentation } }` (alongside the existing `fx` block so transforms/blend/fades still apply).
- In `fabulaRender.ts`, `itemToSnapshot`/`resolveLayers`: a vtuber clip renders the avatar canvas as its layer. **Live/record path** uses the realtime engine; **export of a recorded clip** runs the tracker offline frame-by-frame against the source video and bakes the avatar (quality > speed). The `fx` opacity/scale/blend then composite it on the timeline exactly like any other layer.

**Engine module:** `services/vtuber/{oneEuro,vrmRig,faceTracker,retarget,vtuberEngine}.ts` + `components/VTuberStage.tsx`. `createVTuberStream(inputStream, opts)` is the single entry the switcher/live/Fabula all call.

---

## 10. Phased build

1. **Engine core (face):** MediaPipe FaceLandmarker → VRM expressions + head pose → render → `VTuberStage` preview (Avatar-Only + PiP). The 80% that delivers the VTuber feel.
2. **Switcher integration:** VTuber source type + controls in the TV Studio switcher.
3. **Body + segmentation:** Pose + ImageSegmenter → Body-Overlay + Face-Overlay modes; hands.
4. **Live feeds:** publish the VTuber stream over WebRTC.
5. **Fabula:** per-clip VTuber effect (realtime + baked/offline for export).
6. **Avatar creation — character sheet → VTuber (§12):** 2D-puppet (local, instant) then 3D-VRM generation; tie to Worlds/IZU + Creator Passport ownership.
7. **Hardening:** WebGPU render path, worker + OffscreenCanvas, auto-tiering polish, self-hosted MediaPipe models.

---

## 11. Decisions
1. ✅ **Retargeter — HYBRID.** Hand-rolled face retargeter (`retarget.ts`, shipped) + Kalidokit-style pose/hand math (Phase 3).
2. ✅ **Threading — main-thread MVP**, move trackers + render to a Web Worker + OffscreenCanvas in Phase 3.
3. ✅ **Avatars are user-generated from a character sheet** (see §12) — that is the primary creation path, not a fixed CC0 library. Still ship 1–2 CC0 VRMs as the zero-upload default + for testing; moderation on uploads/generations.
4. **Self-host vs CDN** for MediaPipe assets at launch — lean self-host for local-first + offline (Phase: hardening).
5. **Fabula export**: realtime-capture bake vs. offline per-frame re-render (quality vs. speed) — decide at Phase 5.

---

## 12. Character Sheet → VTuber (upload a drawing, get an avatar)

**The creation promise:** a user uploads a **character sheet** (a drawing / reference of their character) and Plajah **builds a drivable VTuber from it** — no modeling, no hand-rigging. Two output paths, **one realtime driver** (the Phase-1 engine). Key framing: avatar **creation is a one-time bake**; avatar **driving is the local realtime engine** we already built. So the factory just needs to emit something the engine can drive.

### Input
- A single character image (portrait or full-body), **or** a multi-view sheet (front / ¾ / side / back). More views → better 3D; we accept any and quality scales with what's given.
- Pre-process: background removal (SAM / MediaPipe ImageSegmenter), upscale, orientation-normalize.

### Path A — 2D Live-Puppet (instant, fully local, works from ANY single drawing)
Live2D-style without Live2D. The always-available default — best when the sheet is one stylized image.
1. **Segment** the character (SAM / MediaPipe) → clean cutout + alpha.
2. **Part decomposition:** run FaceLandmarker on the drawing (works on illustrated faces) + segmentation → isolate movable layers (L/R eyes, brows, mouth, head, hair, torso, arms); synthesize open/closed-eye + vowel mouth variants by warping the source regions.
3. **Auto-rig a deformation mesh:** triangulate the cutout, bind vertices to the detected landmarks + part layers; define deformers (blink, vowel mouths, head yaw/pitch parallax, body lean).
4. **Drive:** the **same MediaPipe tracker + retargeter** → warp the mesh + swap eye/mouth states in a WebGL/Canvas2D layer. Fully local, realtime, from a single drawing. Lower fidelity than 3D but immediate and universal.

### Path B — 3D VRM Generation (high quality; generation is a heavier, GPU step)
Best when the user wants a true 3D avatar (head-turn, depth, lighting, spring-bone hair).
1. **Image → 3D mesh:** open-source single-/multi-image-to-3D. **CharacterGen** (anime-specialized, 2024) for stylized characters; **TripoSR / InstantMesh / LGM** for general. Multi-view sheets feed multi-view reconstruction.
2. **Auto-rig → humanoid:** fit the mesh to a standard humanoid skeleton (template-fit / learned auto-rigger) and **export VRM** (humanoid bones + spring bones).
3. **Auto-blendshapes:** synthesize the VRM expression set (aa/ih/ou/ee/oh, blink, happy/angry/sad/surprised) as morph targets from the face region.
4. **Drive:** the resulting `.vrm` drops **straight into the existing `vtuberEngine`** — zero new realtime code; the factory just yields an `avatarUrl`.

**Where the heavy AI runs:** image→3D + auto-rig need a GPU. Two options, mirroring Plajah's existing Veo/Suno/Gemini generation: (a) **local WebGPU** when the device supports it (ONNX Runtime Web / transformers.js), (b) a **server AI endpoint** otherwise. Recommendation: **Path A is the local, instant default**; **Path B is an opt-in "make it 3D"** that uses WebGPU-if-available else the server. Either way it's a one-time bake, then driving is fully local.

### The seam — `VTuberAvatarFactory`
```ts
type AvatarDescriptor =
  | { kind: 'VRM'; url: string; source: 'upload' | 'generated' }
  | { kind: 'PUPPET2D'; rig: Puppet2DRig };          // layered 2D mesh + deformers

buildVTuberFromSheet(image: Blob, opts): Promise<AvatarDescriptor>
```
The realtime engine accepts an `AvatarDescriptor`: **VRM** → the three-vrm rig we built; **PUPPET2D** → a parallel 2D-puppet driver. Both consume the **same** MediaPipe tracker + retargeter outputs, so the tracking half is shared. Avatar Studio's existing upload flow extends to accept a character sheet → routes it through the factory → stores the descriptor on the user's `AvatarConfig`.

### Character-sheet phases
A. **2D-puppet MVP (local):** sheet → segment → face-region rig → realtime warp. Delivers "upload a drawing, VTube instantly," fully on-device.
B. **3D generation:** wire CharacterGen/TripoSR (WebGPU local or server endpoint) → mesh → auto-rig → VRM → feed the existing engine.
C. **Polish:** multi-view sheets, better auto-blendshapes, a creator touch-up pass (re-place a layer, nudge a deformer), and tie generated avatars to **Worlds/IZU + Creator Passport** ownership.
