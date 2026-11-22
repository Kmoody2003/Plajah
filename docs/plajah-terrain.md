# Plajah Terrain — plan (`services/terrain`)

Kenne, 2026-11-22: "can our vegetation system reach their level … and Vue terrain capability, how could we build similar
capability into our own stack." e-on's Vue / PlantFactory / PlantCatalog are now free (Bentley, 2024) but closed and frozen
(last stable 2023, 2024 beta, security patches only). We build our own, the way `services/vegetation` is our PlantFactory:
**`services/terrain` is our Vue** — land shaped by erosion, materials painted by the land, and an EcoSystem that places
every tree, plant and fungus by ecology rules. Runs in the browser (WebGPU / TSL compute), shared by every Plajah game and
by Tela / Game Studio.

## Why

- Noise alone reads as noise. Erosion is what makes ground look like land: drainage channels, fans, talus, sharp ridges.
- Its by-products — **flow, wetness, sediment, deposition** — are the maps everything else needs: where rivers run, where
  moss grows, where ferns crowd and pines thin out. One set of maps ties terrain, water and vegetation into a living level.
- Today each game writes its own height function (Rift Realm `world/layout.ts` `worldHeight`, Era Clash, Ravencrest,
  Kith). Placement is hand-written per level (`cyberforest.ts`). Nothing is shared and nothing erodes.

## What exists to build on

| Piece | Where | Keep / change |
|---|---|---|
| Baked height grids (2 m world, 1 m core), `surface()` / `normal()` / `heightAt()` with caves | `games/rift-realm/src/world/terrain.ts` `WorldTerrain` | Generalise into the service's `HeightField`; caves stay a game-side overlay |
| 100 m chunks × 3 detail levels with skirts | same file, `TerrainChunks` | Move to the service; add GPU-displaced chunks later |
| Collision `TerrainField` interface (height field + trunk grid) | `games/rift-realm/src/collision.ts` | The service implements it |
| Grass ground bake (height / cover / trample) | `services/vegetation/grass/ground.ts` | Takes `cover` from the EcoSystem instead of a hand function |
| Instanced forest, plants, fungi fields with LODs + impostors | `services/vegetation/*` | EcoSystem emits their instance lists |
| Apex water in TSL (rivers, pools, falls) | Rift Realm (f09d3740) | Rivers follow the flow map instead of hand curves |

## Architecture

```
services/terrain/
  field.ts        HeightField: grid storage (f32 CPU + GPU storage buffer), sample/normal/slope, tiles, save/load
  noise.ts        GPU noise (simplex / value / cellular, fBm, ridged, domain warp) — TSL ports of FastNoiseLite (MIT) maths
  graph.ts        Terrain graph: nodes (noise, combine, mask, curve, terrace, carve-path, stamp, erode, smooth) → one bake
  erode/
    hydraulic.ts  particle (droplet) erosion on GPU — after SimpleHydrology (MIT); outputs height + flow + sediment
    pipe.ts       grid "virtual pipes" shallow-water erosion for big rivers / lakes
    thermal.ts    talus slip (angle of repose) for scree and cliffs
  maps.ts         derived maps: slope, curvature, flow accumulation, wetness, deposition, occlusion, sun exposure
  material.ts     TSL splat material driven by the maps (rock on steep, scree under cliffs, mud in channels, moss where wet)
  eco/
    rules.ts      EcoSystem rules: per species → height / slope / wetness / exposure / distance-to-water / density curves
    scatter.ts    GPU scatter (blue-noise + rule weights + spacing/competition) → instance lists per tile
    layers.ts     layering: canopy first, then understory reads canopy shade, then ground cover reads both
  stream.ts       tile streaming for very large worlds (bake/load tiles round the camera, detail rings, eviction)
  author.ts       keep-outs and pins: authored places (plazas, arenas, paths) are flattened / protected from erosion
```

Inputs a game supplies: a terrain graph (or its existing height function as one node), authored places (pins / paths /
keep-outs), and species rules. Outputs: `HeightField` + maps, the chunked mesh + material, collision, and instance lists
for `services/vegetation`.

## The four capabilities (Vue → ours)

1. **Procedural land.** GPU noise with fBm / ridged / warp, terraces, stamps (crater, mesa, gorge), path carving (rivers,
   roads, maze corridors). The graph is data (JSON), so Game Studio and Tela can edit it.
