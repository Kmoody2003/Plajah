# Photos engine: gap assessment against Lightroom / Photoshop, using ArtCraft as a reference, and a build plan

Written 2026-10-10. This is research only; no product code was changed.

- **Scope:** Plajah's photos engine (library, organising, develop, galleries), compared with Adobe Lightroom Classic/CC and the photo side of Photoshop.
- **References:** `storytold/lightcraft` (a Lightroom clone, HEAD `0ba118d`) and `storytold/photocraft` (a Photoshop clone, HEAD `7926161`). We read them as shallow clones only and did not build or run them.

> **ArtCraft is a reference and a test oracle only.** Its licence is MIT OR Apache-2.0; LightCraft's `segment` crate is Apache-2.0 only and needs SAM-licensed weights. We take no crates, vendor no code and adopt none of its data models. Plajah builds its own implementations. Where we learned an idea, we credit it in the engine doc. Where ArtCraft is better, we reimplement the idea natively, inside Tela's model, our wasm ABI and our TS APIs. The reason: Photos media has to stay deeply integrated with Tela documents, Fabula and The Post Man (see `docs/tela/GAUNTLET.md`).

---

## 0. Summary

1. **Plajah Photos is a social and presentation product with a decorative develop panel.**
   - Galleries, the 3D walk-in museum, The Wall, salons, critique and event pools are real, and in places ahead of Lightroom.
   - The catalog is thin. There are no ratings, flags or labels, no smart collections, no faces, no maps, and no IPTC or XMP.
   - The Photos develop panel previews with **CSS filters**. Its recipe is **thrown away**: every mount passes `onApply={() => {}}` (`components/GlobalPhotosView.tsx:1217`, `:1368`, `components/PhotoManager.tsx:157`), so "Save Recipe" and "Export rendition" do nothing.
2. **Better code already exists in the repo, but Photos does not use it.**
   - The **Tela raster engine**, `services/tela/raster/**`, is new as of 2026-10-10, untracked, about 5.2k LOC, and has tests. It provides:
     - a WebGL2 RGBA16F tiled compositor that shares one traversal with a CPU reference
     - adjustment layers: levels, curves, hue/sat with ranges, colour balance, vibrance, exposure, B&W, channel mixer, selective colour, `.cube` LUTs
     - selections (wand, colour range, quick select, refine edge), Poisson healing, PatchMatch content-aware fill
     - lanczos transforms and crop/straighten, NLM and bilateral denoise, unsharp mask
     - PSD import and export, and ICC-tagged PNG16/JPEG/WebP export
   - The **Pixels/Fabula GLSL develop shaders** `developtone`/`developfinish` (`components/plajahPixels/engine/fx/effects.ts:197`, `:225`) do linear-light exposure, tonal recovery, white balance, clarity, dehaze and grain. They are tested in `tests/photoColorScience.test.ts`, and only Fabula uses them.
3. **There are three, almost four, separate colour pipelines.** The plan merges them into one:
   - the raster engine's `Adjustment` union (`services/tela/raster/model.ts:58-76`)
   - Pixels/Fabula `InputGrade`: lift/gamma/gain, temp/tint, curve LUT, HSL qualifier, power window (`components/plajahPixels/engine/core/compositor.ts:341-380`)
   - Photos' `PhotoEditAdjustments`, previewed with CSS (`services/photoEditingService.ts:3-22`, `:130-137`)
   - `rust/plajah-color`, 376 LOC with no bindings and no consumer
4. **ArtCraft's LightCraft is far ahead on the develop core and the catalog.** It is not "alpha" in engineering quality: about 205k LOC and about 2,500 tests. It is alpha in feature parity and camera coverage. Its ideas worth reimplementing:
   - a scene-linear Rec.2020 float pipeline with colour tools in OkLCh
   - a log-domain filmic tone map
   - process versions
   - parametric masks combined with cached model output
   - an op-log catalog with inverse ops
   - per-stage cache keys
   - a CPU-reference/GPU-twin equivalence suite
5. **The plan.** Define **one non-destructive, scene-referred `DevelopSettings` model**. It lives in the raster engine's module, compiles to a CPU reference and one GLSL module, and is consumed by:
   - the **Tela Image device**, as a `develop` adjustment or source on a pixel layer
   - **Fabula**, with `InputGrade` mapped onto it
   - the **Photos app**, as a per-photo sidecar with history, snapshots and virtual copies

   Before that, the raster engine needs four things: a **16-bit/float source asset**, **linear-light develop stages**, a **wider working gamut** and **our own RAW decoder**.

---

## 1. What exists today (verified)

### 1.1 Photos surfaces
| Surface | File | Notes |
|---|---|---|
| The Wall, lenses, photo detail | `components/GlobalPhotosView.tsx` | `useShellNext` gated. Lenses: Explore/Rooms/Feed/Synthetic/Hybrid/Catalog/Spatial (`:102-109`, `:1075-1135`) |
| Photo manager | `components/PhotoManager.tsx` | upload loop (`:84-90`), albums (`:131-150`, `:332-387`) |
| Catalog workspace | `components/photo/PhotoCatalogWorkspace.tsx` | Windows mirrored folders (`:148-200`). Collections and counts are placeholders (`:209-229`); the filter button is inert (`:278`) |
| Develop panel | `components/PhotoEditPanel.tsx` + `PhotoDevelopPreview.tsx` | CSS-filter preview (`PhotoDevelopPreview.tsx:4-15`); the recipe is dropped |
| Windows viewer | `components/photo/NativePhotoViewer.tsx` | the only pixel-writing editor: destructive JPEG 0.95 (`:538-583`); EXIF panel hardcoded (`:1393-1409`) |
| Galleries | `components/gallery/*`, `services/galleryService.ts` | Modern / 3D Walk / Portfolio, soundtrack, voice notes, GLB, comments, likes |
| Social | `services/photoCritique.ts`, `services/photoSalons.ts`, `components/EventPhotoPoolView.tsx` | human critique, weekly salons, event QR pools |
| Data | `types.ts:213-241` (`Photo`), `:243-252` (`PhotoAlbum`), `:260-290` (`PhotoGallery`) | `Photo` has **no** EXIF, GPS, rating, flag, label or recipe fields |
| Upload / derivatives | `services/backendService.ts:5356-5388`, `:2583-2611`; `services/imageDerivatives.ts:20-25`, `:101-138` | original kept; 1024 px display (q 0.82) and 320 px thumb (q 0.75), WebP or JPEG, generated client-side |

