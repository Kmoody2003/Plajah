# Fabula CG: motion graphics and titles, powered by Tela

Fabula CG is a broadcast character generator (CG) shared by every production surface in Plajah:

- **Fabula**, through the **GRAPHICS · CG & TITLES** workspace on the edit-page rail and the **CG & TITLES** button on the Edit toolbar.
- **TV Studio**, through the Graphics tab.
- **Router & Switcher**, as a program overlay layer.
- **Stage** (Ambo), as slide layers.

One renderer draws every frame, so the timeline, the export, the switcher and Stage all produce the same pixels.

## Engine (`services/fabula/cg/`)

| File | Role |
|---|---|
| `cgTypes.ts` | The document model: layers, IN/OUT/LOOP moves, keyframes, data fields, timing, live mode, coverage, the drag MIME type |
| `cgEvaluate.ts` | Pure, deterministic `evaluateCg(graphic, t, D, ref)`. D = clip duration on the timeline, `Infinity` while live. Pressing OUT sets D. |
| `cgRender.ts` | The single Canvas2D renderer. It caches Path2D objects, images and text measurements, and draws per-glyph only while text is animating. Works with OffscreenCanvas. |
| `cgPackages.ts` | 24 style systems (packages). Each has an Art Council director, a Motion Council director and a Motion Studio Roster member. |
| `cgArchetypes.ts` | 39 element builders: lower thirds, full pages, stingers, titles, openers, end cards, bugs, tickers, scoreboards, clocks, countdowns, social, quotes, callouts, locators, data and frames |
| `cgLibrary.ts` | Lazy build of 24 × 39 = **936 graphics**, plus My Graphics (localStorage), search and drag-and-drop helpers |
| `cgPlayout.ts` | The live engine: slots (L1, L2, TICKER, BUG, FULL, STINGER), rundown, preview, TAKE, OUT, NEXT, CLEAR, live field updates and stinger cut callbacks. Windows on the same origin stay in sync over the BroadcastChannel `fabula-cg-v1`. |
| `cgOutput.ts` | `drawPlayout`, a self-idling overlay canvas, the key/fill modes and the Router `OverlayLayer` adapter |
| `cgToTela.ts` | Opens a graphic's resting frame in Tela as editable vector objects |
| `cgCouncil.ts` | Attribution ids mirrored from the council rosters. The tests pin them to the source files. |

Measured performance: evaluating a frame takes about 6 µs (the test fails above 1 ms). A held graphic costs nothing, because the overlay canvas only redraws while something is moving.

## Integration points

- **Fabula timeline**: a title clip carrying `cGraphic` (a `CgGraphicRef`).
  - Drag from the library or designer onto any track. CG clips land on a subtitle track at the drop time.
  - The monitor (`CgClipMonitor`) stacks every active CG clip.
  - The offline export (`offlineRenderer.ts`) uses the same renderer.
  - The inspector edits field values and the accent colour. It can also open the graphic in the workspace or take it live.
- **TV Studio** (`components/production/FabulaCGSwitcherPanel.tsx`):
  - An always-on `TELA` overlay over program.
  - A live panel in the Graphics tab.
  - Drop a graphic on the Program monitor to take it.
  - Stingers can cut preview to program at their cut point.
  - The CG layer is also published on the app bus as `fabula:graphics`.
- **Router & Switcher** (`VideoRouterConsole.tsx`): `ProgramOutput.addLayer(cgProgramLayer(...))`. Stingers cut the switcher.
- **Stage** (`services/ambo/fabulaCgSource.ts`) adds two `LayerContent` kinds:
  - `FABULA_GRAPHIC` holds one graphic. Drop it on the deck to make a new slide, or on a slide to replace its CG in the overlay slot.
  - `FABULA_CG_LIVE` mirrors the whole live program onto every Stage output. Use the **⠿ LIVE CG → STAGE** chip in the live panel.
- **Output windows**: the live panel's **FILL OUT** and **KEY OUT** buttons open clean outputs for capture cards, OBS or external keyers.

## Council FX preset bank (`services/fabula/fxCouncilPresets.ts`)

Each of the 12 director lenses (6 Art + 6 Motion) reads an effect's declared parameters and writes one preset in that director's voice. The six Music Council lenses do the same for the audio devices.

- **Effects**: 2,205 presets across 186 video effects. The only effect with none is `mirror`, because all its controls are switches.
- **Transitions**: 379 presets for the 32 phase-3 transitions, plus a bank for each of the 17 inline transitions.
- **Audio**: Music Council presets for the 45 audio devices, in Fabula only. Melos's own preset list is unchanged.
- **Looks**: 72 council looks (12 lenses × 6 categories) in `forgeLooks.ts → COUNCIL_LOOKS`.

The generator never moves drivers or switches (progress, seed, mode, direction and similar), keeps every value in range and snapped to the parameter's step, and is deterministic. Effects added later get their bank automatically. Hand-authored presets always come first.

The presets show up in:

- the Forge inspector picker, grouped as Signature and Council presets
- the FX Library, behind a collapsed COUNCIL PRESETS row per effect or transition
- the Looks tab, under a COUNCIL filter
- the node graph's preset picker

