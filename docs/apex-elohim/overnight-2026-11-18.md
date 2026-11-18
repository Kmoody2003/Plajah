# Overnight report: Apex, 2026-11-18

Everything is committed on `feat/apex-elohim` (not pushed, nothing in production). The dev preview (port 4332) runs it.

## The map grew 10.2 km north
- **Movable world origin.** The height grid used to be assumed centred on the origin. Every world-to-grid conversion (game and tools) now reads the grid centre from `height2.json` (`oz = -5100`), so the map grew north without moving a single existing coordinate. Checked: the old world's heights are identical to the centimetre.
- **`tools/grow_north.py`** builds the new land, always from the original files (`*.before_north.*`), so it can be re-run safely:
  - **Wine country**: rolling Holly-style moraine with kettle lakes; the shipping channel continues north as a long finger lake; Holland-style tulip farms (about 4 km², long single-colour parcels on the flats beside the lake); vineyard blocks on south-facing slopes (about 6.6 km²).
  - **The giant forest**: sequoia and redwood old growth (51-74 m trees, about 9 km²) on the coastal side, leading from the wine country up into the range.
  - **The escarpment**: an east-west ridge with a sheer south face over the head of the finger lake, stream notches cut through the crest, a long rolling back slope.
  - **The Superior Range**: peaks to about 690 m, a glacier (about 3 km²), coastal cliffs with three fjords on the west, dry canyons with rock benches on the east (forest, grass, cold rock desert), a boreal plateau, the lake along the new north shore, and a raised coastal terrace that the coast highway runs on.
  - 104,000 tree points for the north (woodlots, conifers with altitude, the giants).

## Roads (all designed to the same engineering rules: grade limits, curve radii, banking, rounded crests, bridges over water)
- **Finger Lake Loop** (8.9 km): up the west shore through the vineyards and tulips, a high bridge across the lake's gorge under the escarpment, down the east shore. Drivable surface within 5 cm of the design, 7 % max.
- **Superior Coast Highway** (13.5 km): from the coastal highway's north end through wine country and the giant forest onto the coastal terrace along the cliffs, bridges over the three fjords, to the north shore.
- **Mill Road** and **Orchard Lane**: the two county roads that used to stop at the old north edge now join the network.
- **Map-wide grade pass** (earlier): freeways 5 %, highways 6 %, streets 8 %, country 10 %, lanes 12 %; the freeway now ramps down into the sunken downtown section.

## Chora Fest on the map
- `tools/plan_festival.py` places the festival from the real roads: **8 sites** (Halcyon Shores main site plus outposts at Dune Sea, Kettle Hills, Pinewood, Otter Creek, Ironport Nights, Wine Country, Superior Range), **10 speed traps** at the ends of the longest straights, **8 speed zones**, a **drift zone** on Kettle Pass, **8 danger signs** on crests.
- In the game: a stage at every site (neon, speakers, a CHORA FEST LED wall with the site name), speed-trap gantries, danger signs and drift arches. The challenge system now uses these spots (the old ones included one in the lake).

## Browser performance
Measured with a new benchmark (`window.__bench`) and a headless GPU screenshot tool (`scripts/apex-shots.mjs`, works while the pane is hidden):
- **Terrain level of detail**: distant terrain draws 1/4 to 1/64 of the triangles; the visible terrain went from about 4.4 million triangles to about 0.26 million. The ground under the car is unchanged.
- **Halcyon Gateway bridge**: 795 meshes became 15 (the LED wave moved into the shader, same look).
- **Power lines and substations**: 408 meshes became 59.
- Freeway view: 1,789 draw calls and 5.2 million triangles became 308 draw calls and 0.85 million.
- Typical views now run 14-24 ms at 1024x768 on this PC while other sessions use the GPU; the remaining cost is mostly the post-processing chain.

## Looks
- Cliffs and steep ground now render as grey layered rock at every distance (no more stretched tan smears).

## Morning: Glacier Pass and the Superior Range Circuit
- **Glacier Pass** (15.9 km): from the coast highway in the giant forest, up the valley between the two glaciated peaks to a 430 m saddle, down the north side to the shore, where it meets the coast highway's end at exactly the same height. 9 % max (an Alpine-pass grade), hairpins no tighter than 23 m radius, rock cuts up to ~29 m through one ridge nose (the game's cut limit is now 30 m).
- Located with a new tool, `tools/route_pass.py`: a grade-limited, heading-aware route search over the terrain (no bend tighter than ~25 m, steep side slopes and water cost extra), simplified into control points for the road designer. The designer now also relaxes any bend tighter than a road's minimum radius (Kettle Pass improved from 30 to 37 m) and keeps every road's ends pinned to the roads it joins.
- **Superior Range Circuit** (22.9 km, one lap): a new race in the event menu, north on the coast highway along the cliffs and fjord bridges, back over Glacier Pass and down through the giant forest. Checked in the game: the race starts on the grid, the drivable surface matches the design within 5 cm on average (worst 29 cm, at the junction).

