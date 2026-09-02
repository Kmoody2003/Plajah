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
| W2a | **Temporal frame access** (feedback buffer: `prev()` / `prevSrc()` in the FX header, per-instance history, reset on time jumps) + **Time pack** (Trails, Echo, Temporal Blur, Motion Detect, Deflicker, Time Displace-lite, Datamosh-lite, Frame Blend, Ghosting, Strobe) | IN PROGRESS |
| W2b | **Mask input per effect (PixelChooser)**: shape masks (ellipse/rect/polygon, feather, invert), aux-luma masks, planar-tracked masks; mask editor overlay; mix stage in FxRenderer | NEXT |
| W2c | **Track binding**: bind any effect param / mask / window to VectorTrack point or planar data (`instance.bindings`) — resolved identically in monitor + export | NEXT |
| W2d | VectorTrack: track backward, AdjustTrack manual key, corner-pin export rows to FCPXML | later |
| W3a | **Emitter (stateless particles)**: closed-form GPU particle fields (rain/snow/sparks/embers/dust/bokeh/streaks), forces via curl noise, 3D-ish depth, motion blur; preset library by category | after W2 |
| W3b | Text animators on the titler (per-glyph type-on, tracking, scramble, counters) | later |
| W3c | three.js layer node (extrusions, shatter, Form/Mir/Tao) | later |
| W4 | ML tier: MediaPipe subject matte as a mask source (live + offline), depth ONNX, Crossover SAM2 | later |
| W5 | OFX: descriptor export (`services/fabula/ofxManifest.ts`) generated from the registry; Rust shell later | descriptor generator after W2 |

## Done this run
- (2026-09-02) VectorTrack planar tracker end to end — see `plajah-vectortrack` memory / build matrix.

## Next up (in order)
1. W2a temporal access + Time pack.
2. W2b mask input + shape mask editor.
3. W2c track binding.
4. W5 OFX descriptor generator (cheap, on the path).
5. W3a Emitter.
6. W4 MediaPipe matte as mask source.

## Backlog (kernel gaps vs the Boris/Red Giant catalog, for later kernel batches)
Kaleidoscope family variants, halftone rings/colour, fly's-eye, tile scramble, emboss glass,
pseudo-colour, zebra, roman tile, strip slide, infinite zoom, parallax strips, warp repeat,
laser/zap-to-point, aurora/luna/night-sky scenes, grads & tints set (ND grad, dual grad, sunset,
gels, skin tone, split tone), diffusion glass set (net, silk, frost, mist, center spot, split
field), HUD components, array gun, progress bars, long shadow, luster bevel, Symbol mapper,
dither palettes, retrograde/carousel frames, VHS text generator.

## GLSL compile sweep (browser)
```js
const fx = await import('/components/plajahPixels/engine/fx/effects.ts');
const r = await import('/components/plajahPixels/engine/fx/fxRenderer.ts');
const gl = document.createElement('canvas').getContext('webgl2');
const R = new r.FxRenderer(gl); const bad = [];
for (const e of fx.FX_EFFECTS) { for (const p of (e.passes?.length ? e.passes : [{id:'main', glsl:e.glsl}])) { try { R['program'](e, p.id, p.glsl); if (!R['progs'].get(e.id+':'+p.id).p) bad.push(e.id+':'+p.id); } catch (err) { bad.push(e.id+':'+p.id+' '+err.message); } } }
JSON.stringify(bad);
```
