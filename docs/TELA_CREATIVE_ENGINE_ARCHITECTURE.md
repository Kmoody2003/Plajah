# Tela Creative Engine architecture

Tela is a document engine and a creative engine sharing one scene model. A worksheet, poster, live lower third, presentation, animation, or responsive web page should keep editable semantics instead of flattening into a bitmap.

## Engine boundaries

- **Tela document graph:** frames, vector/image/form/base devices, bindings, stable IDs, operations, save/version flow.
- **Vector scene:** text, parametric boxes, editable paths, semantic image crops, gradient paint, transforms, snapping, rulers and safe areas.
- **Raster/media scene:** image, video and dotLottie layers; non-destructive adjustment, blend, luma/alpha/shape masks, groups and transforms.
- **Lorea paint surface:** pressure-aware pencil, ink, marker, paint, texture and eraser presets. Painting returns a standard layer asset, so Lorea and Tela do not fork brush behavior.
- **Document intelligence:** Florence supplies OCR and region meaning; local geometry analysis reconstructs rules and layout; SlimSAM supplies precision alpha segmentation. Response guides become Base fields and a positioned Form overlay.
- **Generative adapters:** `telaGenerativeRegistry` selects registered device/server/API providers by task. Tela does not hard-code or require a paid model; on-device providers win when available.
- **Export surfaces:** print/PDF preserves physical page dimensions; HTML export emits a responsive page and fillable form; the existing Ambo/Fabula engines remain the path for live video and animation output.

## Scene flow

```text
source asset / scan / brush input
             │
             ▼
   semantic + geometry analysis
             │
             ▼
  editable Tela objects and layers
      │          │          │
      │          │          └── masks / groups / blend / animation
      │          └───────────── Base fields + positioned Form inputs
      └──────────────────────── text / shapes / paths / gradients
             │
             ▼
      Page · Board · Studio
             │
       ┌─────┼─────────┐
       ▼     ▼         ▼
   PDF/print HTML   live/media engines
```

## Native compatibility contracts

`classifyTelaAsset` recognizes raster, vector, document, video, Lottie, Photoshop brush (`.abr`), Photoshop custom-shape (`.csh`), and Adobe palette (`.ase/.aco`) families. Browser-decodable images, SVG, PDF-compatible AI/PDF, video, and dotLottie are active import paths. ABR/CSH/ASE are recognized as preset assets but deliberately rejected until their binary parsers land; Tela must never pretend an opaque preset is a drawable image.

The vector raster bridge already handles SVG and PDF-compatible Illustrator files. Legacy PostScript-only AI requires resaving as SVG or PDF. PSD/HEIC/TIFF need dedicated codecs before they can be promised across browsers and mobile devices.

## Model plumbing

Supported generative tasks are text-to-image, inpaint, outpaint, vectorize, style transfer, background removal, and layout generation. Each adapter declares locality, availability and task support. This lets PoKee/Aria orchestrate an installed open model first, then a Plajah server model, then an optional paid API without canvas code knowing which provider ran.

## Persistence and mobile

- Model files remain browser/app cached and use WebGPU with WASM fallback.
- Vector reconstruction stores semantic objects, not tens of thousands of microscopic contours.
- Painting and media are layer assets; operations carry IDs and patches rather than whole-document replacements.
- Touch uses pointer events; rulers and controls have explicit hit areas; the shared menu provides touch long-press where bindings are attached.
- Large codecs/models should be optional capability packs, never a mandatory first-launch download.

## Next codec/engine packages

1. ABR brush-tip/dynamics parser mapped into `TelaBrushPreset`.
2. CSH shape parser mapped into normalized Tela SVG paths.
3. ASE/ACO swatch parser mapped into document palettes and gradient stops.
4. PSD reader preserving groups, masks, blend modes, text and smart objects.
5. HEIC/TIFF/WIC-native decode bridge for Capacitor desktop/mobile packages.
6. Persistent stroke layers with tiled GPU compositing, selection/lasso, liquify and nondestructive filter graph.
7. Lottie timeline editing and shape-layer round-trip, beyond playback/import.

Those packages plug into existing contracts; they do not require another Tela document-model rewrite.
