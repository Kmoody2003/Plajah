# Era Clash 3D: visual target and build plan

The reference pack (`public/games/era-clash/assets/Nov 11 - 02_20/`, 39 images, 1376×768) sets the bar for The Falling Petal in 3D.

## What the pack contains

| Kind | Images | What it sets |
|---|---|---|
| Level maps | `Feudal_Japanese_town_map_design` (Otsu-no-ura), `Feudal_Japanese_coastal_town_map` | Layout: beach landing → harbour and piers → walled town with a grand marketplace and alley maze → samurai district → castle on a moated hill. The surroundings: waterfall, bamboo grove, rice terraces, a mountain shrine. |
| Character turnarounds | `Character_concept_sheet_for_sea` (Invader Chieftain, Heavy Sea Raider), `Feudal_Japanese_villagers_refere…` (fisherman, carpenter, peasant woman), `Feudal_Japanese_villagers_charac…` (fisherman, merchant, townsfolk) | Front, ¾ and back views, which is the input the local image→3D pipeline lacked. |
| Asset sheets | `Japanese_architectural_game_prop…` (gates, torii, kawara roof tiles, stalls, fences, well, toro, nobori), `Feudal_Japanese_town_props_asset…` (crates, cargo, fishing gear, lanterns, statues and shrines, a yatai cart, banners) | The kit of parts. |
| Target shots (31) | Streets, harbour, castle town, rain, night, burning-street battles | The look: lighting, grade, density, materials and composition. |

## Gap between the target and Chapter I today

| | Target | Now |
|---|---|---|
| **World** | A dense castle town: a landmark castle on a hill and a snow-capped volcano seen down every street, a stone sea wall, piers and boats. | A valley road with two rows of houses, a pagoda and a platform. |
| **Light** | Golden-hour backlight, with the low sun glaring through haze. Strong aerial perspective, so distance fades to warm grey. Chimney smoke, embers and fire light in the night and raid scenes. | A photographed HDRI with a flat midday feel. Light fog. No smoke columns except at the kura. |
| **Grade** | Warm highlights, cool desaturated shadows, high contrast. | AgX with neutral colour. |
| **Ground** | Cobbled streets with worn kerb stones, packed dirt, and the stone sea wall. | A dirt road with gravel edges and a grass meadow. |
| **Architecture** | Thick kawara tile roofs with ridge caps and onigawara, deep eaves, lattice fronts, noren, hanging signs, balconies and timber framing. | Box walls with an extruded gable, slats and flat noren. |
| **Characters** | Lacquered samurai armour, plus raiders in fur, leather and chain. | Single-image generated models that tear and smear under big motion. |
| **Crowd and clutter** | Every street is full: crates, barrels, baskets, carts, banners, people. | About 115 props, 6 villagers. |

## What can match the target, and what will only read like it

Every target is a matte painting. In real time on the Intel iGPU baseline (60 fps), we can match:
- the composition: a landmark down every street, layered depth
- the light and grade
- the ground and materials up close
- the density near the player

The far town and the castle become impostors or backdrop cards, and the painted detail far away is approximated rather than modelled.

## Build order

1. **Look pass (the biggest win per hour).**
   - **Light:** golden-hour sun low and behind the action, a warmer sky, height fog with strong aerial perspective, sun glare and bloom on the low sun.
   - **Grade:** a colour grade (warm highlights, teal shadows, contrast).
   - **Atmosphere:** chimney smoke and drifting haze.
   - **Ground and backdrop:** a cobblestone street material (CC0 Poly Haven cobbles), and the volcano and castle silhouette as the backdrop.
2. **Layout: rebuild Chapter I on Otsu-no-ura.**
   - Beach landing (start), then the fisherman's harbour and west docks.
   - The outer wall gate, then the grand marketplace, which takes the market-stall ring from the second map.
   - The alley maze (the close-quarters fighting), then the samurai district gate.
   - The finale at the castle approach, with the keep as the landmark throughout.
3. **Kit of parts from the asset sheets.**
   - **Built in code**, cleanly, instanced and tiling: roofs with kawara rows, ridge caps and onigawara; machiya v2 with lattice, balconies and signs; gates, torii, walls, sea wall, piers, fences, wells and stalls.
   - **Generated image→3D from crops of the sheets:** lanterns, toro, statues and shrines, the yatai cart, baskets and tsumidaru, nets.
   - Throwable and kickable props stay on props.ts.
4. **Characters from the turnarounds.**
   - **Raiders:** the chieftain (section boss) and the heavy sea raider replace the current viking.
   - **Villagers:** fisherman, carpenter, peasant woman, merchant and townsfolk replace the code-built figures.
   - **Pipeline:** front, ¾ and back crops are fed to the image→3D runtime, painted from the views, then auto-rigged onto the contract skeleton.
5. **Raid variant:** the dusk, burning-street look from the battle shots: fires along the street, ember particles, smoke columns, torch light.

## Still needed from Muse

- Turnarounds for **Haru** (and the samurai guards), **Chen** and **Roland**: the pack has none for the heroes.
- Optionally, a front, side and back view of each hero prop the sheets show only in ¾ view (the yatai, the samurai gate).
