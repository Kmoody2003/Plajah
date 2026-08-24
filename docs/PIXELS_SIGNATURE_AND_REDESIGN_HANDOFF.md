# Plajah Pixels — Signature Works + Redesign: Handoff Notes

**Status 2026-08-23.** Branch `feat/vela-stillness`. **All Pixels work is committed.**
Written so another person or model can pick this up cold.

Note the branch is shared with an unrelated parallel workstream (the Vela/Bajo Melos
instruments, which is what it is actually named for). Stage Pixels paths explicitly when
committing; never `git add -A`. The typecheck baseline drifts for the same reason —
diff against a captured baseline rather than trusting the absolute count.

---

## 0. What was asked, in order

1. 12 audio-reactive shaders (6 high-energy, 6 tranquil). Different parts of the
   visual must respond to different frequency ranges, with a **separate, distinct
   reaction for vocals**. Must not feel generic — "designed by a seasoned world
   class visual artist". Vibes: EDM to trippy to surrealist painting to
   impressionism, **at least two like a Miyazaki landscape painting**. "Highend
   extremely smooth." Must run on phone, PC, TV, integrated Intel through high-end
   GPU. Showcase in an artifact; if liked, add to the Pixels library.
2. "take it to another level" — 12 more, more artistic. Series II.
3. 12 more, trippier and more transcendent. Series III.
4. Keep the artifact's ambient demo track ("Drift") as-is.
5. Series IV — nature and physics: fluid dynamics, collision detection, soft body,
   rigid body, kinetic motion, Rube Goldberg cause-and-effect, magnetism, cycles of
   nature, fire, plasma, quantum and entanglement, higher dimensions. 6 + 6.
6. Series V — everything in **3D**: a cross-section of all prior themes plus new
   ones, 6 + 6, high-end textures, some static cameras and some flying cameras that
   **turn and bank**. May be heavy — "top tier, avant garde". Goal: "elevate the GPU
   into an instrument of fine art, not just cool, but gracious and beautiful,
   contemplative, but embrace energy and kinetics — visual poetry intersecting audio."
7. Add all 5 series to Pixels as **defaults**. Study what Pixels does and is intended
   to do. Restyle to the Plajah design standard. Propose better UX structure "in a way
   that unlocks ease of use for beginners and depth for more experienced users".
   Deliver **three artifacts**: two updates to what exists, one ground-up design.
8. "I like proposal three a lot, but would building it break anything Fabula and other
   parts of the platform depend on? Do 1 and 2 for sure; 3 could be saved for later in
   the week barring it wouldn't break other features."
9. "finish proposal 2." <- the current task
10. "make notes across all the work you are doing in case I have to have ChatGPT
    continue while my session limit is hit." <- this document

---

## 1. Where everything lives

### Scratchpad — source of truth for the shaders

```
C:\Users\Kenne\AppData\Local\Temp\claude\C--Users-Kenne\354f427c-9ef0-4ec3-b70b-7e0b40e357f7\scratchpad\
```

| File | What it is |
|---|---|
| `kit.glsl` | The **Plajah Audio Kit** — prepended to every 2D shader |
| `kit3d.glsl` | Series V preamble — raymarch / lighting / camera helpers |
| `works/` 1-12 | Series I |
| `works2/` 13-24 | Series II |
| `works3/` 25-36 | Series III |
| `works4/` 37-48 | Series IV (nature + physics) |
| `works5/` 49-60 | Series V (3D) |
| `template.html` + `build.cjs` | builds `pixels-signature.html`, the 422 KB gallery |
| `drift-ambient.js` | The Drift ambient generator, extracted standalone (request 4) |
| `check.cjs` | Compiles and renders one work headless; catches GLSL errors |
| `montage.cjs` | Contact sheets at two audio states |
| `audit.cjs` | Greps each shader for `iParamN`, compares against the declared count |
| `emit-presets.cjs` | Parses the built gallery into `signatureShaders.ts` |
| `verify-library.cjs` | Drives the live app, measures thumbnails and tiles |
| `verify-shell*.cjs` | Proposal 2 live verification (4 rounds; run `verify-shell4.cjs`) |
| `fix_render_mode.py` | The Render-mode rewiring patch (already applied) |

