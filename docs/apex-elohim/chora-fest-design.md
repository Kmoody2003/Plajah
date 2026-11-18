# Chora Fest: the open-world festival layer (design, 2026-11-17)

Plajah Motorsport: Apex has two halves. The motorsport half is circuits, grids and championships. This doc is the other half: an open-world music-and-cars festival in the Horizon mould, where the festival *is* the game structure. The Plajah difference is that the music is real: Plajah artists perform at the festival (performance capture or virtual), their tracks play on in-game radio, and Chora's virtual DJs host the stations and talk about what the player just did.

Canon it builds on: Port Halcyon is the festival hub with the Plajah FM / Chora stage, the car meet lot and the player's garage (`ironport-complete/docs/vertical-slice-maps.md`, `map-detail-design.md`). Existing code it builds on: `openWorldEvents.ts` (speed traps, drift zones, danger signs), `choraRadio.ts` (On-Air hosts, VYRA, profile stations), `ruralDetail.ts` (a first outpost stage), the Courier and Cops & Robbers modes.

## 1. The loop

1. **Drive anywhere.** Every road earns **Fest Points (FP)**: skills (drifts, near misses, air, drafting, clean racing lines), PR stunts, events, discoveries.
2. **FP opens the festival.** FP thresholds unlock **Stage Passes**. Each pass opens a new **Outpost** somewhere on the map: a new stage, a new region's events, a fast-travel point and a new headliner set.
3. **Each opening is a show.** When an outpost opens, a Plajah artist plays its stage: a performance-captured set (the artist's own motion, recorded with the Game Studio phone mocap) or a virtual-artist set (VYRA and the On-Air roster). The player drives in to the opening set. That artist's tracks join the radio rotation.
4. **The radio follows the festival.** Stations are Chora channels hosted by virtual DJs. Hosts react to the player (won the Kettle Pass hill climb, new top speed at the Lakeshore trap) and announce outpost openings, showcase events and the next headliner.
5. **Seasons.** The festival runs in seasons (weekly playlists in live service). A season has a featured artist, a showcase event, a season car and seasonal PR stunts. The season playlist is that week's Chora release slate.

Horizon's names are not used. Influence becomes **Fest Points**, wristbands become **Stage Passes**, expansions become **Outposts**, and the festival is **Chora Fest** (Plajah FM is its flagship station).

## 2. The map

| Site | Where (world m) | Region role | Stage | Signature event |
|---|---|---|---|---|
| **Main Site: Halcyon Shores** | Port Halcyon waterfront (-6650, 2950) | Home: garage, car meet, Plajah FM booth | Main Stage on the water, LED wall | Opening Showcase (car vs stunt plane, coastal highway, dusk) |
| Outpost 1: **Dune Sea** | west coast dunes (-5300, -600) | Off-road, cross-country, jumps | Sand-bowl stage | Dune Scramble (cross-country) |
| Outpost 2: **Kettle Hills** | south hills and ponds (-600, 3300) | Winding banked backroads, touge | Lakeside amphitheatre | Kettle Pass hill climb, Touge Duel (rival) |
| Outpost 3: **Pinewood** | north forest (-2100, -2900) | Rally, forest switchbacks | Clearing stage in the pines | Pinewood Rally Stage (existing circuit) |
| Outpost 4: **Otter Creek** | farm village (-1450, 1400) | Drag strip, drift yard, barn finds | Barn stage | Section Road Drag, Grain Elevator drift |
| Outpost 5: **Ironport Nights** | riverfront under the Halcyon Gateway (3900, 2600) | Street racing, night events | Under-bridge warehouse stage | Harbor Sprint, Grand Circuit night |
| Finale: **Gateway Finale** | Halcyon Gateway bridge deck | Season finale | Bridge-deck stage, ships under the span | Multi-domain finale (bridge, plane, catamaran) |

Outposts open in the order the player chooses (any pass opens any outpost), as in the genre. The Main Site is open from the start.

## 3. Roads made for it (map changes)

The festival needs roads worth driving. Where the satellite map gives straight farm grid, we add designed roads (the satellite is a guide, not the truth):

- **Kettle Pass** (Kettle Hills, ~6 km, paved): a winding two-lane backroad over the south hills (high points 55–77 m) between the ponds. Linked S-bends, two hairpins at the top, blind crests, 4–6° banking in the sweepers, 8 % max grade. Hill climb up, Touge Duel down.
- **Bluff Run** (Dune Sea → Lighthouse, ~5 km, paved): a lakeshore bluff road over the 118 m high point near (-5170, 800), long fast sweepers with lake views, a crest jump-free speed zone. Kept clear of the cliff raceway (which stays a closed circuit).
- **Pinewood Switchbacks** (Pinewood, ~4 km, gravel): forest climb to the 98 m ridge at (-1870, -3620), five hairpins, drift zone on the descent.
- **Dune Ridge Trail** (Dune Sea, ~3 km, sand/dirt): ridge-top trail with two designed kickers (danger signs) and a sand bowl.
- **Otter Creek Lanes**: tie the farm grid into the village with a flowing county road (cut corners as sweeping bends, not right angles).

Every designed road gets a smooth plan (curves sized for its speed), a vertical profile (grade limit per class, crests rounded), banking from curvature, and is graded into the ground with the road grade pass. Banked roads use the cliff raceway's strip builder (edge lines, kerbs at the apexes, shoulders).

## 4. Activities on the map

| Kind | What | Placement rule |
|---|---|---|
| **Speed Trap** | top speed through a gate | end of a long straight (freeway, coastal highway, Section Road, bridge deck) |
| **Speed Zone** | average speed over 400–800 m | fast sweepers (Bluff Run, coastal highway, Kettle Pass lower half) |
| **Drift Zone** | drift score over a section | switchbacks and hairpins (Pinewood, Kettle Pass top, port yards) |
| **Danger Sign** | jump distance | designed kickers on crests (Dune Ridge, farm crest, quarry) |
| **Trailblazer** | point to point, any route | between outposts across open country |
| **Fest Boards** | collectible boards (FP, fast-travel discount) | hidden at vistas, barns, under bridges |
| **Barn Finds** | hidden classic cars | farmland, forest, dunes (rumoured by radio hosts) |
| **Showcases** | scripted spectacles | Opening (car vs plane), season showcase, Finale |
| **Car Meet** | show your car, photo mode | Main Site lot |
| **Modes** | Courier, Cops & Robbers | across the map (already built) |

Race events per outpost: road race and road sprint (paved), dirt race, cross-country, street race (Ironport), drag (Otter Creek).

## 5. The Plajah layer: artists, performances, radio

- **Performances.** An outpost's headliner set is a stage show: the stage rig (lighting board looks, LED wall visualizers from the Ambo/Flux generator families), crowd, and the performer. The performer is (a) a Plajah artist captured with the Game Studio phone mocap (two-phone capture, pose lifter) and retargeted to their avatar (VTuber rig builder / UserAvatar), or (b) a virtual artist from the On-Air roster (VYRA and friends). The audio is the artist's real track from Chora.
- **Radio.** `choraRadio.ts` grows into the station system: Plajah FM (flagship, festival news), Chora genre channels, the season's featured-artist station, and the player's own profile stations. Hosts are the On-Air staff; their breaks are generated from game events (wins, records, openings, weather) and spoken by the hosts' voices.
- **Rights.** Only cleared tracks play (Track rights clearance: held songs stay off air). Artists opt in to festival play and performances; plays are counted for the artist (Music Intelligence / play counts), and a track's festival appearance links back to the artist's Chora page.
- **Creators.** Artists can book a slot on an outpost stage for a season (curated), and creators can submit performance captures through the Game Studio.

## 6. What to build, in order

1. **Map layer** (now): `region/festival.json` with the Main Site, the outposts, stage pads, and the PR stunt placements; stages drawn at their pads; the existing challenge manager reads its traps/zones/signs from the file instead of hard-coded spots.
2. **Designed roads**: a road designer (plan, profile, banking, grading) and the first road, Kettle Pass; then Bluff Run, Pinewood Switchbacks, Dune Ridge Trail.
3. **Progression**: Fest Points from skills and events, Stage Pass thresholds, outpost opening flow, fast travel. Saved with the garage/cloud save.
4. **Festival map UI**: the map screen shows outposts, stunts and events with their state; the menu carousel gets "Chora Fest".
5. **Radio**: station switching in the car, host breaks on game events, the season station.
6. **Opening shows**: stage rig + crowd + performer (virtual first, performance capture next), the drive-in opening set.
7. **Showcases**: Opening (car vs plane) and the Gateway Finale.
