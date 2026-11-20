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

## Next

- Look at the Ironworks district in the game and fix what is wrong; lap and probe it.
- Harbor District Street Circuit on the north end of the east bank (traced; placement search running).
- The civic riverfront sectors and the Riverwalk circuit, then the hero-shot camera spots.
