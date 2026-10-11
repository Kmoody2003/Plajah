# Fabula vs Premiere Pro / After Effects — gap assessment, with ArtCraft as reference

2026-10-10. Research only: no product code changed. This document builds on `EDIT_COLOR_FX_GAP_PLAN.md` (2026-08-27), `GPU_GRADE_AND_SAM2_PLAN.md`, `AUDIO_SEPARATION_PLAN.md`, `GEN_AGENT_PLAN.md`/`GEN_HANDOFF_PLAN.md`, `AAF_INTERCHANGE_PLAN.md` and `FX_SUITE_BUILD_LOG.md` and does not repeat them. Much of the 08-27 plan has since shipped: keyframes (H1), grade layers (H2), the node compositor (H3), real transitions, curves, the qualifier, power windows and the render queue. The scorecard below reflects the code as it is today.

Program context: `docs/tela/GAUNTLET.md`. The shared engines this plan reuses are:
- the text engine (`rust/plajah-text` + `services/text`);
- vector geometry (`services/tela/geometry`);
- the raster engine (`services/tela/raster`);
- the existing Rust crates `plajah-math` (tracking, homography) and `plajah-color` (LUT, grade).

## ArtCraft rule (binding, Kenne 2026-10-10)

ArtCraft (github.com/storytold, MIT OR Apache-2.0, pure Rust) is a **reference and a test oracle, never a dependency**:
- no ArtCraft crates in Cargo;
- no vendored code;
- no adopted data models.

Where ArtCraft does something better, we reimplement the *idea* natively in Fabula's model (the clip `fx` bag, `LayerInput`, the Forge registry, the Pixels compositor, Tela specs) and credit the idea in the engine doc. Fabula's integrations take priority over any ArtCraft design: Tela documents on the timeline, lower thirds and motion templates, the Pixels render-core, the Melos mixer, and the live switcher / TV Studio.

### What the references actually are (read-only study, 2026-10-10)

| Repo | Clones | Size | Tests | Age | Honest maturity |
|---|---|---|---|---|---|
| storytold/filmcraft | Premiere Pro | 45 crates, ~360k Rust LOC, 5 WGSL shaders | 2,792 `#[test]`, codec oracle tests, golden images | created 2026-09-30, about 11 days old, v0.6.0 | Alpha. The core algebra is strong: time, edits, captions, loudness, LUTs, colour transforms. Playback, GPU coverage and real-media robustness are weak. There is no PR CI (its own `docs/gaps.md` G4), launch crashes are open, and fidelity has never been checked against Premiere. Self-rated "56% ready for real work". |
| storytold/effectcraft | After Effects | 32 crates, ~338k Rust LOC, 28 WGSL files (~15k lines) | 2,854 `#[test]`, golden hashes | created 2026-10-01, v0.8.0 | Alpha. Covers almost every AE feature area and the algorithms are textbook-correct, but it is tested on synthetic data and its own hashes. `docs/effects-parity.md` lists AE render match as "unmeasured". It cannot open `.aep`. Self-rated performance 35%, 3D 35%. |
| storytold/lightcraft | Lightroom | ~24 crates, ~204k LOC | 2,594 | Oct 2026 | Alpha (~61%). A photo grader; no video wheels, OCIO or scopes beyond a histogram. See §5 |
| storytold/soundcraft | Pro Tools | ~14 crates, ~72k LOC | 549 | Oct 2026 | Pre-alpha (~40%). Strong mixer/DSP core; no stems or denoise. See §5 |

Both main repos were written mostly by agents (AGENTS.md/CLAUDE.md, "Opus 5.5 agent-hours" in their ROADMAPs) at very high volume. **Treat them as an algorithm cookbook with good citations, not as battle-tested engines.** The press figure of ~25–35% parity matches their own "ready" numbers more closely than their "feature breadth" numbers (86–91%).

---

## 1. Scorecard

Legend: **E** = exists (usable end to end, preview and export agree) · **P** = partial · **M** = missing.
"AC" is ArtCraft's state in that area (FC = FilmCraft, EC = EffectCraft).
Paths are repo-relative; `Fabula.jsx` means `components/Fabula/Fabula.jsx` (10,761 lines).

### 1.1 Editing

| Feature | Premiere/AE | Fabula | Evidence | AC |
|---|---|---|---|---|
| Ripple / roll / slip trim | PR | **E** | `Fabula.jsx:770` trimMode, `:4696-4698` slip body-drag, `:6250` mode switch | FC E, plus a transactional clamp-then-apply algebra (`edit/src/lib.rs:635-1003`) |
| Slide trim, dynamic JKL trim | PR | **M** | no `slide` trim mode in `:6250` | FC E (slide `:923`) |
| Rate-stretch, speed, reverse, freeze, time remap | PR, AE | **M** | no clip speed field. The export maps time as `lt = kfT + srcIn` (`services/fabulaRender.ts:287`) | FC E (speed/reverse/frame_hold on `TrackItem`; optical-flow retime) |
| Ripple / lift delete, range ripple | PR | **E** | `Fabula.jsx:4250-4251` | FC E |
| 3/4-point insert / overwrite / replace / fit-to-fill | PR | **M** | the source In/Out only ever appends | FC E (sync-lock semantics) |
| Track lock / sync-lock | PR | **M** | no track lock anywhere | FC E |
| Multicam | PR | **P** | Group creation `:4151-4160`, angle grid `:5386`, angle cut `:5681`, manual offsets `:5685`. **No audio sync** (`:5699` says it needs server analysis). **Multicam clips export black**: `itemToSnapshot` has no multicam branch (`fabulaRender.ts:47-70`). | FC E (GCC-PHAT audio sync, live cut record, flatten) |
| Nesting / compound clips | PR, AE | **P** | Pixels scenes drill in view-only (`Fabula.jsx:2645`). The compositor can precompose (`compositor.ts:419-422, 534`), but users cannot make a compound clip or nested sequence | FC E (`ItemKind::Sequence(Arc)`, copy-on-write) |
| Proxies | PR | **E** | `services/fabula/proxyBuilder.ts` (mediabunny/WebCodecs), `proxyTranscoder`; the export bypasses proxies | FC E |
| Markers | PR | **P** | `Fabula.jsx:787` is `useState([])`. Markers drive snapping, beat grids and deliver ranges (`:3916`, `:4680`) but have no name, colour or note, and are not persisted | FC E |
| Undo / redo | PR | **E** | `Fabula.jsx:856` histRef | FC E |
| Interchange | PR | **P** | FCPXML round-trip (`services/fabula/fcpxml.ts`), EDL export (`Fabula.jsx:3847`), FCP7/EDL import. AAF only planned | FC E-ish (EDL, FCP7, FCPXML, OTIO, AAF, OMF with loss reports; never validated in Avid) |

