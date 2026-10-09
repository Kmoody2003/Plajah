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

## Studio Roster — the animators behind the council (2026-10-08)

The six directors keep the **method** (timing, weight, integration, system, signal, light). The **Studio Roster**
(`services/motion/council/motionRoster.ts`) is the studio floor: **57 animators and motion designers** from every
animation and computer-graphics background, so the council can work in almost any style and era instead of one house look.

| Guild | Members |
|---|---|
| Anime | Sakuga Key Animator · Pastoral Naturalist · Mecha Choreographer · Shoujo Romanticist · Cel-Era Painter · Digital Compositing Director (satsuei) · Gag Comedian |
| Cartoon | Silent-Era Trick-Film Magician · Rubber-Hose Vaudevillian · Golden-Age Feature Naturalist · Screwball Cartoon Timer · Mid-Century Modernist · TV Limited-Animation Economist · Bold-Flat TV Stylist · Flash-Era Indie Animator |
| Graphic & Mograph | Modernist Title Designer · Constructivist Agitator · Psychedelic Colourist · Chrome Broadcast Designer · Y2K Interface Futurist · Explainer Systematist · Collage Zinester · Data Storyteller · Art Deco Showman · Sports Broadcast Designer |
| 3D / CGI | Feature CG Character Animator · Stylised-3D Rebel · Simulation TD · Low-Poly Retro Renderer · Abstract 3D Loop Artist · Virtual Production Cinematographer |
| Stop-motion | Clay Animator · Armature Puppeteer · Silhouette & Cutout Animator · Pixilation Prankster · Sand & Paint-on-Glass Animator · Tabletop Miniaturist |
| Experimental | Direct-on-Film Scratcher · Visual Music Abstractionist · Rotoscope Painter · Structural Filmmaker · Surrealist Object Animator · Projection & Installation Artist |
| Games & Real-time | Pixel-Art Sprite Animator · Stylised Game VFX Artist · Demoscene Coder · Interface Motion Designer · Live2D Rigger · Arcade Attract-Mode Showman |
| World Traditions | Ink-Wash Animator · Soviet-School Fabulist · Ligne Claire Animator · Afrofuturist Pattern Animator · Latin American Folk-Graphic Animator · Geometric & Calligraphic Animator · South Asian Folk & Title Animator · Webtoon Motion Artist |

**Shape (matches the art council):** each member has `background`, `lineage`, `ethos`, `protects`, `challenges`, `voice`,
`questions`, `researchBeats`, plus motion-specific `signature` moves, `timing` (fps · on ones/twos/threes/mixed · ease ·
shutter), `texture`, `media`, `styles` (search tags) and `eras` (decades, 1900s–2020s). Each sits in a **`seat`** (the
council director whose craft they report to) and shares an **`artLens`** with the Art Council (CLASSICAL / REBEL /
FUTURIST / WORLD_ECLECTIC / BAROQUE / RADICAL_MINIMAL). `ROSTER_TENSIONS` holds 24 standing arguments, written both ways.

**Rules baked in:** lineage is *study, never imitation of a living creator* (movements, studios, eras, techniques — plus
long-dead pioneers by name). Every World-Traditions member (and the silhouette animator) carries a `culturalNote`:
name the specific people/region, keep symbol meanings correct, never use sacred text as decoration, collaborate with
practitioners for commercial work. The Structural Filmmaker keeps public flicker under 3 flashes/s.

**Casting (`castCrew`)** — deterministic: pinned members first, then scored by style tags in the ask, guild words,
medium and era; no guild may take more than half the seats unless the brief asked for that guild; and if the crew has
no internal argument, the best-scoring rival of the lead is brought in (a crew that agrees produces an average).

