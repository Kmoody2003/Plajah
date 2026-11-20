# Plajah Vegetation — trees, grass & plants, fungi (platform architecture)

Kenne, 2026-11-20: *"architect our own high-end tree system that can look cinematic-real, with large amounts of them in
high quality, proper physics and material — separate tree, grass/plant and fungi systems, all production quality. Take
the art references we have and build procedural versions. Point to free model libraries to turn into the procedural
system. This isn't just for this game — it's for the Plajah infrastructure."*

This is a **platform service** (`services/vegetation`), not a Rift Realm feature. Every Plajah world uses it: the games
(Rift Realm, Era Clash 3D, Ravencrest, Forth Horizon, Apex Elohim, Kith), Plajah 3D / Argilla (author a species from art),
Terra (real-world forests), Game Studio (scatter in levels creators build), Museion's Living Forest, Fabula/Stage previz.

## 1. Why a new system (what's wrong today)

- **Image-to-3D (Hunyuan) trees are solid lumps**: a painted blob canopy, no branches or leaves, no light through the
  crown, nothing to sway. Fine as a distant stopgap, never cinematic.
- **Leaf cards cut from the art** read flat in a canopy (no depth, no parallax).
- **The good pieces exist but are scattered and copied** (inventory 2026-11-20):

| Piece | Where | Quality | Fate |
|---|---|---|---|
| ez-tree species, near instanced + far baked crossed-billboards, wind | ravencrest `forest.ts`, era-clash `core/forest.ts` (fork, best) | high | → `grow/` + `lod/` |
| Branch-skeleton trees + leaf-cluster cards | ravencrest `foliage.ts` = era-clash `core/foliage.ts` (byte-identical copy) | high | → `grow/` |
| World wind: veering direction, gust bands travelling downwind on the GPU | era-clash `core/wind.ts`; ravencrest `physics.ts` Wind; GLSL copies in forth-horizon, museion, kithParty | good | → `wind/` (one field) |
| Real blade grass, camera tiles, seeded per cell, blade→tuft LOD, fade | era-clash `grassField.ts` | high | → `grass/` |
| Blade clusters + **trample / vehicle wake** | `services/realtimeSim/strandFurEngine.ts` (used by forth-horizon grass) | high | → `grass/` + `wind/` interaction |
| Undergrowth species (ferns, azalea, iris…) per tile, near/far LOD | era-clash `undergrowth.ts` | high | → `plants/` |
| Map-wide hash-per-cell scatter (nothing stored per plant), land class/slope/road rules, one draw per species | forth-horizon `vegetation.ts` | high, best design | → `scatter/` (move to GPU) |
| Tested tree grower, skeleton→mesh, per-species botanical leaf outlines | museion `flora/TreeGrower.ts`, `treeGeometry.ts`, `leafShapes.ts` (+tests) | high | → `grow/`, `leaves/` |
| Cyber Forest dressing (art-cut cards, no wind) | rift-realm `cyberforest.ts`, `elderwood.ts` | stylised | first consumer to migrate |

Nothing uses compute shaders yet; only forth-horizon grass reacts to a player/vehicle; impostors are 2-view crossed
billboards; fungi have no system at all.

## 2. Architecture

```
services/vegetation/
  species/     the Species document (schema + validation + provenance) — the one thing every system reads
  wind/        one wind field (GPU): global veer + gust bands + local impulses (player, dash, blast, rotor, vehicle)
  scatter/     ecosystem placement on the GPU: hash-per-cell, rules (slope, height, moisture, light, clearings, lanes)
  lod/         mesh LOD chain + hemi-octahedral impostors baked on the device; cross-fade; per-tier budgets
  materials/   foliage BSDF (two-sided, light transmission, alpha-to-coverage), bark, glow masks, season/wet/moss
  trees/       growers (skeleton), leaves & cards, bark, wind skinning, hero-tree collision + hit reactions
  grass/       GPU blade fields (compute), trample + flattening, cut/burn, biome tint
  plants/      shrubs, ferns, flowers, vines, ground cover — species instanced with the same wind
  fungi/       procedural caps/stems/gills, clusters on logs/roots, translucency + glow, spores
  fromArt/     Plajah 3D bridge: art sheet → Species (see §3); scored against the art
  library/     free-source importers (§4) → Species parameters + texture sets, with licence records
```

