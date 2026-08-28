# Museion — The Living Museum: build handoff

**Status:** Phase I in progress. **Scoped** 2026-08-28.
**Plan + design artifact:** https://claude.ai/code/artifact/56e81a06-edc8-4e3e-8272-58d63150e4f5
**Companion memory:** `plajah-museion-living-museum`

Two flagship wings for Museion (the studio formerly displayed as "Plajah Labs" —
renamed 2026-08-28, commit `147159f`, display strings only):

- **Wing I — The Living Forest.** The entire plant kingdom as a walkable R3F exhibit.
- **Wing II — The Orrery.** The existing Solar System module upgraded to cinema.

---

## Read this first if you are taking over

### The stack is already proven — do not introduce a new one
- `@react-three/fiber`, `@react-three/drei`, `@react-three/postprocessing`, `three` are **installed
  and in production use**. `components/HumanBodyExperience.tsx` is the reference implementation:
  `<Canvas>` + `useGLTF` + `EffectComposer/Bloom/Vignette`, models self-hosted at
  `public/models/anatomy/<system>.glb` behind `const GLB_URL = k => \`/models/anatomy/${k}.glb\``.
  **Copy that pattern**; do not hot-link models or textures.
- `components/SolarSystemModule.tsx` (641 lines) is **already R3F**. Wing II is an upgrade in place,
  not a rewrite. It currently has two defects to fix as part of the work: it **hot-links planet
  textures from the three.js GitHub repo** (`raw.githubusercontent.com/mrdoob/three.js/...` — fragile,
  offline-hostile) and plays a **soundhelix.com placeholder MP3**.
- Audio goes through the **shared** Web Audio context: `services/fabula/audioGraph.ts` →
  `getAudioCtx()`, `resumeAudioCtx()`, `getMasterInput()`, `getFxSends()` (convolution reverb +
  delay buses already exist). Do **not** create a second AudioContext. Ambience must be
  **gesture-gated** — see the autoplay/suspended-context lessons in `plajah-fabula-edit-toolset`.

### Routing must not change
- The forest wing opens on the existing **`PLANT_BIOLOGY`** module id; the Orrery keeps
  **`SOLAR_SYSTEM`**. Both are dispatched in `components/ClassroomsView.tsx`
  (`selectedModule === 'PLANT_BIOLOGY'`), reached via `AcademiaHubView` → `onOpenModule` →
  App's `academiaModule` → `ClassroomsView initialModule`.
- These ids are a **Firestore contract**: `ClassroomModule.url` rows are admin-editable and teachers
  may already have live rows pointing at them. Renaming them breaks real classrooms.
- The existing `components/PlantBiologyModule.tsx` (sepia herbarium study room, Nov-era, unrelated to
  this work) **survives** as the wing's **Study Room** — one door in from the forest. Do not delete it.

### Performance contract — the target is a Fire TV stick, not the desktop
Per `plajah-pixels-gpu-ceiling`, the browser cannot reach the discrete GPU. Budget accordingly:
- Instanced foliage/asteroids (`InstancedMesh`), draco-compressed GLBs **≤ 4 MB** per hero model,
  textures **≤ 2K**, DPR capped at **1.5** on TV.
