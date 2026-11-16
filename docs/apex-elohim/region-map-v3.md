# Apex Elohim: region map v3 (draft)

Files: `region-map-v3.png` (whole region), `city-circuit-detail.png` (city circuit on the
rotated street lattice), `cliff-raceway-profile.png` (elevation), `region-v3.json` (data).

## How the circuits are tied to the map now
- **City:** the downtown street grid was measured from the satellite tile. It is an
  orthogonal lattice rotated about 30.5 degrees, with a block pitch of about 80 m. The
  circuit is laid out on that lattice, so every straight is a real street and every corner
  is a real intersection. Length 4.21 km, matching canon.
- **Rally:** the road legs are routed over the extracted road pixels, so they follow the
  actual farm gravel roads and the forest track. Only the dashed forest trail is new.
- **Raceway:** placed on the wooded bluff beside the lake. It uses the beach flats and
  the existing switchback tracks for access.

## City circuit design (league-style reasoning)
- Pit lane and paddock along the 0.96 km riverfront straight. T1 is the only big
  braking zone and the main overtaking place.
- A quick left-right esse (T2 and T3) follows T1, then a long run to T4.
- The return runs down a different avenue. A small chicane on the bottom straight
  controls the speed into the final corner.
- Walls on both sides everywhere, as in the canon.
- Not yet done: brick-paved sections, run-off and kerb design, camera and spectator areas.

## Great Lakes Cliff Raceway (as requested)
Start low on the beach flats. Switchback climb up the bluff (max about 8%), through a
0.65 km tunnel under the ridge, out onto a cliff-top run about 135 m above the lake with
lake views, then a plateau sweeper and a long descent to the beach. Length about 10 km, so
a shorter sprint layout is probably wanted too. The elevation numbers are design targets,
not real terrain yet.

## Rally stage
About 11 km using existing roads: a farm-grid loop, forest track, creek ford, and one
new cut trail. Service park at Otter Creek.

## Open items
- Streets cannot be traced automatically in the dense core because shadows hide them.
  Terra's real Detroit centerlines (`fetchDetroitStreets`) could replace the lattice fit.
  I have not called that service.
- Corner names beyond T1 are not placed on the map yet.
- Elevation is a design target. Heightmap generation is the next build step.

## Terrain build (first pass)
- `games/forth-horizon/tools/build_region.py` makes the height field from the satellite tile
  and the circuit data. Output goes to `public/games/forth-horizon/region/`
  (`height.f32`, `albedo.jpg`, `region.json`). Datum: lake surface = 0 m, 12 m per sample.
- View it with `npm run forth:dev`, then open `/region.html`. It has camera presets, a
  tunnel x-ray toggle, a height exaggeration slider, and fly-through laps of the cliff
  raceway and the city circuit.
- Circuits are graded into the terrain: the city is flat, the rally follows smoothed
  terrain, and the cliff raceway follows its designed profile (road grade max 6.4%).
  The ridge above the tunnel is built into the terrain.
- Known rough spots: the satellite colour test can mistake dark shadows for water (the
  downtown core is masked out by hand), dunes and hills are procedural noise rather than
  authored terrain, and there are no buildings or trees yet.

## City buildings (first pass)
- `games/forth-horizon/tools/place_city.py` splits the downtown slice into lots from the
  street lattice, then places all 36 hero buildings and generic buildings by district
  rules. Output: `public/games/forth-horizon/region/city.json` (860 buildings) and
  `city_debug.png`.
- The viewer loads the models from the Ironport package folder (`/ironport-assets/`).
  To stay inside GPU memory it uses the Quest-tier textures and base colour only, and
  shares one copy of each texture. Full PBR needs a lighter approach (atlases or
  streaming) before it ships.
- Hero positions come from district anchors I chose (circuit corner, Woodward, stadium
  district and so on). They are not real parcel positions. Building facing is a guess
  that has not been checked against each model's front face.