2. **Erosion.** Hydraulic droplets (tens of thousands per pass, WebGPU compute) + thermal slip, a few seconds for 2 km at
   2 m on the device; heavier presets bake offline once and ship as a texture. Authored places are masked so the plaza
   floor stays flat while the hills round it erode.
3. **Materials from the land.** One TSL material blends 6–8 PBR sets by slope / height / wetness / flow / deposition with
   height-blended transitions and triplanar on cliffs. Free CC0 sets (Poly Haven, ambientCG) as today.
4. **EcoSystem.** Each species gets ecology curves (it likes 20–300 m, slope < 25°, wet, shaded…). Scatter runs on the GPU
   per tile, canopy first, understory reads canopy shade, ground cover last; competition keeps spacing natural. Output
   goes straight into the existing forest / plant / fungi / grass fields. Rift Realm's 20 000 trees, 19 000 plants and
   4 200 fungi come from rules instead of hand lists.

Also in scope later: the spectral sky (Bruneton precomputed scattering, BSD, or Hillaire's model) and volumetric clouds as
a `services/terrain/sky` or a sibling service; Rift Realm's nebula sky stays its own.

## Phases

| # | Phase | Done when |
|---|---|---|
| 1 | `HeightField` + chunks + collision moved out of Rift Realm into the service; Rift Realm uses it unchanged | Elderwood Wilds plays identically; tests sample heights against the old bake |
| 2 | GPU noise + terrain graph; Rift Realm's `worldHeight` becomes the graph's base node | Same world from the graph; a second sample world from pure graph |
| 3 | Hydraulic + thermal erosion with authored-place masks; flow / wetness / deposition maps | Erosion of the Wilds outside the places; depth-score of the Gorge and Glowcap Stream shots improves (`scripts/riftrealm/wilds_depth.py`) |
| 4 | Map-driven material | Cliffs, scree, mud channels and moss read from the maps; no per-level material code |
| 5 | EcoSystem rules + GPU scatter feeding `services/vegetation` | Elderwood's placement lists replaced by rules; counts and frame time within 10 % of today |
| 6 | Tile streaming beyond 2 km (4–8 km worlds) | Walk 8 km without a hitch; memory flat |
| 7 | Node editor in Game Studio / Tela over the terrain graph and eco rules | Kenne edits a world visually and plays it |
| 8 | Adopt in Era Clash, Ravencrest, Kith; sky service | Each game's own height code deleted |

**Phase 1 done (2026-11-22):** `services/terrain/field.ts` (`HeightGrid`, `HeightField` with detail regions, `ColumnGrid`,
the `TerrainField` interface) and `services/terrain/chunks.ts` (streamed chunks with options for detail, holes, LODs).
Rift Realm's `world/terrain.ts` is now the Wilds' settings on top (regions, caves, holes, ground material) and
`collision.ts` takes `TerrainField` from the service. `tests/terrainService.test.ts` checks 20 000 points against the
old sampler (0 m difference); in the browser the old and new modules give identical heights and identical chunk meshes
(400 chunks, same vertex and index counts).

**Phase 2 done (2026-11-22):** `noise.ts` (integer-hashed value / gradient / cellular noise, fBm / ridged / billow),
`graph.ts` (the terrain graph as JSON: noise, warp, combine, scale, mix, curve, terrace, clamp, mask, radial stamps, carved
paths, distance, and `fn` for a game's own height code; validation + CPU compile), `gpu.ts` (the same graph as a TSL
compute bake; `bakeRegion` falls back to the CPU for `fn` graphs), `HeightField.bakeAsync`. Rift Realm's height is now
`WILDS_GRAPH` (one `fn` node over `worldHeight`, identical output). `presets/highlands.ts` is a world made only from the
graph. In the browser the GPU bake matches the CPU to 0.7 mm over 251 001 samples and takes ~0.6 s against ~5 s on the CPU
(2 km at 4 m); picture: `docs/plajah-terrain/highlands-phase2.jpg`.

**Phase 3 (2026-11-22): CPU erosion, baked offline; GPU erosion and the art check still to do.**
`erode/hydraulic.ts` (droplet erosion in scaled cell units, deterministic per seed, protect mask), `erode/thermal.ts`
(talus slip), `erode/index.ts` (`erodeGrid`, change clamped by maxCut / maxFill, presets `light` and `weathered` tuned on
the Highlands), `maps.ts` (slope, D8 flow accumulation, wetness, downsample), `raster.ts` (the `.ptrs` file: int16
heights at 1 cm, uint8 maps) and a `raster` graph node (CPU only for now). `scripts/terrain/bakeWildsErosion.ts` erodes
the Wilds at 2 m in ~35 s and writes `public/games/rift-realm/assets/terrain/wilds-erosion.ptrs` (2.8 MB: the height
change at 2 m; flow, wetness and deposition at 4 m). Protected: the hollow, every place, the river and stream corridors,
the trails (80 %), standing water. Mean change: mountains 6.4 m, escarpment 6.1 m, Highland 1.6 m, plateau 0.7 m, vale
0.7 m; the hollow 0 m, places ≤ 2 cm (at the edge of their protected zone). Before | after:
`docs/plajah-terrain/wilds-erosion-phase3.png` (protected areas tinted red, the biggest drainage in blue).
Rift Realm: **opt-in with `?erosion=1`** (`preloadWildsTerrain()` via the level module's `preload`; `WorldTerrain.bake()`
uses `WILDS_ERODED_GRAPH` = worldHeight + the baked change; `wildsMaps()` hands the maps to phase 4). Still open: erosion
on the GPU (so worlds can erode on the device), and scoring the Gorge / Glowcap Stream shots against the art
(`scripts/riftrealm/wilds_depth.py`) with erosion on, before making it the default. The play server on 4358 needs a
restart to serve the new `.ptrs` file.

**Phase 4 done (2026-11-22):** `material.ts` paints the ground from a level's layer stack: each layer is a look
(colour, roughness, glow) plus a rule of smoothstep ranges over steepness (`up` = |normal.y|), height and — with an
erosion bake — wetness, flow and fresh sediment (`wet`, `flow`, `dep`), mixed in order. Map layers drop out when no bake
is loaded, so a level looks exactly as before without one. Rift Realm's ground (`world/terrain.ts` `terrainMaterial`)
is now only layers: moss (with its glow) · wet moss · scree · rock · channel mud · waterline mud; the blend code is the
service's. Thresholds from the bake's percentiles (wet top ~8 %, channels top ~4 %). Rendered check, plain vs
`?erosion=1`: `docs/plajah-terrain/wilds-material-phase4.jpg` (gullies and a scree fan on the mountain, notched Gorge rim).
Far detail: chunks beyond 480 m are meshed at 12.5 m, so the material can shade from the height field instead
(`normalField`: the baked 2 m world grid as a mipmapped two-channel normal texture; the moss detail normal rides on top;
the hollow's 1 m chunks keep their mesh normals). On for the Wilds with `?erosion=1`. At ~800 m the gullies stay sharp
where mesh normals blur them: `docs/plajah-terrain/wilds-far-normals.jpg`. Not yet seen in the real game with its
lighting, fog and wet pass.

**Phase 5 done (2026-11-22).**
`eco/index.ts` places life by rules. **Canopy** rules compete for one jittered candidate grid: the species is picked by
weight × suitability and kept by density, which can vary by region. **Around** rules grow from placed trees: ferns at a
redwood's roots, shelf fungi up a trunk. **Ground** rules scatter on their own grids. Suitability multiplies smoothstep
ranges over height, steepness, wetness, flow, fresh sediment and clearance, times a region mask; a per-point memo lets
rules share derived values. It is deterministic for a seed and runs on the CPU in ~0.35 s for the whole Wilds (GPU
scatter not needed at this size). `games/rift-realm/src/world/eco.ts` writes world/index.ts's forest as rules
(`WILDS_ECO`, `scatterWilds`). With `?erosion=1`, trees thin on scree and in channels, ferns crowd the wet ground and
glowcaps follow the channels. `scripts/terrain/compareWildsEco.ts` replicates the hand loops:

| | Hand-written | Rules | Rules + erosion |
|---|---|---|---|
| Trees | 20,152 | 20,056 (−0.5%, same species mix) | 18,161 |
| Plants | 25,055 | 24,251 (−3%) | 23,027 |
| Fungi | 7,097 | 6,889 (−3%) | 6,637 |

The placement map (hand | rules | rules + erosion) is `docs/plajah-terrain/wilds-eco-phase5.png`. The forest
session swapped them into world/index.ts and made the rules the default (`?eco=0` brings back the hand loops; it ships
with that session's commit). Same-camera A/B captures show the same forest. The frame-rate check, fps median (min) and
draw calls:

| Shot | Hand | Rules |
|---|---|---|
| portal-plaza | 11.4 (9.8), 54k | 9.1 (8.6), 43k |
| mangrove-mire | 11.8 (9.7), 57k | 11.8 (10.4), 45k |
| eh08-atmosphere | 9.8 (7.9), 59k | 11.0 (9.3), 47k |

That is within noise, with ~11k fewer draw calls under the rules. The ~10 fps itself is a separate whole-level problem
(~13 M triangles, ~50k draw calls).

**Phase 6 done (2026-11-22), shown on a sample world; no game uses it yet.** `stream.ts` streams the ground:
- **`StreamedHeightField`** bakes the whole world once at a coarse cell (8 km at 16 m, 501²) as the far grid and
  fallback. Fine 200 m tiles at 2 m are baked round the player, nearest first, within a per-frame budget: 16 samples at
  a time on the CPU, or whole tiles on the GPU through `bakeTile`. Tiles beyond 1.35 × radius are evicted.
  `surface()` never calls the slow graph.
- **`StreamingChunks`** keeps meshes within view distance (1.8 km): a time-budgeted build, rebuilds when a fine tile
  lands, drops chunks left behind. Normals come from the sampled grid.
- **`gpu.ts`** now caches one compiled kernel per graph and grid size; the tile corner is a uniform. Before this, each
  tile compiled its own shader, which stalled streaming.
- **`presets/expanse.ts`** is an 8 km sample world: ranges, valleys, a mesa plateau and a river.

Results:
- **10 km walk in node** (`scripts/terrain/streamWalk.ts`, 12 m/s, CPU baking): flat at ~3.9 MB of field, ~55–67
  tiles and ~1,100 chunks the whole way; the player is never on coarse ground. Terrain work per frame was 3.8 ms median
  and 9 ms p99 on a quiet run. Spikes (p99.9 18 ms and up) track GC and the machine being at 100 % CPU from other
  sessions.
- **10 km flight in the browser** (GPU-baked tiles, 80 m/s): peak 69 tiles, 4 MB, 1,101 chunks; 443 tiles baked and
  394 evicted. The far grid took 2.2 s and spawn 4.9 s. Terrain work was 3.1 ms median and 28 ms p99. Frame times were
  not meaningful because the pane was hidden. Picture: `docs/plajah-terrain/expanse-stream-phase6.jpg` (fog-washed).

Not done: hitch-free frame timing on a visible, quiet machine; a game using it (the Wilds are 2 km and bake whole).
Next for this phase: build meshes off the main thread in a worker, and streamed vegetation.

Order matters: 1 is pure refactor and unlocks everything; 3 (erosion) is the biggest visual jump; 5 is where it becomes
"a living ecosystem".

## Vegetation gaps to close alongside (PlantFactory parity)

From `services/vegetation`'s own art scores: willow strands, mangrove prop roots, twisted / buttressed trunks are missing
grower forms; no seasons or age; no per-instance seed variants; no visual node editor for species. Seed variants are
cheap (the grower already takes parameters) and go with phase 5; the rest is its own vegetation track.

## Licences

Only permissive code or our own: FastNoiseLite (MIT), SimpleHydrology (MIT), terrain-erosion-3-ways (MIT), Bruneton
(BSD), ez-tree (MIT). Read papers, not GPL code (same rule as Weber–Penn vs Arbaro). No Vue / PlantFactory / PlantCatalog
assets in the stack: free to use, but derived-content resale limits and closed formats make them a poor foundation.

## Coordination

The Rift Realm forest session (Elderwood Wilds, `games/rift-realm/src/world/*`) owns the world today. Phase 1 moves its
terrain code, so it starts only when that session is idle and its work is committed; Rift Realm stays the first user and
the test bed. Nothing pushes (push to master = production).
