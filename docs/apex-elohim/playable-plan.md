# Apex Elohim: making it play and look like the reference assets

Status 2026-11-15. This is the plan after studying the racer folder (325 images, 29 videos) and
wiring the first real textures into the viewer.

## 1. What the references show (the visual target)
From frames of the motion studies and the texture sheets:
- **Cars are photoreal:** deep clearcoat paint with soft environment reflections, visible
  panel gaps, forged and multi-spoke wheels, real brake discs and calipers, cut-out wheel
  arches. They are shown wet (reflections in the tarmac), at dusk, and at night under
  floodlight masts.
- **Surfaces carry history:** rubber streaks on racing lines, tyre marks at the starting
  grid, worn red-and-white kerbs with rubber, painted pit-lane numbers and hazard stripes,
  cracked and patched asphalt, mossy cobbles, rusted drain grates.
- **Effects are heavy:** tyre smoke that lingers and swirls, dust plumes behind rally and
  desert cars, sparks and flame from backfires, brake discs glowing orange, spray in the wet,
  motion blur, wide-angle low cameras, depth of field on close shots.
- **Sky and light:** warm golden hour, sunset clouds, a dusk gradient and a starry night sky
  are all supplied as skydome images.

The viewer is far from this today: the car is a placeholder box car, buildings are flat-lit
low-poly models, there is no particle system, no reflections on the road, no night lighting.

## 2. What is in the folder (inventory)
| Group | Count | Use |
|---|---|---|
| Cars (design sheets, turnarounds, interiors, 29 videos mostly turntables and motion) | about 113 | car modelling in Argilla, livery, behaviour reference |
| Road and ground textures (asphalt, wet tarmac, cobble, pavers, concrete, pit lane, grid, kerb, rumble strip, gravel, dirt, mud, hay) | about 40 | surfaces |
| Terrain and heightmaps | about 45 | landscape, ground splat |
| Foliage sheets (trees, pines, beach grass, crops, wetland, urban) | about 27 | vegetation |
| Building facade textures | about 23 | buildings |
| Sky and atmosphere (clear, golden hour, sunset, dusk, sunrise, stars, rain, wiper, lens flare) | about 28 | skydomes, weather overlays |
| Effects sprite sheets (smoke, sparks, flame, dust, brake glow) | about 33 | particle systems |
| Track props (barriers, catch fencing, grandstand, gantry, speaker towers, pit equipment) | about 13 | circuit furniture |
| Maps | about 11 | already used |

All textures are 1376 x 768 photographic albedo images, not square tiles and not PBR sets.
Many are close to seamless (sand, grass, gravel, hay, cobble, pavers). The kerb, grid and
pit-lane sheets are single placed designs, not repeating tiles.

## 3. Wired in this pass (viewer `/region.html`)
- 25 reference textures copied to `public/games/forth-horizon/tex/` (1024 wide):
  `tools/prep_textures.py`.
- Streets use the reference asphalt (with its lane marks), arterials and freeways the highway
  asphalt, sidewalks the concrete paver sheet.
- The city circuit has its own asphalt surface, kerbs from the reference kerb texture, a
  starting-grid decal, and a pit lane from the pit-lane concrete.
- Terrain gets close-range detail from the grass, sand, forest-floor and gravel textures
  blended over the satellite colour.
- Skydomes: golden hour, clear, sunset, dusk, night, sunrise, with matching sun, fog and
  reflections. A bloom pass is on by default.
- Not wired: wet tarmac, cobble, rumble strips, mud, dirt road, hay. Facades come from the
  building package only.

## 4. What "playable like Forza" needs (systems)
Phase A, feel: a proper car model with working wheels and suspension; a real tyre and
suspension model (weight transfer, slip angles, surface grip by material); gears and engine
sound; damage; cockpit, bonnet and chase cameras; a Forza-style HUD (speed, gear, rev bar,
lap, position, minimap, racing line assist).
Phase B, racing: AI drivers on the racing line; grid start with lights; laps, positions,
penalties, pit lane; replays with the broadcast camera set from the cinematic shots; photo
mode.
Phase C, game: garage, car upgrade and tuning with the fictional engines, events and
championships, festival hub, online ghosts, Plajah FM radio in the car.
Phase D, look: PBR car paint, wet roads with reflections, night lighting, particles from the
sprite sheets, motion blur, depth of field, rain overlay.