- Postprocessing tiers **down** — drop bloom below 30 fps. Reuse the health-check/fallback shape from
  `GpuStage` in `components/Fabula/Fabula.jsx` (if it can't draw, bail to the simpler path).
- `prefers-reduced-motion`: no camera flight — a still forest with slow crossfades.
- Both wings stay **lazy-loaded chunks**; the museum costs nothing until a visitor walks in.

### Traps that have already bitten this codebase (do not re-learn these)
1. **Untracked files break CI, not local builds.** `services/demoMode.ts` was imported by committed
   code but never `git add`ed — local builds passed (file on disk), the Firebase deploy failed with
   `Could not resolve`. Before any push: `git status` and check every `??` entry that committed code
   imports. Verify with the untracked files **stashed** (`git stash -u`) so the local build matches CI.
2. **TDZ crashes are invisible to the bundler.** In huge components, render-scope code must sit below
   everything it reads. This crashed Fabula on mount twice (`Cannot access 'container' before
   initialization`). esbuild/vite will not catch it.
3. **Python `io.open(p,'w')` truncates before writing** — if the write then throws (e.g. a
   surrogate-pair emoji escape `🎇` that can't encode to utf-8), the file is left **empty**.
   Do all `.replace()` + `assert` first, single write last. Emoji via `"\U0001f387"`.
4. **Backticks inside a JS template literal** (Fabula's `const CSS = \`...\``) terminate the string —
   including inside `/* comments */`.
5. **PWA service worker serves stale bundles.** After deploying, hard-refresh (Ctrl+Shift+R) or the
   old UI persists. The Android APK is a **thin shell** (`capacitor.config.ts` →
   `server.url: 'https://plajah.com'`), so deploys reach it with **no APK rebuild** — force-stop and
   relaunch the app.

---

## Wing I — The Living Forest

### The design (full treatment in the artifact)
A forest floor at dusk. Deep green-black ground, god-ray light from the canopy, living green as the
only interface colour. Specimen labels are frosted glass floating in the scene, never a flat page.
Latin binomials **always** italic serif (Fraunces) — the museum-label voice. Layered ambient sound.

### Six galleries (walk by gallery, learn by lineage)
| Gallery | Contents |
|---|---|
| **The Canopy** | Trees — the 3D heart. Oak, maple, baobab, sequoia, banyan, ginkgo, bristlecone. |
| **The Flower Court** | Angiosperms — orchids, roses, sunflowers, corpse flower, lotus. |
| **Herbs & Grasses** | Basil→bamboo, wheat→sweetgrass; cultivation + medicinal lore. |
| **The Ancient Line** | Mosses, ferns, cycads, horsetails — deep time, lit like amber. |
| **The Ocean Hall** | Kelp, seagrass, mangroves, algae. Underwater treatment (see below). |
| **The Fungal Annex** | Fungi — labelled as **its own kingdom** (honest taxonomy), joined to the Canopy by the mycorrhizal "wood-wide web" story. |

Every specimen carries **both** its gallery placement and its true lineage
(`bryophyte | fern | gymnosperm | angiosperm | algae | fungus`), so the wing is browsable as a forest
and teachable as taxonomy.

### The 3D strategy — three sources, in priority order
1. **Procedural `TreeGrower` engine (ours).** The centrepiece and the scale play: space-colonization
   growth + per-species parameters (branch angle, taper, leaf shape/size, bark palette) so an oak
   silhouettes like an oak and a birch like a birch. Gives rotatable trees, **seed→mature growth on a
   scrubber**, and seasonal shader ramps for ~0 asset bytes. **Highest risk, highest magic — build first.**
2. **Curated hero GLBs** — sequoia, baobab, mangrove root systems, mushroom clusters. CC0/CC-BY,
   vetted, draco ≤ 4 MB, in `public/models/flora/`, attribution stored in the specimen record.
3. **Plates & photographs** — public-domain botanical plates (BHL) beside modern photos
   (Wikimedia Commons, USDA PLANTS).

### Sound design
Base forest bed + **independently looped** layers (birdsong, wind-in-leaves, creek) mixed live on the
Web Audio graph so it never audibly repeats. Rooms change the air: Ocean Hall low-passes everything
and adds water; Ancient Line goes sparse and cavernous (convolution reverb via the existing FX bus);
Fungal Annex goes quiet and close. Specimens get their own layer via `PositionalAudio` on approach.

### Data model
`data/flora/types.ts` — `FloraSpecimen`: `commonName`, `sciName` (rendered italic), `family`, `genus`,
`lineage`, `gallery`, `photos[{url,credit,license}]`, `plate?{url,source,year}`,
`model?` (`{kind:'procedural',params}` | `{kind:'glb',url,credit,license}`), `stats{height,lifespan,range}`,
`conservation?` (IUCN → label chip), `story` (the museum-label paragraph — **written by us, not scraped**).
One data module per gallery under `data/flora/` (the `data/scienceDisciplines/*` pattern).
~40 specimens in Phase I → 200+ by Phase IV.

### File layout
```
components/museion/flora/
  FloraWing.tsx        // the walk: R3F scene, galleries, ambience conductor
  TreeGrower.ts        // procedural engine (PURE — unit-tested, no three.js imports in the math)
  SpecimenView.tsx     // orbit a specimen: model/photos/plate + museum label
  ForestAudio.ts       // layered ambience on the shared getAudioCtx() graph
data/flora/            // canopy.ts flowers.ts herbs.ts ancient.ts ocean.ts fungal.ts + types.ts index.ts
public/models/flora/   // hero GLBs (draco)
public/audio/forest/   // CC0 ambience layers
```

---

## Wing II — The Orrery

Upgrade `components/SolarSystemModule.tsx` in place:
- **Self-host** a 2K texture set at `public/textures/solar/` (NASA/USGS Astrogeology PD +
  Solar System Scope CC-BY), lazy-loaded per body — kills the three.js-repo hotlinks.
- Sun with layered bloom + corona sprite; fresnel atmosphere shells (Earth, Venus, Titan); ring
  shadows; Earth night-side city lights.
- **Tour mode**: eased dolly rails between bodies (approach → orbit insertion → hold) with letterbox
  bars and depth of field. Free-flight and classic top-down orrery one key away. TV D-pad steps bodies.
- **True motion**: Keplerian elements per planet computed locally (no API) — real periods,
  eccentricities, axial tilts. Time scrubber 1900–2100; "today" shows the real arrangement.
- Instanced asteroid belt + Kuiper objects; Pluto/Ceres/comets with particle tails.
- **Sound**: replace the placeholder stream with a licensed ambient score layered with **NASA
  sonifications** (Voyager plasma waves, Juno's Jupiter crossing — public domain).
- Label voice matches the forest: serif display numerals, one-line title cards, no dashboard chrome.

---

## Assets & licenses (all free; attribution rides in the data)
| Need | Source | License |
|---|---|---|
| Plant photographs | Wikimedia Commons · USDA PLANTS | CC / PD (USDA is PD outright) |
| Botanical plates | Biodiversity Heritage Library | Public domain |
| Species data | Wikidata · GBIF · World Flora Online | CC0 / open |
| Hero GLBs | Poly Haven · Sketchfab (CC0/CC-BY filter) | CC0 / CC-BY — credit in-data |
| Most trees | **Procedural engine (ours)** | none needed |
| Forest ambience | Freesound (CC0 filter) · BBC Sound Effects | CC0 preferred; **BBC RemArc is personal/edu-scoped — flag before any commercial claim** |
| Planet textures | NASA/USGS Astrogeology · Solar System Scope | PD / CC-BY 4.0 |
| Starfield | NASA SVS · ESO/Gaia sky maps | PD / CC-BY |
| Space audio | NASA sonifications | Public domain |

---

## Phases (each one shippable)
- **I — The Forest Opens.** FloraWing shell (dusk hall, god-rays, layered ambience), ~40 specimens
  across all six galleries, specimen view with photos + plates + labels, `TreeGrower` v1 (5 tree
  archetypes, rotatable), Study Room door wired.
- **II — Alive.** Seed→mature growth scrubber, four-season shader ramps, Ocean Hall underwater
  treatment, Fungal Annex mycelium view, positional specimen audio, hero GLBs. 120+ specimens.
- **III — The Orrery, Reshot.** Everything in Wing II above.
- **IV — The Institution.** TV D-pad walk (`useTvGrid`), kids-mode pass, Findings integration
  (`services/labsFindings.ts` — post a discovery anchored to a specimen), lineage "tree of life" map,
  200+ specimens.

## Working agreements
- Ship in **verified chunks**: esbuild syntax-check after each edit, `npm run build` before any push,
  **one build at a time** (stacked concurrent builds once took 44 min through contention).
- Pure logic (the grower math, Keplerian elements) gets **unit tests** under `tests/` — it is the only
  part of a 3D feature that can be verified headlessly, and this session has no compositing browser.
- Keep commits scoped to this work; other sessions run in this repo concurrently.
