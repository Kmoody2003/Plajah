# Apex: visual fidelity within the Intel Arc 60 FPS budget

Research and source inspection: 2026-11-17. This is an implementation brief, not a measured speedup or a claim of Forza parity. Gemini owns the active frame-rate work; this lane owns material, lighting, atmosphere and image quality. No renderer code or Gemini changes were modified for this research.

## Acceptance target and references

Primary target: the local Intel Arc integrated GPU, 60 real rendered frames/s (16.67 ms/frame). Secondary local target: RTX 4070 Laptop GPU. Record output resolution AND internal resolution; dynamic resolution is not a free visual improvement. Frame generation must be reported separately from rendered FPS and input latency.

Read `CHATGPT_WORKPLAN.md`, `performance-brief.md`, `reference-scenes.md` and the current shaders. The performance brief mentions 17 shots, while the scene document currently lists 11 scene categories. An exhaustive 17-image manifest is still needed.

Inspected these actual images under `D:\plajah game assets deign from promtps\racer\Nov 15 - 14_22`:

- `GT_cars_racing_over_bridge_9ff3f5f4.jpg`: layered forest haze, low river mist, subdued wood, readable dark bridge interior, contact shadows and restrained headlights.
- `Cars_exiting_boardwalk_tunnel_6103cbd4.jpg`: sand roughness and ruts, vegetation of varied heights, dark tunnel versus daylight, distant coast haze, dust lit consistently with the scene.

These are visual acceptance references; their filenames/overlays do not establish which game or renderer made them. The brief also points at `docs/kith-party/kith-racing-benchmark.jpg`; inspection shows stylized fantasy kart art. Do not use its saturated palette as Apex's photoreal material target.

## Findings in the current source

- `sky.ts` blends photographic panoramas with two five-octave procedural noise evaluations and horizon haze. A new atmosphere system must replace corresponding work, not simply stack over it.
- `region.ts` uses time/weather-dependent linear fog. This lacks explicit altitude-dependent extinction and consistent sun-direction scattering.
- `roadpbr.ts` already has two-scale detail normals, wet roughness, pore flattening and puddle ripples. Improve filtering and layering rather than replace this with a uniform shiny surface.
- The installed Three.js physical shader already raises roughness using derivatives of `nonPerturbedNormal`. Adding another generic geometry-roughness term would duplicate existing work. Normal-map variance is a separate problem.
- The car already uses physical materials. There is no benefit in indiscriminately converting the entire city to the more expensive physical shader.
- `enginePerf.ts` and `region.ts` have active shared edits involving resolution/culling. Do not modify those controls in the visual research lane.

## Recommended shader work, in order

The cost ceilings below are proposed acceptance budgets at 1920x1080 output on Arc, not measured estimates. Each item must fit within the total 16.67 ms budget; these are not additive permission to spend beyond it.

| Priority | Technique and integration | Visual acceptance | Proposed incremental GPU ceiling |
|---|---|---|---|
| 1 | Audit linear/HDR lighting, exposure, PMREM and final tone mapping; calibrate roughness/metalness by material | Neutral concrete, no crushed tunnel exit detail, paint reflects the same sky as the environment | 0.2 ms |
| 2 | Analytic height fog and sun-tinted aerial perspective in existing material fog hooks; sky uses the same coefficients | Far trees and towers lose contrast naturally; river mist sits low; no horizon seam | 0.5 ms |
| 3 | Filter micro-normal energy into roughness; preserve macro texture variation; fix undefined reversed smoothstep calls in touched shaders | Asphalt, roofs, fences and paint stay stable in motion instead of sparkling | 0.3 ms |
| 4 | Refine layered paint and porous wet surfaces; baked local reflection probes where appropriate | Clear coat distinct from base paint; wet wood/asphalt darken without becoming metal | 0.5 ms |
| 5 | Thin-leaf backlighting approximation, authored vegetation normals and stable coverage | Leaves transmit warm sunlight without glowing in shade; no canopy crawl | 0.4 ms |
| 6 | Optional selective wet-road SSR with probe fallback | Reflections fade gracefully at screen edges and occlusion changes; no popped captures | 1.0 ms; defer if unavailable |