### 1.2 Bugs found in passing
These are worth fixing whatever happens to the plan.
1. **The develop recipe is discarded and Export does nothing.** `onApply={() => {}}` appears at the three call sites above.
2. **EXIF is read from the stripped derivative.** The code calls `fetchExif(photo.url)` (`components/PhotoGallery.tsx:30`, `components/photo/PortfolioRoom.tsx:89`). Since the derivative pipeline landed, `url` points to a canvas re-encode with no EXIF, so new uploads show none. The fix is to read `originalUrl`.
3. **`addPhotosToAlbum` writes to the music `albums` collection** under a `slideshow` field, not to `photo_albums` (`services/backendService.ts:5543-5550`).
4. **Deleting a photo leaves its files behind.** `deletePhoto` and `bulkDeletePhotos` remove only the Firestore doc (`backendService.ts:5525-5541`). The PhotoManager trash button has no handler (`PhotoManager.tsx:304-306`).
5. **Privacy:** `photos/{id}` is `allow read: if true` (`firestore.rules:2302-2303`), but uploads default to `isPublic:false` (`backendService.ts:5375`). Storage `users/{uid}/**` is `allow get: if true` (`storage.rules:105-106`). So "private" photos can be read by anyone who has the id or path. This is a **security issue for Kenne to triage**. Note the rules-size ceiling in memory before changing rules.
6. **The NativePhotoViewer ignores some sliders.** Highlights, shadows and vignette never reach `filterStyle` (`NativePhotoViewer.tsx:475-486`).
7. **The "Open in Tela / Fabula" hand-off loses the file.** The handlers only switch the view (`App.tsx:1929-1942`).
8. **`rust/plajah-color` claims tetrahedral interpolation** but implements only trilinear (`lut.rs`).

### 1.3 The Tela raster engine (`services/tela/raster/`)
This is the engine Photos must share.

| Module | What it gives Photos |
|---|---|
| `model.ts` | non-destructive `RasterDocument`. Pixel, adjustment, fill and group layers; bitmap, gradient and vector masks; smart filters; 27 blend modes. `colorSpace: 'srgb'\|'display-p3'`, `blendSpace: 'srgb'\|'linear'`, `bitDepth: 8\|16` (`:171-189`). Lives on `TelaImageDevice.raster` (`types.ts:7554`). |
| `adjust.ts` | each adjustment compiled to a CPU `ColorFn`, then baked to a 64³ LUT for the GPU. Levels, curves (natural cubic → 4096 LUT), HSL ranges, vibrance, exposure, B&W, selective colour, `.cube` (tetrahedral). **Adjustments evaluate on sRGB-encoded values** (header). |
| `compositeCore.ts`, `cpuBackend.ts`, `gl/glBackend.ts`, `gl/shaders.ts` | one stack traversal with CPU and WebGL2 backends. RGBA16F FBOs, ≤4096² tiles with mips, GPU/CPU parity tested (<4/255). |
| `filters.ts` | gaussian, unsharp mask, "smartSharpen", bilateral and NLM `reduceNoise`, median, dust & scratches, high pass, add noise |
| `selection.ts` | marquee, lasso, magic wand, colour range, quick select, feather/expand/contract, guided-filter-style `refineEdge`, selection ↔ path |
| `retouch.ts`, `patchmatch.ts` | Poisson healing brush, spot heal (PatchMatch + Poisson), clone, red eye, dodge/burn/sponge; Wexler EM + PatchMatch content-aware fill |
| `transform.ts` | lanczos3 resampling, crop + straighten, homography, mesh warp, content-aware scale, aspect presets |
| `color.ts`, `colorMath.ts` | histogram, eyedropper, sRGB↔P3, Oklab and Lab helpers, ICC-less CMYK soft proof |
| `codecs.ts` | generated ICC v2 (sRGB, P3), PNG 8/16 with iCCP, JPEG/WebP with ICC injection |
| `psd.ts` | PSD in and out via ag-psd, mapped onto our model |
| `engine.ts` | `RasterSession`, the single UI-facing object (open, render, stroke, select, fill, export) |

Tests: `tests/raster{Adjust,Blend,Composite,Paint,Retouch,Selection}.test.ts`. `docs/tela/RASTER_ENGINE.md` is referenced from `index.ts` but does not exist yet.

**Why the raster engine is not yet a Lightroom-grade develop engine:**
- **Storage is 8-bit.** Layers are `Bitmap8` (`buffer.ts:14`). A RAW or 16-bit TIFF source has nowhere to live.
- **Adjustments run in display (sRGB-encoded) space.** That is correct for Photoshop adjustment-layer semantics, but wrong for exposure, white balance, highlight recovery and filmic tone.
- **The gamut is sRGB or P3 only.** There is no Rec.2020 or ProPhoto working space and no ICC input transforms.
- **There are no parametric local masks** (linear, radial, luminance or colour range, AI) that re-evaluate at any resolution. Masks are bitmap or gradient.
- **No RAW decode, lens corrections, upright, dehaze, texture or clarity.**

---

## 2. Scorecard

Legend: **E** = exists, **P** = partial, **M** = missing. "LC" is LightCraft and "PC" is PhotoCraft, given for context only.

