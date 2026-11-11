# Era Clash 3D: Otsu-no-ura as an explorable castle city

Kenne's direction (2026-11-11): the reference stills show a sizable feudal castle city. The player should see much more of it, and be able to walk to every place the stills show. This plan supersedes the single valley road of Chapter I.

## The stills, by place

The 31 target stills are in `public/games/era-clash/assets/Nov 11 - 02_20/`. Each place below is a destination in the city.

| Place | Stills | What it needs |
|---|---|---|
| Harbour and docks | 6 fishermen unloading, 7 ship rigging, 9 guards and fishermen, 15 pirates storming, 29 leap onto the docks | A curved stone quay with wooden piers, moored ships and boats, cargo, fish stalls. |
| Sea-wall promenade | 11 lanterns on the sea wall, 30 dockside lantern street, 16 and 28 pier fights | A stone sea wall with a lantern-lit walk, a waterfront street, a pier with railings over the water. |
| Canal | 2 cherry blossom canal | Stone banks, an arched wooden bridge where each street crosses, cherry trees, moored boats. |
| Castle avenue | 1 guards patrolling, 23 samurai on horseback | A broad avenue from the harbour to the castle, with the keep and the volcano at its end. |
| Merchant streets | 3, 17 burning streets, 12 raided shop, 25 crowded market, 5 evening street | A grid of shop streets and the Grand Marketplace (built). Shop interiors you can step into. |
| Residential hillside | 21 neighbourhood, 24 alley in the rain, 27 villagers and children | Stepped lanes, stone retaining walls, board-fenced alleys, small houses with gardens, a pagoda in view. |
| Castle | 14 gate plaza and watchtower, 31 bridge to the gate, 18 gates breached, 26 gate guards, 19 stone steps, 8 ramparts | The moat and its bridge, a gatehouse, a masugata (square entry court), stone steps between walls, walkable ramparts over the harbour, the forecourt under the keep. |
| Rooftops | 20 rain on the roof tiles | A teahouse balcony or yagura on the hill, looking over the roofs. |
| Overviews | 4, 10 | The whole city from the hill: castle, canals, roofs, bay, volcano. |

## The map

Metres; +Z is inland (north), +X is east. Sea level is y = 0. The playable city spans about x −180…170 and z −100…300 (about 350 × 400 m), which is 3× the valley's width.

- **The bay** is to the south and west. The shore runs east–west at z ≈ −65 (the beach landing and Fisherman's Harbour, built), then turns north along x ≈ −170. That west shore is the sea-wall promenade and the long piers.
- **The Outer Wall** (built at z −36) is extended round the town's landward side, with gates where the avenue and the coast road enter.
- **The Grand Marketplace** stays at (−3, −16). **The castle avenue** runs north from it, 12 m wide, to the castle's gate plaza at z ≈ 190.
- **The canal** runs from a bay inlet at (−170, 40) east to x ≈ 40 along z ≈ 40. Arched bridges carry each street, and cherries line the banks.
- **The merchant quarter** is a street grid west of the avenue (x −20…−150, z −30…120). The current alley maze becomes its densest block.
- **The samurai district** lies east of the avenue (x 20…120, z 60…170). The walled compounds are built.
- **The residential hillside** rises to the northwest (x −60…−170, z 120…240), with stepped lanes and the pagoda temple at its top. That hilltop is the overview.
- **The castle** stands on its stone base at about (60, 30, 260), inside a moat. The route runs: gate plaza and watchtower → bridge → gatehouse → masugata → stone steps → ramparts → forecourt under the keep (the finale). You can reach the keep's walls, not its interior.

## How the chapter plays in it

1. Land on the beach and fight through the harbour (built).
2. Breach the Outer Wall and clear the Grand Marketplace (built).
3. **The city opens.** Explore freely: captives to free and raider bands in each district, the canal, the hillside and the sea wall. The raid spreads (fires, embers) as you go.
4. The finale: up the castle avenue, over the moat, through the gates and up the steps to the forecourt.

## Performance (Intel iGPU baseline)

- Every district is merged per material, so frustum culling drops whole districts that are out of view.
- Districts beyond about 120 m swap to the roof-carpet and impostor representation (as the far town already does).
- Townsfolk, captives and fires are kept per district and only simulated near the player.
- The forest LOD and the fixed fire-light pool are already in place.

## Build phases

1. **The frame and the castle.**
   - Widen the world (terrain, bounds, shoreline) and extend the Outer Wall.
   - Widen the avenue.
   - Bring the castle onto its moated base within reach, and build the whole castle route, replacing the hilltop deck.
   - Rewire the sections and spawns.
2. **The canal and the merchant quarter.** The canal with its bridges and cherries, the street grid, and shop interiors.
3. **The residential hillside.** Stepped lanes, retaining walls, fenced alleys, the pagoda temple and the rooftop viewpoint.
4. **The west shore.** The sea-wall promenade with its lanterns, the long piers, ships and the waterfront street.
5. **Life.**
   - Townsfolk per district, guard patrols and horses on the avenue.
   - District captives and raider bands.
   - A streaming and performance pass.

## The story in the city (draft, 2026-11-11)

**Today's text** (`games/era-clash-3d/src/tale.ts`, Kenne's placeholder from the 2D game): wakō sea raiders fire the coastal villages, and Lord Takamine of Kōyama sends Haru, the Crimson Blade, with Chen and Roland. The later chapters end at the Southern Captain. There is no city or castle objective yet.

**A possible Legend of Elohim framing.** Kenne is deciding whether campaign stories join the universe. The Ravencrest draft (`docs/ravencrest-campaign.md`) sets out the Tehom Lance's seam between realms, realm fissures, and the Lantern Office. For Era Clash, the seam could also tear through time: that is why warriors of different ages clash, and why the "wakō" are Norse raiders come through a fissure. Undecided; the quests below work either way.

### Mini-quests before the castle

| Quest | District (stills) | Objective |
|---|---|---|
| The Burning Boats | Harbour (6, 7, 29) | Drive the raiders off the piers and save the fishing fleet before it burns. |
| Lanterns on the Wall | Sea wall (11, 30) | Relight four signal lanterns so the castle sees the raid. |
| The Broker's Strongbox | Merchant streets (12, 17, 25) | Chase a masked thief through the crowded market and recover the strongbox. |
| Petals on the Water | Canal (2) | Escort a boat of villagers down the canal, holding each bridge as it passes. |
| The Hidden Children | Residential hill (21, 24, 27) | Find three hidden children in the lanes and fenced alleys; bring them to the temple. |
| Fire from the Roofs | Rooftops (13, 20) | Climb to the rooftop lookout and stop the fire-arrow archer. |
| The Magistrate's Seal | Samurai district, gate (26, 14) | Rescue the besieged magistrate; his seal opens the castle gate. Required. |

The castle opens once the player holds the seal and has finished two other quests. The finale runs from the moat bridge to the gates (18, 31), the stone steps (19) and the ramparts (8), ending at the forecourt against the Southern Captain.

### Seeing the objective

- An objective line on the HUD.
- A waypoint marker in the world, and a compass strip with quest pins.
- A quest log in the pause menu.
