# Tela raster engine

Wave 1 engine (GAUNTLET.md). This is a Photoshop-grade raster core for the Tela Image device. It has a non-destructive layer model, a WebGL2 compositor that matches a node-testable CPU reference, selections, painting, retouching, transforms, filters, colour handling and PSD support.

**Code:** `services/tela/raster/` (import from `services/tela/raster/index.ts`).
**Tests:** `npm run test:raster`. That runs 61 tests in node on the CPU paths.
**Visual proof:** `npm run proof:raster`. It runs the GPU in system Chrome and writes before/after sheets and `metrics.json` to `.tela-proofs/raster/`.

## Modules

| File | What it does |
|---|---|
| `model.ts` | Document model: pixel, adjustment, fill and group layers; clipping; bitmap, gradient and vector masks; smart filters; layer styles; the 27 blend modes. Also tree helpers, affine helpers and `migrateLegacyImageDevice`. |
| `buffer.ts` | Pixel containers: `Bitmap8` (straight RGBA8), `Mask8` and `RasterF` (premultiplied float32). Also sRGB transfer, Float16 packing, the shared integer hash and the PRNG. |
| `blend.ts` | The 27 blend modes. CPU reference for compositing. |
| `adjust.ts` | Every adjustment compiled to a colour function, `.cube` parsing with tetrahedral interpolation, and 3D-LUT baking. |
| `filters.ts` | The filter set (smart filters) and tile aprons. |
| `compositeCore.ts` | The single stack traversal that both backends share. Covers groups, clipping, masks, styles, adjustments and smart filters. |
| `cpuBackend.ts` | Reference backend (node, workers), mip sampling and tiled `flattenCpu`. |
| `gl/glBackend.ts`, `gl/shaders.ts` | WebGL2 backend and the public `GlCompositor`. |
| `selection.ts`, `vectorPath.ts`, `distance.ts` | Selections, path rasterization and the exact Euclidean distance transform (EDT). |
| `painting.ts` | Brush engine, eraser, bucket fill, gradient tool, tile-diff undo and `PaintHistory`. |
| `retouch.ts` | Clone stamp, healing (Poisson), spot healing, red eye, dodge/burn/sponge and blur/sharpen/smudge. |
| `patchmatch.ts` | Content-Aware Fill: multi-scale PatchMatch with EM voting. |
| `transform.ts` | Resampling, free transform, perspective, warp mesh, crop and straighten, canvas size, rotate/flip and content-aware scale. |
| `color.ts`, `colorMath.ts` | Eyedropper, histogram and stats, sRGB/P3 conversion, CMYK model and soft proof. |
| `codecs.ts` | ICC profile generation, PNG 8/16-bit writer and reader, JPEG/WebP ICC injection and `encodeBitmap`. |
| `psd.ts` | PSD import/export through **ag-psd** (MIT, the only new dependency). |
| `assets.ts` | Bridge to `telaAssetStore` (OPFS) and `RasterAssetCache`. |
| `rasterWorker.ts`, `workerClient.ts` | CPU-heavy operations in a Web Worker with transferable buffers. Falls back to running inline. |
| `engine.ts` | **`RasterSession`**, the facade the Image-device UI uses. |

## Document model

A `RasterDocument` is plain JSON. Bitmaps are referenced by asset id and are never inlined. The document lives on `TelaImageDevice.raster`, an additive optional field in `types.ts`. When that field is present it is the source of truth.

- Stack arrays are ordered bottom to top.
- A layer transform is an affine `[a,b,c,d,e,f]` that maps layer bitmap pixels to document pixels.
- `PixelLayer`: `asset {assetId | src}`, size, transform, `smartFilters`, `styles`, plus `text` and `media` metadata.
- `AdjustmentLayer`: levels, curves, hue/sat (with per-range edits and colorize), colour balance, vibrance, exposure, brightness/contrast, black & white, photo filter, channel mixer, gradient map, selective colour, invert, posterize, threshold, 3D LUT (`.cube`), and `cssColor` (exact CSS filter semantics, used for legacy migration).
- `FillLayer`: solid, gradient (5 shapes, multi-stop with opacity, midpoints, dither) and pattern.
- `GroupLayer`: nested. Blend `'pass-through'` or any mode (isolated).
- Every layer has `opacity`, `fillOpacity` (applies to content but not styles) and `clipped`.
- Masks:
  - `mask` is either `BitmapMask` (painted 8-bit gray, bounds, default colour, density, feather, invert, linked) or `GradientMask`.
  - `vectorMask` is Bézier subpaths with add, subtract, intersect and xor operations.
