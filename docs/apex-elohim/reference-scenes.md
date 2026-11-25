# Apex Elohim: reference scenes (acceptance targets)

Each scene needs a named site on the map, a camera spot (photo mode / replay cam), and the props listed. Permission given 2026-11-16 to add paved and dirt roads and a creek branching off the waterways.

The camera spots live in `games/apex/src/referenceScenes.ts` (`REF_SCENES`; `window.refScenes` in the game). They also play in the idle cinematic tour. What a place was missing for its shot is built there by `buildReferenceDressing()` (plain geometry, no materials work: the look is the graphics lane's).

Shoot them all with:

```
node scripts/apex-shots.mjs <outDir> --shots <file.json>
```

Write each scene as `[name, cam, at, "rel"]` in the JSON.

| # | Scene | Place on the map (built) | Camera spot | Status 2026-11-19 |
|---|-------|--------------------------|-------------|-------------------|
| 1 | Covered bridge, misty river | Millbrook Creek and its covered bridge, Millbrook Road (countryScenes.ts) | (-888, -1650) toward the bridge | Built. Mist is the graphics lane's. |
| 2 | Suburban cul-de-sac, wet | Eastside court at (7261, 1960): curbed bulb, driveways, fences, mailboxes | (7225, 1990), low, toward the bulb | **Added:** wet leaves along the gutters and on the tree lawns, rain puddles at the curb, autumn colour on the trees round the court. The real wet-road shading is the graphics lane's. |
| 3 | Dune coast road | Shoreline highway along the dunes (index 55-150), with the guardrail on the lake side | (-5339, -144) toward the north-west | **Added:** 2,571 sand blobs (drifts) blown over the edge line onto the carriageway, more on the lake side. |
| 4 | Piered sea bridge | The straight east-west road at z -4380: a ~900 m low bridge on piers across the lake south of Finger Lake | From the water at (1780, -4240), and on the deck from (1500, -4374) | Built (country-road bridge, piers every 22 m). **Added:** 29 lamp posts along the parapets, alternating sides. Sunset is the time of day. |
| 5 | Farm S-curve and hairpin | Millbrook Road's S-curves and hairpin, Hollow Lane, the farm | From the air at (-900, -1350) toward the ridge | **Added:** hedgerows along both sides of Millbrook Road (with field gates) and 6 wind turbines (rotors turn) on the high ground 450-1150 m north. |
| 6 | Red barn, silo, cornfield | Hollow barn and silo, corn rows, Hollow Lane (dirt) | (-1390, -1210) | Built. |
| 7 | Dune circuit at dusk | Great Lakes Cliff Raceway, dune section with pines, kerbs and grandstand | (-5880, 2200) toward the north | Built (circuit kit). Dusk is the time of day. |
| 8 | Autumn suburban street | Eastside straight (7600, 2050) to (7934, 2209), lined with houses | (7700, 2108), low, along the street | **Added:** raked leaf piles on the tree lawns, leaves in the gutters, 12 utility poles with three sagging wires, and 53 spectators on the sidewalks. The street trees along it are in autumn colour (`autumnLeaf()`, per-tree leaf colour in src/ezforest.ts). |
| 9 | Coast cliff flyover | Cliff Raceway climbing the cliff above the lake | (-5396, 1549), 30 m up | Built. **Added:** a high-wing light plane circling the coast 125 m up, banking through its turns (a 64 s loop that crosses the shot). |
| 10 | Industrial street circuit | Ironworks Industrial Circuit, start straight, port cranes | (3700, 215) along the start straight | Built (barriers, tyre walls, fences). **Added:** 3 brick smokestacks in the works beside the start straight. Smoke is the graphics lane's. |
| 11 | Concrete tunnel exit | Cliff Raceway tunnel (samples 207-237) | (-5430, 735) back toward the portal | Built. Dust and light bloom are the graphics lane's. |

Still open (map/world side): none. The hedgerows are now lumpy clumps instead of boxes. Mist, smoke, dust, wet roads and light bloom are the graphics lane's.
