# Tela vector geometry engine

`services/tela/geometry/**` — Plajah's own Illustrator-grade vector core, pure TypeScript (no DOM, no dependencies), runs in node and the browser. Wave 1 of the Tela gauntlet: engine only; the Studio vector UI and the Storybook art designers build on it next.

Tests: `npm run test:geometry` (112 tests). Proof sheets: `npm run proof:geometry` → `.tela-proofs/geometry/{booleans,strokes,materials,vignette}.png` (rendered by headless system Chrome).

## Module map

| File | What it is |
|---|---|
| `vec.ts` | `Vec`, `Rect`, small vector maths, number formatting |
| `model.ts` | **The path model**: `Anchor` (absolute `hin`/`hout`, `kind` corner/smooth/symmetric), `SubPath`, `CompoundPath` (+ `fillRule`), `Curve`; paint types (`Paint` = colour / `LinearPaint` / `RadialPaint` / `FreeformPaint` / `MeshPaint` / `PatternPaint`), `StrokeStyle`, `MaterialRef`, `TelaGeomExt`; legacy conversion (`fromPoints`, `fromNodes`, `toNodes`), exact signed area |
| `pathData.ts` | SVG `d` parse (full grammar, arcs → cubics, packed numbers/flags) and serialise |
| `shapes.ts` | rect (per-corner radius), ellipse, circle, polygon, star (both with corner rounding), spiral, polyline, `smoothThrough` (Catmull–Rom through points) |
| `bezier.ts` | evaluate, derivatives, tangent/normal, curvature, split/subCurve, polynomial roots, extrema, inflections, tight bounds, adaptive Gauss–Legendre length, arc-length inversion and tables, projection, flattening |
| `intersect.ts` | line×line, curve×line (Cardano), curve×curve (subdivision + 2D Newton polish + graze detection), coincidence/overlap detection, cubic self-intersection |
| `boolean.ts` | Pathfinder: union / intersect / subtract / exclude (N-ary), `resolve` (self-intersections, fill rule → clean nonzero), `divide` regions with coverage, shape builder (`pickRegion`, `mergeRegions`), `trim` / `merge` / `crop` / `minusBack` / `outline`, winding / point-in-path |
| `offset.ts` | curve offset (handle-direction-preserving Tiller–Hanson variant with error-controlled subdivision), arcs, joins (miter+limit / round / bevel), caps, `offsetPath` |
| `stroke.ts` | `outlineStroke` (caps, joins, dashes + offset, align dashes to corners, inside/outside alignment), `dashPath`, **`variableStroke`** (width profiles, asymmetric sides, wobble), `PROFILES` |
| `fit.ts` | RDP, Chaikin, Schneider least-squares cubic fitting (with runaway-handle guard), `pointsToPath` (pencil/brush input, keeps corners), `simplifyPath` |
| `transform.ts` | affine matrices (translate/scale/rotate/shear/reflect/compose/invert), SVG transform parsing, `transformPath`, `transformEach`, `align`, `distribute` (incl. spacing from a key object, visual bounds) |
| `pathOps.ts` | reverse, join, close, average, `setHandle` (kind-aware), add / remove (refit) / convert anchor, smooth, roughen, zig-zag, pucker & bloat, twist, `mapPath` (nonlinear maps that keep curves), envelope mesh (`makeMesh`, `envelope`), warp presets (arc, arch, bulge, flag, wave, fish, rise, fisheye, inflate, squeeze, twist, shells), blend, points along a path |
| `brushes.ts` | art brush, pattern brush (side tiles fitted per run, corner tiles), scatter brush |
| `color.ts` | parse/format, OKLab perceptual mix, shade, hue shift |
| `paint.ts` | gradient constructors (`linear`, `radial`, `linearAcross`), paint servers, pattern defs, freeform + mesh layers, `meshGrid`, `tessellateMesh` |
| `materials/filters.ts` | material presets (SVG filter graphs): watercolor, gouache, crayon, pencil, chalk, felt, linocut, riso, paper, ink, volume, roughEdge |
| `clip.ts` | geometric clipping (booleans for fills, curve cutting for open paths) |
| `tela.ts` | bridge: `objectToPath(TelaVectorObject)`, `pathToObject(path, PaintSpec)` |
| `scene.ts` | **`Scene` builder** for designer programs |
| `serialize.ts` | **the canonical SVG serialiser** |
| `svgImport.ts` + `xml.ts` | arbitrary SVG → editable Tela vectors |
| `hittest.ts` | fill/stroke/anchor hits, marquee, visual bounds, snapping (point / guides / grid / angle), smart guides |
| `procedural/*` | seeded RNG, simplex/value noise, fbm, Poisson disc, organic generators, hatching/stipple/halftone, rough lines, painterly recipes (`painted`, `foliage`, `wash`, `brushStroke`, `contactShadow`), composition + atmospheric perspective, symmetry/repeat, character toolkit |

