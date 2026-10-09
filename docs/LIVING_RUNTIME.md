# Living runtime: how a Tela page comes alive

Companion to `docs/LIVING_BOOKS.md` (the plan) and `services/living/contracts.ts` (the data contract). This file is how the **behaviour runtime**, the **reader integration** and the **Tela authoring panel** work, what conventions go beyond the contract, how to extend them, and what is not verified.

## Map

| Piece | Where |
|---|---|
| Pure runtime (unit-tested, no DOM) | `services/living/runtime/`: `targets`, `conditions`, `state` (VarStore), `anim` (preset library), `drag`, `proximity`, `goals`, `particles`, `interpreter` (every Action), `validate`, `catalog`, `objects` |
| DOM engine (one per live page) | `services/living/runtime/engine.ts` (`LivingEngine`, implements `RuntimeHost`) |
| Live page component | `components/living/TelaLivePage.tsx` (props `{ objects, width, height, living, audio, reducedMotion, soundEnabled, onGoto, onGoal, active }` + handle `{ replay, pause, resume, setReducedMotion, getVars, narrate, ... }`) |
| Reader | `components/bookTela/TelaBookReader.tsx` (live pages, page turn coexistence) + `components/living/LivingReaderBar.tsx` (Sound, Read-to-me, Reduced motion, Play again; choices in `localStorage['plajah-living-prefs']`) |
| Authoring | `components/tela/TelaBehaviorsPanel.tsx` (Studio side panel, under the selected object), `TelaLivePreview.tsx`, `services/living/authoring/` (`presets`, `livingDoc`, `describe`), op `SET_LIVING_PAGE` / `SET_LIVING_BOOK` in `components/tela/telaOps.ts` |
| Lab + drive | `living-lab.html/.tsx/.vite.config.mjs`, `services/living/sample/labPage.ts`, `scripts/living/driveLab.mjs`, `scripts/living/perfLab.mjs` |

