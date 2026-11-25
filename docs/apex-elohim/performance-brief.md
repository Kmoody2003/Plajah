# Plajah Motorsport: Apex — performance brief for ChatGPT / Gemini

Goal: **60 fps on desktop (Intel Arc iGPU/dGPU class), 30 fps stable on low-power TV hardware**, while moving the look toward the 17 reference shots in `docs/apex-elohim/reference-scenes.md` (Forza Horizon / Series X–S level). Do not trade the look away; find cost that buys nothing visible.

## What it is
Three.js (WebGL2) open-world racer, `games/apex`, entry `src/region.ts` (~3.9k lines), Vite, dev port 4332 (`/region.html`). Runs full-screen in an iframe inside the Plajah React app (`components/games/IframeGameFrame.tsx`) or in its own window.

## Render chain (per frame)
`EffectComposer`: RenderPass (depth texture on renderTarget2) → `AoPass` (screen-space occlusion) → UnrealBloom → cinematic pass (speed blur, sun shafts, fringing, vignette, grain) → grade/LUT → output. Option: CSM shadows (3 cascades) else single sun shadow. PCFSoft. ACES tone mapping.

## Content that costs
- ~9.5–11k instanced buildings with per-model textures (many texture binds, slow load; `cityVisibility` culls).
- Terrain: 6 m height grid, mesh stride 2 (12 m verts), large ground albedo, custom shader uniforms.
- Vegetation (`src/vegetation.ts`, 4 draw calls) + grass/tree fields (EzTree cards/3D).
- Sim layer (`src/simLayer.ts`): cars, trains, planes. Traffic + AI racers (`openWorldEvents.ts`, `racingAI.ts`).
- Water/river reflections, rain lens, weather, road-wet shader.

## Already done (2026-11-17)
1. Host app is removed from layout/paint (`#root{display:none}`) while the game overlay is open; overlay is a portal to `body`. Likely cause of "a few fps in-page".
2. **Dynamic resolution governor** in `region.ts` (`governFrames`, `applyRenderScale`): averages 45 frames, steps render scale 0.5–1.0 (pixel ratio × scale) to hold `TARGET_MS`. `?tv=1` (or `localStorage apex.tv=1`) = 30 fps cap, pixel ratio 1, start at 0.75. State exposed as `window.govState`.
3. Handling changes (not perf): brake pedal ramp, stronger brake force, softer brake assist, quicker steering response, player↔AI/traffic collision (`carHit`).

## How to measure (do this first)
- `frameProfiler` (`src/frameProfiler.ts`) exposes per-frame CPU/GPU split; `regionViewer.renderer.info` gives `calls`, `triangles`, `textures`, `programs`.
- Chrome `chrome://gpu`, Performance panel, and `EXT_disjoint_timer_query_webgl2` for per-pass GPU ms. Toggle passes (`fxOn`, `aoPass.enabled`, bloom, cine) to attribute cost.
- Test both: in-iframe and standalone, at 1080p and 1440p, in city centre, on the highway, and on the cliff raceway.
- Report numbers before and after every change: draw calls, triangles, GPU ms by pass, JS ms/frame, GC pauses.

## Tasks, in suspected order of payoff
1. **Per-pass GPU budget**: AoPass and bloom at full res are likely the biggest. Run AO at half res with depth-aware upsample (or GTAO half-res), bloom on a mip chain from a half-res buffer, merge cine+grade+output into one fullscreen pass. Replace MSAA `antialias:true` + post chain with FXAA/SMAA/TAA on the composed image (MSAA on a composer target is wasted).
2. **Draw calls / state changes**: texture-array or atlas the per-model building textures; merge static city into chunked `BatchedMesh` / merged instanced chunks with frustum + distance culling per chunk; keep < ~1500 calls.
3. **Shadows**: 3 CSM cascades re-rendering the city is expensive. Cascade 0–1 only dynamic; far cascade baked/static, update every N frames; cull casters per cascade; shadow map 2048→1024 for far cascades.
4. **LOD / impostors**: building LODs beyond ~400 m (box + baked facade), impostors for trees beyond ~150 m, terrain clipmap/geo-mip near the camera with finer mesh only close.
5. **Streaming**: chunk buildings and textures so load does not freeze (currently minutes in the preview pane); decode textures off-thread (`createImageBitmap`), KTX2/Basis compressed textures to cut VRAM and bandwidth (important for iGPU).
6. **Fill-rate**: cap overdraw from alpha cards (grass, trees); alpha-to-coverage or dithered; early-Z; lower shader cost of the terrain material (texture fetch count, derivative-heavy noise).
7. **CPU**: avoid per-frame allocation, move sim (traffic/trains/planes) to staggered updates or a worker, update far cars at 10 Hz.
8. **Tiers**: `low` (TV/iGPU), `mid`, `high` presets selected from the first seconds of frame time + `renderer.capabilities`; the governor handles the rest.

## Visual standard (must not regress)
The 17 reference shots in `docs/apex-elohim/reference-scenes.md`; benchmark art `docs/kith-party/kith-racing-benchmark.jpg`. Keep: ACES + cinematic grade, soft sun shafts, wet-road reflections, readable silhouettes at speed, dense lived-in city (parking, streets, traffic), vegetation density.

## Constraints
Browser only (WebGL2, no WebGPU requirement; WebGPU path welcome behind a flag). No server-side rendering. Must also run inside the iframe. Do not remove features; make them cheaper or scale them down by distance/tier. Return diffs scoped to files, with before/after measurements.