### 1.2 Timeline and audio

| Feature | Fabula | Evidence | AC |
|---|---|---|---|
| Unlimited dynamic tracks, linked A/V, detach audio | **E** | `prod.tracks`, linkId, `detachAudio` | FC E |
| Channel strip (clip and track EQ ×5, compressor, pan, sends) | **E** | `services/fabula/audioGraph.ts:1-13, 15-37` | FC E |
| Groups, master inserts/EQ/mastering/limiter | **E** | `audioGraph.ts:172-260`, `<MixConsole>` `Fabula.jsx:8653` | FC E (submix graph, plugin-delay compensation) |
| Volume / pan **automation** (keyframes, write/latch/touch) | **M** | `KF_PARAMS` (`services/fabula/keyframes.ts:93-104`) has no vol or pan | FC E (sample-accurate lanes, latch/touch/write) |
| Loudness metering / normalise in Fabula | **M** in Fabula | A BS.1770 worklet exists in Melos and targets exist in `services/loudnessQC.ts`. Neither is imported by Fabula | FC E (R128, LRA, true peak, oracle test) |
| Transition audio crossfades | **P** | correct in export (`fabulaRender.ts:162-168`); the monitor only approximates (`Fabula.jsx:9202`) | FC E |
| Stems / dialogue separation | **P** | `quickStems` / `separateStemsCloud` `Fabula.jsx:89, 4885`; the Crossover worker is not deployed (see `AUDIO_SEPARATION_PLAN.md`) | FC M |
| Plugin hosting | **P** | `rust/plajah-vst3-host` exists, but only `windowsBridgeService.ts` references it | — |

### 1.3 Colour

