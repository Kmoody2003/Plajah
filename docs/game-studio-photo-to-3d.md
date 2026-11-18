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

Code: `services/gamestudio/photo3d/*`, tests `tests/photo3d.test.ts` (19), run script
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

**Guards** (`loop.ts`):

- A round that measures worse than the last accepted model is undone (one undo) and the agent is told what it
  did and by how much it hurt, so it doesn't repeat it.
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

Tests (`node --import tsx --test tests/photo3d.test.ts`, 19 pass): every op undoes to the identical doc;
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
- Earlier runs, before the guards, recorded what they're for: the agent replaced the scanned body with a
  plain cylinder (96% → 77%), and painted the whole drum one flat colour.

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
