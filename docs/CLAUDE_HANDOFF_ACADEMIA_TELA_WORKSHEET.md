# Claude Handoff — Plajah Academia, Tela, Rich Lessons, and Worksheet Reconstruction

Current handoff date: 2026-08-25  
Repository: `C:\Users\Kenne\plajah`  
Primary local URL: `http://localhost:3000/`

## 0. 2026-08-25 UPDATE — the "reprint" reconstruction pipeline replaced detection-gated artwork

The worksheet reconstruction described in §5 was rebuilt the same day this handoff was written,
because real results were "good text recognition but bad design, graphics untouched from the
original scan." Root causes found and fixed:

1. **tesseract.js v5+/v7 never returned the block/line/word tree** — `worker.recognize` must be
   called with `{}, { text: true, blocks: true }` and v7 reports no `imageWidth/imageHeight`
   (measure the input image instead). Every "positioned" OCR box before this fix came from a
   synthetic fallback that invented coordinates. Fixed in `services/worksheetLocalVision.ts`
   (both `digitizeWorksheetOnDevice` and the new `recognizeWorksheetLines`).
2. **Artwork existed only if Florence-2 detected it** — `<OD>`/dense captions rarely fire on
   hand-drawn worksheet line art, so graphics silently vanished or stayed as raw photo crops.
3. **No paper flattening** — traces and fallbacks carried grey photo paper and JPEG noise.
4. **Ransom-note typography** — per-line fontSize = 0.82×box height, no baseline math, no
   size/column normalization.

New architecture (all shipped and browser-verified end-to-end on a synthetic degraded scan):

- `services/worksheetReprintCore.ts` — pure, node-testable core:
  divide-by-background **paper flattening** (outlier-replacement on the background grid — a
  max-dilate pass overestimates inside smooth shadow gradients and leaves residue), strict
  **ink map** (lum < 196 + despeckle; looser thresholds let shadow bands weld every drawing
  into one giant connected component), **separateRulesAndRegions** (ONE component pass: an
  isolated thin dark component is a printed rule/answer blank; a straight edge connected to a
  drawing stays artwork — this stops the rule detector carving the sides off a book bag), and
  **normalizeTypography** (size clustering, column snapping, centered-title detection).
- `services/worksheetReprint.ts` — DOM glue: `flattenWorksheet`, per-region strategy tracing
  (LINE_ART re-inks from the binary mask → crisp splines recolored to the dominant ink;
  COLOR uses the LOGO preset with `dropPaperWhite`), and `paperKnockoutCrop` fallbacks
  (flattened crop with paper→transparent — never a grey photo rectangle).
- `services/telaDocumentIntelligence.ts` — `rebuildDocumentIntelligently(src, onProgress, opts)`
  now orchestrates: flatten → OCR (Florence when installed, Tesseract lane otherwise — the
  300 MB pack is OPTIONAL naming, never a gate; `opts.semanticNaming: 'auto'|'require'|'skip'`)
  → erase word-level text boxes from ink (line boxes would erase the blank in
  "Name: ___  Date: ___") → rules/regions split → per-region trace with a paper-residue gate →
  typography → response fields (blank prompts matched left-of at WORD level and above at LINE
  level; rules with text directly beneath are dividers, not blanks) → preview SVG with real
  baselines and width-fitted lines. Tesseract lines are split at large word gaps so
  "Name:  …  Date:" render at their true positions.
- `components/TeacherToolsView.tsx` — layered rebuild now runs automatically after every scan
  (fully local), button no longer demands the model download, a "Name artwork · install pack"
  chip upgrades to Florence naming, and an onion-skin toggle overlays the original at 35%
  over the reconstruction.
- Tests: `tests/worksheetReprintCore.test.ts` (7 tests) + the 4 existing worksheet tests pass.

### 2026-08-25 (later) — hardened against real, imperfect classroom photos

The synthetic sheet passed, so three REAL filled-in worksheets (dim light, held sideways, on a
desk/RGB-keyboard, child handwriting, decorative clip art, grids of rounded answer boxes) were run
end-to-end. They exposed failure modes a clean scan never does; seven robustness passes were added
(all in `worksheetReprint.ts` / `worksheetReprintCore.ts` / `telaDocumentIntelligence.ts`):

1. **Paper isolation** (`cropToPaper`): a downscaled bright-paper mask, flood-fill the EXTERIOR
   background inward from the image borders (interior ink holes kept), crop to the paper and paint
   every exterior pixel WHITE. Removes desk/keyboard/hand clutter AND the dark corner triangles a
   tilted page leaves that an axis-aligned crop can't. This was the single biggest visual fix —
   without it, off-paper darkness bridges the whole page into one connected blob and/or traces as
   giant black shapes.
2. **Orientation voting** (`detectPageOrientation`): one reused Tesseract worker OCRs the page at
   0/90/180/270°; highest confident-text score wins; upright must be clearly beaten before rotating.
   NOTE: browsers apply EXIF rotation on decode, so most phone photos already arrive upright and the
   voter correctly abstains — it's the safety net for genuinely sideways images. Toggle via
   `rebuildDocumentIntelligently(..., { orient: false })`.
3. **Deskew** (`estimateDeskewAngle`): projection-profile small-angle correction.
4. **Form-box frames** (`separateRulesAndRegions` now returns `frames`): a large, hollow,
   rectangular component with an EMPTY interior is a printed answer box → layout rounded-rect. A
   rectangular *drawing* has interior detail → stays artwork. Real worksheets are grids of these;
   without frames they merge into a dropped page-blob. Perimeter coverage is measured along the
   border PATH (robust to stroke thickness), plus an interior-emptiness test.
