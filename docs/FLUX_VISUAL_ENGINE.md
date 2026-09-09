# Flux Visual Engine — one real-3D, audio-reactive generator, every visual surface

Flux is the runtime the Fabula FX suite only ever **spec'd**: a real 3D, audio-reactive visual
generator in the **Trapcode Form / Mir** lineage — flowing point-grids and fractal meshes that swell
with the bass, erupt on the build and ripple on every kick — not a flat fullscreen fragment shader.

## Why it exists (the compatibility question)

Every existing particle/flow "generator" in the platform is a **2D fullscreen fragment shader**:
Forge `particlefield` / `particleburst` (`components/plajahPixels/engine/fx/phase3ParticleEffects.ts`,
deliberately closed-form and stateless), and the Pixels core generators `PARTICLES` / `STORM` /
`STUDIO_GRAVITY` (`components/plajahPixels/engine/core/generators.ts`). None is a real 3D mesh grid or
instanced particle system. The only true three.js path was `model3d` — which loads a `.glb` and has
**no procedural or audio-reactive mode**. Fabula's own code says it outright
(`services/fabula/model3dNode.ts`): the FX suite covers the *look* of particle fields as raymarched
effects "but could never load an actual mesh."

So Flux is **not a duplicate** — it's the missing runtime. It slots in exactly like `model3d`: a
three.js renderer draws to an **offscreen canvas** the compositor uploads as a layer element, so the
live monitor at clip-local time `t` and the export frame at `t` are the same picture, and every Forge
grade / mask / effect applies on top for free. The one thing `model3d` doesn't do and Flux must:
react to audio.

## Architecture — one engine, three surfaces

The unifying interface is **`renderer.domElement` (a canvas)** — the one thing every surface already
accepts.

| File | Role |
|---|---|
| `services/fabula/fluxNode.ts` | **Pure** half — spec, defaults, scene catalog, deterministic camera math, the reusable audio driver (band split → fast-attack/slow-release energy envelope + kick/snare onset), and `fluxBandsFromFreq` (resolution-independent band extraction). No three.js, no DOM. |
| `components/plajahPixels/engine/core/flux.ts` | The three.js renderer, mirroring `model3d.ts`: one lazy-imported `WebGLRenderer` + a hand-rolled bloom pipeline (bright-pass → separable blur → ACES composite) + a **scene registry**. `renderFlux(spec,w,h,localT,audio)` (export, async, deterministic) and `renderFluxLatest(...)` (live, sync). Both return a canvas. |

### Scenes (registry in `flux.ts`)

- **Flux Field** — a structured Trapcode-Form dot-grid terrain over a faint Mir surface. *Built.*
- **Deco Tapestry** — the original embroidered gallery-wall scene. *Built.*
- **Deco Tapestry II / Flux Lattice / Flux Tunnel / Flux Aurora** — four additional
  `SceneInst` builders in `fluxCouncilScenes.ts`, registered in the shared renderer,
  Pixels modes and DJ catalog. *Built.* See [the collection notes](FLUX_COUNCIL_COLLECTION.md)
  for creative direction, council-run limitations, preview and verification.

### Audio contract

Any surface feeds `FluxAudio { bass, mid, treble, level, beat }`. `driveFluxAudio` turns that into the
driven uniforms (`energy`, `kick`, `snare`, smoothed bands) with **one** frame-rate-independent
envelope, so a 30 fps export and a 60 fps monitor feel the same, and a timeline seek snaps instead of
smearing. The hard-won reactivity lives in exactly one place.

## Surface integration status

- **DJ Console — DONE** (`components/dj/StreamStudio.tsx`). Flux scenes appear as their own source
  group in the Pixels monitor's picker; `renderFluxLatest` draws its canvas and it's blitted into the
  Program Out canvas (`drawBackdrop`) exactly like the Pixels GL surface — so it flows into
  `captureStream`, the set recorder, and every pop-out with no extra plumbing. Driven by the master
  bus analyser via `djBands` → `fluxBandsFromFreq`.
