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

## Back Yard (photographic plates)

The Back Yard theme is built from Kenne's asset folder (`D:\Plajah slide show assets\Back yard 1\…`).

**Asset pack.** `scripts/slideshow/build_backyard_theme.py` curates the folder into `public/slideshow/backyard/` (42 assets, about 70 MB, kept out of the PWA precache):
- 15 still plates with grey placeholder windows
- 4 swaying video loops, with windows tracked per frame at 12 fps
- 3 openings, 6 soft bokeh stills, 2 sky-lantern closings and 12 bokeh loops

Shots with stand-in photos and the design sheets are design direction only and never ship. The script writes `manifest.json`, plus a bundled copy for the planner. Windows cut off by the frame edge are extended to the size of their neighbours, so the photo runs off-screen the way the print does.

**Compositing** (`renderers/backyard.ts`):
- Each window is a mesh in plate space. A projective homography maps the photo's face-aware square crop into the quad.
- A per-pixel grey test keeps anything that overlaps the placeholder, such as clothespins, twine and stacked prints.
- The photo is relit by the placeholder's own shading and colour cast.
- For video loops, the quads are taken from the frame actually on screen. Frames are decoded through mediabunny (`videoSource.ts`), one code path for live, render and Fabula.

**Planner.**
- Plates rotate between 1-, 3-, 2- and 5-up.
- The most interesting photo gets the biggest window, and the camera visits windows left to right.
- Every other window is filled from the rest of the album, so no placeholder ever stays grey.
- A swaying loop or a wall of rows appears as a breath every few photos.
- Open on the crane shot, close on the sky lanterns.

## Show Director

`director.ts` (on-device) and `directorVision.ts` (optional).

**Reading the album:**
- Capture time comes from EXIF. File dates are used only when they spread out like real capture times rather than copy times.
- A 48 px colour and layout fingerprint gives visual likeness. Faces, light and warmth are also read, along with whether a print is black-and-white.

**Events.** Time gaps split the album, with an adaptive gap based on the median. Same occasion or close likeness merges events. Undated photos join the most alike event. Events are labelled "Summer 1987", "June 12, 1979", or "Wedding · June 1972" when the vision pass knows the occasion.

**Order.**
- *Life story*: chronological, with undated events slotted in by era.
- *For feeling*: a calm open, a joyful peak at about 70%, then a quiet close.

**Scenes.** Each event opens on an establishing shot and ends on its strongest moment (the button). The best single portrait (or a pinned photo) closes the show. Key shots get more time: opening ×1.15, button ×1.15, peak ×1.1, hero ×1.45. The Back Yard planner keeps an event on one plate when it fits, shows a chapter line when the event changes, and places breaths between events.

**Vision pass.** On-PC models are text-only today, so on-device direction uses the director's own analysis. The optional cloud read sends 384 px thumbnails, six per request, to Gemini through the signed-in `/api/ai/gemini` proxy, and only after the cost and time estimate is shown and accepted. Each photo gets a caption, setting, occasion, people count, mood, era, emotion and energy.

**Defaults.** The director is on by default for Lantern Garden and Classic, and off by default for Back Yard (one switch in the studio).

**Import.** Choose a folder, select photos (multi), one photo, or drag and drop photos or whole folders anywhere on the studio. Folders are walked recursively, iPhone HEIC is converted on-device, EXIF dates are read on import, and audio dropped in the same way joins the soundtrack.

## Descriptions (captions)

- **Off by default.** A shot's description shows only when it's switched on for that shot (`showCaption`). File names never show.
- **Where a description comes from:**
  - **typed** by the owner
  - **a descriptive file name**, via `fileNames.ts` `describeFileName`
  - **the picture**, from the vision read's caption
- **File names.** The detector is strict, because a wrong caption on a memorial photo is worse than none.
  - It rejects camera, phone, app, screenshot, download, scan and random or hash names: `IMG_4021`, `PXL_2023…`, `WhatsApp Image…`, UUIDs, `a8f3kz91`.
  - It turns real names into clean text: `grandma_at_the_lake_1987` becomes "Grandma at the lake, 1987", and `DSC_0045 grandma garden` becomes "Grandma garden".
  - 41 test names pass.
- **Studio controls:** "Remove file-name captions", "Show all", "Hide all", and a per-shot "Show description" switch with the source shown.

## Graphics (posters, obituary covers, flyers)

- **Detection, on-device** (`photoPrep.ts` `graphicLikeness`). Three signals, measured on real photos against an obituary cover:
  - the exactly-flat share of lit pixels: photos ≤0.02, the cover 0.68
  - distinct colours per lit pixel: photos ≥0.17, the cover 0.02
  - the crisp share of edges: photos ≤0.36, the cover 0.85
- **Confirmation.** The vision read also reports `kind: graphic`. Each shot has a "Full screen" override.
- **A graphic is never cropped:**
  - Back Yard gives it its own full-screen shot, fit to 16:9 over a soft lantern plate.
  - Classic shows it whole with no parallax.
  - Lantern Garden letterboxes it inside its polaroid.
  - Full page has no Ken Burns crop.
  - Plate windows are never filled with graphics.

## No exposed template