### 2.1 Library / catalog
| Feature | Plajah | Evidence | Lightroom | ArtCraft |
|---|---|---|---|---|
| Import | **P** | `backendService.ts:5356-5388` saves title, description, visibility and size; no tags, EXIF, GPS or capture date. Third-party sources are `planned` (`photoEditingService.ts:98-104`). Windows folder scan (`MainWindow.xaml.cs:930,1730`). | add/copy/move, rename templates, dedupe, watched folders | LC: all of these plus Lightroom catalog import |
| Folders | **P** | Windows mirrored folders only (`PhotoCatalogWorkspace.tsx:148-200`); cloud photos are a flat list | E | LC E |
| Collections / albums | **P** (buggy) | `createPhotoAlbum` (`backendService.ts:5449-5469`); `addPhotosToAlbum` uses the wrong collection; static collection buttons (`PhotoCatalogWorkspace.tsx:224-229`) | E | LC E (plus stacks and auto-stack) |
| Smart collections | **M** | none | E | LC E: nested `RuleSet` with typed fields |
| Ratings / flags / labels | **M** | no fields on `Photo` (`types.ts:213-241`); only social `favorites[]`/likes | E | LC E |
| Keywords | **P** | `Photo.tags` (`types.ts:234`) exists but has no editor and is not written at upload | hierarchical | LC E, hierarchical |
| EXIF | **P** (broken) | `services/exifService.ts:28-42`: 13 tags, JPEG only, no GPS or orientation; read from the derivative (bug 2). A better reader with GPS is in `services/eventPool/exif.ts:88,133,286`, used only by event pools. | E | LC E |
| IPTC / XMP | **M** | only stripped (`exifService.ts:167-220`) | E (XMP sidecars) | LC E (plus Adobe `crs:` import) |
| Search | **P** | client-side substring match on title, description and tags (`GlobalPhotosView.tsx:153-158`); feed `limit(100)` with no paging (`backendService.ts:5474-5478`) | E (metadata filter bar) | LC E |
| Duplicates | **M** (library) | SHA-256 only in event pools (`services/eventPool/poolClient.ts:47-48,112-126`) | P | LC E (content hash) |
| AI tagging | **M** | the "Synthetic" lens is a regex (`GlobalPhotosView.tsx:148-151`) | E (Sensei search) | M |

### 2.2 People, maps, RAW
| Feature | Plajah | Evidence | Lightroom | ArtCraft |
|---|---|---|---|---|
| People / faces | **M** | `face-lab.html` is the Kaiju avatar lab. Face tracking exists only in `services/vtuber/faceTracker.ts` and `services/lenses/*`. | E | LC P (ONNX faces, needs user-installed weights) |
| Maps / geotag | **M** | no GPS on `Photo`, no map view; GPS is used only in event-pool geofencing (`services/eventPool/poolCore.ts:5-7`) | E | LC P (GPX geotag) |
| RAW decode | **M** | `.dng`/`.raw` appear only in extension lists (`MainWindow.xaml.cs:2459`); no decoder | E | LC E (DNG incl. JXL, CR2, CR3, ARW, NEF, RAF incl. X-Trans, RW2, PEF, ORF; AHD/PPG demosaic). PC E (incl. MHC) |
| Camera profiles | **M** | none | E (Adobe Standard/Color/…) | LC P (DNG matrices good; non-DNG calibration is its weakest area) |
| HEIC | **P** | magic-byte sniff (`exifService.ts:238`); decode depends on the browser or WebView | E | PC P |

### 2.3 Develop
| Feature | Plajah Photos | Platform code that already exists | Lightroom | ArtCraft (LC) |
|---|---|---|---|---|
| White balance | **P**: warmth/tint via CSS overlays; no Kelvin, eyedropper or presets | `developtone` RGB gains (`effects.ts:197`); Fabula temp/tint (`compositor.ts:354`) | E | E: CCT + Bradford; camera-matrix re-evaluation for raws |
| Tone (exp/contrast/hl/sh/whites/blacks) | **P**: CSS approximation | `developtone` linear-light masks; raster `exposure`/`levels` | E | E: guided-filter local tone + log filmic tone map |
| Tone curve | **M** | raster `curves` (`adjust.ts:32`); Fabula `curveLut` (`compositor.ts:356`, `services/fabula/gradeCurves.ts`) | E (parametric + point) | E |
| HSL / colour mixer | **M** | raster `hueSaturation.ranges` (6 ranges, `model.ts:51`); Fabula HSL qualifier | E (8 bands) | E (8 bands + point colour, in OkLCh) |
| Colour grading | **M** | Fabula lift/gamma/gain wheels (`components/Fabula/ColorWheels.jsx`); raster `colorBalance` | E (3 wheels + global, blending, balance) | E |
| Detail: sharpen / NR | **M** | raster `unsharpMask`, `smartSharpen`, `reduceNoise` with bilateral or NLM (`filters.ts:118-218`) | E (+ AI Denoise) | E (+ raw-domain ONNX denoise) |
| Lens corrections / CA | **M** | none | E (profile DB) | P (DNG opcodes, manual; no profile DB) |
| Transform / upright / crop | **P**: rotation ±45° only (`PhotoEditPanel.tsx:44-45`); `cropAspect` has no UI (`:165`) | raster `crop` + straighten, `homographyFromQuads`, mesh warp (`transform.ts`) | E | E (Auto/Level/Vertical/Full/Guided) |
| Effects: vignette, grain, dehaze, clarity, texture | **P** (CSS) | `developfinish` clarity, dehaze, vignette, grain (`effects.ts:225`) | E | E (dark-channel dehaze) |
| Calibration | **M** | none | E | E |
| Histogram / clipping | **M** | raster `histogram` (`color.ts:51`) | E | E |
| Profiles (looks) | **P**: 18 Creative Looks as partial slider sets (`photoEditingService.ts:56-81`) | | E | E: profiles stored as slider deltas with an amount |

