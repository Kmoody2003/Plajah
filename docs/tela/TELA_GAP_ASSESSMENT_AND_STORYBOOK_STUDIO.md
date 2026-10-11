# Tela gap assessment + Storybook Studio prep

2026-10-10. A code audit of `components/tela/*`, `services/tela/*`, `services/living/*`, `services/bookTela/*`, `data/showcase/*` and `scripts/showcase/*`. Nothing here has been built yet; this is the starting point for the studio work.

## Verdict in one paragraph

Tela's strengths are what the Adobe and Microsoft apps don't have:
- the binding graph (Writer → Base → Grid → Chart),
- living documents (behaviours, synthesised audio, narration),
- reference embeds with lock/publish versions,
- 12 chart types,
- the template and design-lesson library.

Its basic editing tools are a long way behind all five apps. Under every gap sits one foundation problem: **there is no document undo/redo** (`TelaView.tsx:490` `dispatchOp` keeps no history). Full parity with all five apps is a multi-year effort. The storybook studio needs only a narrow slice of it, so this document scopes that slice.

## Scorecard

Ratings are on a scale where 5 = credible replacement and 1 = prototype.

| Rival | Score | Has | Biggest gaps |
|---|---|---|---|
| Photoshop | 1.5 | Layers, 16 blend modes, groups (1 level), shape and gradient masks, SAM cutout, a pressure brush (ComicDrawCanvas modal) | No pixel selections, clone/heal or adjustment layers. Inpaint is a fake: `telaInpaintService.ts:94` fills a radial gradient, and nothing calls it. No warp, perspective or crop. No Image-device export. No CMYK, ICC or PSD. Filters are CSS only, with no GPU. |
| Illustrator | 2 | Shapes, text, snapping, guides, rulers and units, 2-stop gradients, image trace (imagetracerjs), SVG export, Lottie | The pen tool makes polylines only, and there is no bezier handle editing. No boolean ops, align/distribute, symbols, type on path or caps/joins UI. SVG/PDF import is rasterised. No vector PDF export. |
| InDesign | 1 | Page presets (Letter/A4/Booklet), `templateRole` labels, a picture-book PDF with bleed and TrimBox (`bookTela/export/pdf.ts`) | No threaded text frames: `textAutoFit.ts` `autoFlowText` exists but only Ambo uses it. No paragraph or character styles, master pages, spreads, text wrap, baseline grid, PDF/X or preflight. Text wraps greedily; the Rust Knuth–Plass engine was never built. |
| Word | 1.5 | Block editor, H1/H2, bullets, Aria co-write, templates, low-fidelity docx/pdf import | Only bold and italic survive the sanitiser (`TelaWriter.tsx:27`). No tables, numbered or nested lists, headers/footers or page flow. No comments or track changes. No find/replace or word count. No docx export. Print covers one frame only. |
| Excel | 1 | Charts (strong), cross-grid and Base aggregate formulas, CSV import | 5 functions. `$A$1` references and `SUM(A,B)` argument lists return #ERR. `%` silently computes modulo. No dependency graph or virtualisation. No paste, multi-select, fill handle, sort/filter, number formats or resizing. xlsx import reads the first sheet only and loses formulas. No export. |

Cross-cutting issues:
- **No undo.**
- Collaboration means whole-doc JSON checkpoints capped at 700KB; there is no CRDT.
- `TelaView.tsx` is 2,800 lines.
- Every drag step dispatches a full immutable document update.
- Orphaned modules: `TelaUnifiedToolbar`, `telaInkEngine`, `telaInpaintService`, `telaPatternBrushEngine` and `Tela3DCanvas` are not imported by anything live. The toolbar's "Word-Grade Typography" and "Table Builder" buttons are dead.

## What the storybook studio actually needs from Tela

Each item is ranked as a hard requirement, a big quality gain, or something to skip for now.

**Must (blocks the studio):**
1. Document undo/redo: a history stack in `dispatchOp`, op coalescing for drags, Ctrl+Z / Ctrl+Shift+Z.
2. Text frames with paragraph/character styles plus auto-fit. Generalise `showcaseFit.ts` beyond its 3 fonts. Text must stay editable rather than baked into vector TEXT objects.
3. Image frames with fit/crop UI. `imageFit` and `imageCrop` already exist in `types.ts:7404`.
4. Spreads and trim/bleed/safe overlays in Studio.
5. A real inpaint and regenerate-region tool for fixing generated art.

**Should:**
- Bezier handle editing.
- Align/distribute.
- Grouping UI.
- Image-device PNG export.
- Master page or "book style" (a shared folio, text style and margins across all spreads).

**Skip for now:**
- Pixel selections and clone tools.
- CMYK/ICC editing. Convert at export only.
- Word and Excel parity work.
- CRDT.

## Storybook data: three models that need to become one

| Model | Where | Role |
|---|---|---|
| `ShowcaseBook` / `ShowcaseSpread` / `ShowcaseCharacter` | `data/showcase/types.ts` | Manuscript + beats + art prompts + locked character `look`. **The best shape. Promote it.** |
| `CharacterSheet` | `services/story/characterBible.ts` | Turnarounds and face embedding. Stored only in localStorage and used only by TelaComicStudio. |
| `TelaDoc` + `living` + `publication` | `types.ts:7670`, `services/living/contracts.ts` | Layout + behaviours + metadata |

**Proposal:** a persisted `StoryBook` (Firestore `storybooks/{id}`) that is a superset of `ShowcaseBook`, with characters as `CharacterBible` (merging `look`/palette/voice with turnarounds/refs). The TelaDoc is *derived* from it by a generalised `buildShowcaseTelaDoc` (`services/showcase/livingDoc.ts:138` → `buildStoryTelaDoc(story, templateId)`), which keeps the stable ids `p<NN>_<label>_<k>` that living behaviours target.

