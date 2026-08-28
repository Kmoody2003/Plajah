# Sky environments — `public/hdri/`

**The sky and the light are the same object.** An HDRI panorama here is both what you
see at the horizon *and* what lights every leaf in the forest. Swapping one changes the
weather, the hour and the mood of the whole hall in a single file.

That is also why the earlier procedural sky never looked photographed: a gradient can
be the background, but it can't be the light.

## Using your own photo

1. Put the file in this folder.
2. Add an entry to `components/museion/flora/skyEnvironments.ts`.
3. It appears in the sky picker (top right of the wing) immediately.

```ts
{
  id: 'my-sky',
  label: 'Morning fog',
  file: '/hdri/my_sky.hdr',
  credit: 'Photograph by …',
  license: 'CC0',              // rendered on-screen; CC-BY sources REQUIRE this
  rotationY: 1.2,              // spin the panorama so its sun matches ours
  intensity: 1.0,              // environment light strength
  blur: 0,                     // 0–1; a little hides a low-res panorama
  sun: { position: [34, 30, 18], color: '#fff2d8', intensity: 2.6 },
  fog: '#c9d8e2',              // MUST match the horizon or you get a seam
}
```

## What kind of image works

| Format | Result |
|---|---|
| **`.hdr` / `.exr`, equirectangular** | ✅ **The right answer.** True high dynamic range: the sun genuinely blows out and casts hard, directional light. |
| **`.jpg` / `.png`, equirectangular** | 🟡 Correct-looking background and usable ambient light, but no real sun energy — keep the directional light for shadows. |
| **An ordinary camera photo** | ⚠️ Not equirectangular, so it cannot wrap the sky without smearing. Backdrop only. |

**Equirectangular** means a 2:1 image holding the full 360°×180° sphere unrolled. A
normal photo isn't that. To get one: shoot with a 360 camera, stitch a panorama, or
download a ready-made HDRI.

## Where to get them free

- **[Poly Haven](https://polyhaven.com/hdris)** — CC0, hundreds of skies, the best source.
  Grab the **1k `.hdr`** (~1–2 MB); 4k is ~20 MB and won't pay for itself in a browser.
  Their **"Pure Sky"** set is sky-only with no ground clutter, which is ideal here —
  our own terrain provides the ground.
- **[ambientCG](https://ambientcg.com/list?type=HDRI)** — also CC0.

## Shipped

| File | Source | Licence |
|---|---|---|
| `kloofendal_48d_partly_cloudy_puresky.hdr` | Greg Zaal, Jarod Guest — Poly Haven | CC0 |
| `forest_slope.hdr` | Andreas Mischok — Poly Haven | CC0 |

Both are 1k, ~1.4–1.9 MB, loaded lazily with the wing. Keep new additions in that
range — the performance target is a Fire TV stick.
