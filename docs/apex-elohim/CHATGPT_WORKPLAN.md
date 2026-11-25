# Apex Elohim: work plan for ChatGPT

You are picking up a browser racing game called **Apex Elohim** (pre-alpha), part of the Plajah platform. This document tells you what exists, how to run and verify it, the rules for working in this repo, and the task list in priority order. Read all of it before changing anything.

## 1. What the game is

An open-world racing game in Three.js (WebGL, not WebGPU). You drive the Kestrel Sovereign GT-R through downtown Ironport (real Detroit streets), along the Great Lakes coast and a rally trail. It has its own vehicle physics, a broadcast replay, dynamic weather (rain, puddles, aquaplaning, spray), flowing water, 3D trees and grass, a photoreal city, controller and touch input.

It is listed in Plajah Games and opens in an iframe. Production URL path: `/games/apex/play/region.html`.

## 2. Where everything is

All game source is in `games/apex/` (the folder name is old; the game is Apex Elohim).

| Path | What it is |
|---|---|
| `games/apex/src/region.ts` | The main game (about 2,700 lines): terrain, city, streets, curbs, weather hookup, driving, camera, menus, render loop |
| `src/physics.ts` | Vehicle model (gears, suspension, tyres, drift). Do not rewrite it; tune only |
| `src/scancar.ts`, `scanparts.ts`, `car.ts` | The car: a scanned body cut into panels with hinges, glass, interior |
| `src/weather.ts` | Weather presets, rain, lightning |
| `src/sky.ts` | Sky dome, clouds, birds |
| `src/water.ts` | River/lake shader driven by a flow map |
| `src/spray.ts` | Tyre spray, rain splashes, puddle function (shared by shader and physics) |
| `src/roadpbr.ts` | Asphalt micro normal/roughness/occlusion shader chunk |
| `src/trees.ts`, `src/ezforest.ts` | Tree level-of-detail. `ezforest.ts` is the high-quality ez-tree set from Ravencrest/Era Clash |
| `src/grass.ts` | 3D grass tufts around the camera |
| `src/trackkit.ts` | Tyre walls, fences, grandstands, pits, flags, light towers, start lights |
| `src/inputs.ts` | Gamepad and touch controls |
| `src/ao.ts` | Ambient occlusion pass (new, needs verification) |
| `src/grade.ts` | Colour grade (LUTs) and lens options (new, needs verification) |
| `games/apex/region.html` | The page and the Settings panel |
| `games/apex/tools/*.py` | Asset pipelines (see section 6) |
| `public/games/apex/` | Shipped assets and the built game (`play/`) |
| `docs/apex-elohim/` | Design notes; `texture-prompts.md` lists the Flow texture prompts |

Also relevant: `data/plajahGamesCatalog.ts` (the Games listing), `components/games/IframeGameFrame.tsx`.

## 3. Running and checking it

```bash
node ./node_modules/vite/bin/vite.js --config games/apex/vite.config.mjs      # dev server, port 4332
```

Open `http://127.0.0.1:4332/region.html`. Use `127.0.0.1`.

Debug handle in the browser console: `window.regionViewer`:

- `startDrive('ironport_grand_circuit' | 'great_lakes_cliff_raceway' | 'pinewood_rally_stage')`
- `wx.setWeather('clear'|'partly'|'overcast'|'fog'|'rain'|'storm', true, true)`
- `setPool(0..1)` puddle level, `keys.add('KeyW')` to drive, `drive()` car state
- `cam(x, y, z, targetX, targetY, targetZ)` holds a free camera still; `cam()` releases it. Use this to look at buildings from open ground. Teleporting the car near buildings puts the camera inside walls.
- `debug().cityItems` and `debug().cityPath` for placing the camera.
- `apexGrade.set(lutId, lensId, amount)` sets the colour grade and lens.

Build the playable page: `node ./node_modules/vite/bin/vite.js build --config games/apex/vite.config.mjs` (writes `public/games/apex/play/`). **Read the build's own exit line.** A wrapper can say 0 when the build failed.

Baseline performance on the dev machine: about 38 to 40 fps in the browser pane with rain, trees and the city. Measure frame rate after each rendering change and tell the owner if it drops by more than about 5 fps.

## 4. Rules for working in this repo (important)

