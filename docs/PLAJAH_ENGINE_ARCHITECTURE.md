# Plajah Creative Engine — On-Device-First Architecture

> Thesis: **run the whole studio on the device; use the cloud only for what silicon on the
> desk genuinely can't do.** One performance architecture for Fabula, Plajah Pixels, Lorea,
> and Crossover. Interactive brief: published as a Claude artifact (v1-engine-architecture).

## Five platform truths (2026, research-grounded)
1. **WebCodecs ≈ native FFmpeg; ffmpeg.wasm ~10× slower.** Hardware decode/encode on every hot
   path, in a worker. Never ship ffmpeg.wasm for realtime work.
2. **WebGPU is everywhere** (Chrome/Edge/Firefox 130+/Safari 26/iOS 26). Zero-copy
   `importExternalTexture(VideoFrame)` — the compositor never touches pixels on the CPU.
3. **OPFS is a real filesystem** (~60% of disk, sync access handles from workers). Large media
   lives here, not marshalled through IndexedDB blob values.
4. **The main thread is sacred** — decode/DSP/compositing/IO/sync/proxy/analysis all move off it.
5. **One state tree deep-cloned per keystroke doesn't scale** — structural sharing (or a
   Rust-owned document) makes an edit O(change), not O(project). (Fabula `updateProd` was the
   canonical offender; now structuredClone, next op-based.)

## The substrate — four shared layers under all four tools
- **Storage:** OPFS content-addressed media store + directory-handle mirror (disk-direct,
  local-first). Cloud sync is a background worker off the hot path.
- **Decode/Encode:** shared WebCodecs worker pool with hardware-decoder budgeting (generalises
  the ScrubThumb decoder-exhaustion crash lesson).
- **Compute:** one shared WebGPU device; a Rust→WASM render core (wgpu) used by Pixels + Fabula
  + Crossover-web.
- **State/Time:** a Rust-owned document + deterministic frame-accurate timeline; structural
  sharing on the JS side; CRDT-ready for collaboration.

## The big bet — `plajah-core` (Rust), compiled three ways
One crate → (a) **wasm32** for the browser (wgpu→WebGPU, WebGL2 fallback, runs in a Worker),
(b) **native** for Crossover/Tauri (real ffmpeg/NVENC), (c) **native** for Cloud Run render.
Moves into Rust: timeline doc + edit ops, wgpu compositor frame-graph, color pipeline, audio
DSP graph, proxy/thumbnail orchestration, project (de)serialize. UI + product logic stay
React/TS. **Render parity stops being chased and becomes a property.** Pixels' worker+GPU
compositor is the natural first inhabitant / proving ground.

## Cloud only for the irreducible
Durable backup + CDN share · cross-device portability · multi-user collaboration (CRDT relay) ·
heavy AI models (upscale/diffusion/stem-split) · server transcode fallback (Crossover Cloud) ·
gen-agent (Kling/Magnific).

## Per-tool from → to
- **Fabula:** deep-clone + per-clip `<video>` (decoder exhaustion) → structural-sharing doc +
  lazy/virtualised pool (shipped) → single WebGPU compositor surface replacing N `<video>`.
- **Pixels:** already the reference (worker GPU compositor + AudioWorklet/SAB + WebCodecs) →
  promote its compositor into `plajah-core` so WebGPU reaches the real GPU and others inherit it.
- **Lorea:** Firestore/epub load races + JS-marshalled page images → OPFS asset store (instant
  reopen) + WebGPU brush raster + worker page decode.
- **Crossover:** siloed native ffmpeg → the *native target* of `plajah-core` and the muscle
  behind Crossover Cloud transcode. One engine, three entry points.

## Phased roadmap
- **Phase 0 (shipped):** crash/hang fixes + true local-first playback + sync gated to idle.
- **Phase 1 (shipped):** OPFS media substrate (`services/fabula/mediaStore.ts`, OPFS-first + IDB
  fallback + migrate-on-read; `stGet/stSet` route `studio:blob:`/`studio:proxy:` through it);
  storage-dedup — watch-folder originals keep no second on-device copy (disk-direct), both cloud
  sync paths read folder bytes off the disk handle. Vector rasters still keep their copy.
- **Phase 2 (in progress):**
  - *Slice 1 (shipped):* the two foundations, built + verified before the editor depends on them —
    `services/fabula/gpuComposite.ts` (one-device WebGPU compositor: N layers, per-layer transform/
    opacity/WGSL grade + premultiplied alpha; headlessly verified — mid-gray@brightness1.5 → [192,192,
    192], grade math correct) and `services/fabula/decoderBudget.ts` (global live-decoder cap 24–48 by
    core count; ScrubThumb acquires a slot before mounting `<video>`).
  - *Slice 2 (shipped, default-off toggle):* GPU program monitor — video layers composite onto one
    WebGPU surface (`GpuStage`) instead of a stack of visible `<video>` elements. MonitorLayer still
    owns every `<video>` (seek/double-buffer/videoRef/audio); GPU mode just hides eligible video pixels
    and registers the element, and GpuStage samples those same elements each frame (GPU→GPU) applying
    transform/opacity/grade/fade. Titles/subtitles/Lottie/Pixels/images stay DOM on top; blur/matte/
    blend layers stay DOM. `⚡ GPU` toggle in the monitor transport (WebGPU-only), **default off**; any
    error or blank-output health check auto-reverts to the MonitorLayer renderer (byte-identical
    fallback). Engine verified in-browser (blue→[0,0,255,255]; 0.5-scale letterboxes correctly).
    Default-off because the composited output on real footage can only be verified on the user's
    device; flip to default once confirmed.
  - *Slice 2b (next):* verify on a real project → make GPU default; then route the timeline warm-buffer
    decoders through the budget/shared pool; grade parity (exact CSS-filter match) + advanced blend modes.
- **Phase 3 (6–10 wks):** `plajah-core` in Rust — compositor first, then op-based doc, then
  Cloud Run render on the same crate.
- **Phase 4 (ongoing):** CRDT collaboration + cloud-only AI + Crossover Cloud fallback.

## Success metrics (today → target)
- 3,700-file project TTF: hang/crash → <1.5s
- Edit latency: O(project) → <16ms O(change)
- Playback source when on disk: sometimes cloud → always local
- Multi-layer preview: drops at cuts → locked 60fps
- Preview↔export parity: approximate → bit-exact (one engine)
- Duplicate on-disk storage: 2× media → ~0 (mirror)

## Risks / mitigations
Rust bar → confine to the engine crate; codec gaps → HEVC(Safari)+AV1(rest)=99.7% decode,
Crossover Cloud covers the rest; WebGPU fallback → wgpu→WebGL2, keep 2D-capture grade floor;
OPFS eviction → disk mirror is the master, OPFS is a cache; big-bang risk → every phase ships
alone and is reversible, Pixels de-risks the engine before Fabula depends on it.
