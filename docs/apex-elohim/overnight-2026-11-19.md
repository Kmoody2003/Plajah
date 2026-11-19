# Overnight report: Apex, 2026-11-19

Kenne went to sleep with "work through and get issues resolved" on the map and world, while Google works on the graphics. I stayed off rendering, shaders, materials and post-processing. Everything is committed on `feat/apex-elohim`, nothing is pushed. Each decision I made alone is marked **Decision**, with the reason.

## Roads: every scenic road now meets the network properly
- **Junction carve bug (since the road designer was first written).** In `scenicRoads.ts` the per-cell reset sat inside a code comment, so the first road to claim a patch of ground blocked every later road. At every T junction the joining road's first ~35 m kept the uncut ground; at the top of the Stair the ground stood 6.7 m above the crest road. **Decision:** each grid cell now goes to its nearest road (over all roads) and is carved once, instead of only un-commenting the reset (which would let a later road's blend zone lift the ground over an earlier road's deck). In-game surface check on all scenic roads: better on every one, worse on none (`fc59c535`).
- **Mill Road** ran alongside the Superior Coast Highway for its last ~80 m and ended 2.5 m above it (2.9 m of road surface on top of the highway). **Decision:** it now turns north and meets the highway in a square T (~80°) at (-1770, -5780), pinned to the highway's line and height; the parallel overlap is gone (`b370078f`).
- **At-grade crossings between scenic roads** were never matched: the designer only pinned a road's two ends. It now finds every crossing with an already designed road and pins the height there. Finger Lake Loop's crossing of the coast highway moved 0.83 m (`b370078f`).
- **Dead ends.** A scan of all 2,851 road lines for ends with no other road within 15 m found 163; most are real cul-de-sacs, port quays and roads running to the map's south edge. Three were scenic roads that stopped in the grass:
  - **Orchard Lane** stopped 47 m short of Finger Lake Loop; it now ends on it (T junction).
  - **Kettle Pass** reached no road at either end (65 m and 53 m from dirt tracks): the only way on was across a field. **Decision:** it now starts with a 205 m straight north to a square T on the east-west country road at z 2340, and ends where the two town streets meet at (2450, 3343). It is 3.46 km now (was 3.02), still 8 % max.

Surface check after all of this (drivable surface vs design, centre and ±70 % of the half-width): every scenic road within 0.65 m worst, except two sub-metre spots with no road crossing them (Kettle Pass 0.95 m, Glacier Pass 0.88 m), probably the 6 m terrain mesh at the edge of a cut. Left as minor.

## The 2.2 m spike on the Escarpment Circuit
Traced: lap index 2057, on the crest road's descent through the eastern gap (3425, -9023), at only 9 m/s, with the car 2.2 m *below* the road. That stretch is a viaduct (the road stands ~9 m over the ground, just past the 8 m fill limit), and the autopilot ran wide: a wheel went over the deck edge and the car sagged before recovering.

The game drew guardrails there, but they were scenery: only three circuits had barrier collision. **Decision:** every scenic road's guardrails are now solid on every drive, free roam included (a car scrapes along the rail the same way it does the city circuit's barriers). Rails are also left out within 10 m of any other road's centreline, so no rail closes a junction or a crossing (that was also wrong visually).

