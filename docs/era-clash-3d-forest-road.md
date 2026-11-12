# Era Clash 3D: the forest road, the fish market, horses and wildlife

Kenne's direction (2026-11-11). It extends [the city plan](era-clash-3d-city-plan.md); places land on [the map](era-clash-3d-map.md) as they are built.

## Decisions (Kenne, 2026-11-11)

- **The harbour moves about 400 m south.** The coast, the beach, the piers and a new open fish market move to z ≈ −470. About 400 m of forest (a quarter mile) fills the space between the harbour and the Outer Wall (z −36). The city stays where it is.
- **The channel becomes a river.** It leaves the water gate and winds south through the forest to the sea. Halfway, the road crosses it by a bridge. Rafts can go from the canal, through the water gate and down the river to the sea.
- **Animals are built in-engine:** procedural rigged horse, deer, dog, cat and birds with their own gaits, using no outside services. They can be swapped for Character Forge models later.
- **The Michael shrine is mechanics plus placeholder.** The shrine, the statue, the blessed spring and the blessing are built. The journal entry for mystery fragment 1 uses placeholder text marked (proposed), for Kenne to write. No Elohim or Void canon is invented.

## The layout (metres; +Z north, inland)

| Band | z | What |
|---|---|---|
| Sea and beach | < −455 | The landing beach, raft 3, and the river mouth east of the harbour. |
| Harbour and fish market | −470 … −430 | The stone quay, three piers, the boats and the dock warehouses (moved). The open fish market sits under awnings on the quay's landward side, with a fish auction floor, drying racks and stalls. |
| Lower forest | −430 … −270 | Invaders along the road. Watchtowers in the trees. The first hidden camp. |
| River and bridge | ≈ −250 | The road bridge over the river. **The cutscene:** invaders threaten a merchant family on the bridge, and the player must defeat them to save the family. |
| Upper forest | −230 … −70 | The second hidden camp. **The hidden glade:** a statue of Michael the archangel, and a spring rising from the altar. |
| Fields | −70 … −36 | Cleared ground before the Outer Wall and its gatehouse. |

The forest is meant to be gorgeous and dense: mixed broadleaf and conifer, ferns, flowering undergrowth, moss, fallen logs, shafts of light, mist in the hollows. The road stays readable through it. The camps, the glade and the towers sit off the road and out of sight from it.

## Gameplay in the forest

- **The road fight:** raider bands along the road. The harbour section becomes "The Forest Road", and the sections advance as the hero walks north.
- **Watchtowers (3):** timber yagura in the trees, taken by invaders. Climb the ladder (a climb action on the ladder) and defeat the archers on top. Each one is a deed.
- **Hidden camps (2):** tents, a fire and loot. Find a camp off the road, defeat the guards, then burn the camp (G at the fire). Each one is a deed.
- **The bridge rescue:** a short cutscene (camera on rails, captions) when the hero nears the bridge. Invaders hold a merchant family at blade-point. Defeat the band and the family is freed; they thank the hero and go on to the city.
- **The shrine of Michael (secret):** found only by exploring. Drinking from the spring (G):
  - grants the blessing: more damage, faster health regeneration, and a glow on the blade;
  - unlocks "Mystery I" in the journal (text: proposed, for Kenne to write).

## Horses

- Horses are tied at the harbour, at the forest's bridge and at the city stables. Press G near one to mount, and G again to dismount.
- **Riding:** walk, trot and gallop, with sprint to gallop. The camera pulls back while mounted. The horse turns smoothly and won't enter deep water.
- **Mounted sword:** left and right katana cuts from the saddle, with a strong pass while galloping that hits along the horse's side. Raiders can pull the rider down when hit enough.
- **The horse:** a procedural rig (spine, neck, head, four three-segment legs and a tail) driven by gait cycles. Walk is a four-beat gait, trot is diagonal pairs, and gallop is a three-beat gait with a suspension phase. It wears Sengoku tack: a wooden saddle (kura), abumi stirrups and a crupper.

## Wildlife

- **The forest:** sika deer that graze and bolt from the hero and from fights. Tanuki, hares and a fox. Birds in flocks that rise when startled, plus crows, and herons at the river.
- **The city:** dogs (shiba-type) that follow or bark, cats on roofs and in alleys, sparrows and pigeons at the market, and gulls at the harbour.
- **Shared engine:** one procedural quadruped rig parameterised by size and proportions (horse, deer, dog, cat, fox, tanuki, hare), and one bird rig for flocks. Simple AI: wander, graze, flee, follow and perch. Animals are only simulated near the player.

## Build phases

1. **Re-lay the coast:**
   - move the harbour south;
   - lay the forest terrain, the river and the road bridge;
   - plant the first pass of the forest;
   - update the map.
2. **Lush forest:** undergrowth, flowers, ferns, logs, mist and light shafts. Performance pass.
3. **Fish market** on the new quay, with stalls and fishmongers (townsfolk).
4. **Forest gameplay:** road bands, watchtowers with climbing, hidden camps, the bridge rescue cutscene.
5. **The shrine of Michael:** the glade, the statue, the spring, the blessing and the journal.
6. **Horses:** rig, gaits, mount and dismount, mounted camera, mounted combat.
7. **Wildlife:** the quadruped and bird rigs, then deer, birds, dogs and cats, then the rest.