Commands: `npm run test:living` (unit tests), `npm run lab:living` (serves http://127.0.0.1:3155/living-lab.html; `?page=triggers|presets|tela|reader`), `npm run drive:living` (real pointer / touch / keyboard drive; frames go to `docs/living-runtime-frames/`).

## How a page is rendered

`TelaLivePage` turns each vector object into its own `<g data-obj-id data-label data-role>` whose content is exactly what `services/tela/telaSvg.ts` (`objectToSvg`) emits, so gradients, filters, blend modes, text layout and path boxes match the flat export. (TelaVector's React renderer is wired for editing and for LOTTIE/MOTION foreignObjects; a reader page must not run those.) Gradient / filter ids are prefixed per instance so two copies of a page (page-turn neighbours) never clash. The wrapper `<g>` is what animates; object internals are never touched, so **a page with all behaviours off is the flat page**.

Page numbering convention: `LivingPage.page` is the **1-based position of the frame in `doc.frames`** (the showcase spread number; cover = 1). A frame's objects are the objects of its VECTOR device (`services/living/runtime/objects.ts`). The reader uses the live page only when `hasLiving(doc.living, page)`; every other page, and every older reader, falls back to the static device.

## Runtime rules (all enforced and tested)

- **Only transform / opacity / filter animate**, as Web Animations on the wrapper `<g>`. Transforms use `composite: 'add'`, so an idle breathe, a tap wiggle and a drag all stack. One-shot "state" presets (fade-out, pop-in, grow, rise...) commit their end state when they finish. Exceptions that are not compositor properties: `draw-on` animates `stroke-dashoffset` and `type-on` rewrites text; both are cheap and bounded.
- **One rAF loop** (drag tweens, follow, tilt/parallax, particles, type-on). It sleeps whenever nothing moves; it stops when the page is not active, not in view, or `document.hidden`; pointer / tilt events wake it. WAAPI loops are paused with the page (`pause()` / `setVisible(false)`).
- **Reduced motion** (reader override beats `prefers-reduced-motion`): ambient loops and motion presets compile to stills; entrances and exits keep an **opacity-only** fade with the same end state (200-500 ms); `grow/shrink/rise/fall` apply their end state without movement; `draw-on` / `type-on` finish instantly; bursts, trails, celebrate confetti are skipped; drag snap-back is instant; flicker / twinkle / glow never run. A behaviour's own `reduced` actions replace its `do` list when reduced motion is on, or when sound is off **and** `do` would show nothing (audio-only).
- **Sound** is only requested when `soundEnabled` is true; the reader sets it after the first gesture. The component calls `audio.unlock()` from the pointer / key gesture. Missing audio (null) is fine.
- **Photosensitivity**: flicker is rate-limited to under 3 changes a second and low contrast; the validator flags timers and flickers that could strobe.
- **Seeded**: every preset takes `seed` (default: a hash of object id + preset), so frames and thumbnails are reproducible; ambient loops are desynchronised with a seeded negative delay.
- **Hit testing**: pointer events are handled once on the page root. For tap / press / drag, the **topmost** object (in z order) that has a behaviour of that kind wins. `{page:true}` behaviours match anywhere, last. Drag / press targets get `touch-action:none` and `data-no-pageturn` (so PageTurn's own swipe does not steal the gesture); the rest of the page keeps vertical scroll (`pan-y`).
- **Accessibility**: each interactive behaviour (tap, doubleTap, press, drag, proximity) gets one focusable control, named by `hint`, sized at least 44px, sharing one control per target and kind (Mars' peek and hide are one control). Enter / Space taps; Space held = press and hold; arrow keys nudge a drag target (8% of travel) and Enter completes it; Enter on a proximity control runs its gentle (non-"fast") behaviour. Results go to a polite live region (set text, goals, "Well done!", drag percent). Hover and tilt are optional extras and need no alternative.

## Conventions beyond the contract

These are all expressed with existing contract fields, so the data stays valid for any reader:

- **Scrub an animation with a variable**: `easing: 'var:<name>'` makes the animation follow the variable (0..1) instead of time. That is how "draw the thread as you pull" (`draw-on`) and "the world changes with depth" (keyframes with `hue`) work.
- **Drag helper variables** (when `progressVar: 'p'`): `p` (0..1), `p.dragging` (bool), `p.snap` (index+1 of the snap point, 0 = none). Events: `drag:start:<behaviorId>`, `drag:end:<behaviorId>`, `drag:snap:<behaviorId>`, usable with `on: {type:'event'}`. Bounds are absolute offsets from the object's rest position; progress is the fraction of available travel in the direction moved.
- **Drag does what**: a drag behaviour's `do` runs once when the drag starts. React to the result with `when`/`event` behaviours.
- **Pitch from the tap**: a `note` of `'scale:C4,D4,E4,G4'` picks a note by where on the page you tapped. A `note` with no `durationMs` inside a `press` behaviour becomes a **held voice** (stopped on release; moving the pointer up bends it +-7 semitones).
- **Page tint**: `set` on `{page:true}` with `fill` + `opacity` draws a tint overlay (candle blown out = dim room); other props move the whole page group.
- **Tilt**: a `tilt` behaviour with `animate {preset:'parallax', amount}` shifts the object opposite to the tilt (DeviceOrientation, iOS permission requested on first tap; pointer position is the desktop fallback). If the page declares `tiltX` / `tiltY` vars they are kept updated (-1..1).
- **Proximity**: `slowBelow` / `fastAbove` are client px/s. One approach fires each behaviour at most once; when one behaviour on a target fires, its siblings stay quiet until the pointer leaves the radius. Speed and position are tracked on the whole document, so an approach from outside the page is measured honestly.
- **Disabled**: authors can switch a behaviour off without deleting it (`disabled: true` on the Behavior; the runtime skips it).
- **Timers** run only while the page is visible; **state resets on every visit** (Play again resets variables, goals, once/cooldown counters, and replays `enter`). Goals fire once per visit and call `onGoal`; the reader stores them under `plajah-living-goals-<albumId>`.

## Authoring (Tela)

Studio posture -> select a vector object -> the **Live** section appears under its properties:

- *Behaviours*: the selected object's behaviours (or all on the page), with enable / duplicate / delete, an inline form (name, hint, target, trigger and its fields, the action list with per-action fields, reduced alternative, once, cooldown, only-when condition) and validation warnings.
- *Add*: 14 plain-language presets (Float, Blink, Breathe, Twinkle, Tap to wiggle, Tap to play a sound, Tap to burst sparkles, Press to hold a note, Drag to reveal, Follow the pointer, Peek when approached slowly, Counter + goal, Fade in on enter, Play music when page opens) that expand into ordinary Behavior JSON, plus a blank behaviour.
- *JSON*: the page's raw data, applied with a readable error if invalid.
- *Preview page*: the page as readers get it, with the real audio engine, a Sound toggle (starts off, first tap turns it on), reduced motion, Play again and live variable display.
- Undo / redo of Live changes (the Tela canvas has no global undo; this panel keeps a per-page history of its own).

Validation (`services/living/runtime/validate.ts`): **every tap / doubleTap / press / drag / proximity behaviour needs a `hint`** (error); empty targets, duplicate ids, unknown presets / particle kinds / cues / sounds / instruments / beds, undeclared variables and strobing rates are warnings or errors.

Persistence: edits are `SET_LIVING_PAGE` ops (`applyTelaOp`, pure), so they autosave through TelaView's normal debounce, serialize with the doc (`telaStore.saveTelaDoc`), are part of the frozen snapshot `publishTelaVersion` writes, and are inside the reader bundle (`services/bookTela/bundleStorage.encodeBundle`). `tests/livingAuthoring.test.ts` round-trips an edited doc through all three. A page with nothing alive on it removes its entry; a doc with no living data carries no `living` key.

## Adding things

**A new animation preset**: (1) add the name to `AnimPreset` in `contracts.ts`; (2) add a `case` to `def()` in `services/living/runtime/anim.ts` returning `{ dur, frames, loop?, alt?, ease?, commit?, fadeTwin?, motion? }`: frames are `{at, x, y, r, sx, sy, skew, o, filter}`; give it a `commit` if it should leave state behind, `fadeTwin: true` if it should survive reduced motion as a fade; (3) add it to `ALL_PRESETS` (and `IDLE_LOOPS` if it should default to looping). The unit tests loop over `ALL_PRESETS`, so it is checked for monotonic offsets, consistent transform lists, determinism and a reduced twin. Add a tile to `services/living/sample/labPage.ts` to see it in the lab.

**An authoring preset** (a card in the Add tab): append to `PRESETS` in `services/living/authoring/presets.ts`; it must return plain Behavior JSON with a `hint` on every interactive behaviour. The authoring test validates every preset automatically.

**A new action or trigger**: extend the contract, then `interpreter.ts` (action) or `engine.ts` (trigger), `describe.ts` (names and defaults) and the field tables at the top of `TelaBehaviorsPanel.tsx`.

## Limits and known gaps

- State and variables are per page visit; nothing persists across pages except what the reader saves for goals. Cross-page variables would need a book-level store.
- Tap-point pitch (`scale:`) and bend are simple conventions, not a full instrument model.
- `draw-on` needs stroked shapes without their own dash pattern; filled-only or dashed shapes fall back to a fade. `type-on` rewrites the line tspans, so combine it with narration highlighting only after it finishes.
- Narration highlighting needs the page's visible text to match the narration word count; otherwise audio plays without highlights.
- The accessible controls are placed at the objects' rest boxes and do not follow a dragged object. Rotated objects use their unrotated box.
- Hover needs a mouse; proximity needs a moving pointer (touch counts only while touching); tilt needs a sensor or falls back to the pointer.
- The authoring form covers the common fields; compound conditions, `if` branches and drag `snapTo` points are edited in the JSON tab.
- Only the topmost object with a given kind of behaviour reacts to a tap, so a character built from many overlapping pieces should be targeted by group or label prefix.

## Not verified (be honest)

Real phones and tablets (touch feel, gyro, iOS permission prompt, `navigator.vibrate`, battery / frame rate on mid-range hardware), real screen readers (VoiceOver, TalkBack, NVDA: only roles, names and live-region text were asserted), a real published book in the production reader, the Studio panel inside the full `TelaView` (it is verified in a harness with the same props and op reducer), and audible output (the lab uses a recording mock; the reader and preview use the real engine, but nobody has listened in this session). Headless frame times (steady 16.7 ms with 19 loops and 60+ particles) are software-rendered and say nothing about devices.
