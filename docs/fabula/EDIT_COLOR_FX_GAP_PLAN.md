# Fabula — Edit / Color / FX Gap Analysis + Refinement Plan

**Date:** 2026-08-27 · **Scope:** the three creative surfaces of `components/Fabula/Fabula.jsx`
(`editWs === "edit" | "color" | "vfx"`). Media, Audio and Deliver are covered elsewhere
(`plajah-fabula-edit-toolset`, `MASTER_SUITE_RESEARCH.md`).

Siblings: `RESOLVE_PARITY_RESEARCH.md` (Edit-page taxonomy), `GPU_GRADE_AND_SAM2_PLAN.md`
(the approved engine blueprint this plan sequences).

---

## 0. Honest inventory — where each page actually stands

### EDIT (`editWs === "edit"`, `renderTimeline` L4372, `renderInspector` L3980)
**Has:** dual viewer (source + program) · JKL shuttle + frame-gated rAF transport · frame-quantized
edit ops (1/fps grid) · blade/razor · lift vs ripple delete · duplicate · cut/copy/paste · nudge ·
enable/disable · undo/redo · snapping + edge-snap · trim modes normal/ripple/roll/**slip** · linked
A/V (`linkId`) + detach audio · drag source→timeline · marquee multi-select · media-bin tree +
watch folders · proxies (WebCodecs 540p + Crossover fallback) · double-buffered playback (no
dip-to-black) · canvas peak waveforms · titler v2 (drag/resize, Local Font Access) · Lottie layers ·
FCPXML + EDL import/export with folder relink · resumable cross-session upload · build-script-from-
timeline · effects library panel (11 CSS filter presets, 15 Pixels GPU generators, Lottie bin).

**Timeline toolbar today exposes only:** SPLIT · IN · OUT · RIPPLE · FRAME RATE · ZOOM · FIT.

### COLOR (`editWs === "color"`, L5672–5771)
**Has:** 7 production LOOKS (film-emulation presets — CSS filter + a prompt string) ·
per-clip primaries `bri/con/sat/hue/warm/blur` · `ColorWheels.jsx` lift/gamma/gain trackballs +
master luma → `fx.wheel` · temp/tint · `GradePreview` GPU monitor running the export's exact shader ·
`ColorScopes.jsx` waveform / RGB parade / vectorscope w/ skin line / histogram (8 fps CPU readback) ·
copy grade → paste → paste-to-selected → reset. **Export parity is real** — `compositor.ts` carries a
per-input grade stage (`InputGrade`: per-channel lift/gamma/gain, contrast@pivot .435, temp/tint,
Rec.709 sat, hue matrix) and `offlineRenderer` feeds it.

### FX / COMPOSITING (`editWs === "vfx"`, L5655–5672)
**Has:** `CompBuilder` — a **flat layer stack** (generator / GLSL shader / color / text / media) with
blend + opacity, built conversationally by AI, snapshotted into the media pool as a droppable clip
that plays live and renders on GPU · `LottieBuilder` (authors real Lottie JSON) ·
`PerformCapture` (VTuber puppeteering → takes into the pool) · a monitor + the shared inspector.

---

## 1. THE THREE STRUCTURAL HOLES

Everything below is downstream of these. Fix them first or the feature list stays a list.

| # | Hole | Why it blocks everything |
|---|---|---|
| **H1** | **No keyframes anywhere.** `FX_DEFAULTS` is a flat static bag; the only `keyframe` tokens in Fabula.jsx are CSS `@keyframes`. | Every transform, grade, mask, opacity and comp parameter is frozen for the life of the clip. No animation = no motion graphics, no reveals, no Ken Burns, no tracked windows. |
| **H2** | **One flat grade per clip.** `fx.wheel` is a single global correction. | Secondaries, qualifiers, windows and shot-matching all require *layered* corrections. There is nowhere to put a second grade. |
| **H3** | **The FX page is a list, not a graph — while the engine is already a graph.** `components/plajahPixels/engine/core/nodeGraph.ts` ships a Fusion/AE-hybrid DAG (source / effect / merge / output, deterministic, offline-render-parity) and `engine/fx/effects.ts` ships 10 GPU effects. Fabula reaches none of it. | The hard half (engine, determinism, export parity) is **done**. The missing half is an editor. Highest-leverage move in the whole plan. |

---

## 2. EDIT PAGE — missing / needs refinement

**P1 — core craft**
1. **Keyframing** *(H1)* — animate transform / opacity / grade / crop, with an inline keyframe lane
   under the clip, diamond add/prev/next in the inspector, and an ease curve editor.
2. **Retime & speed** — no constant speed, no speed ramps, no freeze frame, no reverse clip, no
   rate-stretch trim. (`playbackRate` is only used by JKL shuttle.)
3. **Real transitions** — today's "default transition" is a `fadeOut → fadeIn` *approximation*
   (`addCrossDissolve`, L660/3266/4304). Needs a transition **object** on the cut: overlapping
   handles, draggable duration, a picker (dissolve / dip-to-color / wipe / slide / blur), alignment
   (centre/start/end), and a matching **audio crossfade** object.
4. **Three- and four-point editing** — source in/out exists but only ever appends. Missing
   **Insert / Overwrite / Replace / Fit-to-Fill / Place-on-Top / Append** against a timeline in/out.
5. **Slide trim + dynamic (JKL) trim** — slip landed; slide and dynamic trim did not.

**P2 — organisation & inspector depth**
6. **Markers are throwaway** — `useState([])`, never persisted, no name / colour / note / duration.
   Needs `prod.edits[].markers` persistence + a **marker & edit index panel** (searchable list,
   click-to-seek, export to chapters).
7. **Clip flags + clip colour** — none.
8. **Crop, anchor point, Dynamic Zoom (Ken Burns)** — inspector has scale/pos/rot only.
9. **Stabilisation, lens correction, motion blur** — none.
10. **Track ops** — no lock, no auto-track-select / destination track, no per-track height,
    no video solo.
11. **Compound clips / nested timelines** — the `nested` view is a read-only drill-in for Pixels
    snapshots; you cannot make a compound clip from a selection.
12. **Subtitle track + SRT/VTT** — a `subtitle` clip *kind* exists with no dedicated track, no
    import/export, no burn-in-vs-sidecar choice at deliver.
13. **Multicam** — `mcSel`/`angleView` do angle-cutting, but there's no sync UI or angle grid viewer.

**P3 — deliver-adjacent**
14. **Render queue** — one render at a time, one preset, whole timeline only. No in/out range render,
    no batch presets, no still export, no chapter markers.

---

## 3. COLOR PAGE — missing / needs refinement

This page has the **best engine-to-UI ratio** in Fabula (grade export parity is genuinely solved) and
the **thinnest UI**. It is two `.inspector` asides side by side; it reads as a panel, not a page.

**P1 — the grading primitives that are simply absent**
1. **Curves** — zero. Custom Y / R / G / B Catmull-Rom curves → a 256×1 LUT texture sampled after
   the wheels in the existing grade stage. *(Already specified as Phase A of `GPU_GRADE_AND_SAM2_PLAN.md`.)*
2. **Hue-vs-Hue / Hue-vs-Sat / Hue-vs-Lum / Lum-vs-Sat** curves — the fastest path to "make the
   skin right, leave everything else alone".
3. **HSL qualifier (secondaries)** — eyedropper sampling from the monitor (the scopes already prove
   the canvas-readback path), hue/sat/lum ranges + softness, blur/denoise on the key, and a
   **highlight / B&W / difference** mask-preview mode.
4. **Power windows** — `fx.matte` has a rect/ellipse with position/size/feather but it's a
   *composite* matte, not a grade window: one only, no invert, no per-window correction, no polygon,
   no tracking.
5. **Grade layers** *(H2)* — `fx.grades: [{ id, label, enabled, wheel, curves, qualifier, window }]`.
   Base + N secondaries. This is the model change everything above hangs on.

**P2 — the workflow around the primitives**
6. **LUT support** — no `.cube` import, no LUT browser, no bake-to-LUT export. The 7 LOOKS should
   graduate from CSS-filter strings to real 3D LUTs (identical live and in export).
7. **Stills gallery + grade versions** — no still store, no A/B compare, no wipe / split-screen,
   no per-clip versions. This is *the* colourist workflow and it's missing entirely.
8. **Shot match / auto-balance** — no auto white balance, no shot-to-shot match, no reference-image
   compare (a natural Aria assist: "match this shot to the previous one").
9. **Group grades + a timeline (master) grade** — corrections are per-clip only.
10. **Scopes depth** — fixed small size, no full-screen mode, no CIE chromaticity, no 3D cube,
    no scale/zoom, no target guides beyond the skin line, and the readback is 8 fps on the CPU
    (should ride the GPU monitor).

**P3 — pro colour**
11. **Colour management** — everything is implicitly sRGB. No input / timeline / output colour space,
    no ACES, no gamut mapping, no HDR (Rec.2100 / PQ).
12. **Camera log transforms** — no S-Log3 / V-Log / C-Log / Rec.709 CST node.
13. **Noise reduction + sharpening** in the grade (only `blur` as SOFTEN).
14. **Face / skin refinement.**
15. **Panel support** — no colour-page keymap, no Tangent / mini-panel surface. Web MIDI plumbing
    already exists in `MixConsole` (MIDI-learn), so this is reuse, not new infrastructure.

---

## 4. FX / COMPOSITING PAGE — missing / needs refinement

**P1 — become a node compositor** *(H3)*
1. **Node canvas editor** over `nodeGraph.ts` — drag nodes, wire ports, **view any node's output**
   in the monitor, collapse to groups. The engine, determinism and offline parity are already built.
2. **Expose the Pixels FX registry as effect nodes** — `blur · glow · vignette · rgbshift · pixelate ·
   mirror · sharpen · shake · invert · color` are shipped in `engine/fx/effects.ts` and unreachable
   from Fabula today.
3. **Per-node transform + keyframes** *(H1)* — comp layers have blend + opacity and nothing
   else. No position, scale, rotation, anchor, motion path.
4. **Masks / roto** — no bezier or polygon mask tool, no per-node mask, no feather/expand,
   no animated mask shape.
5. **Chroma keyer** — none. `PerformCapture` can *record* against green; nothing keys it. Needs
   chroma key + spill suppression, luma key, difference key.

**P2 — depth**
6. **Tracking** — no point tracker, no planar tracker. Drives both windows (§3) and masks.
7. **SAM 2 tracked mattes** — fully blueprinted (`/api/crossover/matte`, `matteService`, click-the-
   subject MATTE mode, MediaPipe instant preview), zero built.
8. **Per-clip effect stack on the timeline** — FX are flat `fx.*` fields, not a reorderable
   OFX-style stack. Should be the same node model, scoped to one clip.
9. **Text nodes are one string** — no rich text, no per-character animation, no text on a path,
   no 3D text.
10. **Comp reuse** — a comp becomes a pool asset but cannot be **re-opened for editing**, has no
    published/exposed parameters, and there's no comp template library.
11. **Shader authoring UX** — GLSL is a bare `<textarea>`: no compile-error surfacing, no
    auto-generated uniform UI, and **no ISF import** despite `engine/core/isfLoader.ts` shipping.
12. **Particles / 3D** — `Stage3D` (depth-map parallax) exists outside the comp; no particle node,
    no 3D layer or camera.
13. **Time effects** — no time-remap, echo, or trails nodes.
14. **Comp viewer controls** — no isolated transport, no quality toggle, no RAM preview.
15. **Lottie still doesn't rasterise into MP4 exports** (known, monitor-only).

---

## 5. DESIGN-LANGUAGE REFINEMENT (all three pages)

The tokens are settled and good — `--bg:#0f0e13` / `--panel:#1c1c23` / `--org:#f97316` accent /
`--pl-grad` purple→magenta→orange as *fleeting* hints / `.glass-dark` frosted panels / Inter 900
italic uppercase display / JetBrains Mono numerics / `--line` hairlines. What's inconsistent is
**page architecture and control vocabulary**:

1. **Colour and FX have no page chrome.** Edit has a menu bar, a tool row and a timeline; Colour and
   FX are bare flex rows of panels that just… start. Every page needs the same three-band frame:
   *context bar → work surface → control bar*.
2. **The Colour page has no monitor dominance.** A colourist looks at the picture. Today the picture
   competes with two equal-width asides. It should be: gallery strip on top, big viewer centre,
   scopes right, grade controls in a bottom bar with tabs (Wheels / Curves / Qualifier / Windows).
3. **The FX page is three unrelated slabs in a scroller** (CompBuilder, LottieBuilder,
   PerformCapture). They should be *tools that emit nodes* into one canvas, not siblings.
4. **Control kit drift.** The audio page got vintage `AnalogFX` knobs and the colour page got
   `ColorWheels` trackballs — but the colour primaries are still generic `<input type=range>` and
   the FX page is `<select>` + `<textarea>`. Standardise one kit: **knob · trackball · fader ·
   curve · numeric-scrub field · segmented tab**, all on the sleek-slider base already in the CSS.
5. **`.lbl` does everything.** One orange-65% label style serves section headers *and* parameter
   names. Needs a two-level hierarchy (section caption vs param label).
6. **Orange is both "accent" and "selected".** Keep orange for *selected/active* (the user's stated
   preference) and move informational accents onto the Plajah gradient hints.
7. **No responsive story** on any of the three pages — relevant to the mobile/TV program.

---

## 6. ROADMAP

### Wave 0 — Foundations (nothing else is worth building first)
- **Keyframe model + evaluator** — `fx.kf: { [param]: [{ t, v, ease }] }`, one `evalFx(clip, t)`
  shared by `MonitorLayer`, `fabulaRender.resolveLayers`, `offlineRenderer` and `compositor`.
  Ship with transform + opacity only; every later parameter is free.
- **Grade-layer model** — `fx.grades[]` replacing the single `fx.wheel` (migrate old clips to
  `grades[0]`). Compositor takes an array of grade stages per input.
- **Adopt `nodeGraph.ts` as Fabula's comp format** — `asset.graph` alongside the legacy
  `asset.pixels` snapshot; both render.

### Wave 1 — Colour page rebuild *(depends on Wave 0 grade layers)*
Curves + LUT texture → Hue-vs curves → HSL qualifier + eyedropper + mask preview → power windows
with per-window grade → stills gallery + A/B wipe + versions → `.cube` import/export, LOOKS become
real LUTs → **new page architecture + design pass** (mockup A).

### Wave 2 — FX page rebuild *(depends on Wave 0 nodeGraph adoption)*
Node canvas editor → Pixels FX registry as nodes → mask + chroma-key nodes → per-node preview and
comp transport → ISF import + shader error surfacing → LottieBuilder / PerformCapture become node
sources → **design pass** (mockup B).

### Wave 3 — Edit page depth
Real transitions (object + picker + audio crossfade) → retime/speed + freeze + reverse → three-point
editing → marker persistence + index panel + flags/colours → crop/anchor/Ken Burns → compound clips →
subtitle track + SRT/VTT.

### Wave 4 — Pro tier
Point + planar tracker (drives windows *and* masks) → SAM 2 mattes on Crossover → colour management
(ACES, log transforms, HDR) → render queue + codecs → worker OffscreenCanvas GL monitor (Phase B) →
WebCodecs decode pipeline (Phase C).

### Standing debt to clear alongside
Lottie in MP4 export · proxy build is seek-per-frame (slow, 300 s cap) · double-buffering only covers
±1 neighbour · `mixAudio` doesn't apply per-clip/track EQ+comp+pan · deploy `/api/crossover/stems`.

---

## 7. BUILD LOG (2026-08-27)

- **Band 2 room tool bar** (`renderRoomToolbar`) mounted above all six workspaces — the four-band
  frame is real. Studio-system CSS vocabulary (`.cap`/`.lbl`/`.param`/`.numval`, `.roomtool`, `.segx`,
  identity-stripe utils) shipped. Identity stripes on track heads + bins.
- **Color room** restructured monitor-dominant (`.colorroom` → `.colorstage` big monitor + docked
  scopes; `.colorctrl` tabbed grade banks). Legacy layout deleted.
- **Codec matrix** (`services/fabula/codecMatrix.ts`, 11 tests) — license (free/expired/vendor/grey/
  paid) × tier (webcodecs/wasm/crossover/native). MPEG-2 = expired, full import+export. Import
  recognition + accept string wired. In-browser ffmpeg.wasm lane NOT built (needs @ffmpeg + isolated
  worker — deliberate, would break embedded iframes via COOP/COEP).
- **Tone curves** (`services/fabula/gradeCurves.ts`, 6 tests) — §3.1 done. 256×RGBA LUT baked into the
  compositor grade stage (per-channel R/G/B + master in alpha), so live grade monitor + MP4 export
  agree with zero new render paths. `CurveEditor.jsx` + CURVES tab in the color room.

**Next primitives (still open):** HSL qualifier + eyedropper (§3.3), power windows with per-window
grade (§3.4), grade LAYERS `fx.grades[]` (§3.5 / hole H2 — curves + wheels currently live on the single
flat fx). Then the node compositor (§4 / hole H3) and keyframes (§1 / hole H1).