- **Fabula — NEXT** (mirror `model3d` 1:1). Export: a `clip.type === 'flux'` branch in
  `offlineRenderer.ts` calling `renderFlux(spec, w, h, lt, fluxBandsFromFreq(aud.freq))` and pushing
  `{ element: canvas, effects, grade, ... }`; `'flux'` added to `RenderClip` (`sceneTimeline.ts`); a
  `type:'flux'` case in `services/fabulaRender.ts itemToSnapshot`. Monitor: a `FluxLayer` mirroring
  `Model3DLayer` in `Fabula.jsx` (pass audio from `masterAnalyser()`), a `MonitorLayer` case, an insert
  action, and an `FxLibrary.jsx` entry. **Net-new vs. model3d:** thread audio levels into the renderer.
- **Pixels Studio — NEXT** (new `'three'` scene kind). A `ThreeStage` host (parallel to `StudioStage`)
  mounts `flux.ts`; register scene modes in `types.ts` + `STUDIO_SCENE_TO_MODE`, spread into
  `sceneCatalog.ts` with `kind:'three'`, branch in `LayerStack.tsx`.

## Tela integration — SPEC ONLY (scoped, not built here)

Goal: **run shaders and Flux scenes as interactive media elements inside Tela documents** — maskable,
laid out, and part of the composition, the way an image or video block is today.

### Model

- A new Tela block kind **`visual`** with `source: { kind: 'shader'; src } | { kind: 'flux'; spec: FluxSpec }`,
  plus the standard Tela block fields: frame (x/y/w/h/rotation), z-order, opacity, blend mode, and a
  **mask** (the same clip/shape/alpha mask primitive Tela already uses for images).
- Reuse the existing engines verbatim: shader blocks render through the Pixels `ShaderRenderer` /
  `ShaderLayer` contract (`src`-keyed, audio texture, `iBass/iMid/iTreble/iLevel`); flux blocks render
  through `renderFluxLatest`/`renderFlux`. **No new render code** — Tela becomes a fourth host of the
  same two engines.

### Rendering in Tela

- **Editor (live):** each `visual` block owns a small canvas positioned by its frame; a shared rAF
  ticks all visible blocks. A document with no `visual` block pays for nothing (lazy three import).
  Off-screen / not-visible blocks pause (IntersectionObserver), matching Tela's existing media
  virtualization.
- **Export (PDF/PNG/print):** deterministic frame — call `renderFlux` / `ShaderRenderer.render` at a
  chosen `localT` (a per-block "poster time", default 0 or a document-wide scrub position), rasterize
  to the block's frame. Static exports get a still; interactive/preview exports keep the canvas.
- **Masking & layout:** the block's canvas is composited under Tela's existing mask + transform stack,
  so a Flux field can be clipped to a headline's letterforms or an arbitrary shape exactly like an
  image fill. No engine change — masking happens at the Tela compositor layer.

### Audio in Tela

- Documents are usually silent, so `visual` blocks default to **time-driven** (the audio driver runs
  with `SILENT_AUDIO`; scenes still move on their own clocks). Optional: bind a block to a document
  media element's analyser (a Tela audio/video block) for reactive documents — same `FluxAudio` shape.

### Interactivity

- Pointer events on a `visual` block can drive scene params (a Flux scene's camera, a shader's
  `iParam0..3`) for interactive documents; gated behind an "interactive" flag so print/export stays
  deterministic.

### Files a future Tela build would touch (not in this change)

- Tela block model + types (add `visual` block kind), the Tela canvas renderer (mount + tick +
  IntersectionObserver pause), the Tela mask/transform compositor (already exists — reuse), the block
  inspector (pick shader/flux source + params), and the export path (deterministic poster-time render).
  Zero changes to `flux.ts` / `ShaderRenderer` — Tela consumes them as-is.

## Reusable takeaways

- `renderer.domElement` is the universal seam — canvas in, compositor/blit out.
- Keep all deterministic math (camera, audio envelope, band split) pure in `fluxNode.ts` so monitor and
  export match and the parts are unit-testable.
- One audio driver, one energy model — every surface reacts identically.
