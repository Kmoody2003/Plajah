# Apex Elohim: the river districts master plan (2026-11-20)

Kenne's brief: rebuild the industrial districts and the eastern river bank from his asset folders. Layouts and integration are Claude's call; the folders' maps set the direction and the areas that must be included. Every hero shot in the folders must be a real place in the game. What is built here is made as reusable pieces for the Plajah asset library.

Source folders (Kenne's):

- `D:\plajah game assets deign from promtps\racer\industrial districts`: 4 circuit maps, building / rail / crane / port / refinery / ship sheets, about 25 race shots.
- `D:\plajah game assets deign from promtps\racer\civic riverfront`: 5 district and circuit maps, about 60 asset sheets (civic buildings, opera, museum, glasshouses, festival stages and rigs, yachts, landscaping), about 50 hero shots.

## The map

The river runs north to south between x of about 3700 and 4700. The west bank holds the old Ironworks yards (x 3570 to 4122, z 150 to 1010) and the Port Branch freight line (Ironworks Yard station at 3366, 60). The east bank is about 5 km long, from the river mouth on the lake in the north (z of about -2500) to downtown Ironport and the Ironport Grand Circuit (z 1000 to 2300).

| Zone | Where | What | Source |
|------|-------|------|--------|
| A. New Ironworks Industrial Circuit | West bank: the old yards and west across the Port Branch | "North Harbor Industrial Raceway, Circuit II": 5.34 km, 20 turns, clockwise. Warehouse district and start/finish, container port, harbor hairpin, oil refinery, freight rail yard; an underpass under the railway (-12 m) and a bridge over the yard (+18 m). Replaces the old Ironworks route. | industrial districts |
| H. Harbor District Street Circuit | North end of the east bank, on the lake coast where the river opens out | 5.42 km, 20 turns: container yard, wharf quayside, dock basin with ships and cranes, pier warehouses. No train on the course. (Moved from the east-bank docks so the civic riverfront has the bank.) | industrial districts |
| 1. Opera & Marina | East bank, north | Grand opera hall on its own headland, yacht marina, waterfront plaza, west pier | civic riverfront |
| 2. Museum Plaza & Botanical Gardens | East bank, north-middle | Museum of science and art, botanical glasshouses, civic plaza, ferry terminal and historic pier | civic riverfront |
| 3. Concert Amphitheatre & Urban Beach | East bank, middle | Riverfront amphitheatre and festival grounds (a Chora Fest site), urban sand beach, beach pier, coastal boardwalk | civic riverfront |
| 4. Civic Parklands & Riverwalk Street Circuit | East bank, south, on the river frontage up to downtown's edge | Parklands, the Civic Riverfront Street Circuit (5.34 km, 18 turns, clockwise; pit lane, grandstands, riverwalk bridge, civic monument) | civic riverfront |

**Downtown is not changed.** Its streets, buildings and the Ironport Grand Circuit stay exactly as they are; the riverfront is added along downtown's river frontage only, between downtown and the water, and joins the existing streets where they meet it.

The whole bank gets Mediterranean stone embankments, a riverfront promenade, palm boulevards and the grand bridges from the corridor maps. The corridor map runs west to east along the water; on our map it turns a quarter turn so its water side faces the river (west) and Sector 1 sits at the north end.

## How it is built

- Track lines are traced from the maps (zoomed crops), scaled to each map's stated length (the maps' scale bars do not agree with their own lengths), and fitted onto the ground by a search over position and rotation that scores land, water and railway crossings (scripts/apex-sample-ground.mjs gives the ground grid).
- Every building, vehicle and prop type is a library piece: one builder per asset type, taking a seed and size, with the asset sheet's proportions.
- Each circuit is checked like the others: scripts/apex-probe-circuits.mjs (steps, grades, objects on the course), scripts/apex-lapdrive.mjs (a scripted lap), scripts/apex-shots-on-course.mjs (driver's-eye shots).
- Each hero shot gets a camera spot, like the reference scenes (src/referenceScenes.ts).

## Order

1. A, the new Ironworks.
2. H, the Harbor District circuit.
3. Sectors 1 to 4 and the Riverwalk circuit, then the hero-shot camera spots.

Kenne says up to two more circuits are coming.