- Not done: lots outside the 2.3 x 2.4 km slice, parks and trees, street furniture, the
  palette variants, and Terra parcel footprints.

## City plan direction (2026-11-15, late)
- Decision: mix of real Detroit centrelines (downtown blocks) and a hand-authored harbor,
  riverfront and country connections. The mock satellite is used to infer the setting,
  not as the street source.
- `games/forth-horizon/tools/fetch_detroit_streets.ts` pulled 2,470 downtown centreline
  segments through Terra's adapter (public Detroit open data, bounding box only). Saved to
  `tools/data/detroit_streets.json`.
- `tools/city_plan_real.py` rotates them so the river runs down the left edge and writes
  `docs/apex-elohim/city-plan-real.json`. `tools/render_city_map.py` draws the stylised
  map: `city-map-real-v0.png`.
- The first auto-inferred plan (`city-map-plan-v0.png`) read as a generic grid and is
  retired.
- Asset gaps for the harbor, riverfront, streets and buildings: `city-asset-gaps.md`.
- Not yet wired: the 3D viewer, terrain, circuit and building placement still use the old
  satellite-based lattice. The real plan has to replace them next.

## City rewired onto real Detroit data (first pass)
- `tools/real_city.py` is the shared transform: lat/lon -> river-left canvas -> region world.
  Campus Martius lands on the satellite downtown, shifted inland so Atwater sits on land.
- `tools/city_route.py` + `tools/finalize_circuit.py` route the Grand Circuit along real
  streets (Atwater, Beaubien, Jefferson, Woodward, Fort, Monroe, Brush, Gratiot, Riopelle).
  3.95 km. It is not tuned yet: corner names, the hairpin and the 4.2 km target.
- `tools/fetch_detroit_parcels.ts` pulled 3,875 parcels (1,777 improved). 
  `tools/place_city_real.py` puts each hero on the parcel of its real analog and fills the
  other improved parcels by size and height estimate: 1,152 buildings, fronts facing the
  nearest street.
- `tools/export_city_streets.py` writes the street runs; the viewer draws asphalt, raised
  sidewalks and centre lines. `tools/paint_city_albedo.py` replaces the satellite imagery
  under the city with a neutral ground tone.
- City terrain now rises from the waterfront (about 2 m) to about 12 m inland.
- Not done or not checked: street-level view, building facing, intersection and curb
  geometry, harbor and riverfront geometry, the water edge (the satellite harbor is still
  the water source and does not match the real riverfront exactly).

## Fictional pass: harbor, full blocks, more terrain
- Direction from Kenne: the map is now the fictional version. Real data is a base, not a
  limit, so buildings fill every city parcel (3,167 placed, 36 heroes on their analog
  parcels) and the terrain can be invented.
- Harbor geometry (`tools/harbor_plan.py`, built in `src/region.ts`): quay walls, coping,
  bollards and light poles along the satellite shoreline, two container terminals with
  stacked containers, six plus three ship-to-shore gantry cranes, a container ship and a
  bulk freighter in the slips, transit sheds, a tank farm and a rail yard fan.
  Missing: lift bridge, tugs and small craft, straddle carriers, marina, pier promenades.
- Countryside relief: rolling moraine across the farmland, Cathedral Ridge (about 38 m),
  a northern ridge, taller Pinewood and Kettle hills. Rally stage now climbs to about
  110 m, max grade 11.9%.
- City relief: waterfront scarp up to a downtown plateau, Highland Heights (about 46 m,
  north-east), a Midtown knoll, Lodge Ridge under the freeway, the Gratiot dip, and a
  bluff south of downtown. City circuit now spans 3 to 14 m, max grade 2.4%.
- Buildings use five-point ground sampling, so on the new slopes some will sit on short
  foundations or float slightly. Terraced foundations are a to-do.

## Slopes and driving
- Buildings now take the lowest of a 5x5 ground sample across their footprint, minus 0.35 m,
  so none stand on stilts; uphill sides are buried instead.
