# Fabula — GPU Grading + SAM 2 Tracked Mattes (execution blueprints)

Both approved. Status: **Slice 0 of GPU grading shipped** (per-clip grade export parity via
ctx.filter canvases in offlineRenderer — what you grade is what you export). The rest below.

---

## Project 1 — Per-clip GPU grading (wheels, curves, qualifiers) + worker compositor

These land TOGETHER because they're the same engine change: the program monitor moves onto the
Pixels GL compositor, and the compositor learns a per-input grade stage.

### Phase A — Compositor per-input grade stage (engine)
- `compositor.ts`: extend the input struct with `grade?: { lift: vec3, gamma: vec3, gain: vec3,
  sat, hue, temp, tint, contrast, pivot }`. In the composite fragment shader, apply per-input
  BEFORE blend: `c = gain * pow(max(c + lift, 0.0), 1.0/gamma)` (per channel), then contrast
  around pivot, then hue/sat via YIQ rotate, temp/tint as RB/GM gains.
- Curves: a 256×1 LUT texture per input (host-side Catmull-Rom from the UI's control points);
  sample after the wheels. Qualifier (secondaries): HSL keyer in-shader → mask → grade blend
  (Resolve-style): `qual: { hueRange, satRange, lumRange, softness }` + optional power window
  (ellipse/rect + softness, already have matte math in MonitorLayer's clipPath model).
- offlineRenderer passes the same struct → export parity for free. Replace the Slice-0
  ctx.filter path for clips that carry the new grade model (keep ctx.filter fallback for the
  legacy fields).

### Phase B — Worker monitor (playback)
- New `FabulaMonitor` component: one `<canvas>` (transferControlToOffscreen) + a worker running
  Compositor + per-track video sources. Main thread posts the timeline snapshot + transport
  state; worker pulls frames via `createImageBitmap(video)` per rAF (or WebCodecs VideoDecoder
  per clip once Phase C lands) and composites with per-input grade/transform/blend.
- The DOM MonitorLayer stack remains as fallback (feature flag `fabula:glmonitor`).
- This is ALSO the playback endgame: zero React, zero DOM compositing in the frame path.

### Phase C — WebCodecs decode pipeline (render speed endgame)
- `services/fabula/decodePipeline.ts`: MP4Box.js demux → VideoDecoder → frame queue per clip.
  offlineRenderer consumes decoded VideoFrames directly (no <video> seeks at all).
  Expected: renders bounded by encode speed, not seek latency.

### Color page UI upgrades once Phase A lands
- Three trackball wheels (lift/gamma/gain) with ring = master offset; curves editor (4-point
  Catmull-Rom per channel); qualifier eyedropper (sample from the monitor canvas readback —
  scopes already prove the readback path); temp/tint sliders replace WARMTH.

## Project 2 — SAM 2 tracked mattes (Crossover cloud/native tier)

Browser-side SAM 2 video tracking is not viable (multi-GB weights, GPU memory). It runs on the
Crossover tier and returns a **matte video** the browser composites.

### Server (Crossover Cloud Run — new endpoint)
- `/api/crossover/matte`: body = { videoUrl (cloud asset), prompts: [{frame, points|box}],
  range: {inSec, outSec} }. Runs SAM 2 (facebookresearch/sam2, Apache-2.0) on GPU Cloud Run
  (or the desktop Crossover app with local GPU — same contract), encodes the mask stream as a
  grayscale H.264 MP4 (matte video), uploads next to the asset:
  `users/{uid}/fabula/{project}/{asset}.matte.mp4`, returns the URL.
- Desktop Crossover (Tauri) variant: same contract, local ONNX/PyTorch — free + fast on the 4070.

### Client (`services/fabula/matteService.ts`)
- `requestTrackedMatte(asset, prompts, range)` → POST, poll, then store matte URL on the asset
  (`asset.matteUrl`) + stash locally (`studio:matte:<id>`).
- UI: in the monitor, a MATTE mode — click the subject (positive/negative points, SAM-style),
  scrub to verify, SEND TO CROSSOVER. MediaPipe ImageSegmenter (already in liveComposer) gives
  the instant person-mask preview while SAM 2 runs for the tracked, non-person-capable result.

### Compositing consumption
- Engine: input struct gets `matte?: TexImageSource` — shader multiplies alpha by matte luma
  (same place the qualifier mask lands in Phase A; one mask system serves both).
- Comp Builder: media layers get a MATTE toggle when `asset.matteUrl` exists → cutout subject
  over any background; MonitorLayer preview via CSS `mask-image` (video masks are Chromium-ok)
  until the GL monitor lands.

### Order of execution
1. Phase A (engine grade+mask stage) → 2. Color UI (wheels/curves/qualifier) → 3. Phase B worker
monitor → 4. matteService + MATTE mode UI + server endpoint → 5. Phase C decode pipeline.
