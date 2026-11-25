# Apex Elohim: the simulation layer

A light, Cities: Skylines-flavoured layer under the map editor (F2) and the region view. It is **the logic of that game, not the game**:
it decides where people live and work, which roads and rails matter, and what moves along them, so the world looks lived in and the roads you draw have consequences.
Code: `games/apex/src/sim/` (pure TypeScript, no three.js, tested with `node:test`) and `src/simLayer.ts`, `src/railScenes.ts`, `src/airportScenes.ts` (drawing).

## Kept from Skylines
| Idea | How it is done here |
|---|---|
| **Zones with demand** | Editor zones (residential, dense, commercial, industrial, waterfront, civic …) each get a capacity from their area and a *built level* 0..1. Three global demand numbers (R, C, I) come from the balance of homes, shops and jobs. Zones with no road within 220 m cannot grow. Levels step once per sim-minute. |
| **Road hierarchy and connectivity** | Roads are classed `highway > avenue > collector > street > service > dirt` (+ `ramp`). Every class has a speed, lane count and a rule for who may join it: a highway only meets avenues, ramps and highways (grade-separated everywhere else), streets meet streets, collectors and avenues. Crossings become junctions, dead ends and unreachable fragments are dropped. |
| **Lanes / traffic flow** | Agents follow edges of the graph with a car-following rule (they keep a gap to the one ahead in their lane and queue at closed level crossings). Routes are shortest travel time with a penalty for crowded edges, so traffic spreads and jams show up as flow per edge. |
| **Services and coverage** | `fire`, `police`, `school`, `clinic` points (editor) cover a radius. Coverage and distance to water, parks, stations and the airport feed **land value**, and land value feeds demand and growth. |
| **Commuters** | Residents commute to commercial and industrial zones in the morning peak and back in the evening, in proportion to population and jobs. Industry and docks send trucks to shops, other works and the port. |
| **Rail** | Rail lines (single or double track) with stations, timetables, dwell times, block occupancy on single track and automatic **level crossings** where a rail line meets a road (gates close, road traffic waits). |
| **Airport** | A drawn runway, taxiways, apron, terminal and hangars. Planes arrive on a 3° glide, roll out, taxi to a gate, turn round and depart. One runway reservation timeline keeps them apart. |

## Left out
Budgets, taxes, loans, policies, happiness, education levels, pollution and noise simulation, water/power/garbage networks, citizen-level agents (only sampled *vehicles* exist), buildings that appear/disappear in the 11k-building city (zone growth is shown as the zone's *level* in the editor overlay, not as new meshes), pedestrian paths, traffic lights and lane-changing.

## What is sampled
The sim is cheap on purpose. Trip counts per hour are computed from the zones; only a sample of them become visible vehicles (≤ 260 cars/trucks, ≤ 4 trains running, ≤ 4 planes), weighted toward where the camera is. Everything is O(agents) per frame (about 0.1 ms measured) and drawn as 4 instanced meshes plus a few meshes for trains and planes.

## Data
Everything the user draws lives in `region/user_map.json` (version 1, new feature types are additive):

| `type` | `kind` | points |
|---|---|---|
| `road` | `street, avenue, highway, dirt, creek` (existing) + `collector, service, ramp` | polyline; optional `oneway`, `lanes` |
| `zone` | existing kinds | polygon |
| `rail` | `single, double` | polyline; optional `service: passenger | freight | mixed` |
| `station` | `station, halt, freight` | one point (snaps to the nearest rail within 120 m) |
| `airport` | `runway, taxiway, apron, terminal, hangar` | runway = 2 points, taxiway = polyline, others polygons |
| `service` | `fire, police, school, clinic` | one point |

Generated roads (`country_roads.json`, `user_streets.json`, `city_streets.json`, `shoreline_highway.json`) join the same graph.
`tools/plan_rail_airport.py` writes the first rail lines, stations, airport and its access road into `user_map.json` (features with ids starting `gen-`; re-running replaces only those).

## Terrain
Rail beds, tunnel cuttings and the airfield are cut and filled into the height map before the terrain is meshed (`src/sim/carve.ts`, same idea as `carveShoreline`).
Rail profile: max 2.5 % grade; narrow water and creeks become bridges, the wide shipping river is passed by a tunnel (clearance for ships) with portals.