### 2.4 Local work and workflow
| Feature | Plajah | Evidence | Lightroom | ArtCraft |
|---|---|---|---|---|
| Masking: AI subject, sky, people | **M** (stub) | recipe type only (`photoEditingService.ts:29`); AI tools are `enabled:false` (`:121-125`); SlimSAM runs in the Spatial Lab only (`PhotoCatalogWorkspace.tsx:102-112`) | E | LC P (SAM 3 via candle with user weights; heuristics without them) |
| Masking: brush, linear, radial | **M** in Photos | raster brush engine plus bitmap and gradient masks; Fabula power window (`compositor.ts:363`) | E | LC E |
| Masking: colour / luminance range | **M** in Photos | raster `colorRange` (`selection.ts:92`); Fabula qualifier | E | LC E |
| Healing / remove | **M** in Photos | raster spot heal, healing brush, content-aware fill (`retouch.ts:87-201`, `patchmatch.ts:118`), not wired to Photos | E (+ generative remove) | LC E (spots); PC E (Wexler/Newson remove) |
| Presets / LUTs | **P** | built-in looks only; `.cube` exists in raster `lut3d`, `services/fabula/cubeLut.ts` and Rust, but not in Photos | E | LC E (grouped partial presets with an amount) |
| History / snapshots | **M** | edits are `useState` with Reset only (`PhotoEditPanel.tsx:68,184`) | E | LC E (history + named versions) |
| Virtual copies | **M** | | E | LC E |
| Copy/paste and sync settings | **M** | | E | LC E (by settings group, never the process version) |
| Batch | **P** | bulk upload, bulk delete (Firestore only), multi-select to album | E | LC E |
| HDR / pano merge | **M** | the Spatial Lab exports a splat manifest only (`services/spatialPhotoProjects.ts:30-37`) | E | LC P→E: alignment, deghost, RANSAC, bundle adjustment, multiband blending, linear DNG out |

### 2.5 Output, sharing, platforms, performance
| Feature | Plajah | Evidence | Lightroom | ArtCraft |
|---|---|---|---|---|
| Export: formats | **P** | Photos "Export rendition" does nothing; NativePhotoViewer writes JPEG 0.95 (`:551-570`); raster codecs offer PNG8/16, JPEG, WebP with ICC (`codecs.ts`) but Photos does not use them | E | LC E (JPEG/PNG/TIFF/WebP/AVIF/DNG, HDR gain-map JPEG) |
| Export: sizes / watermark / naming | **M** | | E | LC E |
| Export: colour space | **P** | raster sRGB/P3 ICC only | E | LC/PC E (Rec.2020, AdobeRGB, ProPhoto) |
| Export: metadata control | **P** | strip-all, fail-closed (`exifService.ts:181-220`), used only for chat (`ChatWindow.tsx:704`) | E | LC E |
| Sharing / galleries | **E** (ahead) | `galleryService.ts:41-248`; `GalleryWalk.tsx` (R3F museum, VRM avatar, positional voice notes); soundtrack; comments and likes; `navigator.share` (`GalleryView.tsx:122`); salons; critique; event pools | P (web galleries, shared albums) | M |
| Client proofing / passwords / expiry / download control | **M** | | P | M |
| Mobile | **P** | responsive web; no native photo capture (`PlajahCameraPlugin.kt:63-161` is CameraX *video* only) | E | LC P (WASM web app) |
| TV | **M** | `TvSlideshowSurface.tsx` is Chora now-playing; no photo browser or screensaver | P | M |
| Previews and caching | **P** | client-side derivatives at upload; 1024 px is soft full-screen; no grid virtualisation; `fetchUserPhotos` has no paging; in-memory EXIF cache | E (smart previews) | LC E (content hash × settings hash × size × renderer version; visible-first jobs) |
| GPU | **M** in Photos | CSS only; WebGL develop exists in Pixels and the raster engine | E | LC P (wgpu twin with CPU fallback) |

### 2.6 Where Plajah already leads (keep and build on)
- **Galleries as experiences.** No other photo tool offers all of these:
  - a first-person 3D museum with VRM avatars, proximity voice notes and video frames
  - Chora soundtracks
  - Modern/Walk/Portfolio views
  - GLB sculpture
- **Platform sharing and community.** The Wall, photographer follow, Rooms, weekly Salons, human Critique Circle, event QR photo pools with SHA-256 dedupe and GPS scrub, and protected-thread EXIF stripping.
- **Cross-app reach.** One account and one asset store across Tela, Fabula, Pixels and The Post Man. The shared GLSL develop effects already run in Fabula and export as OFX (`rust/fabula-ofx/src/manifest_gen.rs:1722,1737`).
- **A Photoshop-grade layer engine in TS that runs in the browser and on the GPU** (the raster engine). LightCraft has no layer model, and PhotoCraft's browser story is less direct.
- **The Universal Library panel and the org DAM** (`components/shared/UniversalLibrary/*`, `services/orgAssets.ts`). Presets and looks can ship platform-wide.

---

## 3. Where ArtCraft is ahead, and how we reimplement each idea our way

