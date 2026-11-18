# Atmosphere prototype — 2026-11-17

Implemented in `games/forth-horizon/src/atmosphere.ts`. Integration in `region.ts` is opt-in with `?atmosphere=1`; omit it or use `?atmosphere=0` for the unchanged baseline. No resolution, culling, shadow or performance-governor settings were changed.

The shader integrates exponential height density along the view ray, adds bounded sun-facing tint, and retains existing far-fog coverage. Near-horizontal rays use a stable series limit. World position is reconstructed from the actual model-view vertex, including instancing. Map mode uses the original fog. Existing material compile hooks/cache keys are composed; Three's global shader chunks are not mutated. No extra framebuffer, texture lookup or fullscreen pass is added.

## Verified

- Three focused tests pass: numerical integration against quadrature; material-hook preservation/idempotence; map bypass/camera uniforms.
- Game TypeScript check passes at the checked shared revision.
- Production Vite build passes, with the existing large-bundle warning.
- Asset-free browser fixture at `http://127.0.0.1:4332/atmosphere-review.html` compiles and renders on the local Intel Arc adapter (ANGLE D3D11), with no captured shader errors. On/off screenshots visibly show distance contrast loss and low haze. The fixture uses instanced geometry.

The diagnostic FPS fluctuated with browser interaction/background scheduling (a sample reached 60, others were lower). This is not an attributable GPU benchmark and is not evidence the full game reaches 60 FPS.

## Still required before enabling by default

The full-game tab intermittently stalled and one capture was black; no reliable driving-view A/B or incremental GPU timing was obtained. Captured warnings concerned textures without image data. Cause was not isolated. Keep this experiment opt-in.

Custom water/sky/particle ShaderMaterials are deliberately excluded from the generic material hook. Their atmosphere must be matched before visual acceptance; otherwise water and horizon seams are possible. The density is an artist-tuned exponential approximation, not a full multiple-scattering atmosphere. Below-lake segments use endpoint-clamped heights; normal above-lake camera/surface segments use the analytic integral.

Newly streamed materials are discovered every 1.5 seconds in the opt-in mode. This may cause a brief shader compilation or fog transition; production integration should patch them during creation/loading before warmup, rather than traverse during gameplay. Benchmark the traversal too. No claims of zero runtime cost.

Next: match sky/water treatment, patch at material creation, then compare fixed city/raceway cameras and moving foliage/fences at identical internal resolution using Gemini's per-pass timing. Do not enable the experiment based on the fixture alone.
