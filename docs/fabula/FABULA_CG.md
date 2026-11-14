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
