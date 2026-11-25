# Apex Elohim: work to do next (written 2026-11-16, dev paused for play-testing)

Principle ([[apex-satellite-is-guide]] in memory): the satellite map is a guide, not the truth. The modelled zones (`region/user_map.json`) and the sim logic decide the layout; waterways stay as they are.

## Map logic
- [ ] **Full connectivity audit** after the last changes: every street part of one network, every building with a driveway or street frontage, no orphan streets (re-run `tools/access_and_parking.py` last, order in `tools/PIPELINE.md` below).
- [ ] **Block interiors** in the dense zone are still partly empty between towers; more mid-rise and parking structures (`tools/densify_zones.py`, raise the lattice density / add alleys).
- [ ] **Parking lots**: only ~225 for the buildings that need one; beside/behind lots work, front lots rarely fit. Drive-aisle layout and lot-to-street driveways that do not cross buildings.
- [ ] **Industrial area** is denser but not "truly" dense: more warehouse rows, rail-served yards, truck courts; container stacks outside the port platform.
- [ ] **Waterfront zone** gets no streets from the generator (too small); lay a promenade and slips by hand in the editor.
- [ ] Zones overlap rules: farmland zones cover most of the map; unmarked land should stay forest/dunes/country (check sprawl along highways is not too uniform).

## Rail
- [ ] **Port spur**: the Port Branch passes west of the port district; add a freight spur into the yards and the power plant (fuel by rail).
- [ ] Check **level crossings** on screen (gates, lights) where rail meets roads; drive across one.
- [ ] Trains and planes: confirm they run (sim layer), tune timetable and counts; rail through the shipping river is a tunnel in the plan: draw its portals and check clearances.
- [ ] Rail should serve the layout: stations at the town centres (Southgate, Ironport Central), freight at Ironworks Yard / Port Yards. Review the three generated lines with the editor.

## Power and utilities
- [ ] Pylon routes were straight lines nudged off roads: re-route along corridors (highway verges), keep clear of buildings, and add distribution poles along streets.
- [ ] Substations are simple fenced yards; give each a control building and a feeder to its street.
- [ ] Water tower / treatment works / fuel depot where a city would need them.

## Bridges and tunnels
- [ ] Northgate Bridge ends sit on an island between two channels; the ramp continues high over the second channel. Either span both channels or bring the deck down on the island.
- [ ] The hero bridge's main span is sized for ~700 m; the Halcyon span (960 m) may look stretched.
- [ ] Auto bridges (roads over water) are low concrete decks; add railings variety and check small streams.
- [ ] Lake-coast tunnel: check lighting inside, the ends (portals) and the shoreline highway grade through it; the cliff raceway tunnel is separate.

## Ground and look
- [ ] Ground texture inside built zones is a flat repaint: add street-side detail (sidewalks, lawns, parking tarmac) from the zone data.
- [ ] Old satellite shows through where we did not repaint (tank pond ring in the port, other baked structures); repaint or mask them.
- [ ] Terrain: 6 m height grid is good for towns but cliffs/dunes could use a finer mesh near the camera; streams carved from the map not done.
- [ ] Vegetation system (`src/vegetation.ts`): trees still use the old cards/3D system; add rocks variety, reeds along water, crops as rows.

## Game
- [ ] Industrial circuit: not driven yet. Check the start line, wall collisions, lap finish, AI grid, weather.
- [ ] Menu: carousel and idle beauty shots verified once; check on phone widths and with a controller.
- [ ] Performance: the city takes minutes to load in the browser pane and freezes the page while loading (11k buildings, per-model textures); chunk/stream the buildings, merge draw calls, lower the texture request count.
- [ ] Map editor (F2) is dev-only; creeks drawn are stored but do not carve the ground yet.
- [ ] Cloud saves are in the code; the ops Firestore rules deploy for `gameSaves` goes out with this ship (watch the `deploy_rules` job).

## Pipeline (run in this order after changing zones, roads or terrain)
```
python tools/build_terrain_hi.py            # heights (graded zones), ground texture, land class
python tools/infill_user_zones.py           # streets + buildings per zone, highway sprawl
python tools/plan_port_district.py          # port platform, piers, yards, circuit
python tools/plan_utilities.py              # power plant, substations, pylons
python tools/detail_zones.py                # neighbourhood centres, downtown core, trees, trails
python tools/densify_zones.py               # fill block interiors
python tools/audit_and_seed.py              # riverside facilities, audit roads/slope/overlap
python tools/access_and_parking.py          # connectivity, driveways, parking lots
python tools/fix_driveways.py               # driveways house-to-curb only, concrete, never across a street or a house
python tools/subdivide_blocks.py            # new local streets through oversized residential blocks (starts from city_streets.before_subdiv.json)
python tools/relay_houses.py                # houses onto platted lots facing the street, empty street grids platted (starts from city.before_relay.json)
python tools/civic/district_fix.py          # join dead-end streets, access drives / farm lanes, clear buildings off carriageways
python tools/plan_trench.py                 # depressed downtown freeways: bed profile, ramps (region/trench.json)
python tools/build_city_mask.py             # street widths (real-world, freeway lines are one carriageway each) + the trench cut (alpha)
python tools/build_curbs.py
python tools/civic/district_audit.py        # what is left: region/district_audit.json
```
(all with `IRONPORT_PKG=public/games/apex/ironport`).

## Name (open)
Kenne likes "Apex" and is open to fresh takes. Candidates written 2026-11-16 (the game is a Lake Michigan / Detroit-flavoured open-world racer in the Legend of Elohim universe):
- Apex family: **Apex Meridian**, **Apex Ironport**, **Apex Lakeshore**, **Apex Elohim** (current).
- Place-led: **Ironport** (city), **Ironport Rush**, **Great Lakes Apex**, **Lakefront Legends**.
- Short and strong: **Redline Coast**, **Kettle Road** (the generated road names), **Halcyon** (Port Halcyon, Halcyon Gateway), **Nightshift Ironport**.
- Universe-led: **Elohim Run**, **Legends of Elohim: Apex**.
Check each for existing trademarks before committing; renaming touches `region.html`, `index.html`, the menu title in `src/region.ts`, the Games catalog entry and store listings.