- `styles`: drop shadow, inner shadow, outer glow, stroke (outside, inside or centre, using an exact EDT) and colour overlay.

**Migration.** `migrateLegacyImageDevice()` reproduces the old CSS renderer exactly:

- Transform: `translate·rotate·scale` about the top-left.
- `TelaImageAdjust` becomes a `cssColor` smart filter plus a gaussian smart filter.
- Group blend, opacity and mask are pushed onto members, as the CSS did, and groups become pass-through.
- `ALPHA_IMAGE` becomes a linked bitmap mask (`legacy:<url>`, decoded from alpha).
- `SHAPE` becomes a linked vector mask.
- `LUMA_GRADIENT` becomes a procedural gradient mask.

## Compositing (exact semantics)

`compositeCore.ts` makes every stack decision once. Backends supply only pixel primitives (`Backend<S>`), so the GPU cannot drift from the reference.

- **Porter-Duff with blending** (W3C Compositing L1, which is what Photoshop does), on premultiplied values:
  `co = cs(1−αb) + cb(1−αs) + αsαb·B(Cb,Cs)`, `αo = αs+αb−αsαb`.
- **Separable blend formulas.** All modes are standard, with these specifics:
  - **Soft Light uses Photoshop's formula**: `2bs + b²(1−2s)` and `2b(1−s)+√b(2s−1)`. CSS/W3C differs in the darks.
  - Hard Mix = `b+s ≥ 1`.
  - Divide by 0 gives 1, or 0 when b = 0.
- **Non-separable modes** (hue, saturation, color, luminosity, darker colour, lighter colour) use W3C `SetLum`/`SetSat` with Lum = 0.3/0.59/0.11.
- **Dissolve** promotes coverage to 1 where `hash(x,y) < α`. The hash is shared bit for bit between JS and GLSL and keyed to document pixels, so it is stable across tiles.
- **Clipping groups** composite "atop" (alpha locked to the base) in an isolated buffer, then use the base's blend, opacity and styles.
- **Adjustment layers:** `lerp(Cb, B(Cb, Adj(Cb)), opacity·mask)`, with alpha kept. A clipped adjustment affects only its base.
- **Pass-through groups** render onto a copy of the backdrop, then lerp by group opacity times the mask. Other groups render isolated.
- **Styles:** drop shadow and outer glow go under the content, which has a knockout. Inner shadow, overlay and stroke go over the content. Layer opacity fades everything; fill opacity fades only the content.
- **Linear vs sRGB.** `doc.blendSpace` is `'srgb'` by default, which matches Photoshop's gamma-encoded blending. With `'linear'`, bitmaps are decoded on draw and encoded on readback or present. **Adjustments always evaluate in sRGB-encoded values** in both modes, so a Curves setting means the same thing either way. Filters run in the blend space. A test pins this: 50% white over black is 128 in sRGB and 188 in linear.
- **Tiles and zoom.**
  - `stackApron()` computes the context that filters, styles and feathered masks need, so tiled renders are seamless. This is tested: the tiled result matches the whole render within ≤1 LSB.
  - Zoomed-out previews sample trilinear mip levels: hardware mips on GPU textures, a box pyramid on the CPU.
  - 8k×8k documents render as 2048² tiles. Layer textures are split into ≤4096² tiles with 1-px gutters.

### GPU (`GlCompositor`)

- Surfaces are pooled `RGBA16F` FBOs (`EXT_color_buffer_float`), with an RGBA8 fallback.
- Each operation is one full-screen pass. In-place operations render to a scratch surface and swap texture handles.
- Complex adjustments (hue/sat with ranges, colour balance, vibrance, B&W, photo filter, selective colour) are baked to a 64³ 3D LUT from the CPU function. The error is under 4/255 worst case and under 0.25/255 mean (tested).
- Separable adjustments use a 4096-entry 1D LUT plus a 3×4 matrix.
- Native shaders: gaussian, box, unsharp, high pass, motion, spin/zoom, pixelate, emboss, find edges and add noise.
- Ops that fall back to the CPU (readback, then upload): median, surface blur, Kuwahara, NLM/bilateral, halftone, posterize edges, dust & scratches and the style stroke (EDT). `stats.cpuFallbacks` counts these.
- Lesson recorded in code: every pass unbinds all sampler units. A stale binding of the target texture on any declared sampler is a feedback loop, and WebGL silently drops the draw.
- Export uses a GPU-side encode (unpremultiply, sRGB encode, optional dither) followed by an 8-bit readback.