| Feature | Fabula | Evidence | AC |
|---|---|---|---|
| Wheels, temp/tint, primaries | **E** | `ColorWheels.jsx`, `compositor.ts:349-367` InputGrade | FC E (Lumetri) |
| Curves | **E** | `services/fabula/gradeCurves.ts`, `<CurveEditor>` `Fabula.jsx:8459` | FC E |
| Hue-vs-hue/sat/lum curves | **M** | — | FC E (Lumetri) |
| HSL qualifier, power windows (rect/ellipse) | **E** | `compositor.ts:358-366`, eyedropper `Fabula.jsx:738` | FC P |
| Bezier/polygon windows, tracked windows | **P** | no bezier window; tracks bind to Forge masks, not to grade windows | — |
| Grade layers / secondaries | **E** | `Fabula.jsx:8197-8199` fx.grades | FC P (stack) |
| `.cube` LUT import | **E** | `Fabula.jsx:7595`; trilinear lookup in `compositor.ts:41-44`; Rust trilinear in `rust/plajah-color/src/lut.rs` | FC E (.cube with shaper and .3dl, read+write, **tetrahedral**) |
| LUT export / bake | **M** | — | FC E |
| Scopes | **P** | `ColorScopes.jsx` (116 lines) has waveform, parade, vectorscope and histogram, via 8 fps CPU readback | FC E (CPU) |
| Colour management, log, ACES, HDR (PQ/HLG) | **M** | `RGBA8` targets (`components/plajahPixels/engine/core/glUtil.ts:82-88`), implicit sRGB, no log curves | FC E (linear working space, BT.2390 EETF, ACES gamut compression, camera log); EC E (OCIO/ACES) |
| Shot match / auto colour | **M** | — | FC E (LM solve in Lumetri's own params, with skin protection) |

### 1.4 Effects and transitions

| Feature | Fabula | Evidence | AC |
|---|---|---|---|
| GPU effect library | **E (strong)** | Forge registry `components/plajahPixels/engine/fx/*`: ~199 effects (175 per `FX_SUITE_BUILD_LOG.md` plus 24 in phase4), ~470 presets. Behaviour-swept and pinned by `tests/forgeRegistryIntegrity.test.ts` | EC 306 effects (280 GPU compute, 32-bit float); FC ~29 GPU ops plus CPU fallback |
| Per-effect masks (shape/subject/depth), track bindings, audio bindings, effect keyframes | **E** | `services/fabula/forgeBindings.ts`, `engine/fx/audioReact.ts` | EC P (no audio reactivity) |
| Transitions | **E** | registry `engine/fx/phase3Transitions.ts` (49+ tested at both endpoints, growing) plus the 17 legacy ones; `tests/forgeTransitions.test.ts` | FC E (same p=0/p=1 contract) |
| Looks | **E** | `services/fabula/forgeLooks.ts` | — |
| Blend modes | **P** | 11 modes (`compositor.ts:23-26`); node merge has 8 (`nodeGraph.ts`) | EC 38, FC 27 |
| Adjustment layers | **M** | — | EC E, FC E |
| Track mattes (alpha/luma, inverted) | **M** | only wipe mattes (`compositor.ts:63, 414`) and effect aux inputs | EC E (`project/src/lib.rs:775-800`) |
| Motion blur (shutter angle) | **M** | the Motion Council skips shutter because "Fabula has no motion-blur engine" | EC E (sub-sampled, inherits through precomps) |

### 1.5 Motion graphics (the After Effects side)

| Feature | Fabula | Evidence | AC |
|---|---|---|---|
| Keyframes | **P** | `services/fabula/keyframes.ts:13-31`: 5 eases (linear/hold/smooth/in/out) on 10 scalars (`:93-104`) plus effect params. No bezier handles, no spatial interpolation or motion paths, no roving keys; wheels and curves cannot be keyframed | EC **E (best-in-class)**: AE speed/influence temporal bezier, Gauss-Legendre arc-length spatial paths, roving keys |
| Graph editor (value and speed) | **M** | lane only (`Fabula.jsx:6655`) | EC E |
| Expressions | **M** | The audio and track bindings (`audioReact.ts`, `forgeBindings.ts`) cover the most common expression uses | EC E (JS on boa, host-request re-run, seeded wiggle) |
| Shape layers (path ops, repeater, trim/merge/offset) | **M** in Fabula | `services/tela/geometry` has nearly every operator (`pathOps.ts`, `boolean.ts`, `offset.ts`, `stroke.ts`, `bezier.subCurve`, `lerpSubpath`), but Fabula imports none of it | EC E (kurbo/tiny-skia, curve-preserving booleans) |
| Text layers / animators | **P (weak)** | Nine preset per-glyph animators (`services/fabula/titleAnimators.ts:7`). Titles and subtitles are Canvas2D **at a fixed 1280×720, bright-on-black, keyed with a screen blend** (`engine/core/titleLayer.ts:6,16,44`; `textLayer.ts:8,19`; `fabulaRender.ts:445,450`). So dark text cannot render, there is no true alpha, and output is soft above 720p. No range selectors, text on path or shaping control. The new text engine is not used | EC P+ (harfrust shaping, range/wiggly/expression selectors, text on path; only 8 presets) |
| Masks / roto | **P** | shape masks (ellipse/rect/poly, feather, track follow) in `forgeBindings`; `fx.matte`. ML mattes: `samMatte.ts` (SlimSAM plus tracked prompt), `subjectMatte.ts` (MediaPipe), `depthMatte.ts` (Depth Anything V2). Missing: bezier roto with animated vertices, per-vertex feather, propagation brush | EC E (variable feather, smart mask interpolation, GrabCut and BK max-flow roto brush) |
| Tracking | **E (strong)** | point `services/fabula/vectorTrack.ts`, planar `planarSequence.ts`, mesh `meshTrack.ts`, backward tracking, AdjustTrack, corner-pin export, `fcpxmlTransform.ts`. Rust port in `rust/plajah-math/src/{tracking,planar}.rs` | EC E (NCC→LK with a gain/bias model, KLT, RANSAC) |
| 3D camera solve | **M** | — | EC E (essential matrix, LM+Schur bundle adjust) |
| Stabilisation | **P** | point and planar stabilise (`Fabula.jsx:1939`, `planarStabilizeAt`). No smoothing or warp stabiliser | EC E (Matsushita and subspace); FC 2D only |
| 3D layers / camera / lights | **P** | `model3d` clips via three.js (`offlineRenderer.ts:337-341`), volumetric effects (`phase4Volumetric3DEffects.ts`), stereo/spatial (`services/fabula/spatialEngine.ts`). No 2.5D layer space, comp camera, lights or DoF | EC P+ (per-pixel sorted planes, shadows, bokeh, GGX PBR) |
| Precomps / node comp | **P** | `nodeGraph.ts` node types are source/effect/merge/output; sources are generator/shader/colour **only, no media or text**. `NodeGraphEditor.jsx`; comps are pool assets and cannot be re-opened from the timeline | EC E (precomp, collapse, parenting) |
| Parenting / null objects | **M** | — | EC E |
| Puppet / mesh warp | **P** | mesh-warp effects (`phase4MeshWarpEffects.ts`), mesh track | EC E (ARAP on a constrained Delaunay mesh) |

### 1.6 Generative / AI — **Fabula leads**

| Feature | Fabula | Evidence | AC |
|---|---|---|---|
| Gen providers (Magnific connected; Runway/Kling handoff), credential vault, mirror to bins | **E** | `services/fabula/genAgent.ts`, `magnificApi.ts`, `runwayApi.ts`, `genVault.ts`, `<GeneratePanel>` `Fabula.jsx:6738` | none (no generative AI in either) |
| Script → scenes → shots → timeline, SLATE breakdown, reverse-populate a production from an edit | **E** | `Fabula.jsx:2890-2933` | none |
| Transcription → subtitle clips | **P** | Gemini cloud call (`Fabula.jsx:4270-4273`); no word timings and no text-based editing | FC P (Whisper and DTW word timings plus transcript editing, **off in release**) |
| Segmentation / depth / stereo conversion | **E** | SAM, MediaPipe, Depth Anything, `spatialEngine.ts` | EC P (MobileSAM in Rust, no object matte) |
| Motion Council builds options from assets | **E** | `services/motion/council/motionBuild.ts`, `Fabula.jsx:4122` | none |

### 1.7 Captions

| Feature | Fabula | Evidence | AC |
|---|---|---|---|
| Subtitle track, inspector editing, burn-in | **P** | track type `subtitle`; burn-in is screen-blended white text (`fabulaRender.ts:443-445`) | FC E |
| SRT / VTT / SCC / 608/708 / TTML import and export, sidecar | **M** | no matches for srt/vtt in Fabula code | FC **E** (`crates/captions`: SRT, VTT, SCC, MCC, EBU STL, TTML/IMSC1) |
| Caption styling, safe areas, reading-rate QC | **M** | — | FC P |

### 1.8 Export and codecs

| Feature | Fabula | Evidence | AC |
|---|---|---|---|
| H.264 MP4 plus AAC, deterministic offline render | **E** | `engine/core/offlineRenderer.ts:71` (avc1 only), `:495` (AAC) | FC E |
| Render queue (ranges, markers) | **E** | `Fabula.jsx:3906-3935` | FC E |
| HEVC / AV1 / VP9 / ProRes / DNxHR / alpha / image-sequence export | **M** (planned) | `services/fabula/codecMatrix.ts` holds the licence/tier truth; the wasm lane is not built | FC E (clean-room encoders in Rust, MXF/EXR/DPX) |
| 10-bit / HDR delivery | **M** | 8-bit pipeline | FC P |
| Render parity holes | **bug** | Lottie, data-viz charts (`<TelaChart>` is DOM-only, `Fabula.jsx:9393`) and multicam render black or are skipped in export | — |

### 1.9 Performance

| Feature | Fabula | Evidence | AC |
|---|---|---|---|
| GPU compositing | **P** | WebGL2 compositor (`compositor.ts`); WebGPU compositor `services/fabula/gpuComposite.ts:119` behind a toggle that is **off by default**; the monitor is still mostly CSS/DOM-stacked | FC/EC P (wgpu, Rgba16F accumulators, CPU fallback per layer) |
| Off-main-thread | **P** | grade monitor worker (`components/Fabula/engine/fabulaMonitorWorker.ts`); export runs on the main thread with yields | FC E (`Exporter::step`) |
| Precision / resolution | **M** | RGBA8, a "1080p-class" target cap (`compositor.ts:513`) | FC/EC E (f32 / Rgba16F) |
| Media substrate | **E (strong)** | OPFS `mediaStore.ts`, `prefetch.ts`, `decoderBudget.ts`, AudioContext master clock `playbackEngine.ts`, local-first disk reads | FC P (playback is its weakest area) |
| Render cache / smart preview / RAM preview | **M** | none | EC E (content-hash layer cache keyed on non-transform inputs, disk cache); FC E (position-relative segment hashes) |

### 1.10 Collaboration

| Feature | Fabula | Evidence | AC |
|---|---|---|---|
| Cloud save, multi-device | **P** | `services/fabulaProjects.js`: whole-JSON to Storage plus a Firestore index; merge-on-load, newest wins | FC M |
| Realtime co-edit, review comments, frame-accurate review links, versions | **M** | — | M in both |
| Automation surface (every action is a command, MCP-drivable) | **P** | Motion Council `applyClips`; no general command bus | FC E (`Session::execute` JSON commands plus MCP server) |

### 1.11 Roll-up

| Area | Premiere-side score (5 = credible replacement) | AE-side score |
|---|---|---|
| Editing | 2.5 | — |
| Timeline / audio | 3 | — |
| Colour | 3 (SDR) / 1 (HDR) | — |
| Effects / transitions | 4 | 3.5 |
| Motion graphics | — | 1.5 |
| Gen / AI | 4.5 (ahead of both Adobe and ArtCraft) | 3 |
| Captions | 1.5 | — |
| Export | 2 | 2 |
| Performance | 2.5 | 1.5 |
| Collaboration | 1 | 1 |

**Verdict.** Fabula is a credible *effects-and-finishing* NLE with a world-class platform story. Its two weak halves are:
- **edit-craft fundamentals:** retime, 3-point edits, captions I/O, audio automation;
- **the whole After Effects motion layer:** bezier keyframes and graph editor, shapes, real text, expressions, mattes, motion blur, a 2.5D camera.

Its renderer is also an 8-bit, sub-4K, SDR pipeline. That is the ceiling under colour, export and titles alike.

---

## 2. Where Fabula is already ahead (keep and extend; do not trade away)

1. **Tela on the timeline.** Fabula already renders Tela-native motion graphics in the monitor and in export through the same deterministic renderers:
   - 114+ lower thirds (`lowerThirdRegistry`, handle-driven `evaluateLowerThird`);
   - Tela MOTION_TEMPLATE specs (`services/tela/telaMotionTemplate.ts`, used by `offlineRenderer.ts:410-419`);
   - broadcast identity packs (`graphicMotion.ts`, `broadcastGraphicLayer.ts`);
   - Tela Grid/Base-driven data charts.

   "Open in Tela" goes the other way (`lowerThirdToTela.ts`). No ArtCraft app has a document/graphics system behind its titler.
2. **Live and broadcast.** The same lower-third and title engines feed `TVStudio.tsx`, `LiveBroadcastControlPanel.tsx` and `GoLiveWizard.tsx`, so a graphic designed for an edit runs live. Pixels scenes, deterministic Milkdrop and audio-reactive effects (Beat Reactor) carry VJ craft into the edit. Neither Adobe nor ArtCraft has that bridge.
3. **Gen providers and the production pipeline.** These are covered in §1.6. ArtCraft has no generative features.
4. **Tracking depth in the browser.** Point, planar, mesh and SAM-tracked prompts, with corner-pin export, are on par with EC's tracker apart from its 3D solve, and they already have a Rust port.
5. **Effect library behaviour QA.** Two sweeps run over the library: "does it change the frame" and "does it resolve at both endpoints". Combined with audio bindings and per-effect masks, this is more curated than EC's 306 effects, which no one has compared against AE.
6. **Local-first media.** Disk-direct reads, OPFS, resumable upload and watch folders. FilmCraft's own docs rate playback and real-media handling as its weakest areas.
7. **Licensing and music.** Sync-licence marketplace, Chora music bin, lyric captions.

---

## 3. Where ArtCraft is ahead: the idea to reimplement natively, and why

Each row is an **idea** we rebuild in our own model. Credit the source in the engine doc. No code or data model is copied.

| # | ArtCraft idea (where we learned it) | Our native reimplementation | Why |
|---|---|---|---|
| A1 | **Integer tick timebase**, 254,016,000,000 ticks/s (FC/EC `time/src/lib.rs`) | A `FabulaTime` in TS (safe integer or BigInt at the boundaries) plus `plajah-core` i64. Keep float seconds in the UI; store ticks in `clip.start/duration/srcIn` behind a migration. Fabula has no users yet, so a clean break is allowed. | 29.97/23.976 and 48 kHz are exact, which removes the frame-quantise drift the edit-toolset had to patch by hand. |
| A2 | **Transactional edit algebra**: clamp → apply on a clone → `check()` → commit; slide and rate-stretch; keyframes stored in media time (FC `edit/src/lib.rs:635-1003`) | `services/fabula/editAlgebra.ts`, pure and tested, replacing the inline drag maths in `Fabula.jsx:4666+`. Add slide, rate-stretch, 3/4-point insert/overwrite/replace/fit-to-fill, and sync-lock. | Edits stay correct under speed, reverse and handles; the rules move out of a 10k-line component. |
| A3 | **AE-grade keyframe evaluator**: speed/influence temporal bezier, Newton→bisection solve, Gauss-Legendre arc-length spatial paths, roving keys (EC `keyframe/src/lib.rs:166-580`). Unlike EC, cache the arc-length table. | Extend `services/fabula/keyframes.ts` (keep `sampleTrack` as the single sampler): `Keyframe` gains `inTan/outTan` (speed, influence), `spatial` tangents for x/y, and `rove`. Mirror it in `plajah-core` for parity tests. | This is the base for a graph editor, motion paths and every text animator. It is small and high-value. |
| A4 | **Content-hash layer cache keyed on non-transform inputs** (EC `render/src/cache.rs`) plus **position-relative segment hashes** for previews (FC `render/src/preview.rs`) | A layer texture cache in the Pixels compositor / `gpuComposite.ts` keyed by hash(source frame, effect params evaluated at t, grade) excluding transform. Smart-render segments are hashed relative to the segment start and stored in OPFS. | It is the single biggest scrub and playback win, and ripple edits keep their previews. |
| A5 | **CPU-oracle / GPU-plan split with golden tests** (FC `gpufx.rs`, `plan.rs`, `crates/golden`) | We already have the parity contract (monitor = export). Add a CPU reference for the *grade stage and blend modes* in `plajah-color` and golden PNG tests against the WebGL/WebGPU output. | It catches the Y-flip, 8-bit and blend-mode drift classes that the sweeps found by hand. |
| A6 | **Linear, reference-white-normalised colour pipeline**: BT.2390 EETF on max(RGB) as a ratio, ACES gamut compression, tetrahedral LUTs, camera log curves from vendor specs (FC `color/src/transform.rs`, `lut.rs`, `log.rs`) | A `ColorPipeline` stage in the compositor: input transform (log/709/PQ/HLG) → linear Rgba16F working space → grade → output transform. WGSL plus a GLSL fallback. Tetrahedral interpolation replaces trilinear in `compositor.ts:41-44` and `plajah-color/src/lut.rs`. | Unlocks HDR, log footage and correct blend maths. |
| A7 | **Colour Match solved in the tool's own parameters** with skin protection (FC `color_match.rs`) | "Match to reference" solves LM over our `InputGrade` (lift/gamma/gain/sat/temp/tint) using Oklab tonal-range stats. Aria and the Council can call it. | The result stays an editable grade, not a baked LUT. |
| A8 | **BS.1770 meter with histogram gate; GCC-PHAT-β audio sync with a distinctness score** (FC `audio-dsp/src/loudness.rs`, `sync.rs`) | Reuse the existing Melos loudness worklet in Fabula's master bus plus `loudnessQC` targets. Write a new `services/fabula/audioSync.ts` (or `plajah-audio` wasm) for multicam and dual-system sync. | Loudness QC at delivery; audio-synced multicam. |
| A9 | **Automation lanes with latch/touch/write and point thinning** (FC `engine/src/mixer.rs`) | Volume/pan/send keys on the same `keyframes.ts` sampler, written by the `MixConsole` faders; an allocation-free per-block sampler in the audio graph and the export `mixAudio`. | It is the missing core of Premiere's audio track. |
| A10 | **Captions I/O suite**: forgiving readers, strict writers, tick-exact cues (FC `crates/captions`) | `services/fabula/captions/` for SRT, VTT, SCC (608), TTML/IMSC1 read+write onto the existing `subtitle` track; caption rendering on the text engine (B2). | Required for broadcast and streaming delivery. |
| A11 | **Expression host-request model**: scripts never hold project refs; misses are resolved, memoised and re-run; array-maths operator rewrite; seeded SplitMix64 `wiggle` (EC `expr/src/host.rs`, `rewrite.rs`, `noise.rs`) | A sandboxed expression worker (QuickJS-wasm or a locked-down Worker) that reads our `fx`/`kf` graph through a request API. Bindings (`audioReact`, `forgeBindings`) become built-in expression sources. | Gives AE-style expressions while keeping determinism (monitor = export). |
| A12 | **Shape-operator stacking semantics** (an operator affects every path above it; Repeater slots) **plus curve-preserving booleans** (EC `render/src/shapes.rs`, `path/src/boolean.rs`) | A Fabula shape-layer evaluator over `services/tela/geometry`. The boolean "tidy/refit" idea goes into `geometry/boolean.ts` if its output does not already keep curves (check first). | Merge Paths and Offset output must stay editable. |
| A13 | **Smart mask / shape interpolation**: shape-context correspondence plus Procrustes in-betweens (EC `path/src/interp.rs`) | `geometry` already has `matchSubpaths`/`lerpSubpath` (`pathOps.ts:281-288`). Add shape-context correspondence and Procrustes rotation there, so Tela morphs benefit too. | Turning shapes rotate instead of collapsing; powers roto and shape morphs. |
| A14 | **Non-ML roto fallback**: GrabCut GMM, BK max-flow, guided-filter edge matte, decontamination; **SAM encoder-embedding cache** with prompt-only decoder re-runs (EC `track/src/roto/`, `segment/src/mobilesam.rs`) | A refine stage after `samMatte.ts`: cache the SlimSAM embedding per frame; guided-filter edges and decontamination in `services/tela/raster` (shared with Tela image cut-outs). | Better edges, interactive speed, and a fallback when the model fails. |
| A15 | **Classic-3D per-pixel fragment sort**: inverse homography per plane, depth per pixel, correct intersections *and* blend modes (EC `three_d/compose.rs`) | A WebGPU compute pass for 2.5D layers in our compositor, reusing `planarTrack.ts` homography maths and `plajah-math`. | AE-style 3D layers without a full 3D engine; keeps blend modes correct. |
| A16 | **Subspace warp stabiliser; LM+Schur bundle adjustment** (EC `track/src/subspace.rs`, `camtrack/`) | `plajah-math` additions fed by our KLT/point features. Long-horizon item. | Warp Stabilizer and the 3D camera tracker. |
| A17 | **Motion blur by shutter sub-sampling** that inherits through precomps (EC `render/src/lib.rs:511-532`) | Accumulate N sub-frames of the *transform* in the compositor (cheap with A4's cache); per-clip shutter angle and phase; the Motion Council's shutter action finally has a target. | |
| A18 | **Transcript editing**: word timings (DTW over cross-attention), VAD tightening, word → timeline mapping through clip speed (FC `speech/whisper/align.rs`, `edit/transcript.rs`) | Get word timestamps from our transcription backend; a transcript panel that issues A2 extract/lift ranges. | Premiere's text-based editing; FC ships it off by default anyway. |
| A19 | **Deterministic, steppable export** with fixed interleave groups (FC `export/src/job.rs`) | Move `renderTimeline` into a worker with a `step()` API (it already yields every 24 frames). | Background render while editing. |
| A20 | **Every action is a JSON command, MCP-drivable** (FC `Session::execute`) | A Fabula command bus over `applyClips`/`updateFx`. Aria, the Council and future collaboration ops all go through it. | It is also the foundation for CRDT collaboration (op-based). |

Ideas we deliberately **do not** take:
- FC's clean-room Rust codecs. Our codec matrix rule is "whoever ships the encoder pays"; WebCodecs plus the Crossover tier already cover it, and shipping our own H.264/HEVC encoder makes the patents our problem.
- EC's egui UI and its property-path tree model. Our model is the clip `fx` bag plus `LayerInput`, and Tela specs must stay first-class inside it.
- FC's zero-velocity "Auto Bezier" simplification. EC's evaluator is the better reference.

---

## 4. Staged build plan (ranked by impact)

Every stage keeps the **parity contract**: one sampler/resolver shared by `MonitorLayer`, `fabulaRender.resolveLayers`, `offlineRenderer` and the compositor. Every engine ships tests (`npx tsx --test`, an npm `test:<area>` script). Shared engines are named per item.

### Stage 0 — Render foundation (unblocks everything visual)
1. **Fix the export parity holes.** Lottie (via `services/tela/telaLottie.ts`, which is already deterministic), data-viz charts (rasterise through the Tela chart renderer, not the DOM) and multicam (resolve the active angle plus offset in `itemToSnapshot`) all render black or are skipped today. *Reuses: Tela chart/Lottie renderers.*
2. **Float working space**: Rgba16F targets in `glUtil.makeTarget`, lift the 1080p cap, 4K export. Linear blending behind a project flag (A6 groundwork).
3. **Layer cache** (A4) and the **CPU oracle plus golden tests** for the grade and blend stages (A5). *Reuses: `plajah-color`.*
4. Make the **WebGPU compositor** the default once the golden tests pass on Kenne's machine (`gpuComposite.ts`). This is also the only route to the RTX 4070 (memory: pixels-gpu-ceiling).

### Stage 1 — Tela-in-Fabula on the shared engines (highest platform leverage)
1. **Titles and captions on the text engine.** Replace `titleLayer.ts` / `textLayer.ts` Canvas2D fillText (1280×720, screen-key) with `services/text` layout plus `render/outlines` glyph paths, rasterised at output resolution with **true alpha** and blend `normal`. Real shaping, fallback, kerning, variable fonts, hyphenation and Knuth–Plass paragraphs come for free. Lower thirds, motion templates and broadcast packs adopt the same raster path, so TV Studio and Live get it too. *Reuses: text engine (wasm `plajah_text`), `services/tela/raster` for raster and blur.*
2. **Native text animators** (the AE text layer, built natively):
   - **Model:** `fx.textAnim = [{ selector, props }]`.
   - **Selectors:** range (units: glyph/cluster/word/line; shapes square/ramp/triangle/round/smooth; ease high/low; offset, randomise with a seed), wiggly (seeded), expression (Stage 3).
   - **Properties:** position, scale, rotation, skew, opacity, fill/stroke colour, tracking, blur, baseline shift.
   - **Evaluation:** per glyph on the text engine's laid-out glyph runs (cluster-aware, so ligatures and complex scripts don't break). The existing nine `TITLE_ANIMS` become presets on this model.
   - **Text on path:** the glyph advance maps to `geometry.pointAtLength`/`arcTable`.

   *Reuses: text engine, geometry (path text), keyframes A3.* EC's selector shapes are the oracle: compare coverage curves numerically.
3. **Vector shape layers on the geometry engine.**
   - New clip kind `shape` carrying a geometry `CompoundPath` scene plus an **operator stack** with AE semantics (A12):
     - trim paths: `bezier.subCurve` plus arc length;
     - merge: `boolean.ts`;
     - offset: `offset.ts`;
     - round corners; zig-zag, pucker & bloat, twist, roughen (`pathOps.ts`);
     - repeater (transform stack per copy);
     - stroke with dash, taper and joins (`stroke.ts`, `brushes.ts`);
     - gradient fill (`paint.ts`).
   - Path vertices are keyframeable, with morphing via `matchSubpaths`/`lerpSubpath` plus A13.
   - Rasterise with the raster engine's GL backend (or Loop–Blinn/Slug, which the program allows) at output resolution.
   - SVG/Illustrator import via `svgImport.ts` (replaces `vectorRaster.ts` flattening for editable shapes).

   *Reuses: geometry, raster.*
4. **Any Tela document as a timeline clip.** A Tela frame, artboard or living doc renders through Tela's own device renderers onto the compositor, with its bindings (Grid → Chart) kept live. Bidirectional "open in Tela" generalises `lowerThirdToTela.ts`. This is the moat; nothing in Adobe or ArtCraft matches it.
5. **Shapes and text as masks / track mattes**: alpha/luma/inverted track mattes in `LayerInput` (new `matte` input referencing another layer's texture). *Reuses: raster for feathering (distance transform `raster/distance.ts`).*

### Stage 2 — Edit-craft fundamentals (Premiere parity)
1. **Edit algebra module** (A2) plus slide, rate-stretch and dynamic trim; track lock and sync-lock; 3/4-point insert/overwrite/replace/fit-to-fill.
2. **Retime**: constant speed, reverse, freeze, speed ramps (a time-remap keyframe track on A3). Frame blend first; an optical-flow retime later, on WebGPU, using FC's forward/backward-consistency idea.
3. **Tick timebase** (A1). Do it with Stage 2.1 to avoid two migrations.
4. **Compound clips / nested sequences**: a `kind: "sequence"` clip referencing `prod.edits[id]`, rendered via the compositor's `precompose`. Editable in place.
5. **Persisted markers** (name, colour, note, duration, chapters) and clip colours/flags.
6. **Captions I/O** (A10) on the Stage 1.1 caption renderer; transcript editing (A18).
7. **Multicam audio sync** (A8, GCC-PHAT) and multicam export (Stage 0.1).

### Stage 3 — Motion engine depth (After Effects parity)
1. **Keyframe evaluator v2** (A3) plus a **graph editor** (value and speed graphs, bezier handles) plus motion paths drawn on the monitor, and keyframing of wheels and curves (interpolating grade objects component-wise).
2. **Adjustment layers, parenting/nulls, more blend modes** (target the 27 Premiere modes; EC lists 38).
3. **Expressions** (A11), with Beat Reactor and track bindings as built-in sources.
4. **Motion blur** (A17).
5. **Bezier roto**: animated vertices, per-vertex feather (variable-width feather from geometry offset), smart interpolation (A13), a refine stage (A14). *Reuses: geometry, raster.*
6. **2.5D layers, comp camera, lights, DoF** (A15). A node-graph upgrade: media, text, shape and precomp source nodes in `nodeGraph.ts` (today only generator/shader/colour).

### Stage 4 — Colour and audio pro tier
1. **Colour management**: log/709/PQ/HLG input transforms, ACES gamut compression, tetrahedral LUTs plus LUT export/bake, HDR scopes, 10-bit HEVC/AV1 delivery via WebCodecs where the browser supports it (A6). *Reuses: `plajah-color`.*
2. **Hue-vs curves; bezier/tracked power windows** (bind planar tracks to windows); Colour Match (A7); GPU scopes from the monitor texture (replacing the 8 fps CPU readback).
3. **Audio automation** (A9), **loudness meter and normalise** in Fabula (A8, reusing the Melos worklet and `loudnessQC.ts`), a real monitor crossfade object.

### Stage 5 — Throughput and collaboration
1. Worker export with `step()` (A19); smart-render segments (A4 part 2).
2. A **command bus** (A20), then op-based collaboration (the P4 CRDT in `PLAJAH_ENGINE_ARCHITECTURE.md`), review comments pinned to frame and region, and versions.
3. Stabiliser upgrade and 3D camera solve (A16), in `plajah-math`.

**Impact ranking (top 10 gaps, in order):**
1. Real text and titles (true alpha, output resolution, shaping, animators)
2. Float/4K/HDR render foundation plus the export parity holes
3. Shape layers
4. Retime/speed
5. Bezier keyframes and graph editor
6. Captions I/O
7. 3/4-point edits plus edit algebra (slide, rate-stretch, lock)
8. Track mattes, adjustment layers and blend modes
9. Audio automation and loudness
10. A layer/render cache

---

## 5. lightcraft and soundcraft notes

**lightcraft** (Lightroom clone)
- About 24 crates, ~204k Rust LOC and 2,594 tests. Self-rated alpha, ~61% ready.
- It is a *photo* grader, not a video one: no lift/gamma/gain, no OCIO/ACES, histogram scope only. LUTs are `.cube` 3D, trilinear, CPU-only, with no export.
- Ideas worth taking:
  - **L1. A linear Rec.2020 D65 working space**, with primaries+white-point matrices and Bradford adaptation (`crates/color/src/lib.rs:10,128-151`). This is the shape of A6's working space.
  - **L2. Grading in OkLab/OkLCh** (`crates/pipeline/src/colorops.rs:149-268`):
    - wheels as a/b/L offsets with smoothstep luminance weights;
    - an 8-band hue mixer scaled by chroma, so greys stay neutral;
    - skin-protecting vibrance.

    Each is one WGSL/GLSL function in our grade stage, and it makes a better Hue-vs-curves alternative.
  - **L3. Fritsch–Carlson monotone curves** baked to 1D LUTs (`crates/color/src/spline.rs`). They cannot overshoot. Check `gradeCurves.ts` (Catmull-Rom can overshoot) against this.
  - **L4. Exact PQ/HLG plus luminance-preserving gamut compression** (`transfer.rs:23-52`, `finish.rs:687-706`), and the ISO 21496-1 gain-map writer for HDR stills and thumbnails (`codecs/src/gainmap.rs`).
  - **L5. Qualifiers by OkLab distance**, refined with a guided filter and combined add/subtract/intersect (`masks.rs:211-226,536`). This upgrades our HSL qualifier. The guided filter belongs in `services/tela/raster` so Tela image cut-outs share it.
  - **L6. GPU-vs-CPU equivalence bounds**: mean |Δ| < 0.5 LSB, max ≤ 3 LSB (`crates/gpu/tests/equivalence.rs`). Adopt these exact bounds for A5.

**soundcraft** (Pro Tools clone)
- About 14 crates, ~72k Rust LOC and 549 tests. Self-rated pre-alpha, ~40%.
- Its video crate is copied from FilmCraft.
- It has no stem separation or denoise, so Fabula's stems lead here.
- Ideas worth taking:
  - **S1. One render path for realtime and bounce**, with gain evaluated every 32 samples and interpolated, and plugin instances created and retired off the audio thread (`crates/mix/src/lib.rs:1-40,1197`). This is the model for moving Fabula's live `audioGraph.ts` and export `mixAudio` onto one AudioWorklet engine (today they are two implementations kept in step by hand), and it carries A9 automation.
  - **S2. A BS.1770 meter** with a 1,800-bin gate and 4× polyphase true peak (`crates/dsp/src/meter.rs`), plus its test vectors (997 Hz at −20 dBFS). Use it to validate the Melos worklet that Fabula will reuse. Note that soundcraft has no LRA (FilmCraft's meter does).
  - **S3. An 8-line Hadamard FDN reverb and a stereo-linked log-domain lookahead compressor/limiter** (`plugins/reverb.rs`, `plugins/dynamics.rs`). These are worklet-native replacements for ConvolverNode/DynamicsCompressorNode, and belong in `plajah-audio`, shared with Melos.
  - **S4. Surround buses up to 9.1.6** with BS.775 fold-down and a first-order Ambisonics panner (`mix/src/lib.rs:9-21`, `dsp/src/pan.rs`). This is the path to 5.1 delivery and pairs with Fabula's spatial/XR work.
  - **S5. A Kaiser-sinc resampler and WSOLA time stretch** (`dsp/src/offline.rs:124-238`). These are needed by Stage 2.2 retime (keeping pitch on speed changes) and for sample-rate conform.
- Not applicable: CLAP/VST3/AU hosting (not viable in a browser; `rust/plajah-vst3-host` stays a desktop-only lane).

These fold into the staged plan as follows:
- L2, L3, L5 and L6 → Stage 4.2 and Stage 0.3.
- L1 and L4 → Stage 4.1.
- S1, S2 and S3 → Stage 4.3.
- S5 → Stage 2.2.
- S4 → a later surround stage.

---

## 6. Risks

- **Concurrent-session churn in `Fabula.jsx`** (10.7k lines, many sessions). Every stage should land as pure modules under `services/fabula/**` with tests first, and keep its edits to `Fabula.jsx` to small wiring diffs.
- **Shared-engine timing.** The text, geometry and raster engines are Wave-1 Tela work in progress. Fabula must consume their public APIs only (`services/text/index.ts`, `services/tela/geometry/index.ts`, `RasterSession`/GL backend) and must not fork them. If an engine API is missing something (for example per-glyph cluster boxes for animators), request it from the Tela program rather than patching around it.
- **Wasm ABI coupling.** `plajah_text.wasm` is committed and versioned (`ABI_VERSION`). Fabula's export runs in workers, so the text engine has to load in a worker. Test this early.
- **Parity regressions.** Moving titles to true alpha changes every existing title's look; screen-keyed titles composite differently. Because there are no users yet, a clean break is acceptable (memory: no-users-clean-breaks), but goldens are needed first.
- **GPU reality.** WebGL is stuck on the Intel Arc on Kenne's laptop. Rgba16F plus 4K raises memory and bandwidth needs, so budget tile/segment rendering and keep a quality toggle.
- **ArtCraft drift into the codebase.** The temptation is to "just port the file". The rule is idea only, credited, in our model. Reviewers should reject any PR whose structure mirrors an ArtCraft module or whose types copy its property-path tree.
- **Reference quality.** ArtCraft is ~2 weeks old, agent-written and fidelity-unmeasured. Using it as an oracle means agreeing with *its tests' ground truth* (synthetic scenes, specs it cites: BS.1770, BT.2390, AE docs), not with its outputs blindly.
- **Patents and licensing.** Codec encoders follow `codecMatrix.ts`. Text follows the GAUNTLET patent notes (Slug and Loop–Blinn are fine; avoid Dobbie US 11,216,994). Fonts are OFL/Apache only.
- **Fabula needs sign-in.** Agents can't exercise the UI, so verification relies on headless tests, GL readback and static labs until Kenne smoke-tests.

## 7. Open decisions for Kenne

1. **Timebase migration** (A1). Switch clips to integer ticks now (a clean break, no users) or keep float seconds plus frame quantisation?
2. **Title look change.** Accept that all existing plain titles and subtitles re-render with true alpha on the text engine (they will look slightly different)?
3. **Renderer direction.** Make WebGPU the primary path (with WebGL2 kept as fallback) at Stage 0, or keep WebGL2 primary until the desktop/Crossover build?
4. **Expressions language.** JavaScript (AE-compatible, needs a sandboxed engine such as QuickJS-wasm) or a smaller declarative binding language extending Beat Reactor/track bindings?
5. **HDR scope.** Is HDR delivery (PQ/HLG, 10-bit) a 2026 goal, or is SDR linear-light enough for now?
6. **Shape layers home.** Author them in Fabula only, or as Tela vector objects that Fabula animates? The second keeps one vector model platform-wide, and is recommended.
7. **Captions breadth.** SRT/VTT only first, or the broadcast set too (SCC/608, TTML/IMSC1)?
8. **Collaboration priority.** Review/comments first (cheap) or a CRDT co-edit (expensive)?

---

_Credits: the ideas in §3 and §5 were studied in storytold/filmcraft, effectcraft, lightcraft and soundcraft (MIT OR Apache-2.0) as references only. The read-only clones were made in a session scratchpad and are not in the repo._

## 8. Decisions (Kenne, 2026-10-11)

All recommendations are accepted:
1. Integer ticks now.
2. Titles re-render on the text engine.
3. WebGPU is primary, with WebGL2 as the fallback.
4. JavaScript expressions in a sandbox (QuickJS-wasm).
5. HDR: Claude's call. Recommendation: linear-light SDR first, with HDR delivery later in 2026.
6. Shape layers are Tela vector objects that Fabula animates.
7. Captions ship SRT/VTT first.
8. Review and comments come before CRDT co-editing.

Storybook direction: Worlds is the single world bible. Storybook reuses the SLATE script-breakdown ideas through a shared module, and the two Fabula bridge bugs must be fixed first (worldCharactersForProduction arg; scene-bible character ids).