5. **Confidence-filtered OCR + handwriting drop**: printed labels OCR ≥0.64 (measured), handwriting
   <0.55. Keep body-height words as text only when conf ≥ .55; ERASE every body-height word (conf ≥
   .25) from the ink so handwriting becomes nothing, not garbled text.
6. **Titles → artwork**: words far taller than body text (bubble-letter titles) are NOT typeset and
   NOT erased — left in the ink to be TRACED. "FIND SOMEONE WHO" / "MEET A CLASSMATE" come out as
   recognizable outline artwork instead of OCR nonsense.
7. **Merge cap + mid-grey residue gate**: `mergeIntoRegions` won't fuse two big clusters past 0.5×
   page (which had dropped every icon); the artwork residue gate also skips large mid-grey
   unsaturated regions (underexposure shadow triangles).

Result: "Find Someone Who" and "Meet a Classmate" reconstruct cleanly — titles traced, all clip art
vectorized, boxes/labels/rules/fields correct. "All About Me" (severely underexposed) is
dramatically improved (title + all boxes + clip art), with one residual dark blob from cluttered
room background above the diagonal paper edge. 14 node tests pass.

### 2026-08-25 (later still) — universal typed response fields (marquee roadmap #1)

Competitive read: no edtech tool reconstructs a photographed illustrated worksheet into a native
editable doc (vector art + text + layout + typed fields + ed semantics). Overlay tools (Kami,
Classkick, Formative, Google Practice Sets) float fields on the bitmap; generators (MagicSchool,
Diffit, Brisk) make new sheets from prompts; Acrobat "Prepare Form" does fields-on-a-bitmap with no
artwork/ed-semantics; Mathpix does STEM reconstruction without artwork. The combination is novel —
that's the moat. Roadmap (value order): (1) typed fields [DONE], (2) completed-paper handwriting →
auto-grade, (3) perspective/homography unwarp, (4) semantic re-illustration.

#1 shipped — `rebuildDocumentIntelligently` section 9 now builds TYPED fields from three sources
(all in telaDocumentIntelligence.ts, with a shared `inferFieldType`):
- **9a box fields**: each answer-box FRAME → one field in its writing area, labeled by the box's
  top text, typed by its label. Skips instruction boxes (text coverage > .42), freeform draw boxes
  (`/draw|portrait|sketch/`), and multi-line boxes (≥2 internal rules → their rules make the fields).
- **9b question fields**: each printed question (`?$` or numbered/circled) → a field on the first
  answer rule beneath it. This is the interview/short-answer model.
- **9c/9d**: the existing printed-blank and left/above-prompt rule fields.
Result on the three real sheets: "Find Someone Who" 0→6 fields, "Meet a Classmate" 1→4, "All About
Me" →4 — all typed, positioned as cyan RESPONSE_GUIDE rects that `worksheetTelaAdapter` maps to Base
fields. Verified visually.