### 2.1 Species document (shared)
`kind: 'tree' | 'shrub' | 'grass' | 'plant' | 'fungus'`, then:
- **form**: growth parameters (tree: per-order length/angle/curvature/taper/twist, phyllotaxis, gravitropism,
  crown envelope; fungus: cap profile curve, gill count, stem taper, cluster rule; grass: blade length/width/curl,
  density, clumping).
- **materials**: bark set, leaf atlas (cut-outs with alpha), translucency colour, glow mask + colour + beat response.
- **wind profile**: stiffness per branch order, flutter frequency, gust response; interaction radius/strength.
- **lod**: hero mesh triangle budget, mid budget, impostor size/frames; per tier (`low` iGPU / `high` RTX).
- **ecology**: slope/height/moisture/light ranges, cluster size, spacing, companions (fungi on logs and roots).
- **provenance**: art sheets / library sources with licence lines (CC0, CC BY, Fab Standard…), and the art-fidelity
  score per view.

### 2.2 Wind & physics (one field for the platform)
- One GPU wind texture per world (direction veers, strength gusts, **gust bands travel downwind**) — era-clash's design.
- **Local impulses** written into a small displacement texture around the camera: footsteps, dash, Soul Surge / blasts,
  vehicles (strandFurEngine's trample/wake), rotor wash. Grass flattens and recovers, shrubs part, branches recoil.
- Trees: hierarchical sway baked per vertex at build time (trunk pivot → branch pivot → leaf flutter phase), so the GPU
  cost is a few ALU ops. Hero trees get trunk capsules for collision, hit reactions (bark chips, leaves falling) and,
  where a level wants it, breakable branches.

### 2.3 Rendering & scale
- **Instancing everywhere**, GPU culling per cell, **hemi-octahedral impostors** (hemisphere gives better side
  resolution for foliage than full octahedral) baked once on the device per species and cached, cross-faded with the
  mid mesh. Target: tens of thousands of trees visible, millions of grass blades.
- Grass in **compute** (blade buffers per camera tile), drawn indirect.
- Foliage material: light transmission through leaves (the art's backlit canopies), specular sheen on blades
  (Kajiya-Kay, from strandFurEngine), alpha-to-coverage, contact shadows; glow masks for bioluminescent species.
- Tiers: `low` (Intel/phones: fewer blades, impostors earlier, no transmission) and `high` (RTX: full).

## 3. Art references → procedural species (Plajah 3D `fromArt/`)

Kenne's sheets become **species**, not meshes:
1. **Sheet reader** (built 014280f7) finds the views; cut-outs keep the openings.
2. **Measure** from the views: height, crown envelope (front + side silhouettes = a 3D crown hull), trunk lean/twist,
   root flare; branch structure from the cut-out's **skeleton** (medial axis of the wood mask: branch angles, lengths,
   order); leaf size & density from SAM segments.
3. **Materials from the art**: SAM cuts leaf clusters and single leaves → leaf atlas with alpha; bark swatch from the
   trunk → tiling bark set (PBR from Depth Anything relief + roughness from luminance); glow hue bands → glow mask.
4. **Grow** the tree with a space-colonization grower whose attractor points fill the crown hull, plus the measured
   per-order angles (Weber–Penn-style parameters as the starting point), then place leaves from the atlas.
5. **Score** renders of the grown species against every view of the art (silhouette + colour, the art-fidelity loop,
   ≥95% gate) and adjust parameters automatically until it passes; record the score in provenance.

Same flow for fungi (cap profile from the side silhouette, gills/underside from the close-ups) and plants.
First species from the art we already have:
- Cyber Forest: bioluminescent violet tree, cyan weeping willow, blue-leaf tree, cybernetic mangrove, titan tree,
  cybernetic tree trunk (bark + conduit detail sheet), canopy/plant sprites, mushroom sheets, CF-19 mushroom cluster,
  CF-20 vegetation kit.
- Elderwood: Great Oak (CF-01), the oak platforms' oaks (CF-05…08).
- Other levels later: Marsh cypress & mangroves, Glacial, Volcanic (charred), Celestial.

## 4. Free libraries → procedural inputs (licences checked 2026-11-20)

We import these as **parameters and texture sets**, not as meshes to ship as-is (except hero scans where it pays):

| Source | What we take | Licence | Notes |
|---|---|---|---|
| [Poly Haven](https://polyhaven.com/license) | Plant/tree scans (e.g. Namaqualand set, Pine Forest collection), bark & ground textures, HDRIs | **CC0** — any use incl. commercial; can't claim authorship or relicense | Credit appreciated, not required. Scans need retopo/LOD — our `lod/` does it. |
| [ambientCG](https://docs.ambientcg.com/license) | Bark, moss, ground, leaf textures | **CC0** | ez-tree's bark textures come from here. |
| [ez-tree](https://github.com/dgreenheck/ez-tree) | Grower code (already a dependency) | MIT (verify LICENSE file) | Its demo leaf textures are under the project's own licence — re-cut our own. |
| Weber & Penn (1995) parameter model | Parameter vocabulary for growers | algorithm (paper) | **Don't ship Arbaro** (GPLv2) — implement from the paper. |
| [Quixel Megascans / Megaplants on Fab](https://digitalproduction.com/2026/11/13/quixel-megascans-free-again) | Scanned plants, atlases, bark | Fab Standard Licence (any engine per Epic) | Reported free again Nov 2026 — **confirm the Fab EULA on each listing before use**; assets claimed under the old Epic Content Licence were Unreal-only. |
| [Smithsonian 3D (CC0)](https://3d.si.edu/cc0) | A few botany specimens (orchids…) | **CC0** | Small botany set; no fungi found. |
| Research tree scans: [BioDiv-3DTrees](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12712040/) (4,952 labelled trees, 19 species, TreeQSM models), [TEMPL](https://essd.copernicus.org/preprints/essd-2026-632/) (16 species, CC BY 4.0), [German mixed forest](https://essd.copernicus.org/articles/14/2989/2022/) (CC BY 4.0) | **Real branch statistics per species** (angles, length ratios, taper by order) to train/prior our growers | CC BY 4.0 where stated; check each record | Gives botanically true structure; attribution in provenance. |

**How a library asset becomes procedural**: scan → measure (branch graph from a QSM or the mesh skeleton; crown hull;
leaf atlas and bark set from its textures) → Species parameters + materials → our grower regenerates it at any LOD
with our wind and impostors, and variants come from the seed. Scans can also stay as hero meshes with wind baked by
`trees/` (pivot data computed from the mesh skeleton).

## 5. Phases (each ends with a check against the art and a perf number on both tiers)

1. **Core**: `species/`, `wind/` (merge era-clash + ravencrest + strandFur interaction), `scatter/` (forth-horizon
   design on GPU), `lod/` hemi-octahedral impostors, `materials/` foliage BSDF. Gate: era-clash forest runs on it with
   no visual loss; 10k trees in Elderwood at 60 fps on the RTX, ≥30 on the iGPU low tier.
2. **Trees**: growers (museion TreeGrower + ez-tree backends + space colonization in a crown hull), leaves/bark from
   art, wind skinning, hero collision/hit reactions, `fromArt/` for trees. Gate: the four Cyber Forest tree sheets and
   the Great Oak score ≥95% from every view; Elderwood's forest replaced.
3. **Grass & plants**: compute blade fields + trample for every character/vehicle, undergrowth species from the CF
   sprites → real species. Gate: millions of blades, interaction visible, no shimmer.
4. **Fungi**: procedural caps/gills/stems, clusters on logs/roots, translucency + beat glow, spores. Gate: CF-19 and
   the Glowing Mushrooms sheet ≥95%.
5. **Library importers**: Poly Haven / ambientCG / Fab / QSM datasets → Species with licence records; Game Studio
   and Plajah 3D UI ("Make a species from this art / scan").
6. **Migrate** Ravencrest, Era Clash, Forth Horizon, Museion, Kith onto the service; delete the copies.

## 6. Open decisions (Kenne)
- Megascans: use once the Fab licence is confirmed per asset, or CC0-only (Poly Haven / ambientCG) to stay clean?
- Research datasets (CC BY): fine to use as statistics with attribution in species provenance?
- Order after the core: trees → grass → fungi (recommended) or grass first (cheapest visible win)?
- Hero-tree destruction (breakable branches) in scope for phase 2, or later?

## Stopgap in the meantime
Four Cyber Forest trees are being built with image-to-3D (Hunyuan + paint) and placed instanced in Elderwood
(`elderwood.ts` loads `assets/elderwood/tree_*.glb` over the code trees). They are replaced by phase 2.
