# Apex: moving to the WebGPU renderer (step 5 of the graphics roadmap)

Written 2026-11-17 after an audit of the game code and a first spike on the Intel Arc.

## What the move involves
The game runs on three's `WebGLRenderer`. three's `WebGPURenderer` (`three/webgpu`, falls back to WebGL2 by itself) only draws node materials, so everything hand-written in GLSL must be rewritten in TSL:

| Kind | Count | Where |
|---|---|---|
| `onBeforeCompile` shader patches | ~23 | terrain + roads (region.ts, 10), car paint (scancar.ts), trees, grass, vegetation, dunes, atmosphere |
| `ShaderMaterial`s | ~20 | AO + atmosphere + motion blur (ao.ts), grade, sky, spray, water, weather |
| EffectComposer passes | 8 | render, AO/atmosphere/blur, bloom, cinematic (speed blur, shafts, lens rain), output, grade, SMAA, bokeh |

About 25,700 lines of game code; Ravencrest already runs on `three/webgpu` + TSL, so the patterns exist in this repo (its fog, grass, foliage, materials, post).

## Spike result (webgpu-spike.html)
Real terrain + all 9,467 city buildings as one instanced draw, sun shadow, height fog, bloom, flying over downtown:
- WebGPU backend: 16.6 ms median (60 fps, vsync-bound), 17 draw calls, 0.75 M triangles.
- Same renderer forced to WebGL2: 16.7 ms median, the same.

**Finding:** with the world batched into a few draws, *both* APIs hold 60 fps on the Arc with room to spare. The game is slow because of how it is drawn (hundreds to thousands of draw calls, per-model textures, CPU visibility work), not because it is WebGL. WebGPU's real gains come later: GPU-side culling and compute (grass, trees, traffic, particles) that WebGL cannot do.

## Recommended order
1. **Batch the city first (WebGL, now):** per-model buildings into a few draws with texture arrays (or atlases) + per-instance material index; trees and props the same way. This is most of the remaining frame time and carries straight over to WebGPU.
2. **Rewrite shaders as TSL behind one material factory** (terrain, road, car paint, foliage, water, sky), keeping a GLSL path until each is done; test each in the spike page first.
3. **Post chain as a TSL `PostProcessing` graph** (AO + atmosphere + motion blur in one node, bloom, grade, SMAA/TRAA).
4. **Switch `region.ts` to `WebGPURenderer`** once 2 and 3 cover everything; keep `?webgl=1` (`forceWebGL`) for comparison and for browsers without WebGPU.
5. **GPU-driven extras:** compute culling for instanced sets, compute grass/particles.

## How to run the spike
Dev server (`preview: forth-horizon`, port 4332): `/webgpu-spike.html` (WebGPU) and `/webgpu-spike.html?webgl=1`. The HUD shows backend, frame time, draw calls and triangles.
