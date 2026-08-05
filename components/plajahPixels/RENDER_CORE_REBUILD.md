# Plajah Pixels — Render-Core Rebuild (LOCKED SPEC)

Status: **Steps 1–4 + 5a/5b built (typecheck-clean), not yet live-verified, nothing deployed.**
5c (dynamic LayerStack reorder) is N/A until a layer-reorder UI exists — see §5. This file is the
contract for a focused, step-gated execution pass — kept out of the live build so the app stays
intact. Progress is tracked in §5. Steps 6–8 (hover popup, windowed clone, next-column preload) remain.

---

## 1. The correction that reshapes the model

Tempo and intensity are **first-class, independent drivers** — not byproducts of scene
automation. Automation is a small matrix: any **driver** can be mapped to any **target**,
and multiple mappings run at once, independently.

### Drivers (sources)
- **Measure interval** — every N bars
- **Tempo** — live BPM
- **Intensity** — audio energy / bass
- **Beat** — per-onset

### Targets
- **Scene progression** — advance / switch the active column
- **Layer settings** — per-row opacity, blend amount, params
- (per-clip params reachable through the same path)

### Mapping rule
You map any driver → any target. All of these can be live simultaneously and independently:
- scenes advance every 8 measures
- intensity cross-blends a layer
- tempo speeds an effect
- beats pulse another layer

Effects still ride beats, scenes still ride measures — **and** tempo/intensity are their
own assignable knobs onto either scenes or blends.

---

## 2. Everything else in the locked spec (unchanged)

- One ordered **`LayerStack`** — top row foremost; nothing below overrides what's above.
- Real **per-clip opacity**, **per-row opacity**, and **blend modes** (true compositing,
  not just the global CSS `mix-blend-mode` gate).
- **Clear → truly empty.** Bypass / mute honored.
- Generators / Milkdrop / shaders / media **always swap on fire** — no precedence race.
- **Hover preview** in a small popup, never on the program canvas.
- **Real external output** = a windowed **clone of the composite** for a video wall
  (presenter-view style), not just fullscreen-on-external-display.
- **Next-clip video preloading** for locked 60 fps.

---

## 3. Verified current state (gap analysis, read 2026-06-18)

Source: `components/plajahPixels/components/ClipLauncher.tsx` (1,984 lines) +
`PlajahPixelsStudio.tsx`.

| Spec item | Today | Gap |
|---|---|---|
| Ordered LayerStack | DOM stack: `BackgroundLayer` (bgMedia1+bgMedia2) → VIZ → Milkdrop/FX, composited with **CSS `mix-blend-mode`**, gated globally by `config.enableLayer2`. Layer order is implicit, not a true z-ordered stack. | Needs a real ordered stack where row order = z-order and per-row blend is honored independently of the global gate. |
| Per-clip opacity | Stored on `LauncherClip.opacity`, applied multiplicatively into callbacks (`(clip.opacity ?? 1) * layer.opacity`). | Mostly there for media/milkdrop/shader; verify it reaches the actual composite for generators. |
| Per-row opacity | `LauncherLayer.opacity`, slider in sidebar + AUTO tab. | OK as state; must drive the real composite, not just CSS. |
| Blend modes | `BLEND_MAP` → canvas/CSS blend names; resolved in `fireClip` only when `globalBlendActive`. | Blend is all-or-nothing via global toggle; spec wants per-row blend always honored. |
| Clear → empty | `clearClip` / `clearColumn` / `clearScene` exist; generators "intentionally not cleared". | Spec says clear = truly empty — generator persistence breaks that. Decide + fix. |
| Bypass / mute | Honored in `fireClip` / `clearColumn` / active rendering. | OK; re-verify in new composite. |
| Swap on fire | `fireClip` routes by clip type. | OK, but confirm no precedence race when types differ across a column. |
| Hover preview | `onHoverSource` → PARAMS tab shows a card (no live render). | Spec wants a small live popup preview, never on program canvas. Net-new. |
| External output | Studio opens program output on an external display + fullscreen (Studio ~L446). | Spec wants a windowed **clone of the composite** (presenter-style). Net-new. |
| Next-clip preload | `preloadRef` preloads dropped videos via hidden `<video>`. | Partial — extend to next-column preloading for 60fps. |
| **Tempo as driver** | BPM derived **internally** in beat-mode (`estimatedBpm`, rolling beat-interval avg); only sets bar length for scene advance. | **Net-new.** Not assignable; doesn't drive layers/blends. |
| **Intensity as driver** | Only the "music govern" nudge (`bass > 0.78` accelerates next scene) + FX flags (`enableBassShake`). | **Net-new.** Not assignable to opacity/blend/params. |
| Beat as driver | Beat onset drives scene advance on bar boundaries. | Exists for scenes; generalize to any target. |
| Measure interval | `sceneAutoBars` (2/4/8/16) in beat-mode. | Exists for scenes; generalize. |

**Architectural truth to design around:** ClipLauncher is a controller that emits callbacks
(`onApply`, `onSetLayerMedia`, `onLayerShader`, `onShaderParamsChange`). The actual pixels are
composited in the Studio's DOM layer tree. The rebuild touches **both**: a driver→target matrix
in the launcher, and a real composite in the Studio.

---

## 4. Net-new data model (proposed)