All verification is Puppeteer + SwiftShader against the dev server on :3000.

### Repo — committed on `feat/vela-stillness`

| Commit | What |
|---|---|
| `d1320a2` | Sixty signature works, and a way to hear a voice |
| `5ecbcf7` | The library learns to show its work |
| `3af2cab` | One place for the controls, one word for the job |
| + this round | the off-screen Library fix, thumbnail persistence, the slider sweep, Hypergate |

### Published artifacts

- Gallery, all 60 works: https://claude.ai/code/artifact/7956f158-bb33-491c-a1dd-1540a666f02f
- Proposal 1, Restyle: https://claude.ai/code/artifact/71fc8191-d258-4a81-b689-f34badcd3377
- Proposal 2, Reorganise: https://claude.ai/code/artifact/93e4b0fe-cee2-42a8-b9a5-2a5210a029a4
- Proposal 3, The Instrument: https://claude.ai/code/artifact/23455009-068a-4f08-becc-c49099959577

---

## 2. The shaders — the design problem and how it was solved

### The constraint that shaped everything

Pixels runs **single-pass fragment shaders with no feedback buffer**. There is no
previous frame, so **nothing can be integrated over time**. That rules out the usual
VJ toys: particle systems with velocity, trails, reaction-diffusion, persistent flow
fields.

The rules that follow, which all 60 works obey:

- **Audio never drives position.** It drives amplitude, colour, width, light.
  Driving position without state produces jitter, because each frame independently
  jumps to wherever the current spectrum says it should be.
- Anything that must appear to move over time uses a **closed form** — a function of
  `iTime` that happens to be modulated by audio, never an accumulator.
- **Filmic rolloff** `col / (1.0 + col * k)` everywhere, so a loud transient brightens
  instead of clipping to white.
- **Sin-free hash** (`h31`). `fract(sin(x) * 43758.5453)` is unstable on Mali and some
  Intel drivers and produces visible banding.
- `plajahOct()` sheds a noise octave above 1250 render lines. That is the phone/TV
  performance valve.

### The audio kit (`kit.glsl`)

The engine hands shaders a 512x2 texture: row 0.25 is spectrum, row 0.75 is waveform.
The engine's own `iBass` spans 0-1.9 kHz, which is musically useless — it lumps kick,
bass and vocal fundamental together. The kit derives six meaningful channels:

| Channel | Range | What it is |
|---|---|---|
| `sub` | 50-190 Hz | kick, sub-bass |
| `low` | 380-820 Hz | body, low mids |
| `pres` | 1.1-3.8 kHz | presence — where voices live |
| `sib` | 5-8 kHz | sibilance, hats |
| `air` | 11-17 kHz | air, cymbal shimmer |
| `voice` | derived | **lead detector** |

Plus `plajahPunch()`, a 16-tap crest factor (threshold 1.35, gain 0.7) giving a
transient hit that is independent of level.

```glsl
#define SPEC(F) texture(iChannel0, vec2(F, 0.25)).x
#define WAVE(F) (texture(iChannel0, vec2(F, 0.75)).x * 2.0 - 1.0)
// The macro parameter is F, not x. See gotcha 1.

float peak    = max(max(max(p0,p1), max(p2,p3)), max(p4,p5));
float formant = peak / (a.pres + 0.035);
float v   = a.pres*1.75 - a.air*0.55 - a.sib*0.22 + a.low*0.10;
float raw = clamp(v*2.2, 0.0, 1.0) * (0.12 + 0.88*smoothstep(1.10, 1.58, formant));
a.voice   = raw*raw*(3.0 - 2.0*raw);
```

**The voice channel was fitted, not guessed.** The demo schedulers expose
`window.plajahLeadOn` as ground truth; 420 labelled frames were captured per mix and
candidate formulas scored by AUC. The winner reads about 4x higher with a lead present.
**AUC 0.877 (Surge) / 0.807 (Drift).** Describe it honestly: it is a **lead detector,
not a vocal isolator** — a lead synth trips it too, which is correct behaviour for a
visualiser.

### Series V additions (`kit3d.glsl`)

