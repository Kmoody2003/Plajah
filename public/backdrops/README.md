# Backdrops — `public/backdrops/`

Photographic cycloramas that stand at the treeline behind the specimens. This is
the oldest technique in natural-history display: real specimens in front, a
photographed backdrop behind supplying the depth the room itself can't.

It also solves a real constraint. An **ordinary photograph is not equirectangular**,
so it cannot be wrapped onto the sky without smearing — but it is exactly the right
shape for a curved panel at the horizon.

## Adding your photos

1. Save the images here as `forest-01.jpg`, `forest-02.jpg`, `forest-03.jpg`.
2. Open `components/museion/flora/backdrops.ts` and change `defaultBackdrop()` to
   return the `summer-woodland` set (it ships as `none`, because a set pointing at
   missing files would throw inside Suspense and blank the wing).
3. Reload. They stand behind the trees immediately.

Three photos wrap a full circle at 120° each. Two work at 180°. One works as a
single wall if the camera stays facing it.

## Videos work too — and are usually better

A `.mp4` or `.webm` is detected automatically and plays muted on a loop. **Prefer
video where you have it:** motion at the treeline — leaves stirring, light shifting,
a branch moving in wind — reads as depth in a way no still image can.

```
public/backdrops/forest-loop-01.mp4
public/backdrops/forest-loop-02.mp4
```
…then point a set at them (the `woodland-motion` set is already wired for exactly
those two filenames).

**Keep them cheap.** A backdrop is scenery, not the subject:
- **720p is plenty** at this distance. 1080p is the ceiling.
- **10–20 second seamless loop**, a few MB. Long clips buy nothing.
- **Two panels maximum on TV** — each one is a live video decode.
- Muted is mandatory; browsers refuse to autoplay anything else. The forest's own
  ambience is the soundtrack.

## What makes a good backdrop photo

| | |
|---|---|
| **Landscape, roughly 16:9** | Best. A square image gets stretched vertically across the panel. |
| **Horizon near the middle** | The panel's bottom fades into fog; a high horizon leaves the fade visible. |
| **No strong foreground subject** | A tree trunk right in frame will look painted-on, because it is. |
| **Even, diffuse light** | Hard shadows in the photo fight the hall's own sun direction. |
| **Matching hour and season** | Pair a golden-hour backdrop with a golden-hour sky in the picker. |

## Backdrop vs. sky — they do different jobs

- **Backdrop** (here): what you see at the treeline. Any photo. Does **not** light anything.
- **Sky** (`public/hdri/`): the horizon *and* the light source. Must be an
  equirectangular HDRI. See that folder's README.

For the best result, use both: an HDRI whose weather matches the backdrop's, so the
light falling on the specimens agrees with the scene printed behind them.
