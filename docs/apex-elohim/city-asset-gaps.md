# Ironport city: assets still to build

Status: draft list, 2026-11-15. "Have" means it exists in the racer asset folder or the
86-building package. Everything else needs building or sourcing.

## What the satellite tile shows (inferred, to be redrawn by hand)
- River on the west with a long harbor: two rectangular boat slips and a basin at the top, a
  container and industrial yard, two finger piers with park greens, a seawall along the
  downtown frontage, and a marina edge to the south.
- A rail yard at the top that narrows into a rail corridor running north-south through the
  downtown grid, then continues south.
- A dense downtown core of dark towers on a rotated grid, with a rougher mixed-industrial
  fringe to the south and a finer residential grid to the north-east.
- A freeway diagonal with a cloverleaf interchange on the east side, and a second freeway
  arriving from the south-east.
- A lift or fixed bridge across the river to the south.

## 1. Harbor and port (real geometry needed; nothing exists)
- Quay walls and bulkheads: straight, corner and curved pieces, with bollards, fenders,
  ladders, edge kerbs and railings.
- Piers, finger piers, slips, mooring dolphins, breakwaters, harbor-entrance light.
- Container terminal: container stacks (20 ft and 40 ft, several liveries, no real brands),
  ship-to-shore gantry cranes, rubber-tyred gantry cranes, straddle carriers, reach
  stackers, trucks and chassis, gate complex, light masts.
- Bulk and liquid terminal: tank farm, pipe racks, conveyor galleries, loading arms. The
  Riverfront Silos hero building covers part of this.
- Vessels: container ship, Great Lakes bulk freighter, tug, ferry, pilot boat, fireboat,
  barge, yachts and sailboats for the marina, a floating-dock pontoon set.
- Rail: track, switches and frogs, signal gantries, level crossings, a locomotive, box,
  tank, hopper and flat cars, a turntable approach (the Roundhouse hero covers the shed).
- Bridges: lift or bascule bridge, a fixed river bridge, freeway overpasses, the cloverleaf
  ramps, pedestrian bridges, underpasses.
- River and bank: river bed profile, shoreline profile, seawall and rip-rap, water surface
  shader with shore foam.

## 2. Riverfront (geometry needed)
- Riverwalk paving, railings, benches, lamps, planters, bollards.
- Plaza kit for the paddock plaza behind the gantry (Founders Plaza pavilion exists), with
  fountain and steps.
- Marina docks and the clubhouse apron (Marina Clubhouse building exists).
- Pit lane: pit boxes, pit wall, garages, paddock tents, hospitality units.

## 3. Streets, intersections, sidewalks (tooling and kits)
- A street-mesh generator that turns the street plan into road surfaces, curbs, gutters,
  sidewalks, corner radii, curb ramps and crosswalks, with proper intersection patches.
- Surface variants: asphalt, brick pavers (Campus Martius and the Theatre District),
  concrete, cobblestone, gravel, wet versions. PBR textures for most of these are in the
  racer folder.
- Markings and decals: lane lines, crosswalks, stop bars, arrows, bike lanes, utility
  patches, tyre marks, drainage grate (the T4 bump).
- Medians, islands, the Campus Martius roundabout, guardrails.
- Circuit furniture: start gantry, grandstands, concrete and tech-pro barriers, tyre walls,
  catch fencing, kerbs and rumble strips, marshal posts, timing loops, run-off, sponsor
  boards (fictional only).
- Street furniture: street lights, traffic signals and mast arms, street-name and traffic
  signs (fictional names are fine for streets), hydrants, bus shelters, benches, bins,
  parking meters, planters, mailboxes, newsstands, utility poles.
- Vegetation: street trees, park trees, shrubs, grass tufts, planters; a Michigan species
  set (maple, oak, honey locust, white pine, beach grass for the dunes).
- Ambient: traffic cars and buses, trucks, taxis, emergency vehicles, pedestrians
  (Detroit-representative crowds per the standing rule), cyclists.

## 4. Buildings
Have: 36 hero and 50 generic models, LOD0 and LOD1, base PBR sets.
Needed:
- More generic downtown types so 800+ placements do not repeat (target 25 to 30 more):
  art-deco and brick mid-rises, bank, courthouse, hospital, parking-structure variants,
  hotel variants, church variants, school, police station, post office, bus station,
  substation, water tower (urban), construction crane, stadium parking, billboards.
- A modular facade kit (storefront bands, windows, cornices, corner pieces) for infill.
- LOD2 silhouettes and far-city impostors; collision meshes; night emissive windows.
- A texture strategy that fits GPU memory (atlases or streaming). The review viewer
  already ran out of memory with full-size textures.
- Palette variants B and C, and footprints from Terra parcels instead of the block grid.

## 5. Terrain and elevation for the city
- A city height model, not flat: gentle rise from the riverfront to downtown and further
  inland, the Gratiot dip, bridge ramps, underpasses and quay edges.
- Road grading that keeps carriageways smooth and puts sidewalks above the road.
- Harbor bathymetry and cut-and-fill at the basins.

## 6. Tools and pipeline
- A hand-authored city plan editor or file format (streets, classes, parks, districts,
  harbor zones) that exports to the map graphic, the ground geometry and the lots.
- A Forza-style map renderer for the pause map and minimap (started).
- Terra integration for real centerlines and parcels, if we choose to use them.
- Placement rules: lots and frontage, facing, hero anchors, district density.