**GPU vs CPU** (proof run, RTX 4070 via ANGLE/D3D11, 360×360 photo pairs, all differences in 8-bit LSB):

- Blend modes: max 0–2 on 21 of 27 modes.
- Larger maxima occur only at mathematical discontinuities, where RGBA16F rounding flips a few pixels. Means stay ≤ 0.46:
  - hard mix: 255
  - darker/lighter colour ties: 45
  - vivid light / colour dodge near the singularity: 28 / 14
- Adjustments: max ≤ 2 except posterize and threshold. Those step functions have max 63/255 with mean ≤ 0.23, again from a few boundary pixels.
- Styles and clipping scene: max 1.

## Selections

A selection is an 8-bit coverage mask the size of the document, plus bounds. Operations:

- Rectangle and ellipse marquees with exact anti-aliasing.
- Lasso and polygonal lasso.
- Magic wand: Photoshop per-channel tolerance, contiguous scan-line flood, anti-alias, sample-merged via the image argument.
- Colour range: Lab ΔE with fuzziness.
- **Quick select:** a geodesic, edge-aware Dijkstra from the brush seeds over Lab gradients, then a guided-filter refine.
- Select Subject: a hook to the existing SlimSAM `refineDocumentRegionMask`.
- Add, subtract, intersect, xor and invert.
- Feather (3-box gaussian).
- Expand, contract and border (exact EDT), and smooth.
- Transform selection.
- Refine edge: He et al. guided filter, plus smooth, feather, contrast and shift edge.
- Selection to mask, selection to path (marching squares, then RDP, then smooth cubic handles with sharp corners kept), and marching ants (the same contours).

## Painting

The brush engine supports:

- Round tip with hardness (cosine falloff and 1-px AA) and sampled tips.
- Size, spacing, flow, opacity, roundness and angle.
- Pressure dynamics on size, opacity and flow. Tilt controls angle and roundness. Jitter.
- Smoothing: lazy mouse and a pulled-string stabiliser.
- Scatter with count. Texture with depth.
- Eraser, mask painting, blend modes and lock transparency.

It follows Photoshop's stroke model: flow builds a per-stroke buffer and opacity caps it. Every dab recomposites from the stroke-start snapshot, which is also the undo patch. Undo stores **only touched 64×64 tiles** (before and after; unchanged tiles are dropped). `PaintHistory` is byte-capped at 256 MB by default. `takeDirty()` gives the dirty rect for GPU tile re-upload (`GlCompositor.invalidate`).

Bucket fill uses the wand region (tolerance, contiguous, anti-alias, optional sample-merged). The gradient tool supports linear, radial, angle, reflected and diamond shapes, multi-stop colour with opacity and midpoints, interpolation in sRGB, linear or OKLab, and TPDF dither.

## Retouching

- **Clone stamp:** aligned or non-aligned (`CloneSession`), sampling the current layer or all layers. The source is snapshotted at stroke start.
- **Healing brush:** real Poisson image editing. `f = g + h`, where `h` is the membrane solution of `∇²h = 0`, `h|∂Ω = dst − g`, solved cascadically (coarse-to-fine with SOR). It previews like the clone stamp and blends on `end()`.
- **Spot healing:** content-aware synthesis in a crop, then the Poisson blend.
- **Content-Aware Fill:**
  - Multi-scale Wexler-style EM with a Barnes PatchMatch NNF: propagation plus a shrinking random search.
  - Source-area exclusion mask.
  - "Majority" coarse holes and best-match ring initialisation (see the learnings below).
  - Votes sharpen toward winner-takes-all at full resolution.
  - The old fake `telaInpaintService` keeps its API but now runs this in the worker. It also has a `setGenerativeFillProvider()` hook, used only when a provider is registered and a prompt is given.
- **Other tools:** red eye; dodge and burn by tonal range; sponge; blur, sharpen and smudge.

## Transforms

