# Flux Canvas

Still images brought to life as Flux visualizers. Every image plays three ways, and all three are
ordinary Flux scenes, so they appear wherever Flux does (Pixels, Stage, Chora, Fabula, TV, the DJ console):

| Way | Scene id | Mode | What it is |
|---|---|---|---|
| Directed | `canvas:<id>` | `FLUX_CANVAS_<ID>` | Cuts between the plate and the world by the song's sections, as the councils directed |
| 2.5D | `canvas-plate:<id>` | `FLUX_CANVAS_<ID>_PLATE` | The picture as a living relief (Depth Anything depth), its shapes morphing with the music |
| 3D | `canvas-world:<id>` | `FLUX_CANVAS_<ID>_WORLD` | The picture rebuilt as a place the director flies through |

## Where things live

- `services/fabula/fluxCanvasCatalog.ts` — the image list (names, moods, descriptions) and ids. Pure data.
- `components/plajahPixels/engine/core/fluxImageWorlds.ts` — the engine: building blocks (relief, form points,
  ribbons, shards, crystals, fronds, veils, river, kinetic tiles, mist, cloth, slabs, light rig), each image's
  plate recipe (`PLATES`) and world recipe (`WORLDS`), the Show mode, device tiers and the frame governor.
- `imageWorldAudio.ts` — the ears: the platform's split (kick / snare / hat onsets via StageAudio, flywheel beat
  clock, bass wobble, drops, builds, breakdowns) plus the song map when the host knows the track.
- `imageWorldDirector.ts` — the beat-locked director (cuts on bars, accelerates into drops, hard cut on the drop;
  per-world `path`, `ride`, `avoid`, `minDist`).
- `imageWorldDirection.ts` + `imageWorldDirection.data.ts` — the councils' vocabulary and their direction per image.
- `services/fabula/songMap.ts` (+ worker) — Music Intelligence's measurement turned into sections and drops.
- Assets: `public/visualizers/canvas/plates/<id>.jpg` (1376×768) and `depth/<id>.png`.
- Settings: `spec.morph` (pattern morph, default on) and `spec.director` (default on); Stage shows both as toggles.

## Tweak an image

Open the lab: launch config `flux-canvas-lab` → http://127.0.0.1:3227/flux-canvas-lab.html. Play the test song
(it has real intro / build / drop / breakdown sections) or load a track; pick Show, 2.5D, 3D or A | B. Edit the
image's entry in `PLATES` / `WORLDS` and reload. For deterministic checks use the offline harness in the console:
`await imgLab.prepareSong()`, `imgLab.runSong(scene, t0, t1)` (logs cuts/sections/drops), `imgLab.stillAt(scene, t)`.

## Add an image

1. Save it as `public/visualizers/canvas/plates/<id>.jpg` at 1376×768 (any 16:9 works; keep it under ~400 KB).
2. `node scripts/fluxCanvas/depthMaps.mjs` → writes `depth/<id>.png` (local, CPU).
3. Add it to `FLUX_CANVAS_IMAGES` in `fluxCanvasCatalog.ts`.
4. Add a plate recipe to `PLATES` and a world recipe to `WORLDS` in `fluxImageWorlds.ts` (start from the closest
   existing image).
5. Append its three modes to the `VisualizerMode` enum and to the END of `MODE_TO_FLUX_SCENE` in
   `components/plajahPixels/types.ts` (never insert above — Chora and TV pick presets by index), and bump the
   count in `tests/fluxPlatformCatalog.test.ts`.
6. Optional: `npx tsx scripts/fluxCanvas/runFluxCanvasCouncil.ts <id>` to have the councils direct it (Gemini,
   about a cent per image).