`resolvePreset` and `createForgeTransition` resolve council ids, so saved clips reopen correctly.

## Tests

`npm run test:cg` runs `tests/fabulaCg.test.ts` and `tests/fxCouncilPresets.test.ts`. They check:

- **Library**: completeness and unique ids; every package has a full kit; only Tela fonts are used; every placeholder resolves to a field.
- **Credits**: real council members, pinned to the source rosters.
- **Layout and motion**: title-safe; resting and exit phases; stingers cover the frame at their cut point.
- **Performance**: the real-time evaluation budget.
- **Playout**: slot routing, take/replace/out overlap, rundown with live field updates, stinger auto-out and cut callback.
- **Presets**: ranges, drivers, determinism and id collisions.

## Live sources: the SOURCES room

The **SOURCES** room sits next to LIVE. It handles everything live that graphics can be fed by or painted with.

### Live data (`services/liveData/`)

- **`liveDataHub.ts`**:
  - A persisted source registry, shared by every window on the same origin.
  - One poller or watcher per source, no matter how many graphics use it.
  - Subscribers are notified only when the content actually changes (a signature of the content is compared).
  - Snapshots are mirrored over the BroadcastChannel `plajah-live-data-v1`.
  - Apps can push rows into a `table` source with `pushRows`.
- **Adapters** (`liveDataHub.ts`, `liveDataAdapters.ts`):

  | Adapter | What it reads |
  |---|---|
  | `tela-sheet` | A Tela Sheet or Base (row 1 is the header). It re-reads on every Tela save and every few seconds, so names added to the sheet show up in graphics. |
  | `csv-url`, `json-url` | Published Google Sheets, APIs and similar. |
  | `csv-text` | Pasted CSV. |
  | `csv-file` | A local CSV or JSON file, re-read while open. |
  | `table` | Rows typed by hand or pushed by other apps. |
  | `math` | The Tela Sheet formula engine, the platform's MATLAB-style array maths (SEQUENCE, MMULT, MINVERSE, LINEST, LAMBDA…), with live `t` and `n`. |
  | `simulator` | Registered simulators: the machine-atlas brake simulator plus a signal generator. Live playback or the full series. |
  | `weather` | Open-Meteo current conditions plus a 7-day forecast. No API key. |

- **`binding.ts`**: maps a table onto a graphic's fields. A mapping can be:
  - a column name
  - a `{A} {B}` template
  - an aggregate: `#count`, `#sum:`, `#avg:`, `#min:`, `#max:`, `#pct:`, `#index`
  - an absolute row: `@2:col`, `@last:col` (used by multi-row boards)
  - a literal: `=text`

  Rows are chosen as first, newest, index, match, or `row-of-item`. `autoMap` guesses the mappings from column names.
- **Follow rundowns** (`cgLive.ts`): every row becomes a rundown item, and new rows append on their own.

### Visual paint (`services/visualFill/`)

Any visual can be a **fill, texture, mask or gradient-map** instead of only a colour, gradient or image. The sources are:

- every Stage visualizer: Pixels GLSL generators, Flux 3D, Studio GL, Milkdrop, Chora kinetic type and the shader library
- the 72 Chora worship visualizers
- live video: camera, TV Studio program, Stage outputs
- live face-tracked 3D avatars (VRM)

How it works:

- Frames are pooled by (visual, size), so ten shapes using one visual share a single GPU context. Unused instances are disposed after 8 s.
- In CG, set `CgLayer.paint` on a rect, ellipse, path or text layer, or use the new `visual` layer kind.
- In Tela, set `TelaVectorObject.visualFill` on rect and ellipse shapes. The Tela inspector has a picker.
- Mask and gradient-map run a luminance pass on a ≤320 px scratch canvas, so they stay real-time.

### Tracking (`services/liveTracking/trackerHub.ts`)

Trackers run on a live feed and publish smoothed anchors:

| Tracker | Anchors | Engine |
|---|---|---|
| Face | `face`, `faceTop`, `faceBottom`, `faceLeft`, `faceRight` | MediaPipe (model loaded from a CDN) |
| Pose | named body points plus `head`, `chest`, `hips` | MediaPipe (model loaded from a CDN) |
| Point | `point` (click to pick) | Offline patch tracker |

- A graphic with `ref.anchor` is pinned to a tracked point every frame. It can scale with the subject and hide while the subject is lost.
- External tracking systems can feed anchors with `pushTrackerState`.
- Offline exports never use tracking, so renders stay deterministic.

### New library elements (44 per package, 1,056 graphics in total)

- Weather Now
- 5-Day Forecast (binds rows 0–4 through `dataHints`)
- Visualizer Backdrop
- Visualizer Strap (a gradient-mapped, on-brand visual plate)
- Tracked Name Tag

There is also a drawn `weather` glyph layer: sun, partly, cloud, fog, rain, sleet, snow, storm, night.

### Limits

- Face and pose tracking need network access to load the MediaPipe models. Hand tracking does not exist in the codebase.
- The avatar module drives the face and head only.
- "Plajah Build" files: no project or file API under that name exists in this repo yet. CSV/JSON files and Tela documents are supported instead.
