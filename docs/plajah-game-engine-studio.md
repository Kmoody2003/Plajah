# Plajah Game Engine & Studio Architecture (Phases 1–4 Blueprint)

**Status:** Implemented foundation across Phases 1–4 (`playkit/`, `services/gamestudio/compiler/`, `services/gamestudio/pipelines/`, `services/argilla/poly/subd.ts`, `services/cad/nurbs.ts`, `playkit/render/`, `services/gamestudio/ariaAgent.ts`).
**Scope:** Unified engine and production pipeline for **all Plajah games** — first-party titles (**Rift Realm**, **Era Clash 3D**, **Ravencrest**, **Kith Party**, **Kith Quest**, **Firstlight**, **Live Party & Parlor Games**, **Evite Play Gates**) and **third-party creator games** on the platform.

> **Core Platform Rule (from `packages/first-party-games/docs/shared-primitives.md`):**
> Zero `if (isFirstParty)` branches. Every capability built for a first-party Plajah title ships through the public `playkit` registry and Studio pipeline so creators on the platform inherit the exact same power.

---

## 1. Architectural Overview

```
                      ┌──────────────────────────────────────────────────────────┐
   Idea / Brief /     │       Aria Production Agent (services/gamestudio/        │
   Image / CAD / ───▶ │       ariaAgent.ts) — Semantic Router + QA Gate + Ops    │
   Creator Plugins    └───────────────────────────┬──────────────────────────────┘
                                                  │
          ┌───────────────────────┬───────────────┴───────────────┬──────────────────────┐
          ▼                       ▼                               ▼                      ▼
  ┌───────────────┐     ┌───────────────────┐          ┌─────────────────────┐   ┌──────────────┐
  │  Pipeline 1   │     │    Pipeline 2     │          │     Pipeline 3      │   │  2D / Party  │
  │   Organics    │     │    Vegetation     │          │ Architecture + CAD  │   │  & Parlor    │
  │ anatomy.ts +  │     │  species.ts (10+) │          │  bim3d.ts + rooms   │   │  mode2d.ts + │
  │ morphDrivers  │     │  crown normal xfer│          │  interiors + NURBS  │   │  parlor.ts + │
  │ drape/gpu.ts  │     │  wind + impostors │          │  SubD + hardSurface │   │  3D Stage    │
  │ Prop Classes  │     │                   │          │  vehicles/machines  │   │  Overhauls   │
  └───────┬───────┘     └─────────┬─────────┘          └──────────┬──────────┘   └──────┬───────┘
          └───────────────────────┴───────────────┬───────────────┘                     │
                                                  ▼                                     │
                 ┌─────────────────────────────────────────────────────────────┐        │
                 │  Phase 2: Studio Asset Compiler (gamestudio/compiler/)      │        │
                 │  Retopo & LOD0/1/2 · High→Low Normal/Curv/AO/SSS Bake ·     │        │
                 │  Albedo Delighter · PBR Material Substitution ·             │        │
                 │  In-Studio Ray-Traced Lightmap & SH Irradiance Probe Baker  │        │
                 └────────────────────────────┬────────────────────────────────┘        │
                                              ▼                                         │
                             Compiled Typed Prefab (`plajah.prefab`)                    │
                                              │                                         │
                                              ▼                                         ▼
       ┌─────────────────────────────────────────────────────────────────────────────────────┐
       │             Phase 1 & 4: Unified `playkit/` Cross-Platform Runtime                  │
       │  Registry (Creator Extensible) · Fixed-Step Loop · Unified Touch/Gamepad/KB Input · │
       │  3D Physics (Rapier/Jolt Adapter + Vehicle + Ballistics) · 2D Platformer Physics ·  │
       │  Rhythm Clock · Platform Bridge (XP/Achievements/Sessions) ·                        │
       │  WebGPU/TSL Render Stack (Clustered Forward+, SH Probes, Parallax Box Refl,         │
       │  Detail Normals, SSS, Aniso Hair, POM, Decals, Froxel Fog, GPU Culling, GTAO/FSR1)  │
       └─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Solving "Never Lay Textures Flat" (The 4-Stage Asset Contract)

Flat image projections on primitive boxes fail up close and break dynamic lighting. Every image-based or prompted asset passes through four enforced stages:

1. **Semantic Decomposition (Before Geometry):** Aria classifies input into `organic`, `vegetation`, `architecture`, `hard-surface`, `2d-sprite`, or `parlor-stage` and breaks it into functional sub-parts rather than one monolithic mesh.
2. **Implied Geometry Reconstruction:**
   - **Buildings:** Never an extruded textured cube. `architecturePipeline.ts` infers story count, structural bays, recessed window/door openings, rooflines, **and a complete walkable interior floorplan** (rooms, interior walls, code-checked ≥ 0.9 m × 2.1 m doorways, stairs, furniture socket slots, room light/reflection probes) compiled through Plajah's real `services/cad/bim3d.ts` (`bimTo3D`) into IFC-classified 3D geometry.
   - **Vehicles, Machines, Tools, Furniture:** Decomposed into articulated sub-assemblies (chassis, doors, wheels, axles, hinges, controls) authored with **Catmull-Clark SubD + Edge Creases** (`services/argilla/poly/subd.ts`) and **NURBS / B-Rep** (`services/cad/nurbs.ts`), with explicit physics joints.
   - **Organics:** Inside-out anatomy (`services/argilla/creature/anatomy.ts`) → Argilla sculpting → pose-space muscle/wrinkle morph drivers (`playkit/character/morphDrivers.ts`) + WebGPU compute cloth (`services/soft/drape/gpu.ts`) + typed **Socketable Prop Classes** (`playkit/character/organicRig.ts`).
   - **Vegetation:** Parametric space-colonization + Leonardo pipe-model growth (`services/vegetation/species.ts`) across a 10+ species multi-biome catalog (`vegetationPipeline.ts`), with **3D Crown Normal-Transfer** so foliage cards light as cohesive 3D volumes, plus wind encoding and octahedral impostors.
3. **Retopo, LODs & High-to-Low Map Baking (`services/gamestudio/compiler/`):**
   - `retopoLod.ts` generates LOD0 / LOD1 / LOD2 meshes with smooth normals, tangent frames, and manifold/watertight checks.
   - `mapBaker.ts` bakes Tangent-Space Normals, Curvature, Cavity/AO, and Thickness (for SSS) into packed `ARD` (AO/Roughness/Displacement) maps.
   - `lightBaker.ts` runs in-studio ray-traced baking (CPU BVH + WGSL WebGPU compute shader) to produce **L2 Spherical Harmonics (9-coeff RGB) Irradiance Probes**, **Lightmaps**, and **Parallax-Corrected Box Reflection Probes**.
4. **Albedo Delighting & Material Graph Substitution:**
   - Strips baked directional light/shadows out of photo/art textures and blends high-frequency tileable KTX2 PBR materials using baked Curvature & AO masks (edge wear on exposed corners, grime/moss in crevices) plus distance-blended **Micro-Detail Normals**.

---

## 3. Technical Decisions: NURBS, Physics, Ray Tracing & Real-Time Graphics

| Question | Decision | Implementation |
|---|---|---|
| **NURBS in Modeler?** | **Yes for Vehicles, Weapons, Armor, Architectural Curves** — paired with **Catmull-Clark SubD + Edge Creases** for organic-hard-surface hybrids. Always tessellated to curvature-adaptive LOD meshes + clean UVs for runtime (never evaluated live per frame). | `services/argilla/poly/subd.ts` (SubD + creases on `PolyMesh`) + `services/cad/nurbs.ts` (rational B-spline curves/surfaces, loft/revolve/sweep, curvature-adaptive tessellation, `BRepKernelAdapter` for `opencascade.js` / `Manifold` WASM). |
| **Proper Physics Runtime?** | **Yes — mandatory across all games.** Pluggable WASM backend adapter (Rapier3D / Jolt WASM) + built-in deterministic fallback supporting rigid bodies, sleeping islands, swept-sphere CCD, joints, **4-wheel raycast vehicle suspension** (Kith Racing / Apex), **ballistic spin/Magnus trajectories** (Firstlight / Kith Tennis), and **2D deterministic platformer/slope physics** (Kith Quest). | `playkit/physics/runtime.ts`, `playkit/physics/physics2d.ts`, plus `services/soft/drape/gpu.ts` for WebGPU compute cloth and `playkit/character/organicRig.ts` (DQ skinning + pose-space muscle morphs + soft-tissue spring chains). |
| **Built-In Ray Tracing?** | **In-Studio Baking: YES. Realtime Gameplay: NO.** Browser WebGPU does not expose hardware RT cores cross-platform. Ray-traced GI lightmaps and SH irradiance probes baked in the Studio deliver ray-traced lighting quality at 60 fps on desktop, Arc iGPUs, and mobile phones (Z Fold 7). | `services/gamestudio/compiler/lightBaker.ts` (CPU BVH + WGSL compute path-tracing baker). |
| **Must-Have Real-Time Graphics** | Extend `era-clash-3d`'s proven `GTAO + SSR + TRAA + FSR1 + CSM + Godrays + 3D LUT + KTX2` stack with **Clustered Forward+ Lighting (256 lights)**, **L2 SH Irradiance Probes + Parallax Box Reflection Probes**, **Dual-Scale Micro-Detail Normals**, **Skin/Foliage SSS + Anisotropic Hair**, **POM**, **Instanced Decals**, **Froxel Volumetric Fog**, and **GPU-Driven Frustum/Hi-Z Culling**. | `playkit/render/{clusteredLights,probesGi,pbrAdvanced,decals,froxelFog,gpuCuller,pipeline}.ts`. |

---

## 4. Folding In All Plajah Game Verticals (3D, 2D, Sports, Party & Parlor)

| Plajah Vertical | Shared Playkit Modules Used | Visual Overhaul Path |
|---|---|---|
| **3D Action / Shooters / Fighters** (Rift Realm, Era Clash 3D, Ravencrest) | `playkit/core`, `input`, `physics/runtime`, `audio/rhythmClock`, `character/organicRig`, `render/pipeline`, `platform/bridge` | Immediate Clustered Forward+, Probes/GI, SSS, Decals, Froxel Fog, and compiled Prefabs. |
| **Kith Party 3D** (Kart Racing, Tennis, Kombat) | `physics/runtime` (4-wheel suspension + drift + tennis Magnus spin/bounce), `input` (tap queues), `audio/rhythmClock`, `render/pipeline` | Upgrade courses with Vegetation Pipeline + Architecture Pipeline + PBR Detail Normals. |
| **Kith Quest (2D Side-Scroller)** | `physics/physics2d` (coyote time, jump buffer, slopes, wall slide/jump, bash), `modes/mode2d` (layers, camera, sprites, juice), `input` | Seamless 2D & 2.5D lighting/bloom/particle upgrade while preserving deterministic `1/120 s` sim. |
| **Firstlight (3D Sports / Football)** | `physics/runtime` (spiral ballistic pass + wind + tackle impulses), `character/organicRig` (pads/helmet Prop Classes + muscle morphs), `architecturePipeline` (stadium concourse/suites), `render/decals` (field paint/scuffs) | Stadium interiors, real crowd instancing via `gpuCuller`, and baked stadium probe GI. |
| **Live Party & Parlor Games** (Brain Rush, Crowd Says, Impostor Night, Sketch Rush, Evite Play Gates) | `modes/parlor` (phase machine, secret isolation, scoring, leaderboards), `modes/mode2d` (Motion Council `spring(320,28)` juice + reduced-motion twin), `platform/bridge` | Plug into **Parlor 3D Stage Themes** (`render/pipeline` parlor preset) so trivia/impostor/crowd rooms run inside lush 3D/2.5D animated broadcast venues without rewriting game rules. |
| **Third-Party Creator Games** | `playkit/core/registry` (`registerPlugin`, `registerPrefab`, `registerBehaviour`, `registerGenreTemplate`, `registerParlorGame`) + Aria Skill API | Creators extend every pipeline, shader preset, and genre template using the exact same contracts. |

---

## 5. Phased Implementation Map

- **Phase 1 — Unified `playkit/` Runtime Foundation:** `playkit/{index.ts, core/registry.ts, core/engine.ts, input/unifiedInput.ts, physics/runtime.ts, physics/physics2d.ts, audio/rhythmClock.ts, platform/bridge.ts, modes/mode2d.ts, modes/parlor.ts, character/organicRig.ts}`.
- **Phase 2 — Studio Baking & Asset Compiler:** `services/gamestudio/compiler/{schema.ts, retopoLod.ts, mapBaker.ts, lightBaker.ts}`.
- **Phase 3 — Modeler Upgrades & 3 Specialized Pipelines:** `services/argilla/poly/subd.ts`, `services/cad/nurbs.ts`, `services/gamestudio/pipelines/{organicPipeline.ts, vegetationPipeline.ts, architecturePipeline.ts}`.
- **Phase 4 — Next-Gen Real-Time Render Stack & Aria Production Agent:** `playkit/render/{clusteredLights.ts, probesGi.ts, pbrAdvanced.ts, decals.ts, froxelFog.ts, gpuCuller.ts, pipeline.ts}`, `services/gamestudio/ariaAgent.ts`.

---

## 6. Verification & Canon Quality Gates

Every module is covered by strict TypeScript checking (`tsconfig.playkit.json`) and automated unit tests:
- `tests/playkitEngine.test.ts` (Phase 1 runtime, physics 3D/2D, vehicles, ballistics, parlor, 2D mode, registry extensibility, organic rig & prop sockets)
- `tests/studioCompilerPipelines.test.ts` (Phases 2 & 3 compiler, retopo/LOD, map baker, light/SH probe baker, SubD+creases, NURBS, organic/vegetation/architecture+interiors pipelines)
- `tests/playkitRenderAndAria.test.ts` (Phase 4 clustered lights, SH probes, decals, froxel fog, GPU culler, render tiers, and Aria end-to-end production orchestration)