`vec2 map(vec3 p);` forward declaration, `marchSteps()`, `raymarch()`, `calcNormal()`
(tetrahedral), `softShadow()`, `calcAO()`, `camera()`, SDF primitives,
`h31/vnoise3/fbm3/triNoise`, `fresnel/ggx/aces`, and:

**`autoBank()`** — roll derived from the second difference of the flight path, i.e.
lateral acceleration. This is why the flying cameras bank into turns like an aircraft
instead of sliding flat through them. It was the user's explicit ask.

Series IV uses **closed-form physics**: complex potential for inviscid flow; Rayleigh
drop modes (1879); dipole flux `cos t1 - cos t2`; the Planck locus for blackbody
colour; linear-drag position with a triangle-wave fold for bounces; 4D rotation and
projection for the higher-dimensional works.

### Series V lighting discipline (learned the hard way)

- **No fake sun in an enclosed scene.** Hypergate III first read as "a lit cylinder"
  because a directional key light was shining inside a windowless tunnel. Relight from
  the scene's own emissive panels.
- A metal ocean is **mostly dark** with a few blazing highlights. A cloud is bright but
  **is not a light source**. Five works rendered solid white until sun/sky/GGX gains
  came down by roughly an order of magnitude.

---

## 3. Proposal 1 — Restyle (DONE)

Pixels had adopted none of the platform design system: **0 files importing
`components/ui`, 162 raw `<button>` tags, 396 hardcoded hex values across 99 distinct
colours, 391 arbitrary `text-[...]` sizes.** The single most-used hex in the module was
`#ff8c00`, 137 times — which **is** `--pj-orange`. The module was never fighting the
design system; it predates the control layer and never migrated.

Delivered:

- **`components/plajahPixels/ui/index.tsx`** — re-exports the platform primitives
  (Button / IconButton / Surface / Input / Chip / Eyebrow) and adds only what a VJ
  surface needs and a general app does not: `PIX_BANDS` (the six band colours, as
  *data* colours — they mean a band and never decorate), `Shelf`, `BandDots`,
  `ReactivityMap`, `ParamRow`, `WorkCard`.
- **`components/plajahPixels/ui/shaderThumbs.ts`** — one still per shader through **one
  shared WebGL2 context, one render per animation frame**, cached forever, fed a baked
  plausible spectrum. `getShaderThumb(key, src)` / `peekShaderThumb(key)`.
- **`styles/plajah-ds.css`** — appended `.pj-range` (and `.pj-range--signal`) built on
  `--pj-ctl-h-sm` and `--pj-ease-standard`. There was **no range token**, which is
  exactly why Pixels alone grew 49 hand-rolled sliders.
- **`ShaderPanel.tsx`** rewritten as the Library: signature works first, grouped into
  shelves by series and set, real rendered stills, `ReactivityMap` on the selection,
  and **GLSL moved behind a `showCode` disclosure, default false**.

**Export seams preserved exactly** — other code imports these:

```ts
export const SHADER_LIBRARY: {...}[] = BASE_SHADERS.map(...)
export const DEFAULT_SHADER_SRC = SIGNATURE_ENTRIES[0].src;
```

`signatureShaders.ts` (306 KB) exports `SIGNATURE_KIT`, `SIGNATURE_KIT_3D`,
`SIGNATURE_WORKS: SignatureWork[]`, `signatureSource(w)`, `SIGNATURE_SETS`, where
`SignatureWork = { id, n, name, series, set, setTitle, kit3d, line, params, reacts, body }`.
**Do not hand-edit it** — regenerate with `emit-presets.cjs`, which parses the built
gallery HTML so the two cannot drift.

---

## 4. Proposal 2 — Reorganise (this task)

### The diagnosis

Pixels organised its controls **twice, in two incompatible ways**: an eight-tab settings
flyout *and* six draggable floating panels. Neither won, so a user had to learn both and
remember which lived where. The tell: **Shaders was a panel while Colours was a tab**,
with no principle behind the split.

Meanwhile the three things that genuinely *are* different jobs were **not a mode at
all** — they were independent booleans that could be in any of eight combinations, most
of which nobody wants.

### What was built — `components/plajahPixels/ui/shell.tsx`