1. Many other sessions share this checkout. **Stage and commit only files you changed for this game.** Never `git add -A` at the repo root. Never touch files under `era-clash`, `rift-realm`, `ravencrest`, or `kith` unless the task says so.
2. **Do not push to `master`.** A push to `master` is a production deploy. Commit to a branch and let the owner decide. If the owner asks you to ship, do it from a clean worktree that contains only this game's files, and run the full site build first.
3. Keep raw media out of git. No raw PNG textures, no zips, no source art. Large source files belong in `D:\plajah game assets deign from promtps\racer\`.
4. Anything the game loads must exist in `public/` (the deployed site has no access to the D: drive). The Ironport city models and textures are packed into `public/games/apex/ironport/` by `tools/pack_ironport.py`.
5. Never use the jumbled texture-atlas image of the car as a modelling reference. The scanned body is the car's shell.
6. Safety and honesty: do not claim something works unless you saw it work in the browser. Say what you did not check.
7. Budgets: texture memory matters. Colour maps 2048, normal and roughness 1024. No new always-on full-screen pass costing more than about 2 ms without telling the owner.

## 5. State of the work

Done and visible: city and buildings with photographic textures, curbs and raised sidewalks, trees (ez-tree) and 3D grass, weather with puddles and aquaplaning, spray, flowing water, speed blur and light shafts, controller and touch, track kit, photoreal asphalt.

Written but **not yet verified in the browser**:
- `ao.ts`: ambient occlusion from the depth the main pass writes. Check for halos, noise, banding, cost.
- `grade.ts`: colour grade (the platform's cinematic LUTs) and film/tape lenses (silent film, grindhouse, VHS, found footage, night vision), with Settings rows "Colour grade (LUT)", "Grade strength", "Lens". Check that each lens renders upright (the shaders expect the picture top row first, so the pass flips in and out) and that nothing is mirrored.

## 6. Task list, in priority order

Each task lists what "done" means. Do them in this order, one at a time, each its own commit.

### A. Lighting and atmosphere

1. **Verify and tune ambient occlusion** (`src/ao.ts`). Done when: corners, car undersides and tree bases are visibly darker, there are no dark halos around leaves, fences or silhouettes, no visible noise when moving, and the cost is under 2 ms. Add an on/off row in Settings.
2. **Cascaded sun shadows (DONE, tune only).** Implemented with three CSM (2 cascades, 700 m) in region.ts; Settings > Shadows switches to the old single map. Add cascades (near, mid, far) so shadows are sharp around the car and soft in the distance. Done when long shadows from buildings and trees appear at golden hour and sunset and do not shimmer.
3. **Aerial perspective.** Distant buildings should fade toward the sky colour, take the sun's tint, and lose contrast. Replace or augment the linear fog in `region.ts` (`stepWeather`). Done when far towers no longer look cut out against the sky at any time of day.
4. **Colour grading defaults.** Verify `grade.ts`, then pick a sensible default grade per time of day and per weather (warm for golden hour, cool for storm). Keep the player's LUT choice as an override.
5. **Ground and valley fog.** Low mist over the lake, river and low ground in the morning, lit by the sun. Done when the lake edge in the morning has visible mist and it respects the weather system.
6. **Screen-space reflections** for wet roads and glass. Puddles and curtain-wall glass should show the real buildings and car lights. Note: a live environment snapshot was tried and removed because it popped; do not bring it back. Done when puddles show buildings and lights without popping.
7. **Night lighting.** Headlights that really light the road, street-lamp light pools with glow, varied lit windows (the glass shader already lights some), emissive signs, bloom that handles bright lights. Done when night driving is readable and atmospheric.

### B. Texture work

1. **Check the new textures on buildings.** Use `regionViewer.cam()` to view each material on a building. Confirm the normal maps are not inverted (relief should look raised, not carved). Fix any that look wrong in `tools/build_pbr_from_albedo.py` and rerun it.
2. **Ground PBR.** Grass, gravel, dirt, mud, sand, cobble and the paver are colour only. Add normal and roughness maps (derive them from the colour image with the same method as `build_pbr_from_albedo.py`) and use them in the terrain shader. The rally gravel road is the worst: it reads as a flat tan plane.
3. **Remaining building materials.** See `texture-prompts.md`; the owner generates images in Google Flow and drops them in `D:\plajah game assets deign from promtps\racer\flow-textures\`. Run `tools/prep_flow_textures.py` (2048 sets with normal/roughness/occlusion) or `tools/build_pbr_from_albedo.py` (colour-only images). Wire new material names into the `FLOW` set in `buildCity` in `region.ts`.
4. **Known weak surfaces:** Central Library's large blank beige wall, slate roofs seen from above, the tan generic towers (vertical grain from the texture), mortar smearing at grazing angles (the facade depth effect).
5. **Unused facade photos.** About 40 images in the Flow `Building Textures` folder do not map to any building (Haussmann, Tudor, Moroccan, Gothic, Venetian, Baroque, Colosseum, chalet, Art Nouveau). They could become hero buildings for a district.

### C. Known issues

- Fly mode (`startFly`) throws `Cannot read properties of undefined (reading 'xz')` in `stepFly`. Not related to the rest; fix or remove.
- The race circuit's raised sidewalk starts behind the jersey barriers; check it looks right from a normal driving view.
- The kerb replay camera once showed sky under the road; recheck after the near-plane change.
- Rear quarter panels on the car have small tears from scan defects.
- Performance: the 3D trees and grass cost frame time in the forest; measure and lower radii or counts if needed.

### D. Platform

- The game is not listed on the TV games screen (`components/tv/GamesTvView.tsx` exists only in another unshipped branch). Add it when that branch ships.
- Add the controller and touch controls text to the in-game help line.

## 7. How to report

For every task: what you changed (files), what you saw in the browser (screenshot or description), the frame rate before and after, and anything you did not verify. Keep commits small and name them `feat(apex-elohim): ...` or `fix(apex-elohim): ...`.
