# Photo → 3D in the Game Studio: scan, look, fix, repeat (plan + first slice, 2026-11-18)

Kenne's ask: model advanced geometry easily from a photo. The scan gives the start; whatever detail the scan
misses, Aria's agent adds by modelling and sculpting until the model matches the picture at 99–100%. A vision
model has to see what is missing or wrong and hand that to the agent, which builds on what is there.

This is the **Props room** path of the Game Studio (`docs/game-studio-unified-plan.md` §4). It follows the
same rules as the rest of the Studio:

- **Every change is a readable op.** The agent's edits are ops on an editable model document, shown as
  sentences, undone in one step per round, and hand-editable afterwards. Nothing the agent makes is a baked
  mesh except the scan itself.
- **The scan is a starting point, never the source.** For props, the scan can stay the shell. For hero
  assets (hero cars, main cast), it is a guide only: the loop refuses to call a hero finished while the scan
  still carries its body (Kenne, 2026-11-16).
- **Measured, not eyeballed.** The score comes from pixels where there is truth and from the vision model
  only where there isn't. Under 95% is not finished, and the report says so (feedback: art fidelity loop).
- **Local first.** Scan on the PC's GPU (Tela 3D runtime), eye and hands on the desktop's native models
  first, Gemini second, rules last. No Anthropic calls (AI lanes, 2026-10-25).

Code: `services/gamestudio/photo3d/*`, tests `tests/photo3d.test.ts` (24), run script
`scripts/gamestudio/photo3dLoop.ts`.

## 1. The loop

```
 photo ──▶ cut-out (u2net) ──▶ scan (Hunyuan3D-2mini / TripoSR / SF3D on :51124, local GPU)
                                   │
                                   ▼
                     fit into clay space ─▶ scan becomes SDF clay (Argilla voxelize)
                                   │
                                   ▼
              align the photo's camera (turn/tilt/frame search on the outline)
                                   │
              setup op: project the photo's colours (mirror onto unseen sides)
                                   │
   ┌──────────────────────────────▼──────────────────────────────────────────┐
   │ replay doc → mesh (scan field ∪ parts ∖ carves + strokes, then colour)   │
   │ render: photo camera (unlit) + side, back, other side (shaded)           │
   │ measure: silhouette IoU, outline distance, ΔE colour  ─────────┐         │
   │ eye (vision model): photo + renders → gap report (JSON)        ├─ score  │
   │ worse than last round? undo last round, tell the agent why ────┘         │
   │ anchor each gap in 3D (ray through the aligned camera onto the model)    │
   │ hands (agent): gaps + anchors + op vocabulary → ops (validated)          │
   │ guards: no part that buries the scan, no paint that hides the photo      │
   │ apply as ONE batch op ("Aria, round 3: brass band; tuning lugs…")       │
   └───────────────────── until ≥ 99%, or ≥ 95% and gains flatten, or stall ─┘
```

Division of labour, deliberately:

- The **eye** says *what* and *where in a picture*. It never does 3D maths.
- **`anchorGaps`** turns each picture region into a place on the model: point, surface normal, real size,
  distance from the vertical axis, and the photo's colour there.
- The **hands** choose *which ops and how big*, using those numbers. A rules planner gives the same answer
  shape when no model is available, and is the baseline an agent has to beat.

## 2. The model document (`schema.ts`)

`ModelDoc` (`kind: 'plajah.model'`) is what the Props room edits. Units are clay space (Argilla's [-1, 1]
domain, +Y up, +Z front).

| Field | What it holds |
|---|---|
| `base` | The scan: GLB file, engine, and the fit into clay space. Referenced, never copied in. |
| `useScan` | Show the scan shell. A hero rebuild turns it off once parts carry the shape. |
| `role` | `prop` (scan may stay the shell) or `hero` (scan is a guide only). |
| `references` | The photo (and any more views), each with its aligned `ModelCamera`. |
| `parts` | Named primitives added or carved: box, ellipsoid, cylinder, torus, capsule. Material, blend, mirror, and `why` (the gap it answers). |
| `strokes` | Sculpt strokes: clay, carve, inflate, along points, with radius and strength. |
| `paints` | Ordered paint layers: flat colour, material, or photo projection (`fillUnseen`: mirror / turn / none). Regions: sphere, box, part, all. |
| `materials` | Name, colour, metalness, roughness. |