| # | ArtCraft idea (evidence) | Why it matters | Our native reimplementation |
|---|---|---|---|
| 1 | Scene-linear float working space, Rec.2020 D65 f32, with colour tools in OkLCh (LC `crates/pipeline`, `crates/color`) | exposure, WB and highlight recovery only behave correctly in linear light; OkLCh hue edits do not shift lightness | Add a `develop` stage family to the raster engine. It runs in linear Rec.2020 float, as RGBA16F on the GPU, before the display encode. `colorMath.ts` already has Oklab, so we add OkLCh. The existing Photoshop-semantics adjustments stay display-referred, above it in the stack. |
| 2 | Process versions kept separate from the schema version; missing means V1; process is never copied by presets or sync (LC `docs/process-versions.md`) | looks never change silently when we improve algorithms | `DevelopSettings.process: 'p1' \| 'p2' …` with an exhaustive switch in the compiler, plus an explicit "update to current process" action. A bug fix ships in place; a change to the look ships as a new process. |
| 3 | Masks as a parametric description plus a cached model output (logits stored as an i8 grid and sampled by sigmoid) (LC `crates/develop/src/segmask.rs`) | AI masks render at any resolution without re-running the model; settings stay portable | Our `DevelopMask` keeps **components** (brush, linear, radial, colour range, luminance range, subject, sky, object) combined with add/subtract/intersect, in normalised coordinates. AI components store a compact coverage asset in the Tela asset store, by asset id, never inline. Our existing SlimSAM path (`telaDocumentIntelligence`) produces it. |
| 4 | Op-log catalog with inverse ops: undo, journal and replay in one mechanism (LC `crates/catalog/src/journal.rs`) | undo across sessions and devices, crash safety, an audit trail | Firestore `photos/{id}/edits` stores edits as ops, with a snapshot on the photo doc; undo uses the inverse ops. Reuse `components/tela/telaHistory.ts` semantics so Tela and Photos share one history model. |
| 5 | Per-stage cache keyed by exactly each stage's inputs; exposure is a per-pixel gain *after* the spatial filters, since log-luminance filters are shift-equivariant (LC pipeline `Plan::lin_key`) | slider drags stay at 60 fps on large images | Add stage keys to `GlCompositor`: each develop stage renders to a pooled RGBA16F surface keyed by a hash of its inputs. Dragging exposure re-runs only the per-pixel pass. |
| 6 | Preview cache keyed by content hash × settings hash × size × renderer version, with a visible-first job pool (LC `crates/preview`) | an instant grid, and edited thumbnails that are always correct | Same key shape, stored on the server and at the edge. Thumbnails of the *developed* look are re-rendered on recipe change by a worker job. Cache bust uses `rendererVersion`. |
| 7 | CPU reference plus GPU twin with an equivalence suite (LC `crates/gpu/tests/equivalence.rs`), and procedural HDR test scenes (LC `crates/scenes`) | GPU never drifts from the reference | We already follow this pattern in `compositeCore.ts` and `gl/shaders.ts`. Extend it to the develop stages, and add a procedural scene-linear test generator in `tests/`. |
| 8 | RAW: AHD demosaic, X-Trans directional, highlight reconstruction, DNG opcodes, WB by re-evaluating the camera matrix (LC `crates/raw`, PC `crates/raw`) | RAW is table stakes for photographers | Our own `rust/plajah-raw` crate, compiled into the committed wasm per the GAUNTLET rule. ArtCraft's decoders serve only as an **oracle** in tests (compare demosaiced statistics on a CC0 raw.pixls.us corpus). Start with DNG, then CR2/CR3/NEF/ARW. |
| 9 | Profiles as slider *deltas* with amount 0–200%, and presets as partial settings by group with an amount (LC `profiles.rs`, `presets.rs`) | GPU-free looks and a "strength" slider on any look | Our `DevelopPreset = { groups: Partial<DevelopSettings>, amount }`. The current 18 Creative Looks migrate directly, since they are already partial sets. |
| 10 | ICC v2/v4 engine with rendering intents, BPC and tetrahedral tables (PC `crates/cms`) | correct colour for import, export and print | Extend `codecs.ts`/`color.ts` with an ICC *reader* and matrix/TRC plus LUT transforms. This can sit in `rust/plajah-color` (giving the crate bindings and a reason to exist), with ArtCraft and moxcms as oracles. |
| 11 | Codec fidelity warnings, such as "this export drops layers / 16-bit / alpha" (PC `fidelity.rs`) | honest export UI | `ExportPlan.warnings[]` in our export service |
| 12 | Copy-on-write tiles shared by undo, GPU upload diffing and content-addressed saves (PC `crates/raster`, `format`) | memory and save speed at 50 MP and above | The raster engine already does 64² tile-diff undo (`painting.ts`) and content-addressed assets (`assets.ts`). Converge them into COW tiles when 16-bit sources land. |
| 13 | HDR merge (MTB + Debevec + deghost), panorama (Brown–Lowe, RANSAC, bundle adjustment, multiband), output as linear DNG (LC `crates/merge`, PC `algo/hdr.rs`, `panorama.rs`) | Lightroom parity features | Later stage. Implement in our Rust crate; outputs become float source assets. |
| 14 | HDR editing and export: gain-map JPEG (ISO 21496-1), PQ AVIF | modern phones produce HDR | Later stage, after the float pipeline exists |

**Where ArtCraft is weak, so we should beat it rather than copy it:**
- Camera colour calibration is weak in both repos.
- AI masks need user-downloaded weights or fall back to heuristics. We have on-device SlimSAM and the server.
- There are no galleries, sharing or cloud sync.
- The UI is egui desktop.
- LightCraft has no layers, and PhotoCraft's denoise, relight and stylize modules are prototype grade.
- Neither has a TV or phone story.

---

## 4. The shared develop model (the seam)

### 4.1 Principle
There is **one develop/adjust pipeline platform-wide**. The Tela raster engine owns the compiler and the GPU passes. Photos, the Tela Image device and Fabula are *hosts* that store settings and request renders. Nothing outside `services/tela/raster/**` (and the future `rust/plajah-raw` and `rust/plajah-color`) does any pixel math for develop.

### 4.2 `DevelopSettings` (draft, ours)
The model lives in a new `services/tela/raster/develop/model.ts`, following the GAUNTLET rule that "new types live in the engine's own module". Design rules:
- **Pure JSON.** Bitmaps and mask coverage are referenced by asset id and never inlined.
- **Lenient on read, minimal on write.** Every field is optional, missing means neutral, unknown fields are kept, and neutral groups are never written.
- **Resolution-independent.** Geometry uses normalised 0..1 coordinates of the oriented source; radii are a fraction of the long edge.
- **Process-versioned**, separately from the schema version.
- **Arrays, not hard-coded band fields.** Panels are disabled through a typed set.