Conventions: artboard px, y down. "Left" of a direction = `cross(dir, p) > 0`; a positive-area loop has its interior on its left; boolean results are nonzero with consistent orientation (holes reversed).

## Tela integration

A geometry object is an ordinary `TelaVectorObject` of kind `PATH`: `svgPathData` in **artboard coordinates** and `pathOrigin*` equal to its own (≥1 px) box, i.e. an identity mapping, so every existing renderer (TelaVector editor, telaSvg, exports) draws it unchanged. Engine finish rides in the one additive field `TelaVectorObject.geom?: TelaGeomExt` (types.ts): fill rule, engine paints, stroke style, material, clip. `pathToObject` always fills the legacy fields with a faithful fallback (first stop / base colour; linear/radial approximated as the legacy bbox gradient), so renderers that ignore `geom` degrade gracefully. Objects keep `groupId`, `objectLabel`, `templateRole` — everything stays native to Tela's object model (important for Fabula timeline rendering and The Post Man).

The editor (`TelaVector.tsx` `ObjectEl`) does not read `geom` yet: materials, engine gradients, mesh, clips and inside/outside stroke alignment show only in the canonical serialiser (exports, thumbnails, proofs). **Wave 2 task:** have `ObjectEl` render `geom` objects by delegating to `serialize.objectToSvg` (e.g. `dangerouslySetInnerHTML` inside a `<g>`) or port `geomPath` to JSX.

## The API the next agents use

### Studio vector UI agent
```ts
import { objectToPath, pathToObject, parsePathData, toPathData, hitFill, hitStroke, hitAnchor, inMarquee, anchorsInRect,
  snapPoint, smartGuides, targetsFrom, constrainAngle, setHandle, addAnchor, removeAnchor, convertAnchor, averageAnchors,
  joinSubpaths, closeSubpath, reversePath, boolean, divide, pickRegion, mergeRegions, trim, merge, crop, minusBack, outline,
  offsetPath, outlineStroke, variableStroke, simplifyPath, pointsToPath, transformPath, affine, transformEach, align, distribute,
  roughen, zigzag, puckerBloat, twist, warp, envelope, makeMesh, blend, artBrush, patternBrush, scatterBrush } from 'services/tela/geometry';
```
- Edit loop: `p = objectToPath(obj)` → edit `p` (anchors are plain data) → `onUpdate(pathToObject(p, spec, obj.id))`.
- Direct selection: `hitAnchor(p, pt, tol/zoom)` → `{sub, anchor, part: 'anchor'|'in'|'out'}`; drag handles with `setHandle(anchor, 'in'|'out', pt, kind)`; pen tool builds `Anchor[]` and Alt-drag sets `kind: 'corner'`.
- Pencil/blob brush: collect pointer samples → `pointsToPath(samples, { tol })` (→ `variableStroke` with pressure as a width profile for a blob brush).
- Pathfinder panel: `boolean(op, paths)`; shape builder = `divide(paths)` + `pickRegion` on hover + `mergeRegions` on drag.
- Snapping: `snapPoint(pt, { targets: targetsFrom(otherPaths), grid, angleFrom, angleStep: 45 })`, `smartGuides(movingBox, otherBoxes)`.