**Deliberation:** `MotionBrief.crew` (ids). `localAdvice` gives each crew member a proposal from their own timing +
signature with one-click `stepping` (new `ApplyAction` — on ones/twos/threes) and `ease` actions, surfaces crew
tensions, and builds the plan as **lead** (crew lead's timing + signature) / **counterpoint** (their rival, used once) /
**editor** (the council's spec-anchored beat grid, shutter, title-safe). `deliberate` adds the crew to the model prompt
with the same lead/counterpoint/editor instruction. Aria's `ARIA_MOTION_COUNCIL_METHOD` now describes the roster.

**UI:** `MotionCouncilPanel` has a *Studio crew* row (guild, era, crew size, live auto-cast chips, drop/recast) and a
*Roster* button opening `MotionRosterBrowser` (search, guild chips, era filter, expandable cards, pin into crew).

**Verify:** `node scripts/verifyMotionRoster.mjs` (shape, coverage, tensions, casting, crew advice, search).
**Lab:** `node scripts/buildMotionRosterLab.mjs <dir>` → static page of the panel (offline; local advice path).

### Mounted (2026-10-08)

- **Fabula** — VFX room → **MOTION COUNCIL** tab (`vfxTab === "council"`). Seeds the brief from the selected clip
  (title/subtitle → `title`, other → `mograph`) and the project's fps/aspect (`deliveryFor`). `applyMotionCouncil`:
  `fps` → nearest `FPS_OPTIONS` via `setFormat`; `aspect` → `prod.defaults.aspect` if in `ASPECTS`; `beatGrid` →
  timeline **markers** on every beat (bars if too dense) + snapping on — and edge-snapping now includes markers, so
  cuts land on the beat; `ease` → the selected clip's keyframe eases (`easeToKeyframe`: no overshoot in Fabula's
  keyframes, so overshoot→out, anticipation→in); `stepping` → **bakes** the selected clip's keyframes into HOLD keys
  every N frames (true on-twos/threes). Ease/stepping go through `applyClips`, so **Ctrl+Z undoes them**. Returns
  false (no "applied" badge, a ping instead) when no keyframed clip is selected. `shutter` is not offered — Fabula
  has no motion-blur engine yet.
- **Pixels** — toolbar **Film** button → floating `DraggablePanel` "Motion Council" (seeded `vj-loop`). Only `fps` is
  offered → `config.targetFrameRate` 30/60 (`pixelsTargetFrameRate`); tempo there is derived live from the music.
- Panel props: `supports` (which Apply buttons render), `initial` (host-seeded ask/medium/delivery/tempo), and
  `onApply` may return `false`. The council now emits an `fps` move (Compositor: work at the delivery rate).
- Translation lives in `services/motion/council/motionApply.ts` (pure; covered by `verifyMotionRoster.mjs`).

## The council BUILDS (2026-10-08)

Fabula → VFX room → **MOTION COUNCIL** → **BUILD FROM MY ASSETS** (the advice panel is the other toggle).

1. **Give it sources** — pick any media-pool assets (video, stills, graphics, Lottie, audio). The selected clip's asset
   is pre-chosen. Audio becomes the bed and sets the length.
2. **Describe it** — length ("15 second", "8 bars", "1 minute"), title text in quotes or after "title:", style words
   ("anime", "claymation", "y2k", "art deco"…). Set BPM, how many options, and where to build (end / playhead).
3. **Options** — the crew is cast from the ask (or pin leads from the roster). Each option is led by one member and is
   a real edit: cuts on the beat grid in the lead's pace (or rhythm pattern — e.g. 3-3-2), an in-cut camera move
   (push / drift / snap / float / shake / bounce / scroll; stepped on twos/threes for members who animate that way),
   the lead's Forge look + effects + transition, title animation and grade. One **counterpoint** effect from a rival
   lands on one cut; the lead's council seat is the **editor**. Each card shows a mini-timeline (sources by colour,
   transitions, counterpoint cut, title and audio lanes).
4. **Build / Swap in** — committed as ONE `applyClips` (Ctrl+Z removes it), tagged `councilBuild`, bar markers added,
   playhead jumps to it. "Swap in" replaces the previous council build in place with another option.
5. **Save as recipe** — the option (no media) becomes a reusable motion recipe.

**Engine:** `services/motion/council/motionBuildGrammar.ts` (a build grammar for all 57 members + 6 directors, every id
validated against FX_EFFECTS / FORGE_TRANSITIONS / FORGE_LOOKS) and `motionBuild.ts` (`assembleOption`,
`localBuildOptions`, `planBuild`, `recipeToFabulaClips`). **"The model chooses, the engine builds"**: `planBuild` lets
the model pick per-option pace/move/look/effects/transition/title/titleText only from the catalogs
(`sanitizeOverrides` drops anything else) and the same assembler builds — no keys → fully local.
Safety floor: no cut shorter than 0.34 s (≤ 3 cuts/s, photosensitivity).

## The council in the TEMPLATE process (2026-10-08)

- **Recipe templates** (`motionTemplates.ts`): built-in council recipe library (one per roster member + director, 63)
  + your saved recipes (localStorage `plajah_motion_recipe_templates_v1`); search, rebuild on new sources, delete.
  Builder → RECIPES tab.
- **Platform template direction**: every platform lower third / full page (`LOWER_THIRDS`) and broadcast pack
  (`FABULA_BROADCAST_PACKS`) — 114 — gets a council lead (cast from the template's own name + era first, then its
  premise/tags), a counterpoint, an editor, timing (fps, ones/twos, ease, enter/hold) and notes, with a diversity cap
  so no single member directs more than its share. Builder → PLATFORM TEMPLATES tab (add one to the timeline), and
  `npx tsx scripts/council/runMotionTemplateCouncil.ts` → `docs/motion/template-direction.json` + `TEMPLATE_DIRECTION.md`
  as the motion brief designers build/revise templates against. Art Council `councilStyle` is untouched.
- Roster grew to 57: **Art Deco Showman** (1920s–40s) and **Sports Broadcast Designer** — the template families
  showed both were missing.

**Verify:** `node scripts/verifyMotionBuild.mjs` (+ `verifyMotionRoster.mjs`). **Lab:** `node scripts/buildMotionRosterLab.mjs <dir>`.