```ts
export type ProcessVersion = 'p1';                     // exhaustive switch in the compiler
export type DevelopGroup =
  | 'profile' | 'wb' | 'tone' | 'curve' | 'color' | 'mixer' | 'grading' | 'calibration'
  | 'detail' | 'optics' | 'geometry' | 'crop' | 'effects' | 'masks' | 'spots';

export interface DevelopSettings {
  schema: 1;
  process?: ProcessVersion;                            // missing ⇒ 'p1'; never copied by presets/sync
  disabled?: DevelopGroup[];                           // per-panel bypass, values kept
  profile?: { id: string; amount?: number };           // look = slider deltas + optional LUT asset
  wb?: { mode: 'asShot' | 'auto' | 'preset' | 'custom'; preset?: string; kelvin?: number; tint?: number; /* rendered sources: relative −100..100 */ temp?: number };
  tone?: { exposure?: number; contrast?: number; highlights?: number; shadows?: number; whites?: number; blacks?: number };
  curve?: { parametric?: { shadows: number; darks: number; lights: number; highlights: number; splits: [number, number, number] };
            point?: { master?: CurvePoint[]; r?: CurvePoint[]; g?: CurvePoint[]; b?: CurvePoint[] } };  // reuse raster CurvePoint
  color?: { vibrance?: number; saturation?: number };
  mixer?: { bands: { hue: number; width?: number; dHue: number; dSat: number; dLum: number }[] };   // OkLCh, N bands (8 default)
  grading?: { shadows?: Wheel; midtones?: Wheel; highlights?: Wheel; global?: Wheel; blending?: number; balance?: number;
              /** Fabula parity: lift/gamma/gain expressed exactly (see 4.4) */ lgg?: { lift: RGB; gamma: RGB; gain: RGB; pivot?: number } };
  calibration?: { shadowTint?: number; primaries?: { r: HueSat; g: HueSat; b: HueSat } };
  detail?: { sharpen?: { amount: number; radius: number; detail: number; masking: number };
             nr?: { luma: number; lumaDetail?: number; chroma: number; chromaDetail?: number; method?: 'nlm' | 'bilateral' | 'ai' } };
  optics?: { profile?: string; distortion?: number; vignetting?: number; ca?: { auto?: boolean; red?: number; blue?: number }; defringe?: { purple?: number; green?: number } };
  geometry?: { upright?: 'off' | 'auto' | 'level' | 'vertical' | 'full' | 'guided'; homography?: number[]; rotate?: number; vertical?: number; horizontal?: number; scale?: number };
  crop?: { rect: { x: number; y: number; w: number; h: number }; angle?: number; aspect?: string; flipH?: boolean; flipV?: boolean };
  effects?: { texture?: number; clarity?: number; dehaze?: number; fade?: number;
              vignette?: { amount: number; midpoint?: number; roundness?: number; feather?: number; highlights?: number };
              grain?: { amount: number; size?: number; roughness?: number; seed?: number } };
  lut?: { assetId: string; strength?: number; space?: 'display' | 'log' };    // .cube in the Tela asset store
  masks?: DevelopMask[];
  spots?: { mode: 'heal' | 'clone' | 'fill'; path: [number, number][]; size: number; feather?: number; opacity?: number; source?: [number, number] }[];
  redEye?: { center: [number, number]; rx: number; ry: number; darken?: number; pet?: boolean }[];
}
export interface Wheel { hue: number; sat: number; lum: number }
export interface DevelopMask {
  id: string; name?: string; visible?: boolean; invert?: boolean; amount?: number;
  components: { op: 'add' | 'subtract' | 'intersect'; invert?: boolean; shape: MaskShape }[];
  local: Pick<DevelopSettings, 'wb' | 'tone' | 'color' | 'effects'> & { sharpness?: number; noise?: number; hue?: number };
}
export type MaskShape =
  | { kind: 'brush'; strokes: { points: [number, number, number?][]; size: number; feather: number; flow: number; erase?: boolean }[] }
  | { kind: 'linear'; from: [number, number]; to: [number, number] }
  | { kind: 'radial'; center: [number, number]; rx: number; ry: number; angle?: number; feather: number }
  | { kind: 'colorRange'; samples: [number, number, number][]; tolerance: number }      // OkLab
  | { kind: 'lumRange'; lo: number; hi: number; loFeather: number; hiFeather: number }
  | { kind: 'ai'; target: 'subject' | 'sky' | 'background' | 'person' | 'object'; prompt?: string; clicks?: [number, number, 0 | 1][];
      /** cached coverage (asset id, sampled bilinearly) so rendering never needs the model */ coverage?: { assetId: string; rect?: [number, number, number, number] } };
```

How this differs from LightCraft's schema (design choices, not copies):
- Mixer and grading are arrays and wheels; there are no eight hard-coded fields.
- Disabled panels are a typed `DevelopGroup` set, not strings.
- The parametric and point curves are split.
- A Fabula-exact `lgg` sits inside grading.
- AI coverage is an *asset reference*, never inline base64, because Tela docs must stay small for Post Man letters and Fabula timelines.
- A `fill` spot mode reuses our PatchMatch.

### 4.3 The pipeline (one compiler, three hosts)
`compileDevelop(settings, sourceMeta) → DevelopPlan` lives in `services/tela/raster/develop/compile.ts`. It returns ordered stages. Each stage has a CPU reference function in TS (and Rust/wasm where heavy) and a GLSL twin in `gl/developShaders.ts`, plus a stage cache key.

1. **Source.** Decode to a **linear float** working buffer:
   - RAW goes through `plajah-raw` (wasm), demosaics, and applies camera→XYZ→working matrices.
   - JPEG, HEIC, PNG and 16-bit TIFF are linearised from their ICC.
   - The working space is **linear Rec.2020 D65, float**, as RGBA16F on the GPU.
2. **Geometry**, with a single resample: orientation → lens distortion/CA/vignetting → upright homography → crop/straighten. This reuses the `transform.ts` lanczos and homography code.
3. **Scene-linear:** WB → exposure → dehaze → local tone (highlights, shadows, whites, blacks via a guided filter on log-luminance) → texture/clarity → detail (NR before sharpen) → masks with local adjustments.
4. **Tone map:** a log-domain filmic curve around 18% grey, plus the parametric and point curves.
5. **Colour (OkLCh):** vibrance, saturation, mixer, grading/`lgg`, calibration, B&W.
6. **Output transform:** gamut map to the document `colorSpace` → encode → LUT (display-space LUTs) → vignette → grain.

After that, the existing raster stack (adjustment layers, fills, groups, styles) composites exactly as today in the document `blendSpace`. In the raster model a develop source is a **pixel layer whose bitmap is produced by the plan**, so Photoshop-semantics adjustment layers above it keep their meaning.

### 4.4 Seams, host by host

