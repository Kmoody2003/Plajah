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