- Separable resampling: nearest, bilinear, bicubic (Keys a = −0.5) and Lanczos3. When minifying, the support widens by 1/scale, so there is no aliasing (tested: a 1-px checker becomes flat grey).
- The round-trip PSNR test ranks the filters.
- Free transform: affine.
- Distort and perspective: a 4-corner homography with a DLT solve.
- Warp: a Photoshop-style bicubic Bézier mesh with N×M patches, tessellated and inverse-mapped.
- When a transform minifies, the source is prefiltered with Lanczos first.
- Flip, rotate 90/180, crop with straighten (rotation about the crop centre, plus `straightenCropRect` auto-fit), canvas size with anchors, and content-aware scale (seam carving with a protect mask, shrink and grow).

## Colour

- Working buffers are 8-bit (`Bitmap8`) and float (`RasterF`; the GPU uses RGBA16F). Half-float pack and unpack helpers are provided.
- Eyedropper with point, 3×3, 5×5, 11×11 and 31×31 sampling (alpha-weighted).
- Histogram with per-channel mean, standard deviation, median, min and max, optionally inside a selection.
- `doc.colorSpace` is a tag (`srgb` or `display-p3`). `convertColorSpace` uses linear 3×3 matrices.
- Exports embed the matching ICC. We generate v2 display profiles from primaries:
  - PNG: `sRGB`, `gAMA` and `cHRM` chunks for sRGB; `iCCP` for P3.
  - JPEG: APP2 `ICC_PROFILE`.
  - WebP: VP8X + `ICCP`.
- **CMYK is an ICC-less approximation.** `rust/plajah-color` has grading and LUTs but no CMYK or ICC.
  - Model: Yule–Nielsen (n = 2) Neugebauer over 8 SWOP-ish CMY primaries, with black as an overprint.
  - Separation: GCR plus a damped Gauss–Newton solve, with an ink limit (default 300%).
  - Soft proof: a 33³ LUT applied at present (`setSoftProof`).
  - `separateCmyk()` returns CMYK bytes for print pipelines.
  - It is not a press profile; that comes later behind the same API.

## PSD

`importPsd` and `exportPsd` (ag-psd 31.0.3, MIT) cover:

- Layers with their position, nested groups (pass-through or isolated), clipping, opacity and fill opacity, and every blend mode.
- Bitmap masks (bounds, default colour, density, feather) and vector masks.
- Text layers, rasterized with the text kept in `PixelLayer.text`.
- Solid fill layers.
- Adjustment layers that map to ours (all except colour lookup, which needs its LUT re-attached).
- Effects: drop and inner shadow, outer glow, stroke and colour overlay.
- A flattened composite.

On export, layers PSD cannot express (smart filters, non-integer transforms, gradient or linked masks) are rasterized through the CPU compositor and a warning is returned. Export → import round trip is tested.

## Performance

Measured on the proof machine (RTX 4070 laptop, Chrome):

| Operation | Time |
|---|---|
| 8192×8192 document (3 layers incl. curves + overlay), full flatten, 16 tiles | **3.3 s** |
| Same document, 1024² zoomed-out preview | **~65–110 ms** |
| Same document, 1600×1000 viewport at 100% | **~110–170 ms** |
| Layer texture memory for the 8k document | 23 MB |
| Content-aware fill, 640 px image, ~100×190 hole | **1.7–2.3 s** (identical on the main thread and in the worker) |
| Spot heal, 3 spots | ~0.8–1.5 s |
| Healing brush dab | 20–100 ms |
| GPU filters on a 360² image | 20–35 ms |
| CPU-fallback filters on a 360² image (median, NLM) | 1–3 s |

These numbers are the honest reason those CPU-fallback filters should run in the worker.

## UI API (next wave): `RasterSession`

