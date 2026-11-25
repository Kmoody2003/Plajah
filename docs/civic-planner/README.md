# Civic Planner: one planning engine, many games and experiences

Goal: stop hard-coding each map. Build the way a city is *planned* (planner + zoning board + civil engineer) as a reusable engine that takes terrain, water and a few human decisions (zones, landmarks) and returns a coherent, rule-checked world. Racing is the first consumer (Plajah Motorsport: Apex); the same output must serve a walking/open-world game, a city builder, a train/flight sim, a story game, and so on: different games and different experiences on one world.

## Three roles, three rule layers (all data, not code)

| Role | Question it answers | Rule pack |
|---|---|---|
| **Planner** | Where does the city grow and what is it for? centres, corridors, districts, density gradient, parks, waterfront | `civic/rules.json` → `planning` |
| **Zoning board** | What may be built where, how big, how close? use classes, setbacks, height, coverage, lot size, parking minimums, frontage, buffers (industry vs homes) | `rules.json` → `zoning` |
| **Civil engineer** | Will it stand, drain, connect and stay safe? grade limits, bridges/culverts/tunnels at water, utility corridors and clearances, voltage classes, undergrounding, flood margin | `rules.json` → `civil` |

A rule pack is swappable per game/setting (US Midwest, dense European, fantasy, sci-fi) without touching the generators.

## Pipeline (each stage reads layers, writes layers, then is audited)

1. **Ground**: height, water, soil/landclass, flood zone, slope (`build_terrain_hi.py`).
2. **Networks first** (engineers): highways, rail, bridges/tunnels, then local streets, routed by least cost over grade and water with crossing rules.
3. **Zones** (planner + zoning board): human-drawn polygons or generated; each has a use class and density target.
4. **Lots and buildings**: lots front a street; building type from zone class and lot size; setbacks and parking applied (`infill_user_zones`, `densify_zones`, `access_and_parking`).
5. **Utilities** (civil): power, water, sewer, gas, telecom follow street/rail corridors; never over water (cross by cable under the bed); clearances to buildings and roads (`plan_utilities.py`).
6. **Services and life**: schools, fire, police, transit, jobs/homes balance, so a sim layer can run it.
7. **Audit**: every rule is a check with a count and examples (`tools/civic/civic_audit.py`). A stage is not done until its audit is clean or the exceptions are recorded.

## Output contract (what any game consumes)
Plain JSON/binary layers with no game code inside: `heightmap`, `water`, `landclass`, `streets` (graph with class, width, surface, bridge/tunnel flags), `rail`, `lots`, `buildings` (footprint, use, height, door/frontage), `utilities` (pylons, cables with an `underground` flag, terminals, substations), `zones`, `pois`, `civic_audit.json`. Each game picks layers and an **experience adapter**:
- Racing: streets, barriers, traffic, landmarks (Apex).
- Walking / open world: sidewalks, doors, interiors as portals, NPC schedules from zones and jobs.
- City builder: zones, services and utilities become the player's tools; the audit rules become the advisor.
- Rail / flight sims: rail, airports, signals, timetables.
- Story / quest: POIs and districts with tags (the Elohim universe layers on as a setting pack).

## Principles
- Rules are data with an id and a severity; generators read the same numbers the audit enforces.
- Deterministic (seeded) so a map can be regenerated after a rule change and diffed.
- Human edits win: the map editor writes *intent* (zones, landmarks, no-go areas); generators never overwrite it.
- Real-world logic first, then art direction: grades, drainage, clearances, emergency access.
- Every generator is a pure function of layers + rule pack; Apex-specific names and landmarks live in a setting pack.

## Status (2026-11-17)
Working for Apex: terrain, streets, zones, buildings, parking, port, rail/airport, power with dry-land routing and underground river cables. First rule pack and audit: `games/apex/tools/civic/`. Next: move per-map constants out of the generators into the rule pack, add water/sewer/stormwater and flood margin, then split a game-agnostic `civic/` package out of `games/apex/tools`.