### Lighting and materials first

Keep color textures in sRGB; normals, roughness, AO, masks and depth are data. Audit the whole composer for one final display transform, including custom sky/grade passes, before changing exposure. PMREM supplies roughness-filtered environment lighting [1]. A brighter environment multiplier cannot recover missing HDR light range.

Use physical clear coat on hero paint and selected wet materials, with distinct base and coat roughness. Three.js documents the added per-pixel expense [2]. Use standard materials for ordinary distant concrete/wood. For wet porous surfaces, separate pore saturation, thin film and standing water; maintain the existing retained-wetness physics masks [3]. Water IOR is not identical to the fixed automotive coat model: use a water-specific Fresnel response where needed.

### Atmosphere without a volume ray march at every pixel

First prototype analytic height extinction in the existing fog path. Integrate an exponential density along the camera-to-surface segment with a stable near-horizontal limit; clamp extreme heights and optical depth. Blend fog radiance toward the sun with a bounded directional term. This is an approximation, not multiple-scattering simulation.

Use one shared sun/weather/height parameter set across terrain, buildings, vegetation, water and sky. Keep map mode separate. Test transparent spray and distant silhouettes so fog is not applied twice. If the approximation misses the references, evaluate Hillaire's low-dimensional atmosphere LUT approach [4], amortizing updates across weather/time changes. Do not assume the paper's timings transfer to this browser.

### Stable detail is visual fidelity

Do not turn up normal strength to simulate missing geometry. For normal-map variance filtering, retain averaged normal length in the asset mip chain or a roughness correction channel, and fold unresolved variance into the BRDF. Compare against the installed shader's existing geometry correction. A derivative-only version can be an experiment, but must not broaden already filtered highlights twice. Filament provides relevant PBR/filtering background [5].

Use world-scale material calibration, macro color/roughness variation and authored edge wear. Keep genuine silhouettes and close-up ruts in geometry. Advanced shaders cannot supply missing bridge beams, harbor hardware, spectators or car proportions.

### Reflections and reconstruction are gated experiments

Prefer stable baked, roughness-prefiltered local probes, spatially blended and optionally box-projected; do not reintroduce the previously rejected live scene snapshots. SSR should trace only eligible wet/specular pixels, cap traversal, reject bad depth hits and fall back to probes. Temporal SSR needs motion/reprojection and history rejection; a camera cut must invalidate history.

Temporal anti-aliasing/upscaling similarly needs correct motion for cars, wind-driven foliage and particles, disocclusion handling and resize/camera-cut resets. Shipping ghosting around fences would fail the reference even at a higher FPS. Keep HUD rendered at output resolution after reconstruction. Limit sharpening to avoid halos and grain amplification.

## Windows and vendor capability boundary

Auto SR, FSR, DLSS and XeSS are different technologies. A browser using a DirectX backend does not expose its native device, swap chain or vendor SDK interfaces to Three.js.

| Technology | Current WebGL2 game | Optional development route |
|---|---|---|
| DirectX 12 | No direct JavaScript D3D12 interface | Native renderer integrated with the Windows host; a WebView wrapper alone is insufficient |
| WebGPU | Separate renderer/shader migration, not a WebGL switch | Compute and modern resource management; feature-detect and retain WebGL fallback [6] |
| DirectML / WebNN | WebNN can access ML acceleration on supported Windows/browser configurations | Experimental inference, not automatic game upscaling; benchmark model cost plus GPU transfers before considering per-frame use [7] |
| AMD FSR 1 | EASU/RCAS algorithm can be investigated as a GLSL ES port; SDK is not drop-in | Spatial reconstruction from already anti-aliased color; compare with native and ordinary upscale [8] |
| AMD temporal FSR | No current integration | Native D3D12/Vulkan integration, or substantial independently validated browser port; needs temporal inputs [9] |
| Intel XeSS | No direct browser SDK binding | Native renderer candidate for Arc; query feature support, do not infer all XeSS features from the Arc name [10] |
| NVIDIA DLSS / DLAA / Reflex | No direct browser SDK binding | Native Streamline/NGX integration; 4070 Laptop supports the relevant RTX 40 feature class, including conventional frame generation, subject to runtime requirements [11,12] |
| NVIDIA Image Scaling | Not DLSS; no existing integration | Open shader algorithm worth comparing with FSR spatial reconstruction; port/API compatibility still required [11] |
| Windows Auto SR | No verified support for this browser/iframe game | OS-level option only on supported hardware/game/presentation paths; verify actual activation indicator [13] |