| Host | Where develop settings live | How it renders | Notes |
|---|---|---|---|
| **Raster engine** (owner) | `PixelLayer.develop?: { source: SourceRef; settings: DevelopSettings }`, an additive optional field in `model.ts` | `compositeCore` asks `DevelopRenderer` for the layer's bitmap at view scale; `GlCompositor` keeps stage surfaces keyed per stage | `SourceRef = { assetId; kind: 'raw' \| 'float' \| 'encoded'; icc?; cameraId? }`. Also add `Adjustment { type: 'develop'; settings }` for "Camera Raw filter as adjustment layer" (display-referred subset only). |
| **Tela Image device** | `TelaImageDevice.raster` (already exists, `types.ts:7554`) | `RasterSession` (already exists) | Opening a photo in Tela creates a pixel layer that holds `develop` and points to the **same** Photos asset id, so Tela letters and Post Man bulletins carry the edit and never a baked copy. |
| **Photos app** | `photos/{id}.develop: DevelopSettings` (current), plus `photos/{id}/edits` ops (history), `snapshots[]` and virtual copies as `photos/{copyId}.copyOf` | `DevelopRenderer` on a single-layer `RasterDocument`; grid thumbnails come from the server cache (see 5.3) | `PhotoEditAdjustments` (18 fields) migrates one-way into `DevelopSettings`. There are no users yet, so a clean break is fine (`feedback-no-users-clean-breaks`). |
| **Fabula / Pixels** | per-clip `grade` keeps its UI. `InputGrade` gains `develop?: DevelopSettings`, or is generated *from* it | the Pixels compositor imports the **same** GLSL stage module (`developShaders.ts`) into its context; per-pixel stages only on video (no spatial NR at playback); `lift/gamma/gain` ↔ `grading.lgg`, `temp/tint` ↔ `wb`, `curveLut` ↔ `curve.point`, `qualifier` ↔ a `colorRange`/`lumRange` mask, `window` ↔ a `radial`/`linear` mask | `developtone`/`developfinish` become thin wrappers over the shared stages, so a photo look applied in Photos matches the same look on a Fabula clip. Export to OFX keeps working (`rust/fabula-ofx`). |
| **The Post Man** | letters reference photo asset id + `DevelopSettings` (or a raster layer) | `RasterSession.exportFlattened` at send time for recipients who cannot render | Fix bug 7 (hand-off loses the file) as part of this. |
| **Rust** | `rust/plajah-raw` (new) and `rust/plajah-color` (grown: ICC reader/transforms, tetrahedral LUT, wasm bindings) | compiled into the committed `.wasm` (CI has no Rust; see `scripts/buildAudioWasm.mjs`) | No ArtCraft crates in Cargo, ever. |

### 4.5 Prerequisites in the raster engine
These are additive and must be coordinated with the Tela program. The engine is untracked and being edited as of 2026-10-10.
1. **A 16-bit/float source asset type.** Next to `Bitmap8`, add a `RasterF`/half-float source stored in the Tela asset store, for example as a PNG16 or a raw `.f16` blob keyed by content hash. Develop layers read it; ordinary pixel layers stay 8-bit.
2. **Linear-light develop stages.** A develop-stage family that runs in linear float *before* the display encode. Today `adjust.ts` evaluates only on sRGB-encoded values, which is correct for adjustment layers and stays that way.
3. **A wider working gamut.** Add Rec.2020 linear (develop internal) and ProPhoto/Rec.2020 output tags to `ColorSpaceTag`, with ICC generation in `codecs.ts`, plus an ICC *reader* for input.
4. **Our own RAW decoder**, `rust/plajah-raw`. Start with a DNG parser (LJPEG, then JXL), camera matrices, AHD demosaic and highlight reconstruction. Then CR2, CR3, NEF, ARW and RAF. Use the embedded-JPEG fallback as `previewOnly`.
5. **Parametric mask evaluation** at any resolution, on GPU and CPU (`develop/masks.ts`).
6. **Stage-keyed surface caching** in `GlCompositor`.
7. Write `docs/tela/RASTER_ENGINE.md`, which `index.ts` already references. It should include a develop chapter and the ArtCraft credits.

---

## 5. Staged build plan (ranked by impact)

Every stage builds on the shared raster engine. "Done" means tests (`npx tsx --test`) and a browser check.

### Stage 0: Stop the bleeding (small, independent of the engine)
- Persist the recipe: write `photos/{id}.develop`, in the old shape for now, from `PhotoEditPanel.onApply`, and render saved edits in the lightbox.
- Read EXIF from `originalUrl`. Also extract EXIF, GPS and capture date **at upload** and store them on `Photo`, reusing the `services/eventPool/exif.ts` reader that handles GPS.
- Fix `addPhotosToAlbum` (it must write to `photo_albums`), the delete button, and Storage cleanup on delete.
- Triage the privacy rules (bug 5) with Kenne. Mind the Firestore rules size ceiling.
- Make the Tela, Fabula and Pixels hand-off pass the asset.

### Stage 1: Develop on the shared engine, with an sRGB/P3 source (highest impact)
- Write the `DevelopSettings` model and compiler. Implement the **per-pixel stages first**: WB, tone, curves, mixer, grading, calibration, vignette and grain. Use CPU and GLSL twins and extend the equivalence tests.
- Replace `PhotoDevelopPreview`'s CSS with `RasterSession` on a canvas, so the preview is GPU-backed. Add a histogram and clipping warnings. Fix the cross-origin sampling issue noted in `PhotoDevelopPreview.tsx:4-5` with CORS on Storage (`storage-cors.json`) or a blob fetch.
- Add history (op log with inverse ops), snapshots, virtual copies, copy/paste/sync by `DevelopGroup`, and presets with an amount. Migrate the 18 Creative Looks into this model.
- Use the **spatial stages already in the raster engine**: clarity/texture via the guided filter, NR (NLM and bilateral), sharpen (unsharp mask), crop and straighten, upright homography from guides.
- Healing and remove: wire `spotHeal`, `healBrushStroke` and `contentAwareFill` as `spots[]`.
- Fabula: point `developtone`/`developfinish` and `InputGrade` at the shared GLSL module.