Checked with the autopilot lap tool (`scripts/apex-lapdrive.mjs`): the Escarpment Circuit completes in 9:26, worst height error down from 2.18 m to 0.42 m, no stalls (so no rail blocks the circuit's junctions), no page errors. 

**Final laps, after every fix tonight** (on the check server, so the graphics work's saves could not reload the page):

| | Escarpment Circuit | Superior Range Circuit |
|---|---|---|
| Lap (autopilot) | 9:28 | 19:18 |
| Car height vs road, average | 8.0 cm | 5.8 cm |
| Worst | 0.42 m | 0.48 m (Glacier Pass / coast highway junction) |
| Stalls, resets, page errors | none | none |

The autopilot still runs wide in tight bends (up to 14-21 m off the line); that is its simple steering, and the rails now catch it.

## Pits beside the road (Glacier Pass)
The Superior lap found a 1.9 m dip on Glacier Pass at (-4695, -13552): a gully right beside the road, 6-8 m from the centre and up to 8 m deep. The carve skipped any cell that needed more than 8 m of fill (the viaduct rule) even when the road itself was on the ground, so it left a pit just past the shoulder, and a wheel over it pulled the car down. **Decision:** a cell stays hollow only where the road itself is on a viaduct (its centre more than 8 m over the ground); anywhere else the gully is filled as embankment. Now the ground falls at most 1 m within 8 m of the centre there.

## Kinks in the road line
The re-run lap found a 1.2 m dip on the crest road's viaduct zig-zag, a few metres from the first one. The road's line had a 3.7 m-radius kink there (and a 3.0 m one on Glacier Pass): the designer's bend relaxation measures curvature on a 32 m chord, so wiggles at the 4 m sample scale slipped through. A final light smoothing pass over immediate neighbours now irons them out (ends fixed, so junctions stay pinned; the alignment moves by centimetres). Tightest radius at sample scale: Glacier Pass 3.0 -> 19.7 m, crest road 3.7 -> 22.9 m, Escarpment Road 13.2 -> 21.7 m, Kettle Pass 16.9 -> 31.9 m; grades and lengths unchanged.

## Country roads that stopped short
Of the paved section-line country roads that ended mid-map, three ended within 60 m of another road and now meet it: cr9's east end runs on 30 m to a town street, cr11 runs on 48 m to cr1, and cr2 gets a 17 m stub onto cr7. **Decision:** the others (87-624 m from the next road, mostly ending at farm driveways) are left as they are; joining them means laying new roads, which is better done with you looking at the map. Four more run to the map's south edge, which is right.

## Long roads disappeared
While checking the Mill Road junction I found the coast highway missing from the picture. The spatial culler (`enginePerf.ts`) puts each mesh in a 420 m chunk by its centre and hides whole chunks more than ~2.6 km from the camera. A scenic road is one mesh: the 13.5 km coast highway's centre is far up the coast, so the whole highway vanished wherever you stood more than 2.6 km from that point (most of its length). Objects bigger than two chunks now get the per-object distance and frustum test every frame instead. Checked in the game: the highway is drawn at the Mill Road T junction; frame times unchanged.

## Trees and festival access
- **Access tracks.** The Chora Fest stages stood 160 m to 1.7 km from any road with no way in. **Decision:** the festival planner lays a gravel track to each stage from the nearest road you may turn off (not a freeway or ramp), over dry ground and clear of buildings, ending on the stage's graded pad. There are seven tracks (Superior Range sits beside the coast highway); Dune Sea's is 1.7 km through the dunes. Seen in the game at Wine Country (across the tulips), Ironport Nights (beside the bridge) and Dune Sea.
- **Trees on scenic roads.** The tree and grass clearance only knew the circuits and the coastal highway, so roads outside a circuit (Kettle Pass, Mill Road, Orchard Lane) could have trees on them. It now has every scenic road.

## Testing while the graphics work runs
The graphics session saves files every minute or so, and each save reloads the page on the main dev server (port 4332), which killed long checks. There is now a second dev server, `forth-horizon-check` on port 4333 (`vite.check.config.mjs`), with no hot reload or file watching: a page keeps running what it loaded. The shot and lap scripts take `APEX_URL=http://127.0.0.1:4333`. It serves the working tree, so it includes whatever the graphics session has saved.

## Festival stunts
- **Decision:** re-planned on today's roads, with two planner changes:
  - Each kind of stunt is picked half from the original map and half from the north lands. Without that, the new mountain roads won every danger-sign and speed-zone slot.
  - Names: a spot takes its place's name, else the named road it is on, else the nearest free place within 2.5 km, and only then a compass point. "Otter Creek West 2" and "Superior Coast North 2" are gone.
- Result: 10 speed traps, 8 speed zones, 5 drift zones (was 1: the four new ones are on the mountain roads), 8 danger signs. The Superior Range stage moved 100 m with the road network; the other seven sites are unchanged.
- Saved personal bests are keyed by stunt id (`trap_3`), so an old best may now sit on a different trap. Fine for pre-alpha; say if you want them reset.

## Map screen
- The map only labelled the circuits and four old places. It now also shows:
  - the eight Chora Fest sites, in festival pink ("CHORA FEST · WINE COUNTRY");
  - the north lands: Wine Country, Tulip Flats, Finger Lake, The Giant Forest, The Escarpment, Superior Range, Glacier, Fjord Coast, Dry Canyons, North Shore;
  - every scenic road's name.
- Long labels used to run off their background, because the canvas is a fixed width; the text now shrinks to fit. This also fixes the old cut-off labels.
- This is a first step only: the full map-view upgrade from the concept art (a designed map, not the 3D world from above) is still open, and probably belongs with the graphics work.

## Not done / known
- **Steep-range vegetation** (from yesterday's list): left alone on purpose. Real faces that steep are bare rock, and trees at altitude already cost ~2 M triangles far away.
- **Festival progression** (Fest Points, Stage Passes, opening shows, radio hosts reacting) is not started; it is game structure rather than map, and it touches the same file the graphics work is in all night.
- **Map screen**: labels only; the designed map view from the concept art is still open.
- Sub-metre surface spots with no road crossing them: Kettle Pass 0.95 m at (653, 2676), Glacier Pass 0.88 m at (-3494, -13224); probably the terrain mesh at a cut edge.
- Paved country roads that still end in a field 87-624 m from the next road (cr4, cr5, cr7, cr8, cr9 west, cr10), listed above.
- The headless checks run on the working tree, so they include the graphics session's unsaved-to-git edits; a type error in `scancar.ts` comes from that work, not from mine.