REMAINING: field COVERAGE isn't 100% — some answer boxes aren't detected as frames (connected to
neighbours, or interior not empty enough), so ~6/12 boxes on the dense grid and ~4/7 questions get
fields. Improving requires better frame/box detection (grid-line splitting). Types are almost all
TEXT (NUMBER/CHOICE inference is keyword-based; few triggers on these sheets). Deskew handles small
tilt only (no perspective/keystone — roadmap #3). Very dark room-background objects enclosed by
bright paper can survive the exterior flood as false "interior ink". A dev-only `/api/__scandump`
endpoint was used to extract render proofs during this work and has been REMOVED from server.ts.

### 2026-08-25 (later still²) — completed-paper pre-assessment + teacher turn-in brief (roadmap #2 core)

The scan serves a full assignment lifecycle (teacher's stated workflow): scan → library asset →
base for variants → assign → student/parent get a digital fillable copy OR turn in on paper →
teacher dashboard shows a per-student pre-assessment + a class turn-in brief. Built the deterministic
heart of the completed-paper side:

- `services/worksheetGrading.ts` (PURE, node-tested — 4 tests in `tests/worksheetGrading.test.ts`):
  - `preAssessWorksheet(sheet, reading, student, now)` → `WorksheetPreAssessment`: reuses
    `autoGradeWorksheet` for key-matching, then layers read-confidence, answered/blank, per-field
    status (correct | incorrect | needs_review | blank), completion %, estimated score over
    auto-gradable points, flags, and a recommendation. KEY PRINCIPLE: low read confidence (<0.5)
    and every open-response field are routed to `needs_review`, NEVER auto-scored — the teacher is
    never shown a fabricated number.
  - `buildTurnInBrief(title, assessments, roster, now)` → `TurnInBrief`: turned-in count, class
    average, needs-review queue (worst-first), score distribution, and hardest fields (per-question
    miss rate) for reteaching.
- `services/worksheetLocalVision.ts` `readCompletedWorksheetOnDevice` upgraded: flattens the
  completed scan first (cleaner handwriting OCR), and adds per-field INK-DENSITY so `answered` is
  accurate even when handwriting can't be transcribed. Returns `answered` map.
- `services/worksheetAssignmentService.ts`: `preAssessCompletedScan(sheet, imageBase64, mimeType,
  student, now?)` orchestrator (read → pre-assess) + re-exports `buildTurnInBrief` / types for the
  teacher dashboard.

Proven on REAL student handwriting (Kamille's filled "Meet a Classmate"): all 7 questions correctly
detected as answered (100% completion via ink density), all routed to needs_review (open-response +
child handwriting mostly not transcribed), honest flags (`illegible_answers`,
`teacher_review_needed`). Correct trustworthy behavior — knows the work was done, never invents a
grade. On keyed math/fact worksheets the extracted answers auto-grade.

REMAINING for #2: (a) child/cursive handwriting transcription is weak — Tesseract reads print well
but not handwriting; a TrOCR (transformers.js) or cloud handwriting lane would lift extraction. The
system degrades HONESTLY (completion + needs-review) without it. (b) Wire `preAssessCompletedScan`
into `turnInWorksheet` persistence + a teacher-dashboard brief UI (data structures ready; not yet
rendered). (c) The reprint reconstruction's typed fields (pixel coords) and the DigitalWorksheet's
%-fields are still separate systems — unify so grading uses the better field detection. NOTE: an
intermittent app-level "Failed to fetch" from the healthMonitor/sessionTrace fetch wrapper can hit
tesseract data-URL loading under rapid concurrent calls — not in pipeline logic; the real
single-flow ScanWorksheet path (prepareWorksheetImage first) is unaffected.

### 2026-08-25 (handwriting lane) — on-device TrOCR, honestly scoped

Strengthened roadmap #2's weak point (handwriting transcription). New `services/handwritingTranscription.ts`:
lazy TrOCR (`Xenova/trocr-small-handwritten`, ~60 MB, base is the accuracy upgrade) via the same
`@huggingface/transformers` (v4.2.0) stack as Florence/SlimSAM — `pipeline('image-to-text', …)`,
WebGPU→WASM. `transcribeHandwritingCrops(crops, onProgress)`. Opt-in like Florence
(`isHandwritingModelInstalled`). Wired into `readCompletedWorksheetOnDevice(url, sheet, { handwriting:
'auto'|'require'|'skip' })`: for each answered field it crops the writing area with `cropHandwriting`
(re-inks from the ink map AND strips the printed answer rules so the recogniser sees clean handwriting,
not underlines), runs TrOCR, and uses its text. Threaded through `readCompletedWorksheet` and
`preAssessCompletedScan`.

HONEST OUTCOME (tested on the real filled sheets): the lane works end-to-end (model downloads, loads,
infers) but small-TrOCR on this child's cursive produced confident-but-WRONG reads ("go to sleep" →
"0 0", "art" → "economy", "Kamille" → "throughout"). Shape-based confidence can't distinguish a
confident hallucination from a correct read. So by DESIGN the lane never auto-grades: `readConfidence`
is capped at 0.48 (below the 0.5 auto-score threshold), meaning every photographed-paper answer routes
to needs_review as a SUGGESTION, with `FieldResponse.suggestedCorrect` giving the teacher the tentative
key-match to one-click confirm. Typed digital answers (high confidence) still auto-grade. Ink-density
keeps completion accurate regardless of transcription. This is the correct trustworthy behavior for
child handwriting — a teacher stays in the loop for paper turn-ins; bigger models (base TrOCR / cloud)
lift transcription quality but don't change that. 18 node tests pass; production build green.

### 2026-08-25 (dashboard) — teacher turn-in brief UI wired

Built + wired the teacher-facing dashboard that the whole completed-paper pipeline feeds:
- `services/worksheetGrading.ts` `simulateTurnIns(sheet, roster, now)` — deterministic FNV-hashed demo
  class turn-ins (some not turned in, some blanks, keyed ~65% correct, high confidence = typed
  turn-in) so the brief is populated in demos; swap real `WorksheetPreAssessment[]` for live classes.
  (5 grading tests now.)
- `components/academia/TurnInBriefView.tsx` — renders `buildTurnInBrief`: header stats (turned-in,
  class average, avg completion, need-review count), score distribution bars, "where the class
  struggled" (per-question miss rate), and a student list ordered review-queue-worst-first with a
  drill-down per student showing each field's pre-assessed answer, blank/▢ + key, and a
  "looks right/wrong · verify" chip from `suggestedCorrect`. Plajah dark tokens.
- Wired into `TeacherToolsView` ScanWorksheet: after Publish, a "See turn-in brief (how the class
  did)" toggle renders `<TurnInBriefView sheet={sheet} roster={DEMO_CLASS.students…} simulate />`.
Verified by mounting standalone + rasterising the DOM: renders correctly (4/6 turned in, 88% avg,
distribution, expandable per-student review with green ✓ on key-matches, not-turned-in last). 19
node tests pass; production build green.

REMAINING (dashboard): it currently SIMULATES the class (demo). To go live: persist each
`preAssessCompletedScan` result on the submission in `turnInWorksheet`, then feed the teacher view
real `WorksheetPreAssessment[]` instead of `simulate`. Wire the per-field "verify" chips to actually
confirm/override a grade (write-back). Add a standalone "Turn-ins" entry point (currently only reachable
after a fresh scan+publish).

Roadmap remaining: (2b) base/cloud handwriting model + line segmentation for better suggestions; wire
preAssess into turnInWorksheet persistence + teacher-dashboard brief UI; (3) perspective/homography
unwarp; (4) semantic re-illustration.

### 2026-08-25 (perspective) — roadmap #3: homography un-warp SHIPPED

Photos shot at an angle turn the rectangular page into a trapezoid; the small-angle deskew can't fix
that. New perspective correction — `services/worksheetReprintCore.ts` (PURE, 3 tests):
`computeHomography(src,dst)` (8×8 Gaussian solve), `applyHomography`, `orderQuadCorners`,
`findPaperQuadFromMask` (paper corners via extreme x±y over a bright-paper mask).
`services/worksheetReprint.ts` `warpToPage(flat)`: finds the quad, VALIDATES it (min edge, convexity,
area ≥25% frame, and only warps when it meaningfully corrects — width/height skew >5% or crops real
background), then inverse-homography warps with bilinear sampling to a flat rectangle; returns null →
fallback. Orchestrator 1a: `warpToPage(flat) ?? cropToPaper(flat)`.

Verified: a deliberately keystoned book-bag photo on a dark desk → reconstructed flat, square, upright.
The near-flat real "Find Someone Who" correctly FELL BACK to cropToPaper (page fills the frame),
identical output — no regression. 22 node tests pass; build green. ### 2026-08-25 (dashboard go-live) — turn-in brief wired to real submissions

Wired the dashboard end-to-end (was demo-simulate only):
- `worksheetGrading.ts` `preAssessFromAnswers(sheet, answers, student, now)` — pure, tested: digital
  (typed) turn-ins graded at high confidence (keyed fields auto-grade). Same shape as the paper reader.
- `worksheetAssignmentService.ts`:
  - `turnInWorksheet` now COMPUTES + PERSISTS a `preAssessment` on the submission doc — via
    `preAssessCompletedScan` when a completed-paper photo is attached, else `preAssessFromAnswers`.
  - `fetchAssignmentBrief(worksheetId, sheet, roster, now)` — queries `worksheet_submissions` where
    worksheetId==, uses each persisted `preAssessment` (or recomputes from stored answers), returns
    `buildTurnInBrief`. not-turned-in students come from `roster`.
  - `confirmSubmissionField(worksheetId, studentId, fieldId, correct, teacher)` — teacher write-back;
    stores `teacherOverrides.<fieldId>` on the submission.
- `TurnInBriefView.tsx` now takes `loadBrief?: () => Promise<TurnInBrief>` (async, with loading
  state) and `onConfirmField?`. The suggested-grade chips are INTERACTIVE: for a keyed field routed to
  review (a paper/handwriting read), the teacher clicks "✓ looks right" / "✗" → the chip becomes a
  solid "marked right/wrong" and `onConfirmField` persists. Fixed a Rules-of-Hooks ordering bug
  (all hooks now precede the loading early-return; default-open derived, not stateful-after-return).
- `TeacherToolsView` ScanWorksheet passes the REAL path when `wire && !wire.simulated &&
  wire.worksheetId` (`loadBrief`=fetchAssignmentBrief, `onConfirmField`=confirmSubmissionField), else
  `simulate` for the demo roster.

Verified by mounting standalone: a paper-turn-in brief renders with per-field "✓ looks right / ✗"
chips; clicking one flips it to "marked right" and fires onConfirmField (confirmed `s1:q1=true`). 23
node tests pass; build green.

REMAINING (dashboard polish): confirmations persist but the displayed class average still reflects
only AUTO-scored fields — recompute the average from teacher confirmations for a live finalized score;
add a standalone "Turn-ins" entry point (currently reachable after a fresh scan+publish).

### 2026-08-25 (re-illustration) — roadmap #4 SHIPPED: semantic re-illustration

The last frontier. New `services/worksheetArtLibrary.ts` (PURE, 3 tests in
`tests/worksheetArtLibrary.test.ts`): a curated clip-art library (apple, star, pencil, ruler, book,
notebook, backpack, heart, sun, cake — the decorations that recur on real worksheets), authored from
simple primitives (perfect ellipses, crisp polygons) in a 0–100 space. `matchLibraryAsset(label)`
(exact/synonym/substring with longest-synonym specificity — "book bag" → backpack, not "book");
`instantiateAsset(asset, box, id)` fits an asset into a region box as editable Tela PATH objects
(true per-primitive bboxes — NOT regexing arc paths); `reillustrateArtwork(objects)` swaps each
library-matched artwork region (grouped by parentRegionId, driven by detectedLabel) for the clean
asset, preserving z-order and leaving text/layout/fields/unmatched-art alone.
`telaDocumentIntelligence.ts`: extracted `buildReconstructionPreview(objects,w,h)` (shared) and added
`reillustrateReconstruction(reconstruction)` → { objects, replaced, previewSvg, previewUrl }.
`TeacherToolsView` ScanWorksheet: an "Upgrade artwork" toggle in the layers review (next to onion
skin) runs it and shows the polished preview; click again to flip back.

Depends on the Florence naming pack for real labels (region labels are "artwork N" without it). Verified:
the library renders as clean recognizable icons, and a before/after swapped two rough traced blobs
("a hand drawn book bag"→backpack, "apple"→apple) for crisp vectors in place with text untouched. 26
node tests pass; build green.

ALL FOUR marquee frontiers now shipped: (1) typed fields, (2) completed-paper grading + handwriting
lane + wired dashboard, (3) perspective un-warp, (4) semantic re-illustration. Remaining polish:
recompute class average from teacher confirmations; standalone Turn-ins entry point; base/cloud
handwriting model; grow the clip-art library; unify reprint pixel-fields with DigitalWorksheet %-fields.

Roadmap remaining now (superseded): (4) semantic
re-illustration + the go-live wiring / stronger-handwriting / field-unification items above.

Verified result on the synthetic book-bag worksheet (shadow gradient + warm cast + JPEG noise):
pure-white page, book bag and apple traced as editable splines in position, one shared body
type size + column, centered bold title, 7 rules, and exactly the 5 correct response fields
(Name, Date, Q1–Q3). Remaining known gaps: no deskew for tilted photos, Florence naming lane
not re-validated after the rewrite, and table/checkbox reconstruction still pending.

This is the current handoff for the Academia teacher demo, rich-lesson strategy, Tela creative/document engine, and scan-to-editable-assignment workflow. The older [Academia session handoff](./ACADEMIA_SESSION_HANDOFF.md) remains the source for the Academia Hub, classroom-as-club, Student ID, emergent-school backend, anatomy, and Motion Lab work.

## 1. The product intent — do not reduce this to OCR

The user’s north star is a teacher workflow that turns imperfect real-world materials into deeply polished, source-aware, standards-aligned, personalized learning experiences with almost no production labor from the teacher.

For scanned worksheets, the requirement is explicitly **not** “put text boxes on top of the original photograph.” The result must be a native Tela reconstruction whose parts are independently editable and meaningful:

1. Preserve the untouched original scan.
2. Clean and normalize the camera image.
3. Understand page layout and the positions/relationships of page elements.
4. Segment individual artwork, diagrams, lines, tables, text, and response areas.
5. Recognize the semantic identity of artwork, for example “hand-drawn book bag.”
6. Rebuild recognized artwork as selectable vector shapes and spline paths.
7. OCR printed text separately, preserve its bounding boxes, and match the closest available/open font.
8. Reconstruct page rules, dividers, boxes, and visual hierarchy.
9. Only after the page has been rebuilt, reason over instructions, questions, subject, intent, and expected response type.
10. Convert response areas into native Tela Base fields and positioned Form inputs.
11. Let the teacher compare original and reconstruction side by side, zoom, inspect, correct, and approve.
12. Save both versions to the teacher library, assign to a class, notify students and guardians, accept digital or scanned completion, and preserve audit timestamps.

The same Tela file should remain useful after the scan: artwork must be editable with the Direct/Pen tool; text must remain text; assignment semantics must remain data; forms must remain forms.

## 2. Plajah’s intended differentiation

The strategic position is broader than a worksheet scanner:

- Accept mixed sources: URLs, PDFs, documents, images, audio, video, datasets, and 3D models.
- Preserve provenance, citations, quotations, page/time anchors, licensing, and retrieval metadata.
- Align the lesson to teacher-selected standards and rubrics.
- Build a polished first draft that visibly covers every target and rubric criterion.
- Select a rich presentation system automatically: slideshow, living museum, documentary desk, data story, field lab, or Socratic studio.
- Pull compatible public/cultural resources from Plajah’s own surfaces and rights-aware sources such as Chora Vault, the Library of Congress, museums, archives, and Labs.
- Personalize learner invitations, scaffolds, examples, and stretch work using the Learner Ledger without lowering the common objective or exposing private labels.
- Render through Plajah-native media, 3D, gallery, charting, audio, video, and spatial tools instead of returning a wall of AI prose.

The strategic research and pain-point artifacts already in the repo are:

- `docs/education/PLAJAH_EDUCATION_LEDGER_BLUEPRINT.md` — market fragmentation, competitor comparison, learner-owned record moat.
- `docs/education/ACADEMIA_LAUNCH_PLAN.md` — ClassDojo/Seesaw pain points, safety, demo priorities, and launch sequence.
- `docs/education/RICH_LESSON_ARCHITECTURE.md` — source-aware rich lesson production contract and honest shipped/planned boundary.
- `docs/TELA_CREATIVE_ENGINE_ARCHITECTURE.md` — Tela scene/engine boundaries, media/vector/form model, codecs, and model adapters.
- `docs/PLAJAH_DESIGN_SYSTEM.md` — platform design language.

## 3. Resettable teacher-winning rich lesson demo

The resettable rich-lesson experience is implemented as a real local demo contract rather than a set of screenshots.

### Implemented

- `data/richLessonStudio.ts`
  - mixed source types;
  - source attribution and licensing;
  - standards and rubric coverage;
  - six distinctive lesson presentation systems;
  - rich media/experience blocks;
  - learner interests, strengths, growth areas, supports, and personalized entry points;
  - AI/tool receipts and teacher review gates.
- `data/richLessonDemoStore.ts`
  - deterministic local demo state;
  - teacher-added sources and template switching;
  - exact reset with no Firestore writes.
- `components/academia/RichLessonStudioDemo.tsx`
  - responsive Plajah-design walkthrough covering sources, targets, style, experience, personalization, and proof.
- `tests/richLessonStudio.test.ts`
  - reset, personalization, and contract tests.

### Honest production boundary

The demo and data model are built. Live multimodal ingestion, connector resolution, versioned persisted lessons, PoKee/Claude orchestration, all rich block renderers, and private per-learner overlays are still production work. Follow the interfaces and privacy boundaries in `RICH_LESSON_ARCHITECTURE.md`; do not wire vendor calls directly into UI components.

## 4. Tela creative and document engine progress

Tela is being treated as a shared semantic scene engine rather than a one-purpose editor.

### Implemented or substantially scaffolded

- Proper top menu system for file/document/edit/export workflows.
- Whole-board Tela files with page/frame export behavior.
- Page, Board, and Studio postures.
- Zoom/pan canvas behavior.
- Rulers, guides, snapping, safe margins, print/video safe areas, and pixel/physical measurement units.
- Vector object library and design template library.
- Vector shapes, paths, gradients, fills, strokes, transforms, object properties, selection, and Direct tool path editing.
- Shift multi-selection for objects/layers.
- Right-click/context systems and direct manipulation.
- Image layers, groups, masks, blend/adjustment controls, luma/alpha/shape-mask concepts, and smart cutout plumbing.
- Raster-to-vector trace review with original/vector split and overlay comparisons.
- Lorea/ComicDrawCanvas paint handoff for pencil/ink/marker/paint/eraser work.
- Drag/drop and media import classification.
- Recognition of raster/vector/document/video/Lottie and Adobe preset families; opaque ABR/CSH/ASE assets are not falsely claimed as decoded.
- HTML, SVG, PNG, PDF/page export seams.
- Reusable poster, lower-third, menu, presentation, social, and web templates.
- Notes device and note/journal domain integration.
- Bidirectional Melos lyric/tracklist and Tela adapters.
- Semantic lyric, poetry, note, journal, instruction, question, and response types.
- Assignment builder for selected writer/vector text.
- Native response types including text, number, choice, true/false, attachment, audio, and short video concepts.
- Auto Format as Plajah Plus with undo.

Key files:

- `components/tela/TelaView.tsx`
- `components/tela/TelaVector.tsx`
- `components/tela/TelaImage.tsx`
- `components/tela/TelaWriter.tsx`
- `components/tela/TelaForm.tsx`
- `components/tela/TelaNotes.tsx`
- `components/tela/TelaAssignmentBuilder.tsx`
- `components/tela/telaOps.ts`
- `services/telaCreativeEngine.ts`
- `services/telaAssignmentEngine.ts`
- `services/telaAssignmentAutoFormat.ts`
- `services/telaDomainAdapters.ts`
- `services/telaHtmlExport.ts`
- `services/telaPageExport.ts`
- `services/telaStore.ts`
- `types.ts`

Do not claim full Photoshop/Affinity/Illustrator parity yet. The architecture and a meaningful editor/toolset exist, but persistent tiled paint strokes, advanced selections, liquify, nondestructive filter graphs, PSD preservation, Adobe preset parsers, and full Lottie round-trip editing remain future engine packages.

## 5. Worksheet pipeline — current implementation

### Image preparation and first-pass digitization

- `services/worksheetImagePipeline.ts`
  - retains the original file/data;
  - cleans and normalizes the camera image;
  - generates a cleaned source for OCR/reconstruction;
  - reports capture warnings.
- `services/worksheetLocalVision.ts`
  - local-first OCR/digitization path;
  - no Gemini key required for the primary scan flow.
- `services/worksheetDigitizer.ts`
  - `DigitalWorksheet`, fields, segments, scan assessment, confidence, review issues, and auto-grading model;
  - supports reading a completed paper scan into existing field IDs.

### Layered document intelligence

Primary file: `services/telaDocumentIntelligence.ts`.

Models:

- Florence-2 base FT via `@huggingface/transformers`, approximately 300 MB cached locally.
- SlimSAM 77 uniform, approximately 14 MB cached locally.
- WebGPU preferred, CPU/WASM fallback.
- No required Gemini request for reconstruction.

Current execution order:

1. Florence `<OCR_WITH_REGION>` produces positioned OCR text.
2. Florence `<DENSE_REGION_CAPTION>` describes page regions.
3. Florence `<OD>` detects semantic objects such as “backpack,” not only generic “illustration.”
4. Local geometry analysis finds printed rules/dividers/table edges.
5. OCR objects become independent Tela `TEXT` objects with bounding boxes and font-match metadata.
6. Semantic object/dense-region candidates are filtered using OCR coverage instead of a narrow art-word whitelist.
7. Each artwork region is refined with SlimSAM.
8. The mask is cropped and passed to ImageTracer.
9. Each retained artwork contour becomes a native Tela `PATH` with `pathNodes` for Direct/Pen editing.
10. If the SAM mask produces zero drawable contours, the system automatically retries the recognized bounding box.
11. If tracing still fails, a selectable cropped `IMAGE` review layer is retained and explicitly labeled as needing vector review.
12. After reconstruction, `<MORE_DETAILED_CAPTION>` supplies contextual understanding.
13. Text is classified as heading, instruction, question, or printed content.
14. Dense regions, printed blanks, and local underlines become response fields and `INTERACTION` guides.

Layer provenance on vector objects:

- `LAYOUT`
- `ARTWORK`
- `TEXT`
- `INTERACTION`

Every artwork region now returns an audit record:

- semantic label;
- `TRACED_MASK`, `TRACED_BOX`, or `FALLBACK_IMAGE` status;
- total path count;
- pen-editable path count;
- confidence.

### Latest artwork-action bug and fix

The user correctly observed that the vision model appeared to see artwork but no drawing action occurred.

Root causes:

1. The old action gate required captions to literally contain terms such as “illustration,” “drawing,” or “artwork.” A valid semantic label such as “book bag” or “backpack” was discarded before tracing.
2. Transparent pixels outside a SlimSAM mask were being handed to ImageTracer without first compositing them onto white. Transparent RGB could be interpreted as black and generate a page-sized background path.
3. A valid but empty segmentation result returned zero paths without throwing, so the workflow looked “successful” despite drawing nothing.
4. Paint-equivalent contours were grouped into compound layers, which prevented many contours from exposing Direct-tool anchors.

Fixes now in place:

- `<OD>` semantic object detection is merged with dense regions.
- Semantic nouns invoke drawing even without an “art” keyword.
- OCR overlap rejects text blocks while retaining non-text visuals.
- Transparent masks are composited onto white before tracing.
- Empty mask traces retry the raw recognized box.
- Zero-path regions cannot silently succeed.
- Artwork-region tracing uses `EDITABLE_CONTOURS` mode.
- Each contour exposes spline anchors, capped/reduced to 360 nodes for mobile safety.
- Per-region tracing is capped at 96 contour layers and the document traces at most 12 largest artwork regions in one pass.

Relevant files:

- `services/telaDocumentIntelligence.ts`
- `services/telaImageTrace.ts`
- `components/TeacherToolsView.tsx`
- `components/tela/TelaView.tsx`
- `components/tela/TelaVector.tsx`
- `tests/telaArtworkSelection.test.ts`

### Teacher review and publish flow

`components/TeacherToolsView.tsx`, Scan Worksheet tab:

- capture/upload on desktop and mobile;
- original and reconstructed side-by-side panes;
- zoom and full-screen inspection;
- Fillable vs Layered reconstruction toggle;
- Build/Rebuild editable layers;
- progress phases and errors;
- counts for layout, artwork splines, editable text, and response fields;
- per-artwork audit chips such as `book bag · 8/8 pen-editable splines`;
- scan confidence/quality dimensions;
- teacher review issues and rating;
- Auto Format only after layered reconstruction;
- publish into Tela plus class assignment flow.

`services/worksheetTelaAdapter.ts` carries all accepted `PATH`, `TEXT`, layout, and interaction objects into a native Letter-sized Tela vector device without flattening them.

`services/telaAssignmentAutoFormat.ts`:

- preserves artwork paths;
- creates Plajah Plus title/name/date/assignment structure;
- orders questions;
- builds/links response fields;
- returns a teacher-readable audit;
- supports undo.

## 6. Assignment delivery, completion, telemetry, and guardian access

`services/worksheetAssignmentService.ts` now supports:

- persistent digital worksheet and untouched original scan;
- class assignment record;
- student assignment seeding;
- assigned/opened/submitted/turned-in timestamps;
- duration and status timeline;
- student identity audit;
- digital completion or completed-paper scan upload;
- auto-grade result and Learner Ledger evidence write;
- teacher notification;
- guardian notification fan-out;
- teacher/student/guardian access lists.

`components/StudentAssignmentView.tsx`:

- marks first open;
- records scoped runtime telemetry;
- supports on-platform completion and completed-paper scan;
- shows submission/turn-in timing;
- captures post-submit quality rating and comment.

`services/assignmentQualityService.ts`:

- append-only crash/render/scan/format/submission/user-report events;
- assignment feedback and ratings;
- owner-controlled aggregate summary;
- local fallback for demo/privacy/offline/denied persistence;
- scoped `window.error` and unhandled-rejection listeners.

`firestore.rules` now contains boundaries for:

- `digital_worksheets`
- `worksheet_assignments`
- `worksheet_submissions`
- `assignment_quality_events`
- `assignment_quality_feedback`
- `assignment_quality`

Teacher owns the worksheet and assignment. Assigned students can access the worksheet and their submission. Guardians can access the worksheet and only their own child’s submission. Quality events/feedback are append-only and actor-bound.

**Rules have been edited locally but have not been deployed in this work.**

## 7. Tela domain reuse beyond assignments

`services/telaDomainAdapters.ts` connects Tela to existing platform domains:

- Melos lyrics ↔ Tela Writer;
- Melos tracklists ↔ Tela Base;
- platform notebook entries ↔ Tela Notes;
- Ora journal entries ↔ encrypted journal-flavored Tela Notes;
- changes sync back to the originating domain.

Entry points were added in Melos Pad/Tracklist, Labs Notebook, and Ora note/journal surfaces. Tela is intended to be the common structured document substrate across the platform, not a parallel silo.

## 8. Verification completed

Focused tests:

```powershell
npx tsx --test tests\telaArtworkSelection.test.ts tests\telaWorksheetReconstruction.test.ts
```

Current result: 4 passing tests.

Covered invariants:

- A semantic phrase such as “hand drawn book bag” invokes artwork selection without requiring the word “illustration.”
- Object detection recognizes “backpack” while OCR-heavy title text is rejected as artwork.
- Auto Format preserves artwork paths and creates assignment fields.
- The worksheet adapter retains both vector artwork and editable OCR text.

Vite live transforms returned HTTP 200 for the modified intelligence, tracing, Teacher Tools, and Tela modules.

Production build:

```powershell
npm run build
```

The latest build completed successfully, including PWA generation. Existing non-blocking warnings remain around Verovio browser externalization, Three `sRGBEncoding`, mixed dynamic/static imports, and large chunks.

The dev server was started with:

```powershell
npm run dev
```

Port 3000 returned HTTP 200 at handoff time. Restart if the process does not survive the task transition.

## 9. Exact manual test Claude should run next

Use the same worksheet that previously showed readable text but missing artwork.

1. Hard-refresh `http://localhost:3000/` so no old PWA/HMR asset remains.
2. Open Teacher Tools → Scan Worksheet.
3. Upload/capture the worksheet.
4. Wait for first-pass OCR.
5. Click **Build editable layers** or **Rebuild layers**.
6. Watch progress for semantic object detection, segmentation, and vectorization.
7. Switch to **Layered reconstruction**.
8. Confirm an audit chip appears for the book bag/artwork.
9. The chip should report a nonzero path count and ideally `N/N pen-editable splines`.
10. Compare original/reconstruction at 150–250% zoom.
11. Publish/open in Tela.
12. Select an `ARTWORK` layer, choose the Direct tool, and confirm anchors appear on the actual artwork location.
13. Move an anchor and confirm only that path changes.
14. Select a `TEXT` layer and edit it independently.
15. Confirm Auto Format preserves artwork and creates fillable response fields.

Record these results for each artwork region:

- recognized label;
- detection box accuracy;
- mask quality;
- path count;
- editable path count;
- visual fidelity at normal zoom;
- visual fidelity at 200% zoom;
- whether a bitmap fallback was used;
- teacher corrections needed.

The code path and regression tests are verified, but the exact user worksheet has **not yet been visually validated by the current agent after the latest artwork fix**. Do not tell the user the artwork fidelity is solved until this manual test passes.

## 10. Important production gaps and risks

### Critical security/data-design gaps

1. `DigitalWorksheet.fields` currently contains `correctAnswer`, and `fetchWorksheet` returns the full worksheet to the student client. Before production, split the teacher answer key from the student-visible worksheet projection.
2. Auto-grading currently runs client-side and writes a score into the student submission. Production grading should be recomputed by a trusted server/Cloud Function, with clients writing answers/evidence only.
3. Firestore rules were added but not emulator-tested or deployed.
4. The Scan Worksheet demo currently publishes with `simulate: true` and the demo roster. Real classroom routing must pass the live roster and `simulate: false`.

### Reconstruction gaps

1. The current artwork path is semantic detection + segmentation + pixel tracing. It does not yet perform true semantic re-illustration from a generated scene graph. If fidelity remains weak, introduce explicit per-region strategies:
   - exact line-art trace;
   - color illustration trace;
   - primitive/shape reconstruction;
   - chart/table reconstruction;
   - semantic redraw/re-illustration with a registered local/server vector model;
   - source crop fallback.
2. ImageTracer is acceptable plumbing but may not be the final line-art engine. Consider a Potrace-style monochrome lane for worksheet drawings and ImageTracer for color art.
3. Font matching currently compares installed font metrics. Open-font acquisition, glyph-level recognition, and true outline fallback need more work.
4. Dense object detection can over-detect decorations. The new audit makes that visible; use teacher approvals/corrections to tune thresholds.
5. The learning loop records scan ratings/quality telemetry, but no model training pipeline consumes teacher corrections yet.
6. Page layout reconstruction includes lines and OCR boxes but not a full constraint graph for all nested groups, tables, repeated motifs, or vector primitives.
7. A first model download is roughly 314 MB. Treat this as an optional offline capability pack on mobile; do not force it during initial app install.

### Rich lesson gaps

- PoKee and Claude orchestration is architecture/planned work, not currently part of the worksheet scan.
- Public-source connectors and quotation anchoring must be resolved behind rights-aware interfaces.
- Personalization must stay in private overlays and never alter the common target/rubric.

### Repository hygiene

The worktree is heavily dirty and includes unrelated user/parallel work. Do not reset, clean, or overwrite changes. Do not create a commit unless the user asks. Inspect overlapping files before editing.

The full TypeScript check has numerous pre-existing unrelated errors. Focused module transforms and production builds pass. Do not casually “fix all tsc errors” in this handoff because it will mix domains and risk user changes.

## 11. Recommended next implementation order

1. Manually validate the exact worksheet’s book-bag artwork and capture before/after screenshots.
2. Add a reconstruction-debug inspector showing OD/dense boxes, mask preview, traced contours, and fallback reason per region.
3. Tune artwork selection thresholds and line-art/color trace strategies from that real example.
4. Ensure every accepted artwork path has useful Direct-tool nodes and sane layer grouping on phone.
5. Add teacher correction capture: resize/relabel region, mark false positive, approve trace, edit font match, and rate fidelity.
6. Persist correction provenance and create a resettable scan-quality evaluation set.
7. Split teacher answer keys from student-visible worksheet data.
8. Move grading and quality aggregation to trusted server code.
9. Emulator-test and deploy Firestore/Storage rules.
10. Wire real class rosters and disable simulation outside demo mode.
11. Then continue rich lesson source resolvers, PoKee content mapping, Claude composition, deterministic validation, and private learner overlays.

## 12. Acceptance standard

The marquee claim is earned only when a teacher can photograph a mixed-content worksheet and receive:

- an unchanged original;
- a faithful reconstructed page;
- editable text;
- editable artwork splines in the right positions;
- accurate response fields;
- assignment semantics and answer types;
- a transparent confidence/audit report;
- easy correction and approval;
- one-click class/guardian delivery;
- digital or scanned student completion;
- secure grading and learner evidence;
- a reusable teacher-library asset.

If the model “sees” an object but Tela has no selectable PATH objects for it, the workflow is still failing. Recognition is only complete when it causes a visible, editable drawing action.
