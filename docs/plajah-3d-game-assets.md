# Plajah 3D: game assets from the art and the motion videos

Kenne, 2026-11-19: Rift Realm has to look current-gen (Xbox Series S/X) and match the art. Use the Plajah-built tools.
When they can't do something, build that capability into them first, then build the asset with them. The art AND the
motion videos drive every model, rig and movement.

## What went wrong before
The Cyber Forest creatures were made with one-off scripts around the tela-3d engine (scripts/riftrealm/cut_pale.py,
cf_creature_export.py, hand trims). The moth and bat wings were first hand-built in code and looked nothing like the art.
Movement was invented in a shader instead of studied from the motion videos. Props (data pods, crystal pylons, power
nodes, building blocks) are still primitives from code.

## Gaps found, each becomes a Plajah 3D capability

| # | Capability | Where it lives | Replaces |
|---|---|---|---|
| A | Engine: paint a mesh from several sheet views (`/tela3d/paint-views`) and release the model + memory after a job (`/tela3d/release`) | engines/tela-3d | running paint_from_views.py by hand; force-killing a runtime holding ~12 GB |
| B | Build from a sheet: panels found (suggestBoxes), each view cut with pale/thin parts kept, the best view generated, strays and spurs trimmed, painted from every view, back filled from the mirrored front for thin symmetric parts | services/argilla/understand + studio | cut_pale.py, hand trims, composite backs |
| C | Motion study from a video: frames decoded, subject cut per frame, cycle timing and amplitude measured per body region (wingbeat Hz, gait period, leg phase, strike timing), key poses picked (e.g. wings fully spread) as build inputs | services/argilla/creature/motionStudy | guessing gait numbers; picking frames by eye |
| D | Rig from the art + study: bones placed from the model's regions (wings: shoulder/wrist, legs, head, tail), skinned, clips authored from the motion study, exported as a skinned GLB | services/argilla/creature (forgeToGlb) | the TSL vertex "rig" in games/rift-realm/src/creatures.ts |
| E | Game export: glow map from the art's bio-light hues, compressed textures, size budget per tier | services/argilla export | cf_creature_export.py |

## Order
A → B → rebuild the Cyber Forest props from their sheets → C → D → re-rig every creature from its motion video → E for
all of it. Every result is checked against the art from front, side and back (and against the video for motion) before
it goes into the game; look is judged on the high tier.

## New inputs (Kenne's drop, 2026-11-19): `Shooter/void-sanctum-level-assets` + `Shooter/void-sanctum-models`

**Level asset sheets** — three volumes in the house sheet format (front / left / right / back / top plan / profile,
components breakdown, close-up material insets, a cutaway interior for enterable structures; grey background, orthographic,
one scale across views):
- Vol 1 Cyber Forest = **Elderwood Hollow**, CF-01…CF-23 + CF-24 labelled tactical map: Great Oak hub (OBJ A) on a central
  treetop deck, rope bridges to four oak platforms (West Lookout, East Shelter, Sniper Nest, South Armory), forest floor below
  with Outpost Cabin (OBJ B), Log Tunnel, Rune Monolith, Watchtower, Ruined Chapel, Waterfall Pool (OBJ C), Spawn A west,
  Spawn B east. Fable high-fantasy dominant, Tron only as faint rune veins.
- Vol 2 Sunken Cathedral, SC-01…SC-24 + map. Vol 3 Emberfall Caldera, EC-01…EC-20 (EC-21…24 to come).

