# Hero specimen models — `public/models/flora/`

Drop a `.glb` here and point a specimen at it; it stands in the hall on next load.
This is the same self-hosted pattern `public/models/anatomy/` uses for the seven
anatomy systems.

## Wiring one up

In the specimen's gallery module (`data/flora/canopy.ts` etc.):

```ts
model: {
  kind: 'glb',
  url: '/models/flora/sequoia.glb',
  credit: 'Model by <author>',
  license: 'CC0',      // or 'CC-BY 4.0' — carried into the on-screen label
  scale: 60,           // metres tall the specimen should stand
},
```

`scale` is the **real-world height**, not a multiplier: `SpecimenModel` measures the
model's bounding box and scales it to match, then sits it on the ground. So a model
authored in centimetres and one authored in metres both stand correctly.

## Where to get them (free, redistributable)

| Source | License | Notes |
|---|---|---|
| **Poly Haven** | CC0 | Best-vetted. Some nature assets; excellent quality. |
| **Sketchfab** (filter: Downloadable → CC0) | CC0 / CC-BY | The deepest well of plant scans. **Check the licence on every file.** |
| **ambientCG** | CC0 | Mostly textures, some models. |
| **Quixel Megascans** | ⚠️ Unreal-only on the free tier — **not usable here.** |
| **SpeedTree** | Subscription | Exports game-ready trees you may ship. The professional answer if this becomes a flagship. |
| **E-on Vue / PlantFactory** | ⚠️ Vue is discontinued; PlantFactory output is licensed for rendering, not redistribution in an app. Avoid. |

## Rules before committing an asset

1. **Licence must permit redistribution.** CC0 or CC-BY. Record the credit and the
   licence string in the specimen record — the museum label renders them, so
   attribution can never drift from the file.
2. **Draco-compress and keep it under ~4 MB.** The performance target is a Fire TV
   stick, not a desktop.
   ```
   npx gltf-transform optimize in.glb out.glb --compress draco --texture-compress webp
   ```
3. **Textures ≤ 2K.** Scanned foliage often ships 8K atlases that will stall a TV.
4. **Y-up, metres, origin at the base.** `SpecimenModel` corrects height and ground
   offset, but it cannot fix an axis-flipped export.
5. **Look at it before you commit it.** An unvetted asset is worse than no asset.

## Why both models and procedural trees

Procedural gives the wing **breadth** — every species, growable from seed, seasonal,
for zero bytes. Models give it **truth** for the specimens a visitor walks up to.
The specimen record supports either, so a gallery can mix them freely, and a
procedural tree can be upgraded to a model later by changing one field.
