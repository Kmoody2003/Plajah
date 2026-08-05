# Eclipsa Spatial Audio Mixer (SonicSphere) → Plajah Plan

*Created 2026-07-06. Analysis of the separately-developed `sonicsphere_-spatial-audio-mixer` codebase and the plan to (a) reskin it in Plajah's design language, (b) ship it as a standalone Plajah feature, and (c) integrate it into the Fabula video editor. Related: [[fabula-editor-architecture]], [[plajah-tvstudio-live-architecture]].*

## 1. What SonicSphere is

`metadata.json`: **"A professional-grade spatial audio mixing environment for musicians using Eclipsa and open-source spatial standards."** (Eclipsa Audio = the Google/Samsung brand for **IAMF** — Immersive Audio Model & Formats, the open immersive-audio standard.)

It's a Web Audio DAW-lite built around real audio nodes (`src/hooks/useAudioEngine.ts`, `src/types.ts`):
- **`AudioTrack`**: 3D `position [x,y,z]` via a `PannerNode`, `gainNode`, `analyser` (metering), built-in **EQ** (low/mid/high `BiquadFilterNode`s), **dynamics** (`DynamicsCompressorNode`), **WAM plugins** (`AudioPlugin` type `'wam'|'internal'`), and **`clips`** on a timeline (`AudioClip { buffer, startTime, duration, offset }`).
- **`AutomationLane`**: keyframed automation for `volume | positionX | eqHigh | …`.
- **`IAMFMetadata`**: `groupType 'scene' | 'object'`, priority, description — the immersive-authoring layer.
- **`SpatialMix`**: tracks + master plugins.
- Components: `Mixer`, `Timeline`, `Transport`, `Visualizer`, `Meter`, `Sidebar`. Export via `audiobuffer-to-wav`.

## 2. Why it fits Plajah now

Plajah **already has IAMF/Eclipsa awareness**: the music uploader recognises `.iamf` and sets `isEclipsa` on a track (`AlbumCreator`), and Chora is the audio home. So SonicSphere is the **missing production tool** that authors the immersive audio Plajah can already ingest and (eventually) play back. It also fills a real gap for **Fabula** — film needs spatial/immersive sound design, which the current A1/A2 audio tracks don't provide.

## 3. Reskin to Plajah design language

The engine is sound; the shell is generic. Port the components into `components/spatialMixer/` and restyle to Plajah:
- **Palette/idiom**: obsidian surfaces, `#FF8C00` accent (+ a spatial-teal `#22D3AA` for Chora), glass panels, the `text-[9px] font-black uppercase tracking-widest` label system, rounded-2xl cards — matching the DJ mode / Pixels / Fabula chrome.
- **Reuse Plajah components**: meters/visualizer styled like `DJModeView`'s decks; transport like the existing players; a 3D positioner (top-down + elevation puck) using the same motion/react patterns.
- **Assets**: stems upload through `UploadContext`/`uploadFile` (private-locker-aware); load from a user's Chora tracks or the new ContentAssetManager.
- **Deps**: `uuid` and `audiobuffer-to-wav` are small; verify against Plajah's Vite config (watch for the same bare-import pitfalls as jsmediatags — [[plajah-music-locker]]).

## 4. Ship as a standalone feature

- New lazy view `SPATIAL_MIXER` + a Chora studio entry ("Spatial / Immersive Mix") and an Apps tile.
- Save a `SpatialMix` (tracks, positions, automation, IAMF metadata) to Firestore per user (owner-only, like `personal_*`).
- **Export path**: render to WAV now; target **IAMF/`.iamf`** export next → lands in `AlbumCreator` (already `isEclipsa`-aware) → publishes to **Chora as spatial audio**. That closes the create→host→play loop with existing plumbing.

## 5. Integrate into the Fabula video editor

Fabula's timeline has `A1 · DIALOGUE` / `A2 · MUSIC` audio tracks ([[fabula-editor-architecture]]). Integration seam:
1. **"Spatialize audio" action** on a Fabula audio track/clip → opens the SonicSphere mixer seeded with that clip (and the scene's other stems).
2. **Shared clip contract**: SonicSphere's `AudioClip { startTime, duration, offset }` maps cleanly onto Fabula's clip model — define one common audio-clip type so a mix round-trips without re-cutting.
3. **Bake-back**: the spatial mix renders to an audio asset (WAV now, IAMF later) that drops onto Fabula's A2 as the immersive bed; automation (position/volume) is preserved as Fabula keyframes where possible.
4. **Delivery**: a Fabula film can then carry an **IAMF audio track** → immersive playback in **Taleo** (needs an IAMF-capable player path; scope in Phase 3).

## 6. Phased build

- **Phase 1 — Port + reskin the standalone mixer.** Move engine/components into `components/spatialMixer/`, apply Plajah design, wire stem upload + Chora-track load + WAV export, land as a Chora studio + Apps tile. Persist `SpatialMix` per user.
- **Phase 2 — IAMF export → Chora publish.** Emit `.iamf`; route through the existing `isEclipsa` upload path so spatial mixes publish as Chora releases.
- **Phase 3 — Fabula seam.** "Spatialize audio" from Fabula A-tracks → mixer → bake-back to the timeline; shared audio-clip contract.
- **Phase 4 — Immersive playback.** IAMF-aware playback in Chora + Taleo (binaural fold-down for headphones; speaker layouts where supported), plus deep IAMF authoring (scene/object groups, priorities, Eclipsa metadata).

## 7. Recommendation

The engine (`useAudioEngine`) is the valuable core — **keep it, restyle the shell, and anchor the whole thing on the IAMF/`isEclipsa` path Plajah already has** so it isn't a dead-end feature. Do Phase 1 as a standalone Chora studio first (fastest visible win + no Fabula coupling), then the Fabula seam. This makes Plajah one of the few creator platforms with an integrated **immersive-audio authoring → film + music delivery** pipeline.