- The region viewer has a drivable car: `Drive city`, `Drive cliff`, `Drive rally`. W/S
  throttle and brake, A/D steer, Space handbrake, R reset, Esc exit. Arcade physics: the car
  follows the terrain with pitch and roll, gravity on slopes, drag, speed-sensitive steering,
  drift under handbrake, water slows it and a deep splash resets it.
- Buildings are solid (footprint collision from the parcel centre, width, depth and facing).
- Tested with injected key events only: acceleration to about 150 km/h, steering, a building
  crash and driving over dunes all behaved. Not done: harbor and street-furniture collision,
  checkpoints and lap timing, opponents, road-versus-offroad grip, a real car model.

## City circuit tuning
- Route: Atwater/Orleans start, Atwater/Beaubien, Jefferson/Beaubien, Jefferson/Woodward,
  Woodward/Fort, Monroe/Brush, Gratiot/Brush, back via Jefferson/Orleans. 4.24 km, 13 corners
  (`tools/finalize_circuit.py`).
- Designed elevation: riverfront 3 m, scarp climb to 24 m, crest 46 m near Campus Martius,
  down to the Gratiot dip at 8 m, home at 4 m. The terrain is graded along the street so the
  blocks around it form the hill. Result 3 to 43 m, max grade 7.6%, p95 5.8%.
- Corners are detected from the path and named from the canon list, with names placed by
  the nearest waypoint (T1 RenCen Hairpin ... T13 Riverfront Final). Names are approximate
  in geography.
- Viewer furniture: red-and-white barriers both sides, kerbs on corner insides, start and
  finish gantry with a chequered line, a pit lane beside the straight, sector 2 and 3
  arches, corner labels.
- Lap timing on Drive city: starts on leaving the line, sector splits, last and best lap.
- Not verified: which side the kerbs land on at each corner; pit lane position against the
  street width; barriers are visual only (the car does not collide with them).

## Buildings off the streets
- Cause: models were fitted to the parcel rectangle with 9 m of slack and their front
  extras (awnings, steps) were ignored, and parcels reach the street edge, so footprints
  spilled onto the drawn road and sidewalk.
- Fix in `tools/place_city_real.py`: each building keeps clear of the drawn road plus
  sidewalk edge (class based) with a margin, pushes away from the street up to 7 m, and
  falls back to a smaller type. Generics are now scaled non-uniformly (down to 50%) to fit
  small lots. Heroes try the nearest parcels until one clears (up to 45 m push).
  Overlapping footprints (more than 3 m) are removed.
- Result: 2,110 buildings (was 3,167), 2 heroes still touching a street edge by a few
  metres; 376 parcels have no model that fits clear of the street, and 706 buildings were
  removed as overlaps (the parcel data has stacked and adjoining parcels).
- The city reads sparser outside the core. A fill pass (merge adjoining parcels, infill
  buildings on the empty ones) is the next step if full blocks are wanted.

## Infill pass
- `tools/infill_city.py` runs after `place_city_real.py`. It builds a 3 m occupancy grid over
  the city hull (roads and sidewalks with margin, existing buildings, water and a 12 m
  shore buffer, steep slopes, harbor quays, terminals, sheds and tanks), then places
  buildings frontage first, snapped to a setback line and facing the street.
- Mix by district: core and mid use office, apartment and mixed-use types; the outer
  neighbourhoods are about 88% houses (ranch, townhouse row, colonial, craftsman, tudor,
  split level, duplex) with a few corner shops.
- Result: 7,805 infill buildings, 9,916 in total. 3 buildings (2 heroes, 1 infill) still
  touch a street edge. Frame rate with this many instances has not been measured.
- Run order: `place_city_real.py`, then `infill_city.py`.

