# Fabula Forge — Phase 1–2 Build Matrix

Status is evidence-based: **Built** means native implementation + registry + timeline/node exposure + export path.
**Cataloged** means the contract/presets exist but the renderer or host integration is incomplete. **Open** means not built.

## Phase 1 — Finishing Essentials

### Light, glow and lens
- **Built:** Cine Glow, Film Halation, Soft Diffusion, Star Glint, Volumetric Rays, Edge Glow,
  Optical Glow, Ultra Glow, Light Leak, Glimmer, Flashbulb, Atmospheric Glow,
  Lens Flare Designer, Sparkle Field, Caustic Light, Laser & Zap
- **Built:** true background-input Light Wrap with synchronized Fabula asset binding
- **Open:** downloadable calibrated camera/lens flare profile database

### Blur and focus
- **Built:** Velvet Blur, Directional Blur, Radial Focus, Gaussian/Box Pro Blur, Channel Blur,
  Lens Bokeh, Tilt-Shift, Beauty Blur, Sharpen/Unsharp Mask, Edge-Aware Blur, Rack Defocus,
  luminance Depth Defocus, image-driven Compound Blur, Motion Field Blur
- **Built:** external Depth Map Defocus with synchronized asset binding
- **Open:** temporal optical-flow blur (Phase 2 flow dependency)

### Color and film
- **Built:** Cinematic Color, Film Stock, Skin Refine, Auto Balance, Bleach Bypass, Day for Night,
  Spatial Denoise, Regrain, Film Damage, Color Space Transform, Looks Designer,
  Selective Mojo, Parametric Curve and Guided Color Match
- **Existing Fabula foundation:** primaries, wheels, tone curves, HSL qualifier, power windows, grade layers
- **Built:** strict `.cube` 3D LUT import, project selection, WebGL3D preview and offline-export parity
- **Built:** reference-asset Color Match binding and native two-source render path
- **Open:** automatic statistical frame sampling for Color Match, full OCIO configuration and
  individually calibrated camera-log transforms

### Key and matte
- **Built:** Precision Chroma Key, Luma Matte, Spill Killer, Matte Choker/Blur/Refine,
  Adaptive Key, Edge Color, Garbage & Core Matte and Key Cleaner
- **Built:** true reference-input Difference Key and background-input Light Wrap composite

### Stylize and generators
- **Built:** Prism Grade, Editorial Print, Graphic Cartoon, Analog Damage, Pencil Studio,
  Kaleido Prism, Pixel Sort, Digital Damage, Dither Lab, Spectral Vision, Fractal Field,
  Starfield, Atmosphere Generator, Texture Lab, Paint Studio, VHS & CRT, Analog TV,
  Posterize & Solarize, Relief Studio, Neon Contours and Gradient Studio
- **Existing Pixels foundation:** procedural generators and legacy mirror/pixelate/RGB shift/invert
- **Covered by combined tools:** Etch/Crosshatch (Pencil Studio), Glitch (Digital Damage),
  Infrared/Thermal/X-Ray (Spectral Vision), Clouds/Aurora (Atmosphere Generator)
- **Open:** temporal codec-aware Datamosh (Phase 2 temporal-frame dependency)

### Distort and warp
- **Built:** Lens Warp, Fluid Warp, Chromatic Fringe, Turbulent Displace, Ripple & Wave,
  Corner Pin, Mesh Warp, Bulge & Pinch, Polar Warp, Rolling Shutter Repair, Perspective Warp,
  Advanced Heat Haze, Twirl Warp, Prism Displacement, RGB Separation Pro and Lens Calibration
- **Built:** external luminance/RG Displacement Map with synchronized asset binding
- **Open:** downloadable manufacturer camera/lens profile database

### Transitions
- **Built renderer/export path:** Film Dissolve, Luma Dissolve, Light Leak, Whip Pan,
  Prism Warp, Ink Reveal, Glow Dissolve, Blur Dissolve, Bokeh Dissolve, Zoom/Hyper Pull,
  Film Roll, Glitch Cut, RGB Split, Burn/Flash and Push/Slide. Each evaluates outgoing
  and incoming textures in one native shader. Shape Wipe and Camera Shake Cut are also native.
- **Built integration:** Effects Library preset selection, persisted incoming-clip instances,
  timeline duration wedge, preview/export shader parity
