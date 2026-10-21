# Ravencrest: artwork fidelity assessment and rebuild brief

Date: 2026-10-20. Status: initial source/artwork assessment; rendering corrections started. The castle has **not** been rebuilt 1:1.

## Finding

The implementation has accumulated effects and props without a single architectural authority. It builds a four-level, 12-room gothic mansion, while both supplied castle plans describe five levels and twelve **bedrooms**, plus many other spaces. More bloom, generated props, or polygon density cannot resolve this fundamental mismatch.

Evidence inspected: `components/taleo/HauntedCastleExhibition.tsx`; the extraction and Blender builders in `scripts/halloween`; the supplied reference images listed below; the existing game council specialist definitions in `services/game/council/gameCouncilService.ts` and `services/aria/ariaCreativeRoles.ts`.

## Reference authority

The two supplied plans conflict. Do not blend them silently.

| Reference | Original in artwork/extracted | Purpose |
| --- | --- | --- |
| `floorplan_blueprint.jpg` | `creation_3752884004.png` | Alternate fortress study; not the selected room layout |
| `floorplan_blueprint_2.jpg` | `creation_3752884032.png` | USER-SELECTED AUTHORITY: main grand hall, queen's floor, king's floor, recreation/observatory floor, basement |
| `castle_exterior_moon.jpg` | `creation_3752931199.png` | Exterior silhouette, stone/slate materials, moonlight and warm windows |
| `castle_architecture_callouts.jpg` | `creation_3752931231.png` | Roofs/spires, buttresses, keep, grand gate, watchtowers, curtain wall, viaduct |
| `castle_moat_bridge.jpg` | `creation_3752929161.png` | Arrival and bridge composition |

Readable copies are in `public/models/halloween/ravencrest`. The original images are in `halloween interactiv elayou/extracted`.

The user explicitly selected the residential plan. Its topology takes precedence over the alternate fortress study. These illustrated plans have inconsistent labels, bedroom counts, and scale annotations. “1:1” should mean faithful room placement, adjacency, circulation, proportions and landmark composition. Do not claim survey-accurate dimensions from ambiguous illustration labels. Record every necessary interpretation in the layout manifest and keep reference screenshots beside it.

## Why the current implementation misses

1. **Wrong topology.** Three crypt rooms, mansion foyer/wings and belfry substitute for the selected plan's basement service spaces, grand hall, separate queen/king floors and observatory. One whole above-ground level is absent. Renaming rooms will not fix geometry, stairs, collision or navigation.
2. **Wrong massing.** Repeated boxes, cone caps and simple window frames do not establish the artwork's stepped fortress, dominant keep, secondary spires, raised rocky foundation and enclosing fortifications. The existing bridge is a flat deck across broad water rather than the reference's elevated arched viaduct. These require actual geometry.
3. **Conflicting scenery.** A painted castle cylinder, a large crossroads image, a painted sky, an extra moon/aurora and an older castle GLB compete with the walkable castle. The older GLB places its four towers at a different footprint from the mansion. Perspective and silhouette cannot remain coherent while these independent representations overlap.
4. **Lighting without hierarchy.** Strong purple ambient/hemisphere light and warm directional light oppose the reference's blue-grey moonlit stone and localized amber windows/torches. Low bloom thresholds spread glow across surfaces. Ground fog is made of transparent shader planes; the comments calling it Mie scattering do not establish physically volumetric lighting.
5. **Material shortcuts.** Crops from illustrated asset sheets contain painted shadows/highlights. Generating normals and roughness from luminance transfers that lighting into surface response. It does not produce independent measured PBR channels. Stone, wood, slate and metal also need consistent real-world texture scale and UVs.
6. **Character fidelity is an asset-production task.** The survivor reference requires recognizable faces, dark worn tactical clothing, layered belts/pouches, backpacks, natural hair, boots, katana and spiked bat. The monster sheet calls for decayed zombies, large furred digitigrade werewolves, and aristocratic long-coated vampires. Extra procedural limbs and high vertex counts do not establish those shapes. The currently loaded survivor GLB has 145,288 mesh vertices and four named animation clips; monster GLB has 53,440 vertices and four clips. The runtime never creates an AnimationMixer or plays those clips, relying on procedural bone rotations. Inspect neutral-lit turntables and clip binding before replacing the assets. No complete mesh-to-reference visual audit has been performed in this pass.
7. **Presentation competes with the world.** Multiple telemetry/control bars, bright badges, council tickers and combat messages reduce the view of the architecture. Establish an exploration presentation with quiet navigation and optional diagnostics.
8. **Council claims are scripted.** The room-entry messages unconditionally say effects are verified. They are not a deliberation or an automated visual comparison. Quality needs captured evidence and explicit pass/fail criteria.