### Stage 2: Library parity
- Ratings, flags and colour labels; hierarchical keywords; smart collections. Smart collections are a nested rule set in our own schema and need Firestore indexes; see the Firestore notes in memory.
- Search across metadata (camera, lens, date, rating, keyword) with server-side paging.
- Duplicate detection: content hash plus a perceptual hash.
- XMP sidecar read and write, including an Adobe `crs:` *import* mapper into our model (a mapping, not an adopted model). Write IPTC on export.
- Grid virtualisation and paged `fetchUserPhotos`. Add a 2048 px "smart preview" derivative.

### Stage 3: Float pipeline and RAW
- 16-bit/float source assets; a linear Rec.2020 develop stage; ICC reader; ProPhoto, Rec.2020 and AdobeRGB output.
- `rust/plajah-raw` → wasm. DNG first. Use ArtCraft as an oracle on a CC0 corpus.
- Lens corrections: DNG opcodes, manual corrections, then our own profile database (open data; lensfun is GPL, so it is not linkable and data use needs review).
- A filmic tone map and process `p2` if this changes the look.

### Stage 4: Masks and AI
- Parametric masks (linear, radial, brush, colour and luminance range).
- AI subject/sky/person/object masks via on-device SlimSAM (existing) and a server model, with cached coverage assets.
- People: on-device face detection, embeddings, clustering into a People view. This needs a privacy and consent design; open decision D4.
- AI tagging and captions for search.

### Stage 5: Output, sharing, platforms
- An export service with formats (JPEG/PNG/WebP/AVIF/TIFF16), size presets, sharpen for output, a watermark (Tela text engine), colour space, metadata include/strip/location-strip, naming templates and fidelity warnings.
- Galleries render developed versions. Add client proofing: picks, comments per photo, password and expiry links, download control.
- Map view (Google Maps, per memory; cache coordinates ≤30 days).
- TV photo browser and ambient screensaver from the shared derivative cache.
- Native **still** capture on Android: CameraX `ImageCapture` and DNG via `DngCreator`.

### Stage 6: Merge and HDR
- HDR merge (MTB + Debevec + deghost) and panorama (features, RANSAC, bundle adjustment, multiband blending) in our Rust crate, producing float sources.
- HDR editing with gain-map JPEG and PQ AVIF export.

---

## 6. Risks
- **Concurrent edits to the raster engine.** It is untracked and changing hourly under the Tela gauntlet. Develop work must be *additive*, in a `develop/` subfolder, coordinated with that program's owner, and must not touch the hot shared files (`types.ts`, `TelaView.tsx`, `telaOps.ts`, `renderDevice.tsx`) except for one optional field.
- **Performance in the browser.** The 64³ LUT bake per adjustment, float surfaces at 24–60 MP, and WebGL2 limits on phones and TVs all need tiling plus the windowed render at zoom. Fall back to an RGBA8 working buffer when `EXT_color_buffer_float` is missing (the raster engine already does this). The quality loss must be documented.
- **RAW in wasm.** Memory (a 60 MP float buffer is about 1 GB), worker transfer costs and camera coverage. Mitigate with a binned preview decode, tiles, and DNG first.
- **Camera colour.** This is the weakest area in ArtCraft as well. Without measured profiles, non-DNG colour will be "estimated". Be honest about that in the UI.
- **IP.** Do not copy Adobe's process or profiles. The `crs:` import is a best-effort mapping. Lensfun is GPL, so it is not linkable. SAM weights have their own licence. Check patents noted in memory.
- **Firestore.** The rules file is already over the release ceiling (memory: rules ceiling). New collections (`edits`, smart-collection queries) need indexes and rules space.
- **Privacy.** Face recognition and location are sensitive (BIPA and GDPR biometric rules). The current privacy-rules hole must be fixed before adding more metadata.
- **Pipeline sharing with Fabula.** Video playback cannot afford spatial stages per frame. Restrict Fabula to per-pixel stages, or pre-render, and accept that matching looks between a photo and a clip covers only the per-pixel subset.

## 7. Open decisions for Kenne
1. **D1: Working space.** Linear Rec.2020, as recommended (matches LightCraft and HDR displays), or ProPhoto (PhotoCraft and classic Lightroom)?
2. **D2: Where heavy develop runs.** Fully client-side with wasm and WebGL2 (recommended), or a server render on Cloud Run for exports and thumbnails as well?
3. **D3: RAW scope for v1.** DNG only, or DNG + CR3 + NEF + ARW?
4. **D4: Faces.** Do we build People at all? If yes, on-device only, with opt-in and no cross-user matching?
5. **D5: Catalog history store.** A Firestore op-log subcollection (recommended), or a local-first OPFS journal synced to Firestore? The second makes offline work and the Windows mirrored folders easier.
6. **D6: Photo privacy rules fix.** It needs a rules deploy, which is blocked by the rules ceiling.
7. **D7: Process version policy.** Is p1 the current CSS-era look (frozen and migrated), or a clean start (allowed by the no-users policy)?
8. **D8: Ownership.** Does the Tela gauntlet's raster owner take the `develop/` module, or does a Photos program own it under the GAUNTLET rules?
9. **D9: AI models.** On-device SlimSAM only, or allow a server segmentation and denoise model, which has cost and licence implications?

## 8. Credits (ideas learned, no code taken)
- **LightCraft** (storytold, MIT OR Apache-2.0):
  - process-version policy
  - parametric masks with cached coverage
  - op-log catalog with inverse ops
  - stage-keyed caching with exposure after spatial filters
  - preview cache key shape
  - CPU/GPU equivalence testing
  - profiles as slider deltas
- **PhotoCraft** (storytold, MIT OR Apache-2.0):
  - ICC engine scope (intents, BPC, tetrahedral)
  - codec fidelity warnings
  - copy-on-write tiles
  - filter halo contract
  - pinned oracle corpora
- **Papers referenced** for our own implementations:
  - Pérez et al. 2003 (Poisson)
  - Barnes et al. 2009 and Wexler et al. 2007 (PatchMatch / EM)
  - He et al. (guided filter, dark-channel dehaze)
  - Hirakawa–Parks (AHD)
  - Malvar–He–Cutler
  - Debevec–Malik
  - Ward (MTB)
  - Brown–Lowe (panorama)