## Escarpment Road
- **The Stair**: the escarpment's south face is sheer (~48°), too steep for any road. Real escarpment roads climb a talus apron or a spur, so `grow_north.py` now builds one: a talus apron above the head of the finger lake, from the foothills (130 m, its toe at ground level) to the crest (295 m), ~25 % over 655 m and ~340 m wide. The rest of the face stays sheer. Re-running the grow changed only the apron's area (x 576..1056, z -8334..-9444); every other height is identical.
- **Escarpment Road** (9.8 km): leaves Finger Lake Loop on the west shore, climbs the foothills, then **six legs and five hairpins** up the Stair (~26 m hairpin radius, 9 % max). Each leg gains slightly more than the slope under it, which pays for the nearly flat hairpins. Over the crest it switchbacks down the back slope, crosses the stream notch on a **~37 m-high viaduct**, and runs west along the back of the escarpment, over a gully bridge, into a square T junction with Glacier Pass. Checked in the game: the drivable surface matches the design within 5 cm on average (worst 57 cm, at the junction). Both ends sit exactly on the roads they join (new designer keys `startOn` / `endOn`: a T junction pinned to the other road's line and height).
- `route_pass.py` gained a fine mode (32 headings, 5th argument `1`) for traversing steep slopes at a shallow angle; the stack itself is laid by hand on the apron's plane.

## Afternoon: the Escarpment Circuit
- **Escarpment Crest Road** (5.9 km): leaves the Escarpment Road at the top of the Stair and runs east along the skyline (8.5 % max, 30 m minimum radius). It crosses the lake-head notch on a viaduct up to ~120 m high, drops through the ridge's eastern gap and meets Finger Lake Loop's east shore in a T junction.
- **Escarpment Circuit** (10.4 km, one lap): a new race in the event menu, on its own roads (it shares none with the Superior Range Circuit). From the west shore of Finger Lake Loop over the lake-head bridge, up the Stair's hairpins, along the crest and its viaduct, and back down to the east shore.
- **Bug fixed: north circuits sank into the lake.** The car physics still had the old map's edges hard-coded, so a car north of z -5550 was pushed back to that line and dropped onto the lake. Both north circuits (Superior Range too, which this morning's check missed because it only measured the spawn) were undrivable. The physics now takes its edges from the grown height grid.
- **Bug fixed: a key press could end a race.** The map's idle beauty-shot cinematic (after 10 s without input) ended itself on the next key press by returning to the overview, which also stopped a drive. A click always ended it before a race, but a race started any other way (gamepad, script) was quit by the first throttle press. Starting a drive now closes the cinematic quietly.
- **Bug fixed: bridges over water sent the car back to the start.** The "fell in the water" reset read only the terrain under the car, so crossing any bridge over a lake (the Finger Lake gorge bridge, the fjord bridges) counted as falling in. It now also needs the car itself down at the water.
- **Both north circuits now drive a full lap** (checked with a new autopilot lap tool, `scripts/apex-lapdrive.mjs`, on the real GPU; it steers along the circuit line and reports the car's height against the road design):
  - Escarpment Circuit: lap completed in 9:46, no stalls or resets, no page errors, car within 7.7 cm of the design height on average. One 2.2 m peak on the crest road's descent, where the autopilot was doing ~97 km/h on a 60 km/h road (probably airborne over a crest; not yet pinned down).
  - Superior Range Circuit: lap completed in 20:13, no stalls or resets, no page errors, 5.7 cm on average, worst 0.58 m at the Glacier Pass / coast highway junction.
  - The autopilot runs wide in tight bends (up to ~15-25 m off the line); that is its simple steering, not the road.

## Not done yet / known
- **Material detail pass** (Kenne, 2026-11-18): after the road and street layout is right, a high-end detail pass on materials: real tulip flowers instead of coloured bands, rock-cut faces (they read as flat grey facets now), and the like.
- The festival has no progression yet (Fest Points, Stage Passes, opening shows, radio hosts reacting); the design is in `chora-fest-design.md`.
- Some speed-trap names repeat a place (Otter Creek West 2); vegetation on the steep range is sparse; distant tree density at altitude costs ~2 M triangles.
- The game map screen does not yet show the festival sites or the new north as a designed map (the map-view upgrade from the concept art is still open).
- The memory index is over its size guideline and should be consolidated.