- **Depth** — `DepthProvider` / `useDepth` / `useAtDepth(min)` / `<AtDepth min>`.
  A three-rung ladder **Simple / Studio / Full**, persisted to `plajah-pixels-depth-v1`.
  It is a **display filter, never a feature gate**: nothing leaves the build, no state is
  lost moving between rungs, and a project made at Full opens at Full. `<AtDepth>`
  renders *nothing* rather than hiding with CSS, because an invisible control still takes
  tab order and still reads to a screen reader.
- **Inspector** — `InspectorProvider` / `useDock` / `Inspector` / `InspectorGroup`.
  One right rail, 264px, showing properties of whatever is **selected**. That single rule
  is what replaces six floating panels. The depth ladder sits at its bottom because depth
  is a property of the view, not of the work.
- **ModeBar** — Compose / Perform / Render promoted to the spine, **as verbs**. "Stage /
  Deck / Timeline" names the furniture; a verb names what you came to do, which is what
  lets someone choose correctly without a manual.

```ts
surfacesForMode('compose') // { deck: false, render: false }
surfacesForMode('perform') // { deck: true,  render: false }
surfacesForMode('render')  // { deck: false, render: true  }
```

### The trick that made it cheap — `DraggablePanel.tsx` (98 -> 152 lines)

```tsx
if (dock.docking && dock.el) {
  return createPortal(
    <section className="border-b border-white/[0.08]"> ...collapsible header + children... </section>,
    dock.el,
  );
}
// otherwise: the original floating behaviour, unchanged
```

All six floating panels become inspector sections **with zero call-site changes**. Close
the inspector and they float again exactly as before.

### Wiring in `PlajahPixelsStudio.tsx`

New state `pixMode` / `inspectorOpen` / `dockEl`, plus a `useEffect` mapping
`surfacesForMode(pixMode)` onto the **existing** `setShowClipGrid` / `setShowRenderPanel`
— the booleans stay the source of truth, so nothing else in the 4,000-line file has to
change; the mode just picks them. Outer JSX:

```
<DepthProvider><InspectorProvider docking={inspectorOpen && !uiHidden} el={dockEl}>
  <ModeBar ... />
  <div flex row>  <studio canvas>  {inspectorOpen && <Inspector dockRef={setDockEl} ... />}  </div>
</InspectorProvider></DepthProvider>
```

### The defect live verification caught

The first wiring pointed Render mode at `setShowTimeline`. **Nothing reads
`showTimeline`** — the toggle coloured its own button and did nothing else, and
`TimelineStrip` was an unused import. So Render mode silently did nothing. The real
render surface is `showRenderPanel` -> `TimelineMode`. Fixed by `fix_render_mode.py`,
which also:

- makes `TimelineMode`'s `onClose` drop back to Compose, so the bar never claims a
  surface that is no longer on screen (its close button was icon-only with no accessible
  name, so it also got `aria-label="Close timeline"` — Render mode now depends on that
  panel), and
- retires the dead toggle, its state, and the unused import. In a pass whose entire point
  is that Pixels organised its controls twice, a control that does nothing is exactly the
  confusion being removed.

### Verification status

- **Typecheck: 75 errors, identical to the pre-existing baseline.** The only
  `plajahPixels` error is the pre-existing `stillnessDrivers.ts(124,5)`.
- Live, 1700x1000, guest -> `OPEN_PLAJAH_PIXELS` -> open the shader panel:
  - ModeBar renders with Compose / Perform / Render — yes
  - Inspector renders at 264px — yes
  - **95/95 work cards portal INTO the inspector** — panels dock, not float
  - Perform opens the deck (canvas 954px -> 445px); Compose closes it
  - Depth ladder: simple / full / studio all set `aria-checked` and persist to
    localStorage
  - Closing the Inspector returns panels to floating
  - Render opens `TimelineMode`; Compose and Perform do not; closing it returns to
    Compose with the panel gone
  - 0 page errors across all verification rounds

Two apparent failures in the verification runs were **test artifacts, not product bugs**,
and are recorded so nobody re-chases them: a `div.fixed` still matching the panel text was
the studio root itself, and a canvas probe that sorted by area picked the 1700x1000
backdrop instead of the studio canvas.