## City realism pass (level reopened while the car is built elsewhere)
- Neighbourhood ground: concrete downtown fading to lawn green with distance from Campus
  Martius (`tools/paint_city_albedo.py`), so the grass detail shader reads on the lots.
- Streetscape: 12,867 street trees (fewer downtown, more in the neighbourhoods, kept off
  intersections and buildings) and 3,177 street lights with emissive heads
  (`buildStreetscape` in `src/region.ts`).
- Sun shadows: a shadow-casting sun follows the camera or car (about 380 m box, only when the
  camera is within 900 m). Buildings, trees and terrain cast and receive.
- The wide yellow circuit line is off by default; barriers, kerbs, gantry, pit lane stay on.
- Start line moved 90 m down the Riverside straight (the route's first node was a corner,
  and cars spawned into a barrier). Spawn is on the grid about 40 m behind the line.
- Frame rate measured in the Browser pane while driving: about 34 fps.
- The car is a procedural stand-in (`src/car.ts`); the real one is being built elsewhere and
  should replace `makeCar()` in `src/region.ts`. `/car.html` is a review room with silhouette
  scoring against the turntable cut-outs; the stand-in scores 63% side and 61% rear.

## Street surfaces rebuilt (intersections, kerbs, scale)
- Cause: asphalt and sidewalks were separate ribbons along every centreline, so they overlapped and crossed at intersections, and the paver tile was about 2.6 m per repeat of a 1.4 m-block texture.
- Now `tools/build_city_mask.py` bakes the street network to `region/city_mask.png` (R carriageway, G sidewalk, 1.5 m/px, 2494 x 3841). Carriageways are unions of strokes, so crossings merge into one surface; a morphological close gives rounded kerb returns; the sidewalk wraps the corners. The terrain shader paints asphalt (4 m tile), pavers (1.7 m tile) and a concrete kerb band from the mask. Seamless tiles `asphalt_plain.jpg` and `paver_plain.jpg` are cut from the reference sheets.
- Concrete barriers are now jersey-profile geometry (0.81 m tall, 3.05 m long) textured from the Concrete Crash Barriers sheet: grey, hazard-stripe and worn red/white.
- Not done: crosswalks, lane markings in the mask (1.5 m/px is too coarse for centre lines), kerb height (the kerb is painted, not raised), and the 30 foliage sprites in `public/games/forth-horizon/sprites/` (cut from the sheets by `tools/build_sprites.py`) are not in the viewer yet.
- Building PBR: full base, normal and roughness maps now load (set `?lowtex` to fall back to base-only). Not yet judged visually.

## Photographic trees
- `tools/build_sprites.py` and `tools/build_conifers.py` cut individual trees and plants out of the foliage sheets into `public/games/forth-horizon/sprites/` (white pines, red oaks, weeping willow, street trees, coastal shrubs, reeds, ferns, logs). 38 sprites; only the trees are used so far.
- Street trees (12,867) are now two crossed photographic cards each, in `buildStreetscape`.
- `tools/build_forest.py` scatters 90,000 forest trees where the satellite is dark green (outside the city and off the water); conifers dominate the Pinewood north-west, broadleaf and autumn oaks elsewhere.
- Cards do not cast shadows and use flat upward normals. Measured 53 fps in the Browser pane on the forest view.
- Not done: shrubs, grass, reeds and beach grass from the sprites; LOD; wind; the ground discs are trimmed but oak bases are crude.

## Facade depth and the map screen
- Buildings use steep parallax mapping (8 layers, driven by base-colour luminance, faded beyond about 200 m) plus stronger relief normals (`patchParallax` in `src/region.ts`). Brick mortar lines and window recesses read as depth up close; `?lowtex` turns it off. Not yet checked on glass and hero facades.
- The overview is now a map screen: dark backdrop (no sky, no fog), closer framing, slow auto-orbit, vignette, the map shifted right, and a menu of four event cards (city circuit, cliff raceway, rally stage, free roam). A "MAP" button returns to it from anywhere. The dev panel is hidden on this screen.

