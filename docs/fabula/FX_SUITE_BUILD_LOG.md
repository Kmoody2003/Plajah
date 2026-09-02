# Fabula FX Suite — autonomous build log

Owner: Claude (autonomous overnight run authorised by Kenne, 2026-09-02). Companion docs:
`FORGE_CLAUDE_HANDOFF.md` (Forge state: 106 effects / 287 presets / 17 transitions built by the
Forge session), `FORGE_PHASE_1_2_BUILD_MATRIX.md` (evidence-based status), the FX Suite spec
artifact (https://claude.ai/code/artifact/0e03675e-8f3f-427e-a898-27122510a12e).

## Ground rules for every continuation
- Video FX/plugins only. Native Fabula first; the OFX adapter later translates the same registry
  (stable ids, ordered params, inputs). Do not build a parallel effect system — extend
  `components/plajahPixels/engine/fx/effects.ts` and its packs.
- The worktree carries other sessions' uncommitted work. Commit ONLY files you touched, with a
  clear message, no push. Never revert or reformat others' hunks. Check `git status --short` first.
- Validation after every batch: `npx tsx --test tests/forgeEffects.test.ts`,
  `npm run test:vectortrack`, `npx esbuild <file> --loader:.ts=ts --outfile=/dev/null` (or
  `--loader:.jsx=jsx`) on touched files. Optional: in the browser, import the compositor from the
  dev server and compile every registered effect (see "GLSL compile sweep" below).
- Monitor == export: anything added to the renderer must land in `compositor.ts` (live + offline),
  `offlineRenderer.ts` (pass-through), `fabulaRender.ts` (resolve) and `ForgeClipPreview` /
  `MonitorLayer` in `Fabula.jsx`.

## Re-scoped waves (Forge already covers most of W0/W1)
| Wave | Item | Status |
|---|---|---|
| W0 | Effect stack, named params, presets, monitor/export parity | DONE (Forge) |
| W1 | Kernel mass: 106 effects across light/blur/color/key/stylize/distort + 17 transitions | DONE (Forge); gaps listed in backlog |
| W2a | DONE 2026-09-02 (commit 072d37d) — **Temporal frame access** (feedback buffer: `prev()` / `prevSrc()` in the FX header, per-instance history, reset on time jumps) + **Time pack** (Trails, Echo, Temporal Blur, Motion Detect, Deflicker, Time Displace-lite, Datamosh-lite, Frame Blend, Ghosting, Strobe) | DONE |
| W2b | **Mask input per effect (PixelChooser)**: shape masks (ellipse/rect/polygon, feather, invert), aux-luma masks, planar-tracked masks; mask editor overlay; mix stage in FxRenderer | DONE 2026-09-02 (services/fabula/forgeBindings.ts, MaskOverlay in Fabula.jsx; aux-luma masks still open) |
| W2c | **Track binding**: bind any effect param / mask / window to VectorTrack point or planar data (`instance.bindings`) — resolved identically in monitor + export | DONE 2026-09-02 (LINK select per param when the clip has a track) |
| W2d | VectorTrack: track backward + AdjustTrack (drag corners on a tracked frame) + corner-pin JSON export DONE 2026-09-02 (af7f588); FCPXML transform keyframes open | DONE (core) |
| W3a | DONE 2026-09-02 (phase3ParticleEffects.ts: Emitter · Field + Emitter · Burst, 17 presets) — **Emitter (stateless particles)**: closed-form GPU particle fields (rain/snow/sparks/embers/dust/bokeh/streaks), forces via curl noise, 3D-ish depth, motion blur; preset library by category | DONE (fluid sim / 3D model emitters remain open) |
| W3b | Text animators on the titler DONE 2026-09-02 (services/fabula/titleAnimators.ts: type on, fade up/in, tracking, scramble, word slide, blur in, drop in, with out phase; DOM monitor spans + canvas export per glyph; inspector ANIMATION block). Counters/HUD text tools still open | DONE (core) |
| W3c | three.js layer node (extrusions, shatter, Form/Mir/Tao) | later |
| W4 | ML tier: MediaPipe subject matte as a mask source (live + offline) DONE 2026-09-02 (services/fabula/subjectMatte.ts, mask kind = subject); depth ONNX + Crossover SAM2 | partial |
| W5 | OFX: descriptor export (`services/fabula/ofxManifest.ts`) generated from the registry; Rust shell later | descriptor generator DONE 2026-09-02 (services/fabula/ofxManifest.ts, tests/ofxManifest.test.ts); Rust/C++ shell open |

## Done this run
- (2026-09-02) W2d track backward / AdjustTrack / corner-pin export; W3b per-glyph title animators (monitor == export).
- (2026-09-02) W4 step 1: subject (AI) matte as a mask kind on any effect — MediaPipe selfie segmenter (lazy CDN, GPU→CPU), exact per-frame in the offline renderer (after the seek), throttled last-matte reuse in the live monitor. Verified the model loads and returns a matte canvas in the browser (~14 s first load).
- (2026-09-02) Kernel batch: phase3GradsTintsEffects (ND grad, colour grad, dual grad, radial tint, split tone, gels, skin tone, sunset; Net/Silk/Frost/Mist/Center Spot/Split Field/Double Fog glass), phase3StylizeVariantsEffects (kaleidoscope, halftone pro, fly-eye, tile scramble, emboss glass, pseudo colour, zebra, roman tile, strip slide, infinite zoom, parallax strips, warp repeat), phase3GraphicsEffects (array gun, HUD rings, progress bar, long shadow, luster, laser beam, zap, aurora, night sky). 154 effects / 448 presets; compile sweep 154/154.
- (2026-09-02) W5 step 1: OFX descriptor generator (choice/int/bool typing from labels, clips, contexts, kernel ABI + header hash). W3a: Emitter Field (rest-frame hashed, 3 parallax layers, 7 shapes) + Emitter Burst (64 closed-form particles, bindable emitter position); compile sweep 118/118, deterministic.
- (2026-09-02) W2a temporal access + 10 Time effects; fixed compositor VAO rebind after effects/grade layers/transitions (effects rendered BLACK before), two Forge shaders that did not compile, cube LUT sampler3D precision.
- (2026-09-02) W2b masks (ellipse/rect/poly, feather, invert, follow point/planar) + W2c track-bound params via one resolver (resolveInstanceForFrame) used by ForgeClipPreview and fabulaRender. Verified by GL readback in the browser.
- (2026-09-02) VectorTrack planar tracker end to end — see `plajah-vectortrack` memory / build matrix.

## Next up (in order)
1. Depth matte (ONNX depth model as mask/aux source) + Crossover SAM2 tracked mattes.
2. OFX shell scaffold (Rust cdylib reading the manifest).
3. Universe text tools (counters, screen text, text tile) on the title engine; Real Lens Flares element designer; 3D DVE (cube/cylinder/page turn); wire remover (Anchor + inpaint).
4. Corner-pin → FCPXML transform keyframes; shared track assets across clips.

## Backlog (kernel gaps vs the Boris/Red Giant catalog, for later kernel batches)
Symbol mapper (ASCII), retrograde/carousel film frames, VHS text generator, dither palettes
(Universe), Universe text tools (need the text engine), Glo Fi / Quantum fractal glows, Heatwave,
ChromaTown, Sketchify variants, muzzle flash (Bang), Real Lens Flares element designer, 3D
cube/cylinder/page-turn DVE, sphere map, wire remover (needs Anchor + inpaint).

## GLSL compile sweep (browser)
```js
const fx = await import('/components/plajahPixels/engine/fx/effects.ts');
const r = await import('/components/plajahPixels/engine/fx/fxRenderer.ts');
const gl = document.createElement('canvas').getContext('webgl2');
const R = new r.FxRenderer(gl); const bad = [];
for (const e of fx.FX_EFFECTS) { for (const p of (e.passes?.length ? e.passes : [{id:'main', glsl:e.glsl}])) { try { R['program'](e, p.id, p.glsl); if (!R['progs'].get(e.id+':'+p.id).p) bad.push(e.id+':'+p.id); } catch (err) { bad.push(e.id+':'+p.id+' '+err.message); } } }
JSON.stringify(bad);
```