### Retiring the duplicate organisation (the second half of Proposal 2)

The tabs existed in **two places at once**: a 384px drawer sliding over the canvas you
are trying to look at, and a compacted copy inside the deck's `rightPanel`. Both are now
gone as separate organisations:

- **`SettingsShell`** (in `ui/shell.tsx`) applies the same trick as `DraggablePanel` —
  swap the wrapper, never the children. Docked, it portals into the Inspector; undocked,
  it is the original sliding drawer, unchanged. **~1,550 lines of controls moved without
  one of them being edited.** In the docked branch the children go into a plain block,
  not a flex column, so their own `flex-1`/`overflow` rules resolve to natural height and
  the Inspector does the scrolling.
- The drawer's own header is suppressed when docked; the Inspector supplies one.
- **The deck's compact copy was deleted** — 277 lines. What stays in the deck is what is
  genuinely deck-local: program output and transport.
- The Inspector went **264px -> 320px** so seven tabs and their sliders fit.
- `TAB_TITLES` maps tab id to the **visible label**, because four of the ids disagree
  with what the user sees: `colors` is **Palette**, `ambient` is **FX**, `text` is
  **Chat**, `ai` is **Clips**. A header that contradicts the tab is worse than no header.

`PlajahPixelsStudio.tsx`: **4,091 -> 3,815 lines.**

### Verified live

All seven tabs dock into the Inspector, each names itself in the header, and each renders
its own distinct content — checked by reading the docked text, not just the tab state:

| Tab | Header | Content proves it is the right panel |
|---|---|---|
| Core | Core | preset list (NEBULA, STORM, VORTEX, ...) |
| Palette | Palette | "dynamic multi-colored reactive palette" editor |
| FX | FX | emitter count, lifespan, phonetic lyric drive |
| Stage | Stage | fixtures, strobe on beat, bass camera shake |
| Chat | Chat | text presets, font list |
| Clips | Clips | project save/load (.plajah) |
| MIDI | MIDI | 8 knobs, CC 14-21, mic input |

Closing the Inspector hands back to the sliding drawer (`#settings-drawer` reappears).
Program Output survives in the deck; **zero** duplicate tab buttons remain outside the
Inspector. 0 page errors.

### Three collisions only a screenshot could find

DOM assertions passed while the thing still looked wrong. Each of these was found by
looking at a render, then fixed and re-measured:

1. **Seven tabs overflowed the 320px rail.** Clips and MIDI sat off-edge behind a
   horizontal scroll nobody would discover. The strip now wraps (`flex-wrap`,
   `min-w-[68px]`) into 4 + 3.
2. **The Depth ladder was under the platform's player bar.** It sat at the bottom of the
   Inspector, which is exactly where the global player overlays. It moved to the ModeBar
   as `DepthLadder` — still a property of the view, now on the spine where nothing covers
   it.
3. **Two pieces of top chrome collided, and that one was self-inflicted.** `#title-header`
   (`absolute top-6 left-6`) and the icon row (`absolute top-6 right-20`) only ever fit
   because the canvas was the full window; the Inspector took 320px and they overlapped.
   The header was a *second wordmark* — the ModeBar already says "Pixels" — so it was
   deleted and the part carrying real information (look name, mode) moved onto the bar.
   The standalone `← Exit` pill in `components/PlajahPixelsView.tsx` had the same problem
   (`absolute top-6 left-6`, straight onto the ModeBar); it became an `onExit` prop
   rendered as a spine control rather than being nudged down into another floating pill.

Measured after: at viewport 1700 **and** 1280 — stage widths 780px and 450px — one chrome
box in the top strip, **zero clashes**, `#title-header` gone.

### Files touched outside `plajahPixels`

`components/PlajahPixelsView.tsx` — the standalone exit. The studio's signature gained an
**additive optional** prop: `{ platform?: PlajahPixelsPlatformBridge; onExit?: () => void }`.
Existing callers are unaffected.

### The Library you could not see

Reported as "the thumbnail preview and a lot of the UI upgrades is missing — it looks
partially done, like a mixture". Three separate causes, only one of which was cosmetic:

1. **The Library panel opened off-screen.** The floating panels are `position: fixed` and
   were handed `window.innerWidth - 372`, but an ancestor establishes a containing block,
   so `fixed` resolves against *that* box. In the app the box starts 600px in and is
   1216px wide, so the panel landed at 600 + 1444 = **2044 in an 1816px window** — 228px
   past the edge. Open the Library, see nothing new.
   **This is the same fault that made the first thumbnail pass render 0/95.** Back then
   only the symptom was treated (the IntersectionObserver was removed), not the position
   that caused it. `offsetParent` is null for fixed elements and cannot locate the
   containing block, so `DraggablePanel` now *measures* it — the gap between the position
   asked for and the position landed is exactly the container's offset — and clamps into
   the visible window on mount, on resize, and while dragging. A saved layout outlives the
   layout that produced it, so the mount clamp matters as much as the drag clamp.
2. **The stills died on every reload.** 95 shaders is 95 GLSL compiles, about 25 seconds,
   and the cache was a `Map`. They now persist to IndexedDB keyed by shader id *and* a
   hash of its source, so editing a shader re-renders it rather than showing yesterday's
   picture. IndexedDB, not localStorage: ~931KB of JPEG data URLs is a fifth of the
   localStorage budget, stored as UTF-16.
3. **The controls were genuinely half-migrated.** A token-styled rail around hand-rolled
   furniture. **48 of the module's 49 range inputs now use `.pj-range`** (a new
   `--dense` rung, `--pj-ctl-h-xs`, for the packed rail). The one left raw is a
   *transparent overlay* input sitting on a custom-drawn track — giving it a thumb would
   paint a second control over the first.

Migrate element-aware, not by string replace: `flex-1 cursor-pointer` also appears on
`<label>`s, and a blind replace put a slider skin on three of them.

### Pixels opens on a signature work

The sixty were first in the library but nothing was applied at boot, so opening Pixels
showed the old Stage visualiser — they were not "the defaults everyone sees" until the app
actually opened on one. `shaderSrc` now initialises to `DEFAULT_SHADER_SRC` and
`shaderStart` to `performance.now()` (iTime is `(now - shaderStart)/1000`, so the clock has
to start with the studio or the work begins mid-animation).

`OPENING_WORK` is looked up **by name** — `Hypergate` — not by index. This is the face of
the app; reordering a shelf must not be able to change it silently.

The spine used to name the colour preset, which was a lie with a shader over the top. It
now resolves the active work from the source itself (`SHADER_LIBRARY.find(s => s.src ===
shaderSrc)`), so no caller had to start passing a name around. Verified: the bar reads
**HYPERGATE · I** at boot and the canvas paints (71% of sampled pixels lit, mean luma 106).

### What remains (not blocking, but honest)

- **`PlajahPixelsStudio.tsx` has not been broken apart.** Splitting it is a pure refactor
  with real regression risk and no user-visible benefit, so it was not bundled into a UX
  pass.
- **Hex literals elsewhere in the module remain unmigrated.** Sliders are done; the
  buttons, chips and badges are not. Migrate opportunistically, not en masse.
- **Proposal 3** is still unbuilt and still unblocked — see section 5. Build it as an
  additive *producer* of `SceneTimeline`, never a replacement.

---

## 5. Proposal 3 — The Instrument (deferred by the user; UNBLOCKED)

The user's gate was: *would building it break Fabula or anything else that uses the
Pixels engine?* **Answer: no, provided it is built as an additive producer.**

Every external import of `plajahPixels` was traced. **Everything external depends on the
ENGINE, never the UI**: `offlineRenderer`, `sceneTimeline` types, `Compositor`,
`ShaderRenderer`, `AudioTexture`, `stillnessDrivers`, `midiService`, `proxyTranscoder`.

Consumers: Fabula (`fabulaRender.ts`, `fabulaBridge.ts`), **Ora** (`oraRestRender.ts`,
`StillnessDeep.tsx`, `sessionRunner.ts`), DJ StreamStudio, MixPixelsStage,
MediaConverter, Melos MIDI, FxStageVisualizers, AlbumCreator.

**Only three UI seams cross the boundary:**