## 5. Asset sheets to build (the gap list)
Prompt rules from `PROMPT_CONTEXT.md` apply: fictional names only, no real brands, no
"Forza" wording, Michigan-honest terrain, Detroit-representative crowds. Every sheet is
for the builder, and the roster docs win on any number.

### Cars (highest priority)
1. For each of the 12 garage cars: exploded part sheets, one per car: body panels, chassis,
   suspension (double wishbone, pushrod, dampers, springs), brakes (disc, caliper, ducts),
   wheels and tyres, engine bay, intake and exhaust, interior (cockpit, dash, seats).
2. A fictional engine family sheet set matching the roster (V8, V10, V12, electric
   motor and battery) for the simulation.
3. Livery sheets: three paint schemes per car on clean templates (no real sponsors).
4. Tyre sheet: compounds, sidewall designs (fictional), tread patterns.

### Road and surface texture sets (tileable, with normal, roughness, height)
5. Asphalt: new, worn, patched, wet, with rubber racing line, with tyre marks.
6. Brick pavers (Campus Martius, Theatre District), cobble, concrete slab, sidewalk pavers
   (all four with wet variants).
7. Kerb set: red-white, with rubber, apex and exit versions; rumble strips; run-off
   gravel and sand traps; pit-lane concrete with decals.
8. Road decal atlas: crosswalk, stop bar, arrows, bike lane, lane lines, manhole, drain
   grate, utility patch, painted circuit numbers.

### Circuit furniture
9. Barriers: concrete, tech-pro, tyre wall, catch fencing, marshal post, lighting mast,
   timing loop, sponsor boards (fictional).
10. Grandstand (modular), pit garages, paddock tents, start gantry (the sheet exists),
    grid boxes, podium and parc ferme.

### Harbor and port kit
11. Quay wall and bulkhead module set, pier and slip pieces, bollards, fenders, ladders.
12. Gantry cranes, RTG cranes, straddle carriers, reach stackers, container variants, tank
    farm, pipe racks, conveyor galleries.
13. Ships: container ship, Great Lakes freighter, tug, ferry, pilot boat, fireboat, yachts.
14. Rail yard kit and bridges: lift bridge, overpasses, ramps, signal gantries.

### City and environment
15. Modular building kit and 25 to 30 more generic downtown buildings (list in
    `city-asset-gaps.md`), LOD2 silhouettes, night emissive windows.
16. Street furniture: street lights, signals, signs, hydrants, bus shelters, benches,
    bins, planters, fences.
17. Vegetation as alpha cutout cards and meshes: street trees, maple, oak, white pine,
    beach grass, reeds, crops, shrubs. The existing sheets are not cutouts yet.
18. Equirectangular skydomes at 4k to 8k, HDR if possible, matching the current six moods;
    cloud layers and rain overlay.

### Effects flipbooks
19. Tyre smoke, dust plume, sparks, backfire flame, brake glow, water spray, splash,
    engine heat haze, as 8 x 8 flipbook sheets with alpha.

### UI
20. HUD kit: speedo and tacho designs, minimap frame, lap and position panels, event
    banners, menu screens (fictional branding only).

## 6. Honest gaps and risks
- The reference quality is photographic. Real-time can approach it with PBR, reflections,
  bloom and particles, but matching the videos exactly is not realistic. The target is the
  same lighting, colour and material language.
- The reference textures are single albedo images. Without normal and roughness maps the
  roads cannot show wet reflections or depth; sheets 5 to 8 fix this.
- Cars are the biggest visual gap and the biggest build: 12 cars to model from sheets.
- The viewer runs out of GPU memory when it loads full-size building textures. A texture
  budget (atlases or streaming) is needed before the final city.
