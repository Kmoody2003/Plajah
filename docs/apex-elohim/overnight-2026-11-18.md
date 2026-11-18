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

## Not done yet / known
- **Glacier Pass** and the escarpment climb (the road over the range) are not laid yet; the coast highway currently ends at a north-shore lookout.
- The festival has no progression yet (Fest Points, Stage Passes, opening shows, radio hosts reacting); the design is in `chora-fest-design.md`.
- Some speed-trap names repeat a place (Otter Creek West 2); vegetation on the steep range is sparse; distant tree density at altitude costs ~2 M triangles.
- The game map screen does not yet show the festival sites or the new north as a designed map (the map-view upgrade from the concept art is still open).
- The memory index is over its size guideline and should be consolidated.