### Storybook art agent (designer programs)
```ts
import { Scene, rectPath, circlePath, smoothThrough, boolean, offsetPath, variableStroke, PROFILES, linear, radial, linearAcross, meshGrid, shade, mix } from 'services/tela/geometry';
import * as P from 'services/tela/geometry/procedural';

export function spread7(): TelaVectorObject[] {
  const s = new Scene({ width: 1024, height: 768, seed: 'moon-blanket/7' });     // deterministic
  const atmo = { sky: '#c9dbe0' }; const hz = P.horizon({ x: 0, y: 0, w: 1024, h: 768 }, .58);
  s.layer(0, () => s.fill(rectPath(0, 0, 1024, 768), linear(0, 0, 0, hz, [[0, '#6fa6cf'], [1, '#f6c79a']])));
  s.layer(2, () => s.fill(P.hill(-120, 1144, hz + 70, hz - 60, { seed: 20 }), P.atDepth('#5a8f55', .9, atmo), { material: s.material('gouache', { streak: 0 }) }));
  s.layer(4, () => P.foliage(s, crownShape, { light: 215 }));
  s.layer(6, () => P.drawCharacter(s, PIP, { x: 600, y: 680, facing: -1, armR: 120, expression: { mouth: 'open' } }));
  return s.build();
}
```
- `s.fill / s.stroke / s.shape / s.ink(spine, colour, width, profile)` · `s.group(label, fn)` (one Studio group) · `s.clip(region, fn)` (geometric clip) · `s.layer(z, fn)` (depth order) · `s.material(preset, params)` · `s.add(...legacyObjects)` (mix in watercolorKit/feltKit output).
- Painterly recipes: `P.painted(s, shape, colour, { light, medium, shadow, highlight, ink, sketchy, temperature })`, `P.foliage`, `P.wash`, `P.brushStroke`, `P.contactShadow`.
- Shapes: `P.blob, P.leaf, P.leafVein, P.cloud, P.hill, P.ground, P.wave, P.rock, P.grassBlades, P.petal, P.sparkle, P.crescent`.
- Marks: `P.hatch, P.crossHatch, P.flowHatch, P.stipple, P.halftone, P.directionalTone, P.rough, P.wobbleOutline`.
- Placement: `P.poisson, P.jitterGrid, P.radialRepeat, P.mirror, P.repeatAlong, P.gridRepeat, P.thirds, P.horizon, P.golden, P.avoidGutter, P.atDepth, P.depthPlanes, P.depthScale, P.placeAt`.
- **Characters stay on model**: define one `P.CharacterSpec` per character per book (build, head ratio, ears, tail, palette, line weight, medium, light); every spread calls `P.drawCharacter(s, SPEC, pose)` with a different `Pose` (x/y/scale/facing/lean/arms/legs/expression/look). Same spec + pose ⇒ identical objects (tested).
- Generalising the existing kits: watercolorKit's stacked wash ≈ `P.wash` + the `watercolor` material; feltKit's fuzz/stitch ≈ `felt` material + `outlineStroke({ dash })`; both kits keep working through `s.add(...)`.

### Paint and materials
`Paint` values go anywhere a colour goes (`s.fill(shape, linear(...))`). Materials are `{ preset, params, seed }` on `geom.material`. Presets and their knobs: watercolor (edge, rim, mottle, grain, freq) · gouache (edge, mottle, streak, angle) · crayon (coverage, tooth, edge, vertical) · pencil (coverage, tooth) · chalk (coverage, edge) · felt (fuzz, fleck, depth) · linocut (gouge, angle, edge) · riso (grain, offsetX/Y, ghost) · paper (amount, scale) · ink (feather, wobble) · volume (light, depth, shadow, highlight, colours) · roughEdge (amount, freq). Halftone and stipple are geometry (`P.halftone`, `P.stipple`), so they print crisply.