## Council-derived direction

This is an assessment using the existing council's written criteria, **not a claim that a live council session occurred**.

| Discipline | Direction | Review evidence |
| --- | --- | --- |
| Real-time 3D / Søren | Prioritize matching massing, surface response and depth before effects | Fixed reference cameras, neutral material render, close material views |
| Gameplay / Elena | Keep the arrival landmark visible; connect gate, courtyard, stairs and destinations coherently | Continuous recorded walks, door/stair clearance checks, no teleport-only rooms |
| World direction / Takumi | Preserve the dominant silhouette and quiet atmospheric spaces | Clean HUD-free arrival, bridge and courtyard captures |
| Hardware / Kenji | Establish a budget and remove duplicated scenery, redundant lights and unbounded allocations | Measured frame time, draw calls, triangle count, texture memory on declared target hardware |
| Classical art / architecture | Preserve hierarchy, rhythm, proportion and masonry construction | Elevations, plan overlays, window/buttress spacing comparisons |
| Baroque / lighting | Use pools of amber light against a cool, legible stone silhouette | Grayscale value comparison; highlight clipping and shadow readability checks |

## Initial implementation changes

- Added a final `OutputPass` after bloom so tone mapping and display color conversion occur at the end of the post-processing chain.
- Added a default Ravencrest Reference Art preset with cooler, lower ambient fill, restrained bloom, lower environment intensity and cool directional moonlight. Existing alternate presets remain available.
- In the reference preset, hid competing castle/crossroads image backdrops, the added moon/aurora and free-floating embers. The sky texture remains provisional and must receive its own reference comparison.
- Removed the old castle shell attachment while retaining the tank from the same GLB. The walkable scene is now the sole architecture owner.
- Disabled the heavy vignette by default and added post-processing cleanup.
- Added an isolated preview at `/scripts/halloween/preview.html`, served with `node node_modules/vite/bin/vite.js --config scripts/halloween/preview.config.mjs`.

These are foundation corrections. Lighting settings are provisional until reviewed in the browser and on target hardware; they do not establish finished artwork fidelity.

## Ordered rebuild plan

### 1. Establish the architectural contract

Use the selected residential plan. Trace each floor into normalized polygons using the original image, north at the top and entrance south. Give each room, doorway, stair, tower and landing a stable ID and source image region. Distinguish observed lines from inferred hidden construction. Derive room labels, geometry, collision, floor heights, teleport positions and minimap from this single data model. Do not maintain parallel hand-authored coordinate lists.

For the selected residential plan, capture this schedule:

- Basement: northwest wine cellar, north armory, northeast laundry, west boiler room, east workshop, southwest food cellar, southeast staff quarters, central main stairs.
- Ground: north grand hall, northwest dining room, northeast kitchen/pantry, southwest library/study, southeast living room, south main entrance with flanking stairs and four corner towers.
- Second: north queen's suite, northwest/northeast bedrooms 1/2, southwest/southeast bedrooms 3/4, central gallery, flanking stairs, south balcony.
- Third: north king's suite, northwest/northeast bedrooms 5/6, southwest/southeast bedrooms 7/8, central hallway, flanking stairs, south balcony.
- Fourth: northwest/northeast bedrooms 9/10, central recreation spaces, southwest/southeast storage, projecting south observatory, central/flanking circulation and corner towers.

Bedroom numbering follows the breakdown list where printed room labels repeat. The king and queen suites plus ten guest bedrooms give the twelve-bedroom target.

**Gate:** plan-overlay images for all five levels; every named space accounted for; a written exception list for contradictory source details.

### 2. Build a walkable greybox before decoration

Build the selected footprint, five floor elevations, corner towers, courtyard/voids, actual stairs, door openings and parapets. Replace the existing four-level floor resolver and stair logic together with the geometry. Rebind movie displays, spawn points, music zones, encounters and room teleports to valid room IDs.

