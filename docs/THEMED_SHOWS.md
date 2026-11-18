# Themed Shows (Photos)

Programmatic, themed slideshows built from a folder or album. The first theme is a
memorial, **Lantern Garden**; the second is **Classic**.

## What a show is

`ShowSpec` (services/slideshow/types.ts) holds everything: the theme, the dedication
(opening line, name, dates, closing line), the prepared photos, the music (none /
playlist / loop), the pace, and theme options. Every frame is a pure function of show
time `t`, so one engine drives all three outputs:

| Output | Path |
|---|---|
| **Live** (interactive) | `ShowRuntime.startLive()`: pointer, touch, swipe and arrow keys, space to pause, Esc to step back |
| **Video** | `renderShowVideo()`: frame-by-frame with WebCodecs via mediabunny, music mixed offline |
| **Fabula** | `openShowInFabula()`: one live-scene clip per plan segment on V1, music on A1 |

## Pipeline

1. **Smart prep** (`photoPrep.ts`, on-device)
   - Orientation: EXIF-honoured decode, plus owner quarter turns.
   - Faces: FaceDetector where the browser has it; otherwise a saliency map (edges, skin tone, centre bias).
   - Polaroid crop: a square that keeps faces whole, with headroom.
   - Tone fix: a restrained levels, gamma and saturation pass, blended at 70%.
   - Interest score: drives how long each photo stays full page.
2. **Planner** (`planner.ts`)
   - Builds deterministic segments: `intro → visit… (wide every N) → outro`.
   - Full-page time is 4.5–11s, from interest and faces.
   - Playlist mode can fit photo timing to the music.
   - `musicCues()` repeats the playlist, or the single loop track, until every photo has had its time.
3. **Renderers** (`renderers/`)
   - `lantern.ts`
     - The camera flies on lifted Bézier arcs, craning over the lines between rows.
     - It leans into each polaroid, which stops swinging as the camera arrives.
     - The photo lifts into a full-page frame with a slow Ken Burns move, then the camera pulls back out.
     - Every few photos there is a wide breath of the whole garden; the outro releases sky lanterns.
     - Live mode is an endless tour of the least-seen photos. Tapping a polaroid glides there and holds it full page until the next tap.
   - `classic.ts`
     - Full-screen photos with Ken Burns and a 2.5D depth parallax: the subject and lower frame float forward.
     - Transitions: crossfade, dip to black, dreamy drift, parallax push and soft wipe (auto varies them).
     - Photos that fight the screen shape sit on a blurred copy of themselves rather than being cropped.
4. **Scene** (`themes/lanternGarden.ts`)
   - Primitive and instanced geometry on the iGPU baseline: a fixed pool of six lantern lights, bloom at half resolution, no per-pixel noise.
   - Props: posts, catenary lines, paper lanterns, string-light bulbs, a fence, trees, a bench, a candle table, flower pots, fireflies and sky lanterns.

## Fabula integration

- Media pool item: `{ type: 'show', show: ShowSpec }`.
- Clips: `{ kind: 'show', srcIn: segment.start }`.
- Laid end to end the clips reproduce the render exactly. Each one can be trimmed, moved, re-ordered, graded or given a Fabula transition.
- Monitor: `ShowLayer` in components/Fabula/Fabula.jsx re-renders the scene at `srcIn + local t`.
- Export: an `offlineRenderer` branch for `clip.type === 'show'` renders through `renderShowFrame()`, which returns the same frame.

## Where it lives

- Photos → **Shows** tab (PhotoManager).
- On an album: **Make a themed show**. On a selection: **Make a Show**.
- Lab: `themed-show-lab.vite.config.mjs` → http://127.0.0.1:3301/?preset=10 (painted sample photos and a synthesized pad). `showLab.stills(spec, times)` pins exact frames for review.

## Next

- Cloud-save show specs, uploading local-folder photos and music so shows survive a reload and sync across devices.
- An art pass against a reference image or video for the garden: real lantern and prop models through the asset pipeline.
- More themes on the same renderer contract (`ShowRenderer` in renderers/base.ts).
- A Fabula inspector for show clips: per-photo dwell and caption, and "Edit in Photos".