Microsoft's current Auto SR documentation lists specific Copilot+ AMD, Intel and Snapdragon platforms, Windows 11 24H2+, drivers/packages and DirectX game requirements [13]. Do not repeat the outdated blanket claim that it is Snapdragon-only. Equally, the local Arc label does not establish eligibility. CPU/OS/driver identification through CIM was unavailable in this session, so local Auto SR support remains unknown.

NVIDIA's current Streamline repository documents Vulkan paths as well as DirectX; its marketing FAQ still says Vulkan is coming soon. Use the chosen SDK version's programming guide and per-feature checks [14]. Do not promise RTX 50-only multi-frame features on the 4070.

Recommendation: ship the visual improvements through portable shaders first. Evaluate WebGPU behind a flag later. Treat native vendor reconstruction as a separate renderer project, with a measured comparison against the browser; transferring browser frames to a native upscaler can erase savings and does not supply missing motion/depth automatically.

## Integration and validation contract

1. Capture the exact revision, active adapter, browser/driver, output/internal dimensions, quality settings, weather, time and fixed camera before comparison. Warm assets/shaders first; use foreground tests both standalone and in the Plajah iframe.
2. Use city rain, covered-bridge mist, coastal tunnel exit and sunny forest as named tests. Save a stationary frame plus the same 10-second moving-camera sequence. Record not-yet-built sites rather than inventing coordinates.
3. Collect per-pass asynchronous GPU timings, CPU submission time, frame p50/p95/p99, draw calls, triangles and render-target memory. Reject disjoint GPU results. Compare identical resolution settings before allowing adaptive resolution.
4. Evaluate paint highlights, wet reflections, sky/ground color continuity, foliage/fence shimmer, contact halos, tunnel exposure and HUD clarity. A still image alone cannot approve temporal rendering.
5. Keep each shader experiment independently switchable. No always-on extra pass over the workplan's approximately 2 ms threshold without explicit reporting. Promote only when both visual review and total-frame budget pass.

Next concrete implementation: a separately testable analytic atmosphere module and an opt-in integration patch after Gemini's shared `region.ts` edits settle. This research does not assert that atmosphere, vendor upscaling or 60 FPS is implemented or verified.

## Sources

1. https://threejs.org/docs/pages/PMREMGenerator.html
2. https://threejs.org/docs/pages/MeshPhysicalMaterial.html
3. https://seblagarde.wordpress.com/2013/03/19/water-drop-3a-physically-based-wet-surfaces/
4. https://diglib.eg.org/items/8a3e5350-18b3-46bd-9274-3add5af88c75
5. https://google.github.io/filament/Filament.md.html
6. https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API
7. https://learn.microsoft.com/en-us/windows/ai/directml/webnn-overview
8. https://gpuopen.com/manuals/fidelityfx_sdk/techniques/super-resolution-spatial/
9. https://gpuopen.com/manuals/fidelityfx_sdk/samples/super-resolution/
10. https://www.intel.com/content/www/us/en/developer/topic-technology/gamedev/xess.html
11. https://developer.nvidia.com/rtx/streamline
12. https://developer.nvidia.com/rtx/streamline/get-started
13. https://support.microsoft.com/en-us/windows/ai/ai-features/automatic-super-resolution
14. https://github.com/NVIDIA-RTX/Streamline/blob/main/docs/ProgrammingGuide.md