**Gate:** walk from bridge through every level without teleporting; no invisible blockers, holes, blocked stairs, ceiling intersections or camera clipping. Floor/room detection must agree with the visible space.

### 3. Match the exterior silhouette

Construct raised rocky foundations, curtain walls, stepped main volumes, dominant keep, secondary watchtowers, steep slate roofs, spires and arched viaduct. Use a modular architecture kit with real openings, pointed arches, buttresses, cornices and recessed window bays. Reconcile the floor-plan footprint with the exterior illustration in the exception log rather than inventing another castle shell.

**Gate:** matched entrance, bridge three-quarter and elevated cameras; compare silhouette and landmark alignment before adding decorative clutter.

### 4. Finish one representative visual slice

Complete bridge → gate → courtyard/entrance → stair landing, with correct masonry scale, slate, iron, damp stone, banners, localized torchlight, window warmth and restrained fog. Use independent albedo/normal/roughness maps, inspect them under neutral illumination, and avoid baking illustration shadows into albedo. Create the other rooms from this approved material and architecture kit.

**Gate:** paired reference/runtime captures at matched framing, including a grayscale comparison and close surface views. The slice must meet the visual target before spreading the kit across all rooms.

### 5. Complete interiors and character integration

Furnish rooms according to their actual plan function. Scale furniture to the player; reserve clear navigation space. Review Jack/Elise and monsters against front/side/three-quarter references, then validate feet, hands, weapons, animation transitions and contact shadows in the finished scene. Keep combat readable without filling the environment with unrelated glow.

**Gate:** room-by-room reference checklist, character turntables and an uninterrupted exploration/combat recording.

### 6. Presentation and performance acceptance

Make diagnostics/council notes optional, keep controls compact and provide a clean art-review view. Measure before setting numerical budgets: name target desktop/mobile hardware, resolution and frame-rate target. Instance repeated architectural pieces, share materials, bound shadow-casting lights, stream levels and use LODs only after capturing a baseline.

**Gate:** no browser/runtime or missing-asset errors; all routes work; resize and preset switching work; repeatable frame-time/call/memory capture on the declared target. Keep final screenshots against the original artwork in the review folder. Do not mark “1:1 complete” until architecture, traversal and art-direction gates all pass.

## Engine decision

Do not make a migration the prerequisite for correcting the assets. The current Three.js renderer can display authored skinned GLBs, PBR surfaces and post-processing; the discovered topology/asset mismatches will remain after a port. First build one identical representative scene from engine-independent GLBs and the residential plan contract, then compare engines with the same camera, lighting, assets and target device.

Babylon.js is the leading candidate if replacing the hand-built runtime: it supports WebGL/WebGPU, glTF assets, animation and game-oriented systems, including Havok integration. It provides a more complete browser game framework while preserving React as the application shell. This is a recommendation for a measured prototype, not a completed migration.

Godot is attractive for integrated scene/animation/level editing, but its current web export is WebGL 2 Compatibility only; Forward+/Mobile and WebGPU are not supported in that web path. Its default web sample audio also has effects limitations. It is not automatically a visual upgrade for this browser-first experience. Recheck the actual export pipeline before selecting it.