## How the six showcase books were made (and what that implies)

Every step was code or a script:
- TypeScript manuscripts and character bibles.
- Hand-coded procedural vector designers per template, which **throw without showcase data** (`storybooksB.ts:17` `needBook`).
- Living editions hand-written in TS.
- Puppeteer page renders.
- Admin-token publishers (`publishBooks.ts`, `publishLiving.ts`).

The UI pieces that exist were not used: `TelaBehaviorsPanel`, `ComposeWithCouncil` and the Composer Council. **The studio's job is to turn each of those scripts into a UI step a creator can run.**

## Studio workflow: eight stages

| # | Stage | Builds on | New work |
|---|---|---|---|
| 1 | **Story**: write or import, split into spreads, beats, refrain, age band | `documentImport.ts`, `storyMetrics.ts`, Editorial Council "Young Readers" lens, the `analyzeStories.ts` prompt | Spread editor UI. A manuscript → spreads splitter (Aria). Live reading-level and refrain meters. |
| 2 | **Cast**: the Character Bible | `ShowcaseCharacter.look`, `characterBible.ts`, the [character-consistency rule] | A merged persisted model. Turnaround / reference-sheet generation. The locked look gets injected into every art prompt. |
| 3 | **Storyboard**: thumbnail grid, beat → page type, page-turn pacing | `Beat` type, `ShowcaseSpread.turn`, template `pages[]` | Storyboard view (drag to reorder, mark turns, choose a layout per spread). |
| 4 | **Art**: generate per spread in the book's style | `IMAGE_SLOT`s, `CHILDRENS_BOOK_ART_DIRECTION.md`, Art Council, TelaComicStudio | **A cloud generation provider** (today's only path is local DirectML, with a placeholder fallback on web). Storybook style kits instead of comic ink. Variations, approval, region regenerate. Generative-first: no stock art. |
| 5 | **Layout** | 10 children's templates, `watercolorKit`/`feltKit` | **Generic designers** that take a `StoryBook`, not showcase data. Trim chosen up front. Editable text frames. |
| 6 | **Living**: behaviours, music, ambience, narration | `TelaBehaviorsPanel` presets, Composer Council, `narration.ts`, `childrensSpeech.ts` | Wire `VoiceRecorder` (`narration.ts:371`) to a UI and to storage. Word timing from TTS or recording. One-click "suggest behaviours" per spread. |
| 7 | **Proof** | `validate.ts`, `checkLivingTargets`, `pageFidelity`, reader `useLivingPictureBook` | In-app spread proof with bleed/safe overlay. Children's-content review gate. Preview in the real BookReader shell. |
| 8 | **Publish**: flat, living, print, ebook | `bookTela/export/pdf.ts` (bleed), `epub.ts` (fixed layout), `pod/printSpec.ts`, Lulu, `publishLiving.ts` logic | Square and landscape trims (8.5×8.5, 10×8, 8×10) plus `print` metadata on the children's templates. Facing-page output. Client-side living-bundle publish (move the logic out of the admin script). Firestore rules for `telaVersions`. |

## Build order

- **Phase 0, foundations (no studio UI yet):**
  - Undo/redo.
  - The `StoryBook` type and its persistence.
  - `buildStoryTelaDoc`.
  - Print metadata and trims on the children's templates.
  - Port one showcase designer (Bedtime is the simplest) to read `StoryBook` generically, as the pattern for the rest.
- **Phase 1, the studio shell:** stages 1–3 (Story, Cast, Storyboard) as a full-screen studio launched from Tela and the Creator Hub. Round-trip a showcase book through it as the acceptance test: import the Bedtime data, get the same pages out.
- **Phase 2, art:** a provider, style kits, `IMAGE_SLOT` filling, a regenerate-region tool, character-consistency QA.
- **Phase 3, living + narration:** recorder UI, word timing, suggest-behaviours, Composer Council in the flow.
- **Phase 4, proof + publish:** in-app proof, client publisher, POD trims, EPUB fixed-layout check on a real device.

## Decisions (Kenne, 2026-10-10)

1. **Art:** built in code on the Tela engine from 1-few author style examples (procedural designers, like the showcase templates). Image models only optional. See docs/tela/GAUNTLET.md.
2. **Firestore rules ceiling:** still open, must be solved before client-side living publish (Phase 4).
3. **Text:** live, editable text frames on the new platform text engine (not baked).
4. **Remix:** yes, users can start from a showcase book (CC BY).

## Voca reading stack inside the studio (Kenne, 2026-10-10)

Built into the storybook editor, not added on later. The scope is the plan in `docs/LIVING_BOOKS.md` ("Read aloud -> Plajah Academia Voca") plus the Voca build in `components/voca/*` and `services/voca/*`.

**Authoring side, in the Story and Living stages:**
- Every spread's text gets Voca data:
  - reading level (the existing storyMetrics band mapped to Voca levels 1-10);
  - target words with syllable splits;
  - accepted pronunciation variants (dialect-fair);
  - a comprehension question per spread or per book;
  - word timings (narration alignment), shared with the read-along highlight.
- `vocaContentSafety` runs as a gate in the Proof stage.

**Reader side:**
- The "Read page" button hands the live text frame to Voca:
  - aligner and coaching ladder;
  - listener mode for children without consent;
  - reader lock.
- Results go to the Education Ledger (students). Everyone else gets Academia "Continue learning".
- Because text is live (not baked), Voca highlights the actual page words using the text engine's glyph geometry.