```ts
const s = await RasterSession.open(device);            // device.raster or migrated legacy layers; assets decoded
s.attachCanvas(canvas); s.renderView({ x, y, scale, width, height }, { checker: true });
s.on((doc, reason) => setDoc(doc));                    // immutable doc updates
// layers
s.addPixelLayer(bitmap, { name }); s.addAdjustment(defaultAdjustment('curves')); s.addFill({ type: 'solid', color });
s.update(id, { opacity: .5, blend: 'overlay', clipped: true }); s.remove(id); s.undo(); s.redo();
// painting (document coordinates in; mapped to layer space; GPU tiles refresh per add())
const st = s.beginStroke(id, { tool: 'brush', brush: { ...DEFAULT_BRUSH, size: 40 }, color: [r, g, b, 255] }, { target: 'pixels' | 'mask' });
st.add({ x, y, pressure, tiltX, tiltY }); st.end();      // tools: brush pencil eraser clone heal dodge burn sponge blur sharpen smudge
s.bucketFill(id, x, y, color, { tolerance: 32, contiguous: true, antiAlias: true }); s.gradient(id, spec, { shape: 'radial', x0, y0, x1, y1 });
// selection
s.select(rectSelection(W, H, r), 'add'); s.select(await rasterWorker().run('quickSelect', {...}), 'add');
s.marchingAnts(); s.invertSelection(); s.selectionToLayerMask(id);
// retouch / filters / geometry
await s.contentAwareFill(); await s.applyFilter(id, { type: 'gaussianBlur', radius: 4 }); await s.resizeImage(w, h, 'lanczos3');
// colour + export
s.sampleColor(x, y, '5x5'); s.histogram(); s.setSoftProof(true);
await s.exportFlattened({ format: 'jpeg', quality: .9 }); await s.exportLayerPng(id); s.exportPsd(); RasterSession.openPsd(bytes);
const json = await s.save();                            // persists dirty pixels to OPFS, returns RasterDocument for device.raster
```

Lower-level pieces (`GlCompositor`, `compositeDocument` with a custom backend, the selection, transform and filter functions, `rasterWorker().run(op, args, { transfer })`) are all exported from `index.ts`.

## Not done / known limits

- **UI.** None yet; this was wave 1.
- **Interactive GPU painting.** Strokes paint on the CPU into the layer bitmap, and dirty tiles are re-uploaded with `texSubImage`. That is fine up to about 4k layers. A GPU dab path would be faster.
- **Content-Aware Fill on structured scenes (foliage, trunks).** It shows faint seams, slight haze along long straight hole edges, and occasional copied trunk pieces. It has no colour adaptation (Image Melding gain/bias) and no rotation/scale search. Spot healing and small holes look clean. See `.tela-proofs/raster/content-aware-fill.png`.
- **Layer styles.** No bevel/emboss, satin, inner glow or gradient/pattern overlay. The stroke is colour only. The style stroke and the median-type filters run on the CPU even in the GPU path.
- **Linked bitmap masks** export to PSD rasterized. Colour lookup adjustments import without their LUT.
- **PSD bit depth.** Import of 16/32-bit PSDs reduces them to 8-bit. Export writes 8-bit RGB only; CMYK PSD is not written.
- **CMYK** is an approximation (see above). There is no ICC parsing or applying of arbitrary profiles yet.
- **16-bit PNG** export exists (`encodePng16`). JPEG and WebP go through the browser encoder, so they are 8-bit.
- **Smart filter masks** and **content-aware scale on the GPU** are not implemented.
- **The GPU path** was verified on one machine (NVIDIA through ANGLE/D3D11). Mobile and Intel GPUs without `EXT_color_buffer_float` fall back to RGBA8 surfaces. That fallback is untested.

## PhotoCraft (storytold/photocraft) — reference only

Per Kenne's policy, this is **not a dependency, nothing is vendored and nothing is compiled in**. We studied it at rev `79261615956ab21334e49ca1d384390272e647da` (MIT OR Apache-2.0) as a reference and quality comparison. What we took away as ideas, all reimplemented from the cited papers and our own measurements:

- **Content-aware fill.** Its docs (from black-box measurements of Photoshop 25.4) confirm the same Wexler EM + PatchMatch family. Three ideas we adopted after our own A/B tests:
  1. Initialise the coarsest level ring by ring from best-matching patches, not a smooth membrane, which pulls fills toward flat colour.
  2. Make the vote converge to exact copies (near winner-takes-all) so texture stays crisp.
  3. Photoshop's local sampling window, a square of side `4·√(max(w,50)·max(h,50))`. It is implemented as `window: true` but off by default, because our foliage A/B looked better with the whole image.
- **Our own finding.** An "any child is hole" rule when building the pyramid leaves a blurry band 5–8 px wide along hole edges after upsampling. A "majority" rule removes most of it.
- **Ideas not yet adopted:**
  - Image Melding gain/bias colour adaptation (Darabi et al. 2012).
  - Rotated, scaled and mirrored source variants (generalised PatchMatch).
  - An auto sampling-area min-cut.
- **Healing.** Their Poisson healing is the same Pérez et al. membrane with cascadic SOR, which validates our approach.
- **Dodge/burn.** Their "protect tones" (scaling luminance, not per-channel) is a good next step for our dodge/burn.