## Glass and hero facade depth
- First parallax pass streaked badly on the hero facades: the offset was a fixed texture fraction, but hero textures stretch over a whole building. It is now a depth in metres (0.16 m) converted to texture units from the surface's own uv-per-metre (screen derivatives), so every facade gets the same physical relief.
- Result: the Guardian's brick, glazed tile banding and recessed windows read as depth; glass towers show recessed mullions and the sky reflection in the sheet.
- Glass materials (name contains "glass") get metalness 0.55, roughness 0.14 and stronger environment reflection; hero facades get softer normals.
- Frame rate while driving the city circuit: about 56 fps in the Browser pane. Not done: lit windows at night, real glass transparency, hero facades still sample the 1024 tier, rooftops and sides of hero buildings are flat colour (the roster notes say the facade texture is front-only).

## Menu flow, clouds, race backdrop
- Menu cards open a briefing (event name, length, route notes, START / BACK) while the camera flies to the venue (1.5 s eased move). START runs a 3-2-1-GO countdown with the throttle locked, then drives. Free roam starts on the coastal highway. Esc or the MAP button returns to the map screen. Tested by clicking the Pinewood card, START and watching the countdown.
- Two layers of procedural clouds float at 2,900 m and 3,900 m, drifting slowly, lit white with a hint of the time-of-day tint; thin and light on request.
- The map screen backdrop now has racing graphics: speed streaks, a ghost circuit outline, tyre marks, chequered strips top and bottom, a kerb stripe, a rev arc with lap readout, sector bars and a large ghost race number.
- The map slice fades into the backdrop over 1.3 km at its edges (terrain and lake share the fade); forest and street trees are hidden on the map screen.
- Not tested: the other three START buttons, Esc from a drive, lap timing starting after the countdown.

## Plajah design language on the menu
- Source: `docs/PLAJAH_DESIGN_SYSTEM.md` and `styles/plajah-ds.css`. The menu, briefing, HUD, dev panel and map backdrop now use the brand tokens: purple #6B0099, magenta #D40055, orange #FF8C00 (action), cyan #00DAF3, lilac #D0BCFF, on the Plajah theme background #1a0026.
- Type: Outfit for display and labels (0.28 em tracked uppercase eyebrows), Inter for body, JetBrains Mono for timecodes and data. Loaded from Google Fonts in `region.html`.
- Shapes and surfaces: glass cards at 24 px radius, 28 px sheet for the briefing, pill controls, hairline borders, blur. START is the orange accent pill with near-black text; BACK and the MAP button are the secondary glass pill. Event accents: city orange, cliff cyan, rally magenta, free roam lilac.
- The map's default framing is closer (about 6,500 m away, was 11,000 m) so it fills most of the screen.
- Not checked: the in-game HUD and briefing panel in the new style, light themes, and whether the web fonts load offline.

## Settings instead of the dev panel
- The always-on debug panel is gone from the game screens. A gear button (top right, next to MAP) opens a Plajah-styled Settings sheet: Graphics (time of day, bloom), World (harbor, streets, buildings, trees and lights, labels), and a collapsed "Developer tools" section holding the camera presets, fly and drive buttons, circuit line, x-ray and height scale. The camera/altitude readout shows only while Developer tools is open.
- The map screen's chequered strips were replaced by solid ember-gradient rails, since the checks read like a transparency grid.

## Music
- Source folder: `racer/Music apex elohim/` (the four files now live there). `tools/prep_music.py` copies the distinct tracks into `public/games/forth-horizon/music/` and writes `music.json` (menu list and driving list). Titles containing "apex elohim" are menu tracks; the rest play while driving. Run it again whenever songs are added.
- `apex elohim.mp3` and `apex elohim 2.mp3` are still byte-identical (same MD5), so the script uses one; the rest are High-Speed Ritual and High-Speed Ritua 2l.
- Behaviour: menu tracks on the map screen and briefings; the driving tracks alternate and advance when one ends; 1.6 s crossfades; starts on the first click or key press; volume slider in Settings > Audio.
- Verified: the menu track loads after a click. Not verified by ear: levels, crossfade, driving tracks.