**Blender models** (another pipeline, code-built): v1 greybox, v2 textured (rejected by Kenne as "1990's"), v3 Great Oak
photoreal proof (8.1k tris LOD0, blocky card canopy — still below the bar). Useful as: the **scale/placement contract**
(manifest: spec heights, footprints, world_z; forest floor z = 0, canopy decks z = 12), **walkable interiors and collision**
for enterable structures, and **21 tiling 2048² photo textures** (+ v3's normal/roughness derivation). Not as the look.

**How they enter the workflow**
1. Each structure sheet → B (build from sheet): sheet views cut, shape generated from the best view, painted from every view
   with A. Enterable structures: the generated shell must keep the Blender model's doorways/floors, or the sheet views are
   painted (A) straight onto the Blender interior geometry where generation can't make an interior.
2. Dimensions and placement from the v2 manifest; collision from the Blender greybox.
3. Ground/tiling materials from the shared textures with v3-style normal + roughness.
4. The labelled tactical map is the layout reference for the level; Vol 2/3 sheets feed the cathedral and caldera levels.

## Decision (Kenne, 2026-11-19): one environment
"Cyber Forest" and "Elderwood Hollow" are the same level (Muse named it differently). Both aesthetics belong to one place:
- **Layout and structures** = Elderwood Hollow (CF-24 tactical map; CF-01…CF-23 sheets): Great Oak hub on the treetop deck,
  rope bridges to the four oak platforms, forest floor with cabin, log tunnel, rune monolith, watchtower, chapel, waterfall.
- **Cyber forest look through all of it** = the `Cyber Forest Level Assets` folder: bioluminescent flora (glow grass, ferns,
  neon mushrooms, flower pods, vines, crystal plants), the creatures (wolf, mantis, wasp, deer, bat, moth, …), the neon energy
  nodes and data cables as accents, conduit veins in the bark, the titan tree's scaffold/lamps/cables on the Great Oak.
- The tech blueprint layout now in games/rift-realm/src/cyberforest.ts (server complex, data river, Digital Bridge) is
  replaced by the Elderwood layout; its tech pieces survive only as accents placed where the Elderwood map allows.

## Progress
- **A** done d081bce4 — `/tela3d/paint-views`, `/tela3d/release`.
- **B** done — `services/argilla/understand/sheetBuild.ts`: `findSheetViews` (figures on the sheet's plain background,
  house roles by reading order), `cutFigure` (distance-from-background matte so pale/thin parts stay, holes filled, main
  piece, edge colours bled inward so no background fringe), `buildFromSheet` (front cut-out → Hunyuan main piece → painted
  from front/back/left/right/top; any view whose outline overlap is under 0.6 is dropped and the model repainted). Engine:
  `top` view, per-view overlap report, `keepLargest`. Proven on CF-03 Outpost Cabin in the lab: 193 s, front 0.86 / back
  0.74 / left 0.75 / right 0.81; the top slot was the floor-plan drawing (0.58) and was dropped automatically.
  Still solid: no interior yet (enterable structures take the Blender interior next).
- **B2 geometry from the art** (Kenne: "an extra step that extrudes and models meshes from a vision model understanding
  the geometry from the art, from depth and visual intelligence") — `engines/tela-3d/art_geometry.py`,
  `/tela3d/reshape-views`, `reshapeFromViews`, on by default in `buildFromSheet` between generate and paint. The generator
  saw one view; every other view is a measurement, applied in a voxel grid:
  0. proportions: the depth the side views and the plan measure (median, clamped) — the cabin came out ×1.34 deeper,
     the three estimates agreeing (1.30 / 1.40 / 1.34);
  1. outlines by vote: front+back, left+right, plan each must agree before anything is cut, and a group that would cut
     >22% is a different drawing and skipped (generated sheets are not to one scale: the cabin's back is drawn 12%
     narrower than its front, its side views show the roof from above);
  2. grow into outline the shape dropped;
  3. Depth Anything V2 (local ONNX): broad relief at the shape's outer envelope raises what the generator left sunken
     (the cabin's caved-in back), carrying the generator's own log grooves onto it; fine relief (±2% of depth) extruded /
     carved from every view except the one the shape came from;
  4. marching cubes, then every vertex near the generator's untouched surface snaps back to it (its crisp detail).
  Hole-tolerant solid fill (three-axis span vote) because generated meshes aren't watertight.
  Cabin: side outline match 0.72/0.74 → 0.84/0.92, back 0.85, front kept 0.93+, caved-in back filled.
  Next in B2: SAM parts + Gemma naming so each part (roof plane, post, ladder, chimney) gets its own rule (planar roof,
  cylinder logs, thin ladder rails) instead of one voxel treatment.

## Batch: all Elderwood sheets (2026-11-19), strengths and weaknesses
`buildFromSheet` with the geometry step, run on CF-01…CF-23 (no tuning between sheets). 19 built. CF-16 Cover Kit,
CF-21 Lighting Props, CF-22 Waterfall Pool and CF-23 Ruin Walls ran out of memory (PC commit ~5 GB free: other apps hold
~17 GB; the engine's surface-snap step samples 4M points). Overview: `docs/plajah-3d-elderwood-batch.jpg`.

**Scorecard** — better: 3 (cabin, chapel, monolith) · about the same: 7 · worse: 8 · total failure: 1 (Great Oak).

### By situation
| Situation | Sheets | Result | Why |
|---|---|---|---|
| Solid object, house layout, eye-level orthographic views | 03 cabin, 04 chapel, 18 monolith | **works** | views found + named right; sides rebuild what the generator melted (chapel walls) or left sunken (cabin back) |
| Platforms around a trunk (radial) | 02, 05, 06, 07, 08 | **worse** (lumps, streaks) | figures merge/overlap on these sheets; a round object's silhouettes all agree at IoU ~0.7, so wrong views pass; uncapped grow fills the merged outline |
| Open frames: railings, ropes, ladders, lattices | 09 tower, 11 bridge, 17 rack | **worse / walls** | the cut-out fills holes, the generator makes solids, grow fills between rails |
| Organic / rounded | 19 mushrooms, 15 swing | **worse** on 19 even with every view right | voxel rebuild (288 grid, per-axis projection) terraces curved surfaces; it only keeps the generator's surface where nothing moved |
| Views drawn from above (3/4 high angle) | 12 junction | unchanged | no view is an elevation; the generator also reads the raised front as eye level |
| Long rigs between two anchors | 13 zipline | **worse** (−52% vol) | views at different scales; a side view in the plan slot cut a whole tree (single-view group, no vote) |
| Collage / panel-grid / kit sheets | 01 oak, 15 swing, 17 rack, 20 vegetation | fail / unchanged | whole sheet or grid read as one figure; kit sheets hold several objects |
| Sheets with printed view labels | 14 stairway | unchanged | labels ("LEFT SIDE VIEW") ignored; roles by reading order put left/right swapped |

### Strengths
- The generator (Hunyuan, front view) is usually good: platforms, watchtower, swing, mushrooms, stairway came out
  recognisable before any geometry step.
- When a sheet is read right, the geometry step does what it was built for (chapel walls, cabin back, monolith).
- The overlap gate is safe against obviously wrong views: it rejected views on 07, 10, 11, 12, 14, 15, 20 and left the
  shape alone.

### Weaknesses, in order of damage
1. **Reading the sheet** (10 of 19 sheets): figures merged by touching canopies / debris / panel frames, overlapping
   boxes, full-bleed material insets taken as views, roles by reading order instead of what the drawing shows, labels
   ignored, kit sheets with several objects.
2. **Voxel rebuild quality**: terracing and horizontal streaks on everything it changes; snap only restores untouched areas.
3. **Grow has no cap** (02: +16%, 17: +15%); the outline cut does (22%).
4. **Proportions use rejected views** (13: a 0.05-overlap view drove depth ×1.6).
5. **Single-view groups cut without a vote** (13).
6. **Open structures become solids** (cut-out hole fill + generator).
7. **No interiors** (chapel plan rejected because the model is solid; cutaways unused).
8. **The judge is wrong**: outline overlap ROSE on the lumps (grow fills the outline), so IoU can't tell a better model
   from a worse one. A judge must compare the painted render with the art per view (edges/features), not silhouettes.

### What to build next (proposed)
A. **Sheet reader from a vision model**: SAM regions + layout reasoning (Gemma 4 locally) to find each drawing, read
   printed labels, tell elevation / plan / cutaway / inset / kit part apart, estimate each view's camera pitch, and split
   kit sheets into separate objects. Fixes weakness 1 and feeds everything else.
B. **Geometry step v2 as surface deformation**: move the generator's own vertices along normals toward each view's
   silhouette and depth (no re-voxelising) → no terracing; keep the voxel path only for filling big dents. Add the guards:
   proportions from passing views only, grow cap, single-view groups need ≥0.75, revert on any judged loss.
C. **Render-vs-art judge**: per-view render of the painted model compared with the art cut-out (edge + feature
   similarity), used both as the revert guard and as the batch score.
D. **Open-structure rule**: keep the cut-out's holes (rails, ropes, ladder rungs) and build thin parts as tubes/planks
   from the kit row instead of letting the generator make walls.