- **Built integration:** transition-driven audio fade parity and auxiliary node ports
- **Built integration:** same-context compound-clip precomposition and aligned moving outgoing handles

## Phase 2 — Tracking, Cleanup and Compositing

### VectorTrack (Mocha-equivalent core)
- **Built foundation:** serializable normalized motion-data asset, brightness-invariant point tracker,
  ambiguity/error confidence, subpixel refinement, manual sample replacement, inverse stabilization,
  least-squares planar homography, translation/scale/rotation/shear/perspective decomposition,
  surface corners and inverse homography
- **Built integration:** video-frame decode runner, forward point tracking UI, normalized clip
  persistence, confidence display, stabilization toggle and monitor/export transform binding
- **Built foundation (2026-09-02):** multi-frame planar tracking over a 3×3 feature lattice inset in
  the surface (flat cells skipped), per-feature confidence, iterative worst-residual outlier rejection,
  re-anchored seeds (reference features projected through the solved plane, so features cannot
  random-walk), explicit failure (`lost` samples + reason, runner stops), interpolated sampling between
  frames, stabilise (`planarStabilizeAt`) and corner-pin (`cornerPinAt`: place + sampling matrices)
  derived from one sampler, `exportCornerPin` rows; fixed the point tracker's second-best ambiguity
  (measured against the final winner) and added a predicted search centre
- **Built integration (2026-09-02):** planar decode runner from the playhead with progress + STOP and
  resume-from-sample; `SurfaceOverlay` on the program monitor (draggable corners/body while editing;
  tracked quad + lattice coloured by confidence when playing); inspector PLANAR block (SURFACE / TRACK
  PLANAR / STABILIZE / CLEAR / PIN TO SURFACE); `clip.fx.planarSurface`, `clip.fx.planarTrack`,
  `trackMode: 'planar'`, `fx.pinTo`; projective sampling in the WebGL compositor (`LayerInput.homography`,
  `uH`, conjugated for the Y-flipped upload), the offline renderer, the WebGPU monitor compositor and
  the export resolver; DOM monitor via CSS matrix3d over the contain box; GpuStage now applies point-track
  translation and the homography (previously ignored)
- **Open:** track backward + AdjustTrack (manual key correction re-weighting the solve), feature
  re-detection through occlusion, worker/WebCodecs decode (serial seeks, 600-frame cap), shared
  motion-data asset (sourceAssetId is recorded but never resolved), binding tracks to effect params /
  mattes / grade windows, corner-pin export to FCPXML/AE/Nuke, verifying GL y-orientation of the legacy
  translation path on real footage

### Mesh, flow and camera
- **Open:** optical-flow field, spline point propagation, deforming mesh tracker,
  PowerMesh-class warp, planar-from-mesh solve, rolling-shutter model,
  lens calibration profiles, 3D camera solve, point cloud and camera export

### Roto and ML matte
- **Existing foundation:** static rect/ellipse mattes and grade windows
- **Open:** Bézier/B-spline/X-spline shapes, per-point feather, open shapes, shape groups,
  magnetic edge snapping, motion blur mattes, SAM-style click/text segmentation,
  temporal matte propagation, face/skin/hair mattes, edge refinement, Cryptomatte I/O

### Cleanup and paint
- **Open:** object removal, clean-plate generation, temporal median fill, tracked clone,
  repair/heal brush, paint strokes, AutoPaint recording, grain-aware patching,
  wire/rig removal, dust/dead-pixel cleanup, flicker repair, beauty cleanup

### Compositing depth
- **Existing foundation:** node graph, merge modes, per-node viewer, masks/grades groundwork
- **Built foundation:** portable auxiliary sampler ABI, Inspector asset binding, synchronized
  preview/export media resolution, Difference Key, Light Wrap, Displacement/Depth Map and Reference Match
- **Built:** auxiliary node-port exposure and graph-renderer binding
- **Open:** channel tools, alpha arithmetic,
  premultiply/unpremultiply, set matte, depth/normal/vector channels, motion-vector blur,
  expressions, groups/macros, published parameters, effect builder and flare builder

## Completion Gate

Phase 1 or Phase 2 is not called complete until every row has:
1. a native implementation or an explicit scoped exclusion;
2. curated presets and at least one artistic template where applicable;
3. timeline and node-graph exposure;
4. preview/export parity;
5. parameter, persistence and render-conformance tests;
6. stable IDs and version migration for future OFX mapping.