In a Game Project the finished model is an `AssetRef` of kind `model` that points at the doc, and an
`Instance` places it (`prefab: 'model:<id>'`). That wiring is not built yet (§7).

## 3. The gap report (`gapReport.ts`)

```ts
interface GapItem {
  id: string;
  axis: 'silhouette' | 'geometry' | 'colour' | 'material' | 'prop';
  kind: 'missing' | 'wrong' | 'extra';
  view: string;                 // 'photo' or a render: 'render-photo', 'render-side', 'render-back', …
  region: { x0, y0, x1, y1 };   // 0..1 of that picture, top-left origin
  description: string;          // one sentence a modeller can act on
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;           // 0..1
  hint?: { shape?: 'ring'|'bar'|'rod'|'knob'|'plate'|'block'|'lump'|'hole'|'groove'|'band';
           colour?: '#rrggbb'; material?: string; metal?: boolean;
           depth?: number;      // how far it stands off, as a fraction of the subject's height
           count?: number;      // repeats round the subject (lugs on a drum)
           symmetric?: boolean };
}
interface GapReport { subject: string; visionScore?: number; items: GapItem[]; source: string }
```

`parseGapReport` accepts what models actually return and cleans it: fenced JSON, `[x0,y0,x1,y1]` in 0..1,
0..1000 (Gemini's habit) or pixels, `{x,y,w,h}` boxes, loose axis words ("outline", "hardware"), numeric
severities on 1–4 / 1–5 / 0–1 scales, unknown views, boxes drawn as a line (widened, not dropped), and
near-duplicate items (merged, the more severe kept). Every repair is a warning in the round's record.

`gapPrompt` is the eye's instruction: the photo first, then the renders by name. The photo-camera render is
compared pixel for pixel; the other angles only for what the photo implies (parts that wrap round, symmetry,
plausible thickness). Items still open from the last round come back with their ids, so progress on each gap
can be followed.

## 4. The op vocabulary (`modelOps.ts`)

| Op | Sentence in the history |
|---|---|
| `addPart` (add or carve) | "Added Top rim (a ring in Brass) at 0, 0.6, 0" / "Carved …" |
| `updatePart` / `removePart` | "Top rim: moved to …, sized …" / "Removed Top rim" (pinned paint goes with it, and comes back on undo) |
| `extrude` | "Pulled Handle out 0.12 from …" (stored as a capsule or box part: one editable piece) |
| `sculpt` / `removeStroke` | "Built up the belly (4-point stroke, radius 0.1)" |
| `paint` / `removePaint` | "Painted everything with the photo's colours, mirrored onto the sides it can't see" |
| `putMaterial` / `removeMaterial` | "New material Brass: #c8a040, metal, roughness 0.3" (refused while in use) |
| `setCamera`, `setSubject`, `useScan` | alignment, naming, hero rebuild switch |
| `batch` | one undo step per agent round, labelled "Aria, round N: …" |

`applyModelOp` is pure and returns the inverse (tested: every op undoes back to the identical document).
`ModelHistory` records who made each step (`person` / `aria`). `validateModelOp` checks anything a model
wrote before it reaches the document: shapes and brushes from the vocabulary, positions inside the clay
domain, sizes in range, `#rrggbb` colours, batches nested one level at most. `parseAgentOps` first fills the
defaults models leave out (a missing rotation shouldn't cost a whole op).

Smooth, flatten, pinch and crease stay hand brushes in Argilla for now: the CPU replay can't reproduce them
exactly, and an agent op must replay identically everywhere.

## 5. Scoring (`score.ts`)

Per round, from the photo's own camera (rendered **unlit**, because projected photo colour already carries
the photo's light; shading it again reads as colour error):

- **shape** = silhouette IoU − 2 × (outline distance − 0.5%), outline distance as a fraction of the
  subject's height (symmetric chamfer between the two outlines);
- **colour** = 1 − (ΔE − 3) / 30 over blocks of 1/48 of the subject's height, times the share of the photo's
  subject the comparison covered (ΔE 3 is a match by eye).

Five axes, each reduced by the open gap items on it (cost per item: low 1%, medium 3%, high 7%, critical 15%,
times confidence, capped at 60% per axis):

| Axis | Weight | Measured part |
|---|---|---|
| silhouette | 0.30 | shape |
| geometry | 0.20 | none (no depth truth); capped at shape + 5% |
| colour | 0.20 | colour |
| material | 0.15 | eye only |
| prop | 0.15 | eye only |

The eye's own 0–100 guess is logged next to the score and never replaces it.

**When to stop** (`loopVerdict`): aim 99%; stop at 99%, or once ≥ 95% and two rounds bring less than half a
point; below 95% stop only on a stall or after 8 rounds, and report it as **not finished**.

**Guards** (`loop.ts`), so a round only goes up:

- **Each edit is tried on its own before it is kept** (`trialEdits`). The model is replayed with the edit
  and rendered from the photo's camera, and its photo match is compared with the model without it. A
  **line search** tries each edit at 100%, 50% and 25% strength (`scaled`: parts shrink, a ring keeps its
  inner edge on the body, strokes press lighter, paint goes thinner, a move goes part of the way). The edit is
  kept at the best strength only if it raises the match. An edit that changes no pixel the photo's camera can
  see (the back, a dent seen face-on) can't be judged by the photo, so it passes and the eye judges it next
  round. The trial measure (`matchScore`) is continuous: colour counts even under ΔE 3, where the shown
  colour axis is already "perfect". Each trial is logged ("kept Top rim at 50%: 95.21 → 95.40").
- **Edits are grounded** (`ground`): a ring the agent centred on the surface point instead of the body's axis
  is moved onto the axis at the same height.
- **The eye can't undo good work by re-rating** (`steadyGaps`). A gap the eye reports again can't cost more
  than last round, unless a kept edit this round targeted it. In the first real run, the eye re-rated two
  unchanged gaps (medium → high, high → critical), and that alone undid both rounds.
- A round that still measures worse than the last accepted model is undone (one undo) and the agent is told
  what it did and by how much it hurt. Now that edits are tried, this guard catches only what the photo can't
  see and the eye says got worse.
- While the scan carries the body, an added part bigger than 20% of the model's box is refused (the first
  real run's agent replaced the scanned drum with a plain cylinder; the score fell from 96% to 77%).
- While photo colours are on, a flat paint over more than half the model is refused (same run: "paint
  everything dark blue" wiped out the photo's colours).

**What pixels can't see.** A dent carved straight into the front of the model doesn't change the unlit
photo-camera render at all (found by a test). Depth errors are the eye's job, from the shaded side, back and
other-side renders. More reference views (a second photo, a turnaround, a design sheet) turn those into
measured axes too: each extra view with an aligned camera gets the same pixel score.

## 6. Lanes

| Job | Desktop app first | Then | Last |
|---|---|---|---|
| Scan | Tela 3D runtime, local GPU: Hunyuan3D-2mini (shape), TripoSR / SF3D (textured) | — (paid generators only with Kenne's OK) | — |
| Eye | Gemma 4 E4B vision on the native engine (`NativeLlmService.LookAsync`, already used by Argilla's part naming) | Gemini, with the user's cloud consent | no eye: pixel score only, rules planner |
| Hands | local LLM on the native engine (`LOCAL_LLM_*`) | Gemini text | rules planner (`planFromGaps`) |

Lanes are injected (`Lanes` in `loop.ts`), so the same loop runs with fixed answers in tests. One run at a
time on the GPU (it idles near 80 °C), never batches of local model calls.

## 7. Runtime targets: great-looking web games on Windows, Android, iOS and Mac (constraint, not built)

The Studio's output has to look great as a **web game** and run strongly on native hardware everywhere. This
section is a constraint on everything the photo → 3D path produces; none of it is built in this slice.

- **One runtime, native GPU APIs underneath.** WebGPU first (D3D12 on Windows, Vulkan on Android, Metal on
  iOS and Mac via Safari/WebKit), WebGL2 as the fallback tier. The desktop app (WinUI) runs the same game in
  WebView2 with the native engine beside it for AI and baking. iOS and Mac get the same web build in
  Safari or a WKWebView shell, so there is no second engine to keep in step.
- **Tiers by GPU adapter, not by device name** (Ravencrest Canon): the baseline is an Intel Arc iGPU at
  60 fps at 720p internal plus upscaling; discrete GPUs and the desktop app get ultra; phones get the mobile
  tier. Every pass is measured on the target GPU.
- **What a finished ModelDoc exports to.** The SDF doc is the source; the game gets baked assets per tier:
  surface-nets mesh → decimated LODs (hero ~60k / prop ~8k / far ~1.5k triangles, tunable per project) →
  UV atlas with the paint layers baked to base colour, packed ORM and a normal map baked from the
  full-resolution field → GLB with meshopt compression and KTX2 (Basis) textures at 1k/2k. Re-baking is
  automatic when the doc changes, so a hand edit never leaves a stale asset.
- **Budgets travel with the asset.** Each baked tier records triangles, texture memory and draw calls, and
  the Studio's Test room checks a level's sum against the tier budget before publishing.
- **Phones.** Thermal and memory limits decide the mobile tier: half-res textures, no per-pixel noise, one
  shadow cascade, instancing for repeats (lugs, bolts, foliage). Touch controls come from the playkit.

## 8. First slice as built (2026-11-18)

Built: `schema.ts` (ModelDoc), `modelOps.ts` (ops, inverse, sentences, validation, history), `sdf.ts`
(parts and strokes as distances), `gapReport.ts` (schema, parser, prompt, costs), `score.ts` (pixel score,
axes, stop rules), `camera.ts` (project/unproject, ray marching), `planner.ts` (anchors, rules planner, agent
prompt and parser), `mesh.ts` (GLB reader with vertex/texture colour, no three.js), `render.ts` (software
renderer), `replay.ts` (scan → clay field via Argilla's voxelize, doc → mesh via surface nets, colour layers
with photo projection and unseen-side fill), `align.ts` (camera search), `loop.ts` (the loop and its guards).

Tests (`node --import tsx --test tests/photo3d.test.ts`, 24 pass): every op undoes to the identical doc;
pinned paint follows its part; validation; sentences; gap parsing of real model habits; cost caps; pixel
score; stop rules; SDF primitives and rotations; camera round trip; the rules planner places a band as a ring
at the right height and repeats lugs round the body; size guard; a scripted end-to-end loop on a synthetic
drum (scan without its band → eye reports it → Aria adds a gold ring → 89% → 98%); a bad agent's round is
undone and the agent is told why.

### Real run: conga drum photo (`public/soma/drums/conga.jpg`)

`node --import tsx scripts/gamestudio/photo3dLoop.ts public/soma/drums/conga.jpg --eye-model gemini-3.5-flash-lite --agent-model gemini-3.5-flash-lite`
(outputs in `D:\Plajah Runtime\photo3d\conga\`: `round_<n>.png`, `rounds.json`, `history.txt`, `model.json`, `run.log`).

| Step | Result |
|---|---|
| Cut-out (u2net) | 960×1443, 26.6% subject |
| Scan, Hunyuan3D-2mini on the RTX 4070 laptop GPU | 60k triangles in 54 s (generate 26 s, reduce 25 s), shape only. It caught the lugs and the side handle. |
| Scan → clay (voxelize, grid 24, CPU) | 17–38 s |
| Camera alignment | yaw 217.5°, pitch 3°, silhouette IoU 95.2% (155 tries, ~10 s) |
| Round 1 (scan + photo colours, mirror fill) | **96.1%**: silhouette 94, geometry 97, colour 91 (ΔE 1.2 in the photo view), eye's own guess 72 |
| Round 1 agent | added a brass top rim ring and switched the fill to "turn" → measured 93.7% in round 2 → **undone** |
| Round 2 agent | added the rim again, off the axis, plus a dark paint patch → 95.4% → **undone** |
| Stop | ≥ 95% and no gain for two rounds. Final model = scan + photo colours, **96.1%**. 5 Gemini calls, $0.011. |

What this run shows, honestly:

- The pipeline works end to end on real local models: scan, clay, alignment, measured rounds, the eye's gap
  reports, agent ops, guards and undo.
- **It did not reach 99%.** The flash-lite agent's edits made things worse twice, and the guard took them
  back both times. That is the guard doing its job, but no agent round improved the model.
- The eye was right about something the photo-view score can't see: the unseen sides show the mirror fill's
  grey seams at the silhouette edge (`round_1.png`, side views). Those need a fill that doesn't sample the
  photo's edge pixels, and a measured score on the other angles (more reference views).
- Gemini Flash (3.6 / 3.5) returned 503 "high demand" during the session, and 3.8-flash refused the shared
  lane's `thinkingLevel: minimal` (400). Only flash-lite answered. A stronger model for the hands is the
  first thing to try, and the desktop's local lanes are the planned default anyway.
### Why the rounds went down, and the rerun after the fix (same photo, same flash-lite models)

Diagnosis from `rounds.json` of the run above: the agent's edits didn't measurably change the shape
(shape 0.945 in all three rounds). Almost all of the drop came from the **eye re-rating the same two
gaps** (medium → high, high → critical), which raised their cost by 6.7 points. The edits did cost a little
colour (ΔE 1.2 → 2.8), but the colour axis treats anything under ΔE 3 as perfect, so nothing measured it. The
flat brass ring also replaced the photographed brass, and the second ring was centred on a surface point
instead of the body's axis. Fixes: per-edit trials with a line search on a continuous match, `steadyGaps`,
photo colour wins on added parts where the photo sees them, `ground` for rings, a strict round guard, and
dropping edits that change nothing from any angle (§5).

Final rerun (`D:\Plajah Runtime\photo3d\conga\run.log`; the earlier runs are in `before-fix\` and `fix-v1\`):

| Round | Measured | Photo match (trial measure) | What happened |
|---|---|---|---|
| 1 | **94.8%** | 94.59 → 94.78 | kept "turn" fill, a 25% top ring (unseen; left for the eye), two tuning brackets; dropped a flat seam paint (worse at 100/50/25%) |
| 2 | 94.1% → undone | — | the eye judged round 1 worse (geometry 91 → 87), so the round was undone. Then: dropped a seam paint and a rim ring (no gain at any strength); kept two brackets, 94.59 → 94.80 |
| 3 | **94.9%** | — | stalled, stop |

Kept scores: **94.8 → 94.9**. No kept round went down, and the photo match only went up. Every edit that
lowered the match was caught by its own trial before it reached the model. What's still true:

- It stalled at **94.9%, under the 95% target, so it is not finished**. The flash-lite agent's ideas are the
  limit. Of 9 proposed edits, 5 were kept, each worth tenths of a point. The vision model also changes its
  ratings between runs: the same round-1 model scored 96.1% in the first run and 94.8% here, so compare
  rounds within a run, not across runs.
- The kept brackets read as flat yellow blocks from the side (`round_3.png`). The photo barely sees them, so
  only the eye can push back on how they look.
- The grey seams on the unseen sides (mirror fill at the silhouette edge) are still there. Neither agent seam
  paint survived its trial, because flat paint matched the photo worse than the seam it covered.
- Earlier runs, before the guards, recorded what they're for: the agent replaced the scanned body with a
  plain cylinder (96% → 77%), and painted the whole drum one flat colour.

### Local GPU pass (2026-11-18): no hosted services

Kenne's direction: no hosted services. Make our own process good, on the local GPU alone. Changes, in the
order they went in, each followed by a real conga run (`D:\Plajah Runtime\photo3d\conga\`: `v2-local\`,
`v3-outline\`, `v4-speed\`, and the latest at the top level):

1. **Local eye and hands.** llama.cpp's `llama-server` (official ggml-org release **b12138**, file
   `llama-b12138-bin-win-cuda-12.4-x64.zip`, 288,913,238 bytes, SHA-256 matched GitHub's digest) in
   `D:\Plajah Runtime\bin\llama-b12138\`, running Gemma 4 E4B Q4_K_M plus its f16 vision projector from
   `D:\Plajah Models\llm\gemma-4-e4b\` on port 51127. The CUDA runtime DLLs come from the Tela 3D env's
   torch install, which saved the separate 391 MB `cudart` download. Thinking is off: with it on, Gemma spent
   whole token budgets before answering. `scripts/gamestudio/localLlm.ts` starts the server when it's needed.
   Gemini is only the fallback (`--lane local|gemini|rules`).
2. **Registration** (`refineCamera`): coordinate descent on turn, tilt, **roll**, **lens** and frame after
   the coarse search. The coarse search had fixed a 30° lens and no roll. Photo-view silhouette IoU went
   from 94.9% to **97.1%** (yaw 217.5° → 195°, lens 34.5°, roll 2.3°), in 12–27 s.
3. **Unseen-side seams**: projected colour that lands off the photo's subject takes the nearest subject
   colour (a breadth-first fill of the photo) instead of grey clay. The photo-camera colour axis went from
   91 to 99 (the eye stopped flagging the seams).
4. **Outline fixes** (`outline.ts`), the measured half of the eye. Each connected blob where the photo and
   the photo-camera render disagree becomes a carve (the model sticks out) or an added lump (it falls short),
   placed at the depth of the nearest surface the camera sees. Every fix goes through the same per-edit
   trials and line search. 9 of 9 and 11 of 11 were kept in the two runs.
5. **Photo beats opinion** (`refuted`): when every edit aimed at an eye claim on the photo's own view made
   the photo match worse, that claim's confidence halves each round. Claims about unseen sides are untouched.
   A **strict score** (`strictScore`), without this discount, is reported next to the loop's score every
   round.
6. **Speed**: the clay field is cached next to the scan (voxelize 17–90 s → 0); the replay keeps the scan's
   lattice samples, uses a dense reused sample buffer instead of a `Map` (scan-only replay 2.1 s → 0.9 s),
   and buckets parts and strokes in a coarse grid (full replay with 19 parts 4.5 s → 2.2 s); the
   unseen-edit check reuses the current mesh instead of re-replaying it.

| Run | Rounds (loop score) | Measured at the end | Time | Notes |
|---|---|---|---|---|
| before (Gemini flash-lite) | 94.8 → 94.9 | IoU 95.0%, colour 0.976 | ~10 min (Gemini 503 waits) | |
| v2: 1–3 + cache | 96.0 → 96.3 | IoU 97.3% | 4.7 min, $0 | eye's vague "texture" claims cap geometry at 86–88 |
| v3: + outline fixes + refutation | 95.3 → 96.2 → 98.0 → 98.3 → 98.5 | IoU 98.3%, colour 0.998 | 14 min | trials 75% of the time (2.8–6.4 s each) |
| v4: + replay speed-ups | 95.3 → 97.2 → **99.0** (reached aim) | IoU 98.2%, colour 0.996 | 8 min | trials 2.1–3.0 s each; Resolve shared the GPU, so Gemma ran at 11–43 tok/s |

Read the 99% carefully. The **measured** gains are real: silhouette IoU 97.1 → 98.2–98.3%, photo colour
0.985 → 0.996–0.998. Most of the rest is the eye being out-voted: its photo-side geometry claims ("rim too
thick", "central emblem missing") were down-weighted because every edit aimed at them made the photo match
worse. With those claims at full weight, the final model scores about **96%**. The strict score now prints that
number every round; it was added after v4, and the v5 run that would have shown it was stopped when the work
was paused. Closing that gap needs an eye whose claims hold up, or edits that can fix them, or more
reference photos.

Where the time goes now, per round: measure ~2 s, eye 15–80 s (Gemma on a GPU it shares with whatever else
is open; it writes 600–1,000 tokens per report, now asked to be terse), agent 20–55 s, edit trials 80–140 s
(about 40 trials at 2–3 s each, almost all of it CPU meshing).

**GPU rendering and batched trials (not built; this harness has no WebGPU).** Trials are ~70% of a round
and are pure CPU replay: SDF → surface nets → software raster. In the app, the same doc replays through
Argilla's WebGPU field. A trial doesn't need a mesh at all: the photo-camera view can be **ray-marched
straight from the brick field plus the doc's parts**. All the variants of a round (each edit at 100/50/25%)
can go as one batch, as array layers of one dispatch, scored by a compute pass (IoU and ΔE reductions), so a
round's ~40 trials cost roughly one frame each instead of 2–3 s. That's the next speed step, and it belongs
in the Props room on the desktop's GPU, not in this Node harness.

## 9. Next

1. Desktop lanes: wire the eye to Gemma 4 E4B vision and the hands to the native LLM through the existing
   bridges; Gemini only with cloud consent.
2. Props room UI in the Studio: photo drop → scan → loop with the round strip, the history sentences, and
   accept / undo per round; then hand tools on the same doc (Argilla brushes write `sculpt` ops).
3. GPU replay: the doc's parts and strokes in Argilla's bake shader, so the room replays live.
4. More reference views as measured axes (second photo, turnaround, design sheet), which is also the route
   for hero assets (scan off, parts carry the shape).
5. Bake and export tiers (§7) and the `model:<id>` prefab in Game Projects.

## 10. Decisions for Kenne

- Which lane the eye uses by default on the desktop when both Gemma 4 vision and Gemini are available
  (local is free and private but slower; Gemini is better at spatial notes).
- Whether the Props room offers paid generators (Magnific / Meshy credits) as a scan option at all.
- Default loop budget per model (rounds and, for Gemini, a cost cap shown before the run).