Windows are found by grey mask, then quad fit, then a rescue pass, then edge extension.
- **Rescue pass.** Leftover grey is rescued if it is exactly a window's grey and flat, or ringed by bright paper, or sits level in a row of prints of the same grey and is print-sized. That last case covers neighbouring prints whose grey merged.
- **Rejects.** Tiny, thin, much brighter slivers are dropped as paper borders. Background grey (sky, trim, a garden sign, fence boards) is left alone.
- **Loops.** Windows that appear only part of the time are kept. Their quad is held, and the grey mask draws nothing where there's no grey.
- **Runtime.** Window meshes are drawn 10% larger than the quad, and the mask finds the true edge. A window with no photo, or with a failed photo, borrows another print photo.
- **Table spreads.** Both are excluded: prints buried under other prints can't be filled reliably.
- **Audit.** An offline audit (template-grey pixels left uncovered per plate) is clean apart from the three background objects.

## Transport

The studio's first tab, **Show · timeline**, plays the planned show exactly as it renders.
- **Controls:** back to start, previous and next shot, play/pause, and a running time showing the current photo.
- **Timeline:** a scrubbable segment strip (opening, photos, wide shots, chapters, closing).
- **Keys:** space plays and pauses, ← → step shot to shot, Home goes back to the start.
- **Music** follows the same cues as the render (`ShowRuntime.playPlan` / `seekPlan` / `stepPlan`).
- **Live mode** has the same bar, with previous, pause and next plus the "seen full page" count.

## Editing shots

- **Strip actions.** Hover a thumbnail for **Edit**, **Crop & scale** and **Remove**. Right-click for the full menu: edit, crop and scale, rotate, keep original framing, full screen or print, show or hide the description, and remove from the show.
- **Edit photo.** Opens the platform's Photo Develop panel (`PhotoEditPanel`). The saved recipe is baked into new pixels (tone via `adjustmentToCssFilter`, straighten with no exposed corners). The shot is then re-prepped, keeping its description, timing and choices.
- **Crop & scale** (`ShowCropTool.tsx`) has three parts:
  - **Crop picture:** aspect presets (Free, Original, 16:9, 4:3, 3:2, 1:1, 4:5), drag to move, corners to resize, and wheel or slider to zoom. It replaces the auto-trim.
  - **Polaroid window:** the square that goes in the print. It replaces the face-aware pick.
  - **Full-page size:** 60–100%.
  - **Auto** restores any of them.

## Auto-trim

`detectTrim` in `photoPrep.ts` runs on import.
- **Borders:** flat black or white borders are cut away (scans, letterboxed stills).
- **Phone screenshots:** recognised by phone shape, no camera date, a PNG file or "Screenshot" name, and a flat status bar.
  - It cuts to the photo inside. A row counts as chrome when most of it is the app's background colour (taken from the screen edges, light or dark mode); the photo is the tallest run of non-chrome rows.
  - Tested on light and dark Instagram-style screenshots: the crop lands within 1% of the true photo edges.
- **Override:** each shot has a "Keep original framing" option.

## Transitions and reuse

- **Transitions.** Cuts use Fabula's library shaders (`transitions.ts` compiles the `phase3Transitions` GLSL; outgoing and incoming frames are rendered to targets, then the transition pass).
  - **Auto** picks from the theme's palette. Back Yard uses Exposure Blur (bloom or cool haze), Diffuse, Glint and Dolly Fade. Classic mixes its own moves with Fabula's.
  - The owner can pin any library transition and set its length (0.4–4s, Back Yard default 1.4s). This replaces the old ~3s double-exposure between plates.
- **Reuse.** Windows go to the least-shown photos, and a shot repeats a photo only when it has more windows than the album has photos.
  - Small albums are steered to plates and breath shots they can fill.
  - Verified: no repeats within any shot with 11 photos, and the breath picked a 7-window plate over a 40-window wall.

## Export

- **Encoding:** mediabunny `CanvasSource` with hardware H.264 preferred, `latencyMode: 'quality'`, variable bitrate at ~0.18 bits per pixel per frame (~11 Mbps at 1080p30), and a key frame every 2s.
- **Speed:** measured 2.6× faster than real time at 1080p (a 58.7s show in 22.5s).
- **Progress:** the progress line shows the live speed.

## Studio UI (Plajah Design Language)

- **Primitives.** Built on `components/ui`: `Button`/`IconButton` (one `primary` = Render 1080p; `accent` = play), `Surface` sections with `Eyebrow` titles, `Chip` toggles, `Input`, `AnchoredPopover` for the Open menu, and `useContextMenu` for the timeline. Colours and radii come from the `--pj-*` tokens.
- **Layout.** The left column (stage, transport, shot timeline) is pinned and sized to the viewport. The right options panel scrolls on its own, and the selected-shot inspector sits at its top.
- **Timeline** (`components/photo/show/ShowTimeline.tsx`):
  - **Select:** click, Ctrl/⌘-click, Shift-click a range, or drag a box over empty space.
  - **Move:** drag a shot or the whole selection; Alt+←/→ nudges.
  - **Edit:** Ctrl/⌘ D duplicate, C copy, X cut, V paste, A select all; Delete removes; swap two from the bar or the menu.
  - **Hover:** edit, crop, remove and more.
  - **Director:** a hand edit turns the director off (and says so).
- **Look** (`finish.ts` + `components/photo/show/LookPicker.tsx`):
  - **Pickers:** the platform cinematic LUT strip (`LutStrip`, `CINEMATIC_LUTS`) with a strength setting, and the lens picker (`LensPicker`, `LensEngine`).
  - **Scope:** whole show, or per photo (a photo's look wins on its shots).
  - **How it applies:** the LUT is a 17³ 3D texture on the GPU, and the lens runs on each rendered frame. Both apply after the picture and before the overlay's `textScene` (captions, cards, chapter lines, fades), so text is never graded.
  - **Verified:** Bleach Bypass desaturates and Sepia 1890 warms; VHS renders.