Primary references checked 2026-10-20: [Babylon specifications](https://www.babylonjs.com/specifications/), [Havok integration](https://doc.babylonjs.com/features/featuresDeepDive/physics/havokPlugin/), [Godot web export](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html).

## Four-council production ownership

All four disciplines must review the same captured slice rather than independently inventing styles.

- Art: own original-image authority, architecture proportions, character likeness, surface response, palette and matched reference-camera comparison. Reject substitute characters or flattened painted scenery as a finished 3D reconstruction.
- Interactive game: own traversable five-level topology, collision, camera obstruction, combat ranges, monster navigation and discovery routes. Preserve player control and readable silhouettes when adjusting composition.
- Animation: own skeleton/clip compatibility, locomotion blending, foot contact, turn-in-place, weapon attachment, distinct monster movement, attack anticipation/contact/recovery and character turntables. The existing animation clips need inspection, not automatic acceptance based on their names.
- Music: own a restrained recurring gothic motif and transitionable exploration/tension/combat layers. Ground hall, queen, king, basement and observatory require distinct orchestration/ambience without unrelated songs restarting at doorways. Mix voices, footsteps and attack cues ahead of music; measure actual loudness/true peak and check loop seams before choosing mastering values. No measured mix has been supplied yet.

`scripts/halloween/run-fidelity-councils.ts` prepares four actual local-model reviews from the project's council rosters and source audit. It does not change shared profiles or production data. Its inputs are textual evidence, not image pixels; do not represent those responses as visual review. The user authorized temporarily stopping the idle sidecar and restarting it afterward. `run-review-with-idle-worker.ps1` performs that restoration in a finally block. The council now starts and loads its GPU model, but the thermal guard pauses at 83 °C until the GPU cools to 78 °C. The runner waits and retries within that unchanged guard. No completed council output has been obtained or fabricated at the time of this assessment.

Final attempt: the bounded retry period ended with the GPU at 79 °C, still above the 78 °C resume threshold. The council process stopped and the original sidecar was restarted (latest PID in `artifacts/ravencrest-review/sidecar-restored.json`). The thermal and exclusivity guards were not changed.

Update after the user's request to stop the service and run the council: all four reviews subsequently completed with cooldowns between runs. Results and limitations are recorded in [the council run summary](halloween-council/summary.md). The sidecar was restarted afterward. These outputs supersede the earlier failed-run status; they remain source-based reviews rather than visual/audio approval.

## Asset procurement and likeness policy

Download supplemental assets only against a specific gap, recording original URL, author, license, intended use and local path. CC0 masonry, slate, wood, iron, terrain and ambience may be useful foundations. Generic purchased/downloaded humans, werewolves or castles are not evidence of a likeness match; they may need custom sculpting, clothing, texture authoring, hair/fur and retargeting. Do not buy assets without an agreed budget.

Downloaded and integrity-checked two 1K Poly Haven PBR candidate sets (3.48 MB total): Rob Tuytel's [Castle Brick 01](https://polyhaven.com/a/castle_brick_01) for damp basement masonry, and [Roof Slates 03](https://polyhaven.com/a/roof_slates_03) for the roof kit. Both are [CC0](https://polyhaven.com/license). They include separate diffuse, OpenGL normal and roughness maps. Original URLs, author, license, real-world width and checksums are saved in `public/models/halloween/materials/polyhaven/provenance.json`. They are staged for material review, not silently substituted as a claimed exact artwork match.

The target is the closest defensible visual match at chosen reference cameras plus coherent freely explorable 3D. An exact pixel match from every moving viewpoint is not a meaningful promise for a perspective concept painting with contradictory details. Acceptance must be based on paired captures, geometry/route checks and explicit approved interpretations, not a verbal percentage.

## Concrete reconstruction outputs

`data/ravencrestResidentialLayout.ts` now records five selected floors and 37 named room/space IDs, including twelve bedrooms. This is explicitly a **draft trace**; doors, towers, bathrooms, stair flights and dimensions are pending. It is not wired into the live mansion and must not be treated as a finished navigable level.

Run `node node_modules/tsx/dist/cli.mjs scripts/halloween/prepare-fidelity-review.ts` to validate the floor/bedroom/ID constraints and regenerate the original-artwork overlay, layout JSON and GLB inventory in `artifacts/ravencrest-review`. Counts are file metadata, not quality measurements.

## Validation limits

- Layout contract validation passed: five floors, 37 unique room/space IDs, twelve bedrooms, valid normalized rectangles. All eight GLB files were parsed for the inventory.
- Six downloaded texture maps matched the original API byte counts and MD5 checksums.
- Targeted TypeScript checking no longer reports errors in the edited exhibition component or the layout contract. It still fails on four existing imported-service errors: two archive API argument-count errors and two StoryReportCharacter ID errors. See `artifacts/ravencrest-typecheck.txt`.
- Browser screenshot verification did not complete: navigation to the isolated local preview timed out, including after limiting dependency scanning to the Halloween entry. No before/after screenshot comparison or measured runtime performance is claimed. The rendering changes need this review before visual acceptance.


## Phase 2 implementation update

The selected residential construction contract is now integrated into the live exhibition: five floors, 37 destinations, all-room circulation and four connected stair flights. The standalone construction viewer passed browser rendering and walking checks. See artifacts/ravencrest-review/phase2-status.md for evidence and remaining work. Earlier statements that the layout was not yet connected to the runtime describe the initial assessment, not the current implementation.
