# Apex Elohim: night of 2026-11-20 (Claude, map and world)

Kenne's brief before bed: build the river districts from his asset folders (docs/apex-elohim/east-bank-masterplan.md), manage disk space if it runs out, report in the morning. Never pushed.

## Done

- **Disk.** C: had 19 MB free. Deleted my own scratch screenshots and the before-graphics server's Vite cache: 13 GB free.
- **New Ironworks Industrial Circuit (North Harbor Circuit II).** Traced from the layout map, scaled to 5.34 km, fitted by a search over the ground (tools/plan_ironworks_v2.py; the old route is region/industrial_circuit.v1.json). It runs across the old yards with the harbour hairpin on the river quay, and crosses the Port Branch twice: a bridge in the refinery stretch (+7.5 m clear of the rail) and an underpass just before the start straight (6.8 m under it).
  - The road has a design height (industrialProfile): level over and under the crossings, cosine ramps 150 m and 130 m long, never below the water (it crosses the inlet edge on a low bridge), and no grade over 10 %.
  - The underpass is an open cutting (the height map is a 12 m grid and cannot hold vertical sides), crossed by a 64 m rail span on piers.
  - Bridge deck and piers are built wherever the road stands clear of the ground.
  - Port cranes, containers and tanks, city buildings, parking lots and yard items on the new course are left out. Downtown and the other circuits are not touched.
- **Asset library (src/library/).** Reusable pieces sized from Kenne's sheets:
  - industrial buildings: bulk warehouse with silo, logistics centre, sawtooth manufacturing hall, harbour control tower, customs building;
  - rail: locomotive and wagons (hopper, tanker, boxcar, container flatcar), ballasted track, signal gantry, relay hut, buffer stop;
  - refinery: distillation tower, Horton sphere, storage tank, pipe rack, flare stack;
  - port: container block, quay crane.
- **Ironworks dressing (src/ironworksDistrict.ts).** The map's sectors dressed from the library: warehouses on the start straight, manufacturing halls at the underpass, containers and quay cranes on the river, control tower and customs at the harbour, the refinery through the sweepers, the freight yard under the bridge.
- **Cliff Raceway.** The car drives on the road where the dune laps over its edge at the start (the sand stays, as Kenne asked). The lap script's stall there was the script steering by the raw points; it now follows the line the circuit is built on.
- My grandstand clearance fix in src/trackkit.ts (stands back off a curving track) went into the graphics session's commit 25ef7015 with their work.

- **Harbor District Street Circuit.** Kenne's map traced and scaled to 5.42 km (tools/plan_harbor_circuit.py), on the east shore of the strait north of the river mouth: the north end of the east bank, clear of the civic riverfront. Its road never goes below 3.6 m, so where the course reaches out over the water it runs on a deck on piers. It has its own menu card, brief and weather (a missing weather plan had stopped the game loading), and barriers that hold in races and free roam. It is dressed with container blocks, quay cranes and warehouses from the library.
- **Civic riverfront (first pass).** The east bank's shoreline is traced (tools/plan_civic_riverfront.py), and src/civicDistrict.ts dresses it from the new civic library (src/library/civic.ts):
  - the whole bank: a stone promenade with an embankment, lamps, palms and benches;
  - Opera & Marina: the opera hall, a marina of pontoons with yachts;
  - Museum Plaza: the museum of science and art, the glass museum pavilions, the glasshouse, a plaza fountain, the ferry pier;
  - the amphitheatre with its festival stage, the urban beach and its pier;
  - Civic Parklands: the monument, flower beds, fountains and sculptures.

  It is built after the city's buildings are known, so nothing lands on downtown. The old Ironport harbour's pieces in the civic stretch (container terminal, sheds, tank farm, berths, cranes, rail spurs) are left out; its quays on downtown's frontage stay.

- **Laps.** The new Ironworks: a full 5.3 km lap, no stalls, the car never more than 0.4 m off the road. The Harbor District circuit: a full 5.4 km lap, no stalls, 0.2 m. The harbour circuit's first placement ran past the world's east edge (x 8196: the map is 1376 x 12 m), where the car stopped dead; it is refitted at (7370, -2960), x 6866 to 7935. Parked cars are kept off both new courses (downtown's are as they were).
- **Hero scenes (src/heroScenes.ts).** 19 camera spots covering about 50 of Kenne's shots: Ironworks (finish line, straight, bridge, into and out of the underpass, refinery, silos, warehouses, harbour), the harbour circuit (cranes, container canyon) and the civic riverfront (opera, marina, glass museum, fountain, amphitheatre, beach, promenade, parklands). A spot is written against what it shows (a point on a built line, or a placed landmark seen from the river), so it follows the world. `window.heroScenes()` resolves them, and scripts/apex-hero-shots.mjs shoots them. The civic race shots (boulevard, chicane, riverwalk) wait for the Civic Riverfront Street Circuit.
- **Black frames.** Some shots come out black at random (a different scene each run). The underpass exit, the warehouse and the marina were black on the first run and fine on the second. It is the renderer, not a place in the world: the graphics lane's.

## Next

- Look at the Ironworks district in the game and fix what is wrong; lap and probe it.
- Civic riverfront: look again after the amphitheatre fix, the glasshouse site, and the bank's old satellite texture (containers still painted on the ground: the graphics lane's).
- The Civic Riverfront Street Circuit (from Kenne's two circuit maps), then its race hero shots.
- A finer opera hall: its white shells read edge-on from the river.