1. `SHADER_LIBRARY` (from `ShaderPanel.tsx`)
2. `LayerStack` + `LauncherLayer`
3. the studio default export + `PlajahPixelsPlatformBridge`

The decisive fact: `SceneTimeline` is `blocks[]` of
`{ snapshot, start, duration, trimIn, loop }` — **a scored track already IS that shape.**
So Proposal 3 is safe if built as a *producer* of the existing `SceneTimeline` /
`SceneSnapshot` / `RenderLayer` model rather than a replacement for it. Do not change
those types; emit them.

---

## 6. Gotchas — every one of these cost real time

1. **GLSL macro / swizzle collision.** `#define SPEC(x) ...vec2(x, 0.25)).x` expanded the
   trailing `.x` into `.0.055`. All 12 shaders failed to compile. **Rename the macro
   parameter to `F`.**
2. **`mat2()` takes COLUMNS, not rows.** The kit's `rot()` was `mat2(c,-s,s,c)` — the
   textbook matrix written out — which rotates by **-a**. Invisible in about 40 abstract
   works, but it made Turning's tree grow *downward* and silently mirrored Linkage's
   crank pin against its own slider maths. Correct: `mat2(c, s, -s, c)`.
3. **Short params array -> NaN -> black frame.** `w.params.map(p => p.def)` passed
   `undefined` into `gl.uniform1f(iParam2, ...)`. Works rendered fine standalone and were
   black in the gallery. Pad to four slots **in both places**. `audit.cjs` exists to catch
   this class and later caught three more. Now 60/60 with 0 mismatches.
4. **Inverted CSG deletes the whole solid.** `max(d, -(abs(q.x) - k))` is a *subtraction*
   removing everything with |x| < k; with k larger than the crystal it deleted every
   shard. A clip is `max(d, abs(q.x) - k)`.
5. **IntersectionObserver rendered 0/95 thumbnails.** A draggable panel can sit outside
   the viewport, so the observer never fires. The "8 cards visible" sanity check was *also*
   wrong — it only tested vertical intersection. **IO was removed entirely**; the
   one-render-per-frame queue was already doing the anti-stall job. Result: 94/95 stills.
6. **Overexposure** — see the Series V lighting discipline above.
7. **Droste's twist maths** must tile log-space with a period **sheared by a whole number
   of turns per scale step**. `atan(turns*TAU/L)` gives one copy and a hard seam.
8. **Yantra's triangle SDF** had its bottom edge at distance R instead of R/2, so the
   4-up / 5-down sets did not interlock.
9. **Bash heredocs repeatedly fail here** on apostrophes and JS quotes ("unexpected EOF
   while looking for matching quote"). Use the Write tool, or write a python patch file to
   disk and execute it. This bit again while writing this very document.
10. **Sampling gaps produce false negatives.** Stepping 1500px through a 900px viewport
    skipped bands and falsely reported 3 dead tiles.
11. **Dead state looks like working state.** `showTimeline` toggled and coloured its
    button while nothing consumed it, so wiring a mode to it produced a mode that appeared
    to switch and changed nothing. Grep for consumers before mapping onto an existing
    boolean.
12. **Cloudline never converged** after four attempts at density, scale and altitude. It
    still reads as the flank of one cloud rather than a sea of them. Shipped with an honest
    note on the page as the weakest of Series V.

---

## 7. Next steps, in order

1. **Commit.** Nothing is committed yet. Suggested split: (a) signature shaders +
   presets, (b) Proposal 1 restyle + `ui/`, (c) Proposal 2 shell.
2. **Optional Proposal 2 completion**: migrate the eight-tab flyout content into Inspector
   sections and retire the flyout; split `PlajahPixelsStudio.tsx`.
3. **Proposal 3**, as an additive producer of `SceneTimeline`. Safe per section 5.

### Commands

```bash
# typecheck — a bare tsc OOMs silently, so the memory flag is mandatory
NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit    # baseline: 75 errors
```

```bash
# rebuild the gallery and regenerate the preset file
node build.cjs && node audit.cjs && node emit-presets.cjs
```

```bash
# live verification (needs the dev server on :3000)
node verify-shell4.cjs
```
