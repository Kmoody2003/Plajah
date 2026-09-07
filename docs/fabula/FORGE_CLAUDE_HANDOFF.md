# Fabula Forge FX Suite — Claude Handoff

## Objective

Finish Fabula Forge as a native, high-quality video FX/plugin suite comparable in breadth to
Boris FX and Red Giant/Maxon. Effects must make beautiful results easy through curated presets,
run natively in Fabula first, and preserve a stable parameter/input ABI for future OFX hosts.

Scope is video FX/plugins only. Photo-only, audio-only and 3D-DCC products are excluded.

## Current verified state

- 106 native effects
- 287 curated effect presets
- 17 native two-input transition families
- 5 true auxiliary-input effects
- Ordered per-clip effect stacks with enable, reorder, remove, preset and parameter controls
- Forge Effects Library and Transition Library
- Node graph exposure; multi-input effects have SOURCE and AUX ports
- Live WebGL preview and offline MP4 export parity
- Multipass effects and stable named-parameter ordering
- Strict `.cube` 3D LUT import, project persistence, selection, GPU application and export parity
- Same-context compound-scene precomposition for two-input transitions
- Transition-driven audio fades in offline export
- Dev server responds at `http://localhost:3000/`
- `npm run lint` passes
- `npx tsx --test tests\forgeEffects.test.ts` passes (9 tests)

The evidence-based status matrix is:

- `docs/fabula/FORGE_PHASE_1_2_BUILD_MATRIX.md`

Do not call Phase 1 or Phase 2 complete unless its completion gate in that file is actually met.

## Important repository warning

The worktree contains many unrelated user changes. Forge work is **not committed**. Do not stage,
commit, revert or rewrite unrelated files. Inspect `git status --short` before any Git operation and
stage only explicitly reviewed Forge paths if the user asks for a commit.

## Architecture and principal files

### Portable registry and host model

- `components/plajahPixels/engine/fx/effects.ts`
  - `FxEffect`, stable effect IDs, ordered parameter declarations, presets and categories
  - shader ABI: `inp()` = current pass, `src()` = original source, `aux()` = auxiliary input
  - multipass contract
- `services/fabula/forgeEffects.ts`
  - serializable `ForgeEffectInstance`
  - deterministic instance/preset construction and parameter ABI ordering
- `services/fabula/forgeTransitions.ts`
  - portable two-input transition catalog and deterministic instance construction
- `services/fabula/cubeLut.ts`
  - strict serializable 3D `.cube` parser

### GPU render path

- `components/plajahPixels/engine/fx/fxRenderer.ts`
  - one-input/multipass rendering plus optional `uAux`
- `components/plajahPixels/engine/fx/transitionRenderer.ts`
  - native outgoing/incoming transition shaders
- `components/plajahPixels/engine/core/compositor.ts`
  - ordered Forge stacks, auxiliary element uploads, same-context compound precomposition,
    grade layers, 3D LUT post-pass and transitions
- `components/plajahPixels/engine/core/offlineRenderer.ts`
  - deterministic preview/export media resolution, auxiliary-media synchronization and
    compound-input grouping
- `components/plajahPixels/engine/core/nodeGraph.ts`
  - graph SOURCE/AUX evaluation for multi-input effects
- `services/fabulaRender.ts`
  - Fabula timeline adapter, transition layer emission, auxiliary asset metadata and audio mix

### Fabula UI

- `components/Fabula/FxLibrary.jsx`
  - effects/presets and transitions/presets
- `components/Fabula/Fabula.jsx`
  - per-clip stack Inspector, auxiliary asset picker, LUT import/selection, monitor preview,
    export handoff
- `components/Fabula/NodeGraphEditor.jsx`
  - native effect nodes and SOURCE/AUX ports

### Effect packs

- `phase1LensBlurEffects.ts`
- `phase1AdvancedLightEffects.ts`
- `phase1AdvancedBlurEffects.ts`
- `phase1ColorKeyEffects.ts`
- `phase1AdvancedColorEffects.ts`
- `phase1AdvancedKeyEffects.ts`
- `phase1StylizeGeneratorEffects.ts`
- `phase1StylizeFinishEffects.ts`
- `phase1DistortEffects.ts`
- `phase1DistortFinishEffects.ts`
- `phase1MultiInputEffects.ts`

All are under `components/plajahPixels/engine/fx/`.

## Current interruption point

Compound-scene transition precomposition has just landed and passes TypeScript/tests.

The next edit was going to replace the outgoing transition freeze in `services/fabulaRender.ts`
with an aligned moving source handle. There are five occurrences of:

```ts
prev.duration - 1e-3
```

around the transition resolver. Instead of holding the final frame, compute the outgoing local
source time across the transition window, approximately:

```ts
const outgoingHandleTime = Math.max(0, prev.duration - dur + (t - cur.start));
```

Use that value for every outgoing transition branch, respecting `srcIn` through `emitClip`.
Verify short clips and unavailable handles clamp safely. Add a pure helper/test if practical.

After handle alignment, update the transition row of the build matrix and run the validation
commands below. That should close the last currently identified Phase 1 transition fidelity gap.

## Next work after Phase 1 closure

Start Phase 2 with VectorTrack, in this order:

1. Serializable motion-data asset and track-binding contract
2. Point tracker with confidence/error metrics and manual correction
3. Planar translation/scale/rotation solve
4. Shear/perspective homography solve and surface/grid overlay
5. Corner-pin export plus stabilization/inverse motion
6. Reusable track binding for effect parameters, mattes and transforms
7. Optical-flow field and spline/roto propagation
8. Mesh tracking, rolling-shutter/lens models and later 3D camera solve

Do not represent a simple point tracker as a Mocha equivalent. The completion requirements are
listed under VectorTrack, Mesh/Flow/Camera, Roto/ML Matte and Cleanup in the build matrix.

## Quality rules

- Prefer beautiful, restrained defaults; stronger artistic options belong in presets.
- Every new effect needs at least three useful presets where applicable.
- IDs must be unique and stable. Parameter declaration order is the GPU/OFX ABI.
- Never claim “Built” without registry, UI, preview/export path and conformance coverage.
- Multi-input effects must sample actual synchronized source textures, not approximations.
- Temporal effects such as true datamosh or optical-flow blur must wait for temporal frame access.
- Keep native Fabula execution primary; the later OFX adapter translates the same manifest,
  inputs and ordered parameters.

## Validation

Run after every batch:

```powershell
npx tsx --test tests\forgeEffects.test.ts
npm run lint
```

Useful inventory command:

```powershell
npx tsx -e "import {FX_EFFECTS} from './components/plajahPixels/engine/fx/effects.ts'; import {FORGE_TRANSITIONS} from './services/fabula/forgeTransitions.ts'; console.log({effects:FX_EFFECTS.length,presets:FX_EFFECTS.reduce((n,e)=>n+(e.presets?.length||0),0),multiInput:FX_EFFECTS.filter(e=>e.auxInput).length,transitions:FORGE_TRANSITIONS.length})"
```

## Known limitations that must remain explicit

- Full OCIO configuration and calibrated downloadable camera/lens profile databases are not done.
- Automatic statistical reference-frame Color Match is not done; bound reference matching exists.
- True temporal datamosh and optical-flow motion blur are not done.
- Phase 2 tracking, roto propagation, cleanup/paint and camera solve are not done.
- OFX packaging/host adapters are not done; the stable native ABI is the preparation for them.

