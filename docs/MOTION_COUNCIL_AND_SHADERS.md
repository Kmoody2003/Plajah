# Motion Graphics & VFX Council + Image-Sourced Shaders

Aria is one collaborator. Like the **Art Council** (`services/council`) and the **Music Council**
(`services/melos/council`), the **Motion Council** (`services/motion/council`) is an internal team of
durable, conflicting lenses that keep moving visuals from collapsing into one "make it dynamic" template.
They direct motion graphics, titles, character animation, VFX, generative/shader work, VJ sets and 3D
reveals — and they double as VJs. Only Aria speaks to the user; she names the directors when it helps.

## The two-layer pattern (identical to the Art Council)

1. **Lens layer (data, Aria's own summary)** — `services/aria/ariaCreativeRoles.ts`
   - `ARIA_MOTION_DIRECTOR_COUNCIL: AriaMotionDirectorLens[]` — the six lenses (`id, name, medium, conviction, challenges, protects`).
   - `ARIA_MOTION_COUNCIL_METHOD` — the method string ("convene six internal motion-direction lenses… synthesize without averaging").
   - `MOTION_DIRECTOR` added to `ARIA_CREATIVE_ROLES`; `resolveAriaCreativeRole` now routes motion/video/vj/pixels/fabula/shader/vfx surfaces to it.
2. **Director layer (agents)** — `services/motion/council/`
   - `motionCouncilPersonas.ts` — `MOTION_PERSONAS` spreads each lens and adds `epithet, craft, councilStyle, vj, voice, questions, researchBeats, tensions, cares`.
   - `motionCouncilTypes.ts`, `motionKnowledge.ts` (grounding), `motionCouncilService.ts` (`deliberate` AI + `localAdvice` deterministic), `motionCouncilStore.ts` (localStorage history + lead counts).
   - UI: `components/motion/council/MotionCouncilPanel.tsx`.

## The six directors (blended craft + temperament + era)

| id | name | craft | era / lineage | protects |
|----|------|-------|---------------|----------|
| `KINETIC` | The Kinetic Typographer | motion type / titles / broadcast mograph | Swiss kinetic → Kyle Cooper titles | timing, kerning-in-motion, the beat, legibility |
| `CHARACTER` | The Animator | character / cel / rigged 2D | Disney 12 principles → modern rigs | weight, arcs, anticipation, personality |
| `COMPOSITOR` | The Compositor | VFX compositing / integration | optical printing → node graphs (Nuke) | integration, edges, matched blur & grain, black point |
| `GENERATIVE` | The Generative Artist | generative / code / shaders | demoscene → GLSL / TouchDesigner | the rule, audio-reactivity, real-time behaviour |
| `SIGNAL` | The Signal Bender | analog video / glitch / **live VJ** | 90s rave / CRT → datamosh | feedback, signal texture, live performance, honest imperfection |
| `CINEMATIC` | The 3D Dramatist | 3D / CGI / lighting & camera | broadcast spectacle → virtual cinematography | light, camera choreography, the reveal, scale |

Tensions are written both ways (grid vs feel, seam-hidden vs artefact-framed, behaviour vs staged reveal,
hand-keyed vs procedural) so the room genuinely disagrees. `GENERATIVE` and `SIGNAL` are flagged `vj: true`
as the two who lead a live set; all six can VJ.

## How the council reasons

`deliberate(brief, spec)` asks the model with all six personas + a grounded knowledge block; on any failure
it falls back to `localAdvice`, a **deterministic** motion doctor that turns the spec into frame-accurate
direction with no AI:
- **tempo + fps →** beat grid (frames per beat / per 1/8 step), loop-safe bar length.
- **fps →** 180° shutter motion-blur (ms), strobe warning ≤24 fps.
- **delivery →** title-safe, colour space, LED-wall/projection caveats (`MOTION_DELIVERIES`).
- **easing vocabulary** (`EASING_PRESETS`): entrances ease-out, exits ease-in, loops linear, overshoot/anticipation for impact.

One-click `ApplyAction`s (`fps` / `beatGrid` / `shutter` / `ease` / `aspect`) are emitted for the host
surface (Pixels / Fabula) to wire via the panel's optional `onApply`.

## Wiring targets (host surfaces)

Mount `MotionCouncilPanel` where moving visuals are built:
- **Pixels (VJ)** — as an "Ask the council" panel beside the shader/generator gallery; wire `onApply` to fps/beat-grid.
- **Fabula** — motion graphics / titler / transitions; wire `onApply` to clip fps/ease.
The Music Council is mounted in `components/melos/beats/mixer/MixerView.tsx`; follow that pattern.

---

# The 12 image-sourced shaders & generators (build recipe)

Each of the 12 is authored from a **reference image the user supplies**, and **attributed to a motion
director** via its `set`/style so the council owns the visuals it leads (`directorForCraft` maps craft →
director; portfolio attribution matches the Art Council's `seedPortfolio` by style key).

**Where they register** (from the shader/generator survey):
- **Shaders (audio-reactive house set):** append `SignatureWork[]` — create a new series file
  `components/plajahPixels/engine/presets/seriesMotionCouncil.ts` exporting an array, then splice it into
  `SIGNATURE_WORKS` in `signatureShaders.ts` the same way Series VI/VII are imported and spread. GLSL is
  **body-only** (Shadertoy `mainImage`), no preamble — `signatureSource(w)` prepends `SIGNATURE_KIT`
  (+`SIGNATURE_KIT_3D` when `kit3d`). Audio drives amplitude/colour/light/width only, **never position**.
  Channels available in the kit: sub / low / pres / sib / air / voice + `plajahPunch()` transient.
- **GLSL generators:** append to `PROCEDURAL_PRESETS` (`proceduralPresets.ts`, `{name, cat, src}` full GLSL).
- **Canvas2D generators:** append to `CANVAS_PRESETS` (`canvasPresets.ts`, `{id,name,cat,init?,draw}`).
- **ISF generators:** append to `ISF_PRESETS` (`isfPresets.ts`, `{name, isf}` with the `/*{…}*/` header).
All of these flow automatically into `BASE_SHADERS` in `components/plajahPixels/components/ShaderPanel.tsx`.

**Per-image translation checklist (what I read off each picture):**
palette → color grade; dominant geometry/flow → field/SDF or draw method; texture/grain → noise & post;
motion feel → speed/ease and which audio channel drives what; shader vs generator → full-frame reactive
field = shader (`SignatureWork`), self-contained animated source to layer = generator.

**Status:** council BUILT (awaiting typecheck). Shaders BLOCKED on the reference images — recipe above is
ready to execute per image the moment they arrive.