## Downtown corridor along the Grand Circuit
- Reason: the route ran mostly past houses. Everything within 240 m of the circuit centre line is now commercial: office towers, hotels, apartment towers, mixed-use, civic and tech buildings and parking decks, with small shops and a few cafes as fillers, and no houses. Heights are stretched vertically (0.85 to 2.3 times, 45 to 130 m target) so the street reads as a canyon.
- Implemented in `place_city_real.py` (parcel pass) and `infill_city.py` (infill pass) from `docs/apex-elohim/city-circuit-real.json`; the viewer applies the new per-building vertical scale `sy`.
- Run order unchanged: `place_city_real.py`, then `infill_city.py`.

## Zoning plan (replaces the corridor patches)
- `infill_city.py` now builds blocks (connected free land between streets) and gives each block one land use: CBD (within 200 m of the circuit or 650 m of Campus Martius), MID (to 420 m / 1.1 km), STRIP (arterial-fronting retail, 1.1 to 2.6 km), INDUSTRIAL (within 450 m of the quays), RESIDENTIAL (townhouses and duplexes near the core, detached houses beyond). Heights fall with distance, one base height per block. `place_city_real.py` now places only the 36 heroes (`HEROES_ONLY`, default on).
- Result: 144 CBD, 95 MID, 83 STRIP, 196 residential blocks; 8,731 buildings. Within 200 m of the circuit: 517 buildings, median 85 m, 96% over 30 m, only apartment towers, offices, hotels, mixed-use and lofts (no shops, no houses). 200 to 420 m: median 50 m. Beyond 900 m: median 10 m, mostly houses.
- Known flaw: STRIP blocks are filled with whatever small retail fits, so barber shops dominate (867). Needs weighted types.
- Not modelled: alleys, parks and plazas, loading access, parking provision.

## Retail fix result
- STRIP blocks use a weighted mix with per-block caps. Retail counts: mixed-use 533, strip malls 277, auto repair 87, barber 63, diner 63, pharmacy 55, grocery 54, gas 29 (was 867 barber shops). Total 7,994 buildings.

## Building pass, step 1: roofs
- `addRoofDetails` in `src/region.ts` adds to every non-residential building over 13 m: a stone cornice slab at the roofline (and a base course over 30 m), rooftop mechanical units, elevator penthouses over 26 m, wooden water tanks on legs (some, 18 to 75 m), and radio masts with red lamps over 58 m. About 3,150 cornices, 1,070 plant units, 390 tanks and 750 masts, all instanced. Checked on a rooftop view.
- Next in the plan: ambient occlusion, facade grime and streaks, sky reflections on glass, modular facade kit with real window recesses, texture upscaling and GPU compression, night windows. New building textures: none were found in `racer`; the 01:44 files are in `Shooter/`.

## Track assets and cars from Antigravity (reviewed with /assets.html)
- `assets-src/props/` (20 files) are image-to-3D blobs: one fused mesh per sheet, not usable. `assets-src/cars/` has 23 GLBs: 18 procedural CAD cars (about 35k triangles, 9 to 12 named parts) and 5 blobs. None are 1:1 with the turntables.

## Sovereign GT-R fit (stand-in car)
- `car/sovereign/fit_profile.py` extracts the side silhouette from the turntable cut-outs; `src/car.ts` now takes its roofline from it. Side silhouette match 63% -> 73.6% (aspect 3.12 vs reference 3.13). Rear/front are 3/4 views, so widths could not be fitted; the cabin glass is crude. Not at the 95% gate; this route has a ceiling. Next: image-to-3D (Hunyuan) from the cleaned turntable frames once the GPU is free, then re-score.