**Rendering contract:** filters use `filterUnits="userSpaceOnUse"` with an explicit region (bbox + preset margin), `color-interpolation-filters="sRGB"` and seeded `feTurbulence`, so browser and puppeteer exports match. Noise is in user units: grain has one physical scale across a page. **PDF:** filtered objects must be rasterised by the PDF exporter (render the object's SVG at print DPI through the same Chrome path); unfiltered geometry, gradients and mesh stay vector.

**Mesh gradient decision:** vector tessellation, not raster. A grid of colour nodes is interpolated bicubically (Catmull–Rom across cells, so cells meet smoothly) and subdivided until the colour step is ≤ `tolerance`; each micro-quad is a flat polygon with a hairline of its own colour (no AA seams), clipped to the shape. Resolution-independent, identical in browser/puppeteer/PDF, no canvas in node. Capped at 6,000 quads (coarsened, never silently rasterised).

## Algorithms and evidence

**Booleans** (`boolean.ts`): operands' subpaths are closed and cut into x/y-monotone pieces; all piece pairs are intersected (overlap-aware, sort-and-sweep culled) and cut; endpoints are clustered into exact shared nodes; coincident edges are merged into one edge that records every owner and direction; each edge's left winding number per operand is measured by a ray from its midpoint along its left normal (excluding itself) — no epsilon offsets; an operation is a predicate on per-operand inside flags; surviving edges are linked into loops at nodes by the most-left turn (exact ±π U-turns at tangencies are resolved by looking a short way along the edge); pieces of one source curve are re-joined exactly (`subCurve` of the source, not a refit) and collinear lines merged. Evidence (tests): area identities `u+n = a+b`, `u−n = x`, `(a−b)+(b−a) = x`, `(a−b)+n = a` hold to ≤1e-6 relative over 120 random rect/circle/star/blob pairs, 80 grid-aligned rect pairs sharing edges/corners, identical and rotated-identical shapes, 24 internal/external tangencies, near-horizontal edges (rise 1e-14…1e-4) meeting an arc end, rect edges through circle caps at near-tangent heights. A wider scratch run (617 cases) gave worst relative error 3e-8.

**Offsetting:** endpoints move along normals; handles keep their direction, lengths scale by `1 − dκ`; checked against the true offset at 5 samples, subdivided to tolerance; inflections split first; swallowtails are removed by resolving the raw loop with the "positive winding" rule. Outline stroke = both sides + joins + caps (or two loops for closed paths) resolved nonzero. Variable width = arc-length sampling, per-side displacement by the profile, Schneider refit split at corners, caps, resolved nonzero.

## Retiring the two drifting serialisers (done)

- `services/tela/telaSvg.ts` is now a re-export of `geometry/serialize.ts`. The canonical serialiser is byte-identical for every object without `geom` — proven over all 37,037 objects of the template gallery against a frozen copy of the old file (`tests/fixtures/legacyTelaSvg.ts`). Callers (TelaView, scripts, tests, bookTela, evite, chora promo…) are untouched and now also render `geom`.
- `services/telaPageExport.ts` `telaVectorSvg()` now calls `deviceToSvg(device, { background: '#fff' })`. Its private, weaker `objectSvg` (no gradients, no text wrapping, no filters/blend, unwrapped text) is deleted; downloads now match the editor. Hidden objects are no longer exported.
- Next: (1) TelaVector `ObjectEl` → delegate `geom` objects to the serialiser (above); (2) new code imports from `services/tela/geometry` directly; (3) once (1) lands, `telaSvg.ts` can be removed by a codemod (`'services/tela/telaSvg'` → `'services/tela/geometry/serialize'`).

## SVG import coverage

path / rect (rx, ry) / circle / ellipse / line / polyline / polygon / text + tspan (TEXT objects) / image / g / nested svg / use + symbol / defs; transforms baked into geometry (stroke widths × √|det|); CSS cascade (presentation attributes < `<style>` rules by specificity, with class / id / tag / descendant / child selectors < inline style) and inheritance; fill/stroke opacity; currentColor; linear + radial gradients (href chains, objectBoundingBox → user space, gradientTransform, spreadMethod); clipPath → geometric clipping (booleans), or carried as `geom.clip` for heavy art (`clipMode: 'carry'`). Reported approximations: masks (treated as clips, luminance ignored), patterns (flat colour), filters (dropped).

## VectorCraft (storytold/vectorcraft) — reference only

Evaluated at rev `389f75fa7be31f24200f9024e1d3e5b2f69f6318` (MIT OR Apache-2.0, Rust on kurbo; pathops uses the `linesweeper` sweep-line crate). **Policy (Kenne, 2026-10-10): reference only — no dependency, no vendored code.** Nothing from it is in this repo; no NOTICE is required.

What we compared and learned:
- **Booleans:** same family as ours (winding classification over a split arrangement, N-ary predicates, re-joining split pieces). Differences: it finds topology with linesweeper's robust sweep and *refits* split pieces at a 0.01 precision; ours intersects pairwise with overlap detection and re-joins pieces *exactly* from their source curve (no refit drift), classifying by a per-edge ray. Their regression suite inspired our own constructions for the property tests (area identities, near-horizontal edges meeting arc ends, rect edges through circle caps, tangencies); ours pass all of them. Their changelog shows sweep hangs/lenses fixed in alpha (issue #1028), which our ray-per-edge design does not have, at the cost of O(E²) classification (fine for illustration-sized inputs; a sweep or BVH can come later).
- **Offset / outline stroke:** they stroke with kurbo's stroker then normalise the region — the same "raw outline → winding resolve" approach as ours. Their offset-path tests (circle grow/inset, rect miter/bevel/round areas, inset to empty, large deltas) are mirrored in our tests with our own numbers.
- **Fitting:** both use Schneider-style least squares; we added a runaway-handle guard after a noisy-input failure.
- **Brushes/variable width, SVG import (usvg), image trace:** feature-rich in VectorCraft; ours are TS-native and Tela-shaped. Image trace stays on `services/telaImageTrace.ts` for now.

## Not done yet (honest list)

- Editor rendering of `geom` (wave 2, see above); live (non-destructive) effects/appearance stacks; text on path / pathfinder on live text; gradient annotator UI.
- Booleans are O(E²) in the winding pass: comfortable for a few thousand edges, slow for huge traced art (add a sweep/BVH when needed). Stroke caps on zero-length *closed* subpaths and dash seams on closed variable-width strokes are approximations.
- Freeform gradient is an approximation (radial blooms), not Illustrator's triangulated solve. Masks import as clips. Pattern brush corner tiles use one outer-corner tile (no inner-corner tile yet).
- Materials are filter graphs tuned by eye on the proof sheet; PDF needs the rasterise-filtered-objects step in the PDF exporter.
- Character toolkit covers round/bean/pear/tall bodies, three ear types, two tails, eyes/mouth/brows/blush; hands are mitts and poses are 2D (no turnarounds yet).