```ts
type DriverKind = 'measure' | 'tempo' | 'intensity' | 'beat';
type TargetKind = 'scene' | 'rowOpacity' | 'rowBlendAmount' | 'rowParam';

interface DriverConfig {
  kind: DriverKind;
  // measure: barsPerStep; tempo: bpm source/scale; intensity: band + curve; beat: subdivision
  // ...kind-specific fields
}

interface Mapping {
  id: string;
  driver: DriverKind;
  target: TargetKind;
  targetLayerId?: string;   // for row* targets
  targetParamIdx?: number;  // for rowParam
  depth: number;            // how strongly the driver moves the target (0–1)
  enabled: boolean;
}
```

A central **driver bus** samples all active drivers each frame and applies every enabled
`Mapping`. Scene mappings advance columns (today's `launchScene`); row mappings modulate
opacity/blend/params live.

---

## 5. Step-gated execution plan (run in a FRESH focused session)

Each step builds **and verifies** before the next. Do not batch.

1. ✅ **Driver bus + types.** Done — `engine/audioDrivers.ts` `AudioDriverSampler`; beat-mode effect
   delegates detection to it. Verbatim constant move, typecheck-clean, no behavior change.
2. ✅ **Mapping model + UI.** Done — `engine/automationMatrix.ts` (`Mapping`, drivers/targets,
   persistence) + Driver Matrix editor in the AUTO tab. Empty by default.
3. ✅ **Scene mappings.** Done — `mappingKey`-gated rAF bus advances scenes per driver
   (measure/tempo/beat clock + beat-onset + intensity-spike), each with a `rate`. Legacy Scene
   Automation panel left untouched (parity). Added `rate` field + `sceneRateOptions`/`defaultRate`.
4. ✅ **Row mappings (the new part).** Done — same bus derives a 0–1 signal per driver (intensity
   energy · beat envelope · tempo LFO · measure sawtooth) and modulates row targets. **Live today:**
   `rowParam` → shader params (`onShaderParamsChange`, no time reset); `rowOpacity` → milkdrop layer
   opacity (`onSetOpacity`). Recorded into `layerModRef` for Step 5: general `rowOpacity`
   (media/shader layers) and `rowBlendAmount` (no composite blend-amount exists yet).
   *Pending live verification (covers Steps 2–4).*
5. **Real composite in Studio.** *In progress — decomposed after reading the render core.*
   The composite is three absolute depth planes (`depthBgRef`/`depthVizRef`/`depthFgRef`) with a
   **hardcoded** sub-layer order (BackgroundLayer → VIZ → Butterchurn → per-layer ShaderLayers →
   Matte → overlays). ClipLauncher's logical layers are **not 1:1** with these components
   (`BackgroundLayer` internally composites bgMedia1+bgMedia2, opacity via `config`), which is what
   makes a true ordered LayerStack a real rebuild rather than an edit.
   - ✅ **5a — modulation spine.** `onLayerModulation` prop + Studio `layerMod` state; the bus routes
     non-milkdrop `rowOpacity` through it, applied to shader-layer `layerOpacity` at render (over base,
     no shader-time reset). Additive — callback absent ⇒ today's behavior.
   - ✅ **5b — per-media opacity.** `onLayerModulation` now carries `layerId`; Studio routes
     'bg'/'overlay' → new `media1Opacity`/`media2Opacity` multiplier props on `BackgroundLayer`
     (fed via refs into its rAF canvas draw, ×`layer1/2Opacity`). General `rowOpacity` is now live for
     bg, overlay, milkdrop (5-step), and shader (5a) layers. Additive — multipliers default 1.
   - ⏸ **5c — structural reorder: N/A until a layer-reorder UI exists.** Re-checked against the code:
     there is no layer-reorder control, so the fixed depth-plane order (bg back → VIZ → milkdrop →
     shaders front) already *is* top-row-foremost for every layer that can exist. A dynamic LayerStack
     reorder is only meaningful once users can reorder layers — that's a separate feature, not core to
     this rebuild. **"Clear → truly empty" is already satisfied** by `clearClip`/`clearRow`/`clearScene`
     (cells → `null`); the generator retention in `clearColumn` is deliberate scene-transition smoothing,
     not a clear-cell violation — left intact. Bypass/mute already honored (the bus skips
     bypassed/muted layers before modulating).

   **Still pending live verification (covers Steps 2–5b).** `rowBlendAmount` remains recorded-only:
   continuous blend crossfade needs two-pass compositing the layer components don't support; revisit
   if/when it's wanted. VIZ-layer opacity is recorded-only (the VIZ canvas shares the depthViz plane
   with milkdrop/shaders; isolating it needs the structural split above).
6. **Hover preview popup.** Small live preview, never on program canvas. *Verify: program untouched.*
7. **Windowed composite clone.** Presenter-style external output mirroring the composite.
   *Verify: second window matches program 1:1.*
8. **Next-column preload.** Extend `preloadRef` to preload the next column's videos. *Verify: 60fps on swap.*

### Known follow-ups (not blockers)
- The legacy beat-mode scene effect runs its own `AudioDriverSampler`; the bus runs another. Two
  samplers is harmless (read-only `getByteFrequencyData`) but redundant — unify when retiring the
  legacy panel.
- Live shader-param / milkdrop-opacity pushes hit `setState` ~per frame (epsilon-throttled). Fine
  at current scale; rAF-batch if many row mappings run at once.

---

## 6. Hard constraints
- Nothing deploys until a step is built **and** verified.
- The live app must stay runnable at every step (no half-migrated composite left active).
- `sessionStorage` key `plajah-clip-launcher-v2` migration must keep loading old matrices.
