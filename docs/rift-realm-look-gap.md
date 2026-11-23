# Rift Realm — the cyber forest's look: gap to the clips and stills (2026-11-22)

Goal (Kenne): the game should look like the video clips and stills behind each level, starting with the cyber forest.
That means real geometry, high-end textures and materials, and the performance to afford them.

Sources: the art | game pairs in `docs/rift-realm-wilds/*.jpg` (34 shots, re-shot 2026-11-22 by the forest session).
The art is in `D:\plajah game assets deign from promtps\Shooter`, with clips in `Nov 15 - 14_43/*.mp4`: the forest
flythrough, chapel ruin, canopy sniper, mangrove walk, tree ramp and vault. Camera matches are in
`games/rift-realm/src/world/shots.ts`. Geometry scores (depth model) are in `docs/rift-realm-open-world.md`: mean 0.372.

## What the art has that the game doesn't (biggest first)

1. **Light and exposure.** The art is low-key and contrasty: deep shade under the canopy, warm shafts of sun through
   fog, cool bounce light, soft dark contact shadows everywhere (ambient occlusion). The game is over-exposed and flat:
   white blown-out sky, evenly lit ground, no AO, so everything floats. This is the cheapest, biggest step: tone
   mapping and exposure, GTAO, height fog in layers, god rays, a sky that isn't a white hole.
2. **Foliage.** Art canopies are dense, dark green, soft and translucent where the sun comes through. Game canopies
   read as flat grey-cyan shards: leaf cards with no translucency, no shading by depth into the crown, the wrong
   colour, too sparse. Fix it in the leaf material (subsurface/translucency, crown-depth darkening, wind), the atlas
   colour, and denser crowns.
3. **Ground and stone materials.** Art flagstones are dark, varied and worn: moss in the cracks, leaf litter, puddles
   only in hollows. Game stone is uniformly light, glossy-wet everywhere (the wet pass is overdone) and tiled, with
   floating slabs. Needed: height-blended PBR (albedo, normal, roughness, AO) with moss and dirt in crevices,
   per-stone variation, puddles masked to low spots, decals (leaves, cracks, circuits).
4. **Undergrowth.** Art: ferns, moss mounds, leaf litter, warm yellow-green. Game: one teal grass blade everywhere.
   Needed: a mixed ground layer (fern, moss, litter, small plants) in the right palette, and less grass.
5. **Ruins geometry.** Art: gothic stone with tracery, broken edges, ivy and vines, rubble. Game: box walls and box
   arches from the kit. This is the forest session's geometry work (built from the sheets); the materials above
   lift it a lot before the shapes change.
6. **Water and glow.** Glowcap Stream: art has white water and spray over rocks, mist, and strong bloom on the
   glowcaps and circuits. Game: a flat cyan sheet and weak glow. Needed: the Apex water with foam on the rocks,
   mist particles, bloom tuned to the emissives.
7. **Performance.** The level runs at about 10 fps with ~13 M triangles and ~50k draw calls. High-end materials
   need headroom first: merge static meshes and instance kit pieces, use the impostor and LOD rings, cull the canopy
   and shadow casters, and set a draw-call budget.

## Proposed order

| # | Work | Files (owner today) | Proof |
|---|---|---|---|
| A | Performance budget: draw calls ↓ 5×, triangles ↓, 60 fps target on the dev PC | world/kit.ts, places.ts (forest), services/vegetation LODs | fps / calls / tris per shot |
| B | Light: exposure, tone mapping, GTAO, layered fog, god rays, sky | post.ts, world/skyCycle.ts (uncommitted edits by another session) | same-camera pairs |
| C | Foliage material + crowns | services/vegetation/trees/* (uncommitted edits by another session) | pairs: Portal Plaza, EH08, Circuit Court |
| D | Ground and stone materials, wet pass, decals | world/terrain.ts (this session), kit.ts materials | pairs: Portal Plaza, Cathedral, Circuit Court |
| E | Undergrowth mix and palette | services/vegetation catalog + eco rules (this session) | pairs: EH08 |
| F | Water foam, mist, bloom | water (forest), post.ts | Glowcap Stream pair |

The scoring needs one addition. The depth score only measures layout and silhouettes, so a colour/tone score
against the art (histogram + SSIM on a low-res luminance) would show A–F moving. Every change gets a same-camera
art | game pair.

## B — light pass 1 (2026-11-22)

Proof: `docs/rift-realm-wilds/light-pass-1.jpg` (art | before | after, same cameras, `?time=day`, clean HEAD snapshot).
- Day fill 2.7 → 1.05 (green-grey bounce), warmer sun (6.0), exposure 1.2 → 1.0, env 0.18 → 0.12.
- GTAO at forest scale: radius 0.25 → 1.4 m, scale 1.3 (`scene.userData.look`, read by post.ts).
- Height fog: thick on the floor, thinning over 35 m above the player's ground; darker green-grey haze.
- Day sky held at 50 % (no white hole through canopy gaps); storms darken the haze and the horizon band (the
  `?sky=vol` pale band under a dark deck).
- Grade: contrast 1.12 around mid grey, darker toe, warm mids over cool shade; shafts ×1.4.

Mean luminance (art ≈ 55–78): before 82–142 → after 48–120. Mossy Floor and Glowcap Stream now match; Portal Plaza,
Circuit Court and Great Oak are still bright from the glossy flagstones (D) and open sky where the art has canopy (C,
geometry). The Cathedral art is a cool blue interior: it wants a per-place light (a local look volume), not the global
day.

## D — stone and ground pass 1 (2026-11-23)

Proof: `docs/rift-realm-wilds/stone-pass-1.jpg` (art | before | after: Portal Plaza, Circuit Court, Cathedral).
- wetness.ts: damp is a satin sheen (roughness never under 0.3; it was 0.14 on every flat face, so plazas mirrored the
  sky). Only rare pools on flat ground (where the wet zones peak) go glossy (0.07) and darker.
- kit.ts flagstones: per-slab tone from a ~1 m cell hash (light/dark, warm/cool grey), cooler darker stone, moss and dirt
  in the joints and up the bevels, moss patches creeping onto the tops, rougher moss.
- Paving mean luminance: Portal Plaza 89 → 77 (art 76), Circuit Court 76 → 66 (art 78), Cathedral 71 → 63 (art 55).

Still open: a warm cast on the stone (the light grade; the Cathedral wants its own cool look), moss on the tops is faint,
no leaf-litter or crack decals yet, the circuit lines in the paving are thin and sparse next to the art.
## Coordination

The forest session (`local_06184409`) owns world/* geometry. Uncommitted edits in post.ts, skyCycle.ts and
services/vegetation/trees/* belong to other sessions. Agree who takes B and C before anyone edits those files.
