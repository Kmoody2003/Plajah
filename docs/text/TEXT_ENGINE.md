# Plajah text engine

The platform text engine composes text for Tela Writer documents, layout frames, vector text
and storybook pages. It is built from three parts:

- `rust/plajah-text` is a Rust crate compiled to a bare wasm32 module with a flat C ABI. It handles
  fonts, shaping, itemisation, hyphenation, Knuth–Plass line breaking, justification, optical
  margins, bidi, outlines and caret spans.
- `services/text/**` is the TypeScript layer. It holds the shared rich-text model, font
  registry, frame-chain layout, SVG and Canvas renderers, and the editing geometry.
- `components/text/TextSurface.tsx` is the editable React surface. `text-lab.html` exercises it.

```
model (TextStory) ──prepareParagraph──▶ RunSpec[] + ParaSpec ──pt_layout (wasm)──▶ lines/glyphs/caret spans
      ▲                                       ▲ widths per line                           │
   edit ops                         flow.ts: frames → columns → wrap → per-line measures  ▼
TextSurface ◀── caret.ts (hit test / caret / selection) ◀── StoryLayout (absolute) ──▶ svg.ts / canvas.ts / PDF data
```

## Build and test

| Command | What it does |
|---|---|
| `npm run text:build` | `cargo build --release -p plajah-text --target wasm32-unknown-unknown`, then copies the module to `services/text/engine/plajah_text.wasm`. The module is committed because CI has no Rust. |
| `cargo test -p plajah-text` (in `rust/`) | Runs 22 Rust tests against real fonts in `.cache/text-fonts`. Bench: `cargo test --release -p plajah-text bench_breakdown -- --ignored --nocapture`. |
| `npm run test:text` | Runs 18 node tests in `tests/textEngine*.test.ts`. Fonts are downloaded once into `.cache/text-fonts`. |
| `npx tsx scripts/textProof.ts` | Writes the specimen to `.tela-proofs/text-proof.{html,png}`. |
| `npx vite --config text-lab.vite.config.mjs` | Opens the editable lab at http://127.0.0.1:3150/text-lab.html. |
| `node scripts/genTextFontManifest.mjs` | Regenerates the font manifest from the google/fonts repository tree. |

The wasm module is about 967 KB uncompressed (`opt-level=3`, fat LTO). Hyphenation patterns are
not embedded in it. They are runtime assets.

## Rust crate (`rust/plajah-text/src`)

| Module | Responsibility |
|---|---|
| `fonts.rs` | Font blobs (TTF/OTF/TTC; bytes are leaked to `'static` and reclaimed when unloaded). Instances: one face at fixed variation coordinates. Each instance has metrics, a GSUB/GPOS feature list, a shape-plan cache, outlines, info (names, axes, named instances read from `fvar`). |
| `shape.rs` | rustybuzz shaping with pre/post context and per-run features. Font fallback chain: spans that come out as .notdef are reshaped with the next font, recursively. Also handles tracking, synthesized small caps (x-height/cap-height ratio), native `smcp`/`c2sc`, synthesized super/sub, and case transforms (same-width mapping keeps offsets stable). Glyphs are stored in logical order. |
| `itemize.rs` | UAX #9 levels (UTF-16), UAX #24 script runs (Common/Inherited absorbed), UAX #14 break opportunities, and rule L2 visual reordering. |
| `hyph.rs` | Liang's algorithm over hyph-utf8 `.pat.txt`/`.hyp.txt` loaded at runtime, with an FNV-hashed pattern table. |
| `kp.rs` | Knuth–Plass total fit: boxes, glue and penalties; four fitness classes with adjacent demerits; double-hyphen and final-hyphen demerits; consecutive-hyphen limit; looseness; minimum last-line length; three passes (pretolerance, tolerance, emergency stretch with artificial demerits); per-line measures; ragged mode (TeX `\rightskip`) with a hyphenation zone; tiered elastic material; Knuth's pruning; a first-fit fallback (giant paragraphs, tabs). |
| `protrude.rs` | Optical margin protrusion table (microtype defaults: punctuation, quotes, hyphens, dashes, and A/T/V/W/Y diagonals). |
| `para.rs` | The paragraph composer. Itemise, shape, then build items: words become boxes split at hyphenation points, soft hyphens and emergency character breaks; spaces become glue; explicit hyphens and CJK breaks become penalties; tabs become tab items. Then break, rebuild each line (reshape at unsafe-to-break cuts, insert U+2010), justify, apply optical margins, reorder bidi, place tab stops and leaders, and emit caret spans. |
| `lib.rs` | The ABI. |

### Justification model

Elastic material comes in three tiers, used in priority order: word spaces (min, desired, max as
% of the font's space), letter spacing (% of the em), and glyph scaling (%). The adjustment ratio
uses the tiers in that order and charges the later tiers more (cost multipliers 1.0, 1.4, 1.8). As
a result the composer re-spaces words first, then hyphenates, and only then changes letterforms.
The line builder distributes the same way, and glyph scaling is reported per run as `scaleX`.

Demerits follow TeX: `(linepenalty + badness)² ± penalty²`, plus flagged, final-hyphen and fitness
terms. In the emergency pass, demerits use the uncapped badness, so a very loose line still costs
more than a loose one.

### ABI (v1, `ABI_VERSION`)

The host calls `pt_create()`, writes 32-bit words through `pt_input(p, n)`, calls an operation,
and reads the reply from `pt_output_ptr` / `pt_output_len`. Encoding:

- Integers are `u32`/`i32`. Reals are `f32` bit patterns.
- UTF-16 text is packed two code units per word, low half first. A length-prefixed string is
  `len, units…`.
- OpenType tags are big-endian `u32` (`'wght'` = `0x77676874`).
- Every offset is a UTF-16 code unit.

| Function | Input → output |
|---|---|
| `pt_bytes(p,n)` then `pt_font_load(p)` | Font bytes → blob id |
| `pt_font_info(p, blob, index)` | → names, 12 metrics, OS/2 weight/width, flags, axes, named instances, GSUB/GPOS tags |
| `pt_instance_create(p, blob, index)` | `[n, (tag, value)×n]` → instance id |
| `pt_instance_metrics(p, inst)` | → 12 metrics, GSUB and GPOS tag lists |
| `pt_glyph_index(p, inst, cp)` | → gid (0 = missing) |
| `pt_outlines(p, inst)` | `[n, gid×n]` → per glyph `[gid, ops, bbox×4, advance, ops…]`. Ops: `0 x y` M, `1 x y` L, `2 x1 y1 x y` Q, `3 …` C, `4` Z. Font units, y up. |
| `pt_shape(p)` | text, run, direction, script → glyphs in visual order `[gid, cluster, font, xAdv, yAdv, xOff, yOff, flags]` |
| `pt_breaks(p)` | text → `[offset, 1 allowed / 2 mandatory]…` |
| `pt_hyph_load(p, lang, left, right)` | patterns, exceptions → pattern count |
| `pt_hyphenate(p, lang, left, right)` | word → break offsets |
| `pt_layout(p)` | Paragraph composition (see below) |

`pt_layout` takes:

- **Input:** `textLen, text, runCount`, then the runs, then the paragraph parameters.
  - **Run:** `start, end, size, tracking px, shift px, flags, fontCount, fonts…, hyphLang, lang, featureCount×[tag, value], objW, objAscent, objDescent`.
  - **Paragraph:** `align, baseDir, word[3], letter[3], glyph[3], pretolerance, tolerance, linePenalty, doubleHyphenDemerits, finalHyphenDemerits, adjDemerits, looseness, emergencyStretch, maxHyphens, rag, lastMin, hyphZone, hyphenPenalty, explicitHyphenPenalty, hyphMinWord, hyphBefore, hyphAfter, hyphCaps, oma, algorithm, singleWord, defaultTab, tabs×[pos, kind, leader, alignChar], widths×n`.
- **Output:** `lineCount, paraLevel, algo, demerits, badness, missing×[start, end]`, then for each line:
  - `start, end, contentEnd, flags, x, width, natural, ascent, descent, lineGap, maxSize, ratio, glyphScale, wordExtra, letterExtra`;
  - `runCount × [font, size, level, style, x, width, shift, scaleX, flags, glyphCount × [gid, cluster, x, y, adv, flags]]`, with runs in visual order;
  - `spanCount × [start, end, x0, x1, rtl]`, one caret span per grapheme in visual order.

The constants `RUN`, `GLYPH`, `LINE` and `ALIGN` in `services/text/engine/wasm.ts` mirror the
Rust flags.

## TypeScript API (`services/text`)

The barrel is `services/text/index.ts`.

```ts
const text = await createTextSystem({ preload: ['EB Garamond'] }); // engine + FontRegistry + default StyleSheet
await text.ensure(story);                       // families, per-script Noto fallbacks, hyphenation
const layout = text.layout(story, frames);      // StoryLayout (absolute page px)
layoutToSvg(text.engine, layout);               // or layoutToSvgMarkup / drawLayout(ctx, engine, layout, { mode })
pointToPosition(layout, x, y); positionToCaret(layout, pos, affinity); rangeToRects(layout, story, range);
```

- **Model (`model.ts`).** Types: `TextStory → Paragraph{id, styleId, attrs: ParaAttrs, runs} → Run{text, styleId, attrs: CharAttrs}`, plus `StyleSheet` (paragraph and character styles with `basedOn` and `next`), `Position{paragraphId, offset}` and `TextRange{anchor, focus}`. Resolution: `resolveParagraph`, `resolveRun`. Pure ops: `insertText`, `deleteRange`, `splitParagraph`, `mergeParagraphs`, `applyCharAttrs`, `setCharacterStyle`, `setParaAttrs`, `setParagraphStyle`, `sliceStory`, `insertFragment`. Each op has a serialisable `TextOp`, replayed with `applyOp`.
  - Paragraph ids are stable, which makes the model CRDT-friendly.
  - In text, U+2028 is a forced line break, `\t` a tab, U+00AD a discretionary hyphen, and U+FFFC an inline object (`CharAttrs.object`).
- **Conversions (`convert.ts`).** `fromTelaBlocks`/`toTelaBlocks` (block ids become paragraph ids), `fromVectorText`/`toVectorText`, `htmlToStory`/`storyToHtml` (clipboard), `plainTextToStory`.
- **Fonts (`fonts/registry.ts`).**
  - `FontRegistry.loadFamily`, `addFontBytes` (TTF/OTF/TTC/WOFF1), `resolve(request, size)` with CSS weight matching and variable axes (wght from weight, wdth from stretch, opsz auto from size), `fallbackChain`, `ensure`, `cssFamily`.
  - The registry registers the same bytes as a DOM `FontFace`, so DOM text matches engine metrics.
  - The manifest (`fonts/manifest.json`) covers all 140 families in `telaFonts.ts FONTS` plus 23 Noto fallbacks. Real file names come from the google/fonts tree, and URLs were verified with curl.
  - Fetched bytes are cached with the Cache API in the browser and in `.cache/text-fonts` in node (gitignored, shared with the Rust tests).
- **Layout (`layout/flow.ts`).** `TextFrame{x, y, width, height, columns, gutter, columnWidths, insets, verticalAlign, baselineGrid, firstBaseline, exclusions, minWrapWidth}`.
  - Exclusions are rects, circles, ellipses or contour polygons, each with an offset and a side: `both`, `left`, `right`, `largest` or `jump`. When there is room on both sides, the wrap yields two measures on one baseline.
  - Paragraph features: widows and orphans (the whole paragraph moves when both rules can't hold), keep together, keep with next, start on next column or frame, drop caps, list counters and markers, borders and shading, spacing, leading (auto, fixed or multiple), and baseline-grid snapping.
  - Output: `StoryLayout{frames[{lines, decorations, columns}], lines, paragraphs, overflow, overflowAt, missing, stats}`.
- **Incremental layout.** `prepareParagraph` is memoised per immutable paragraph object (invalidated by stylesheet, engine or font generation). `composeParagraph` is content-addressed: a hash of text, runs and spec plus the measures, with an LRU of 8,000 entries per engine. An edit therefore re-composes only the paragraphs whose content or geometry changed.
- **Render.**
  - `render/svg.ts` draws one path per colour run from engine outlines; there are no `<text>` elements, so output is identical everywhere.
  - `render/canvas.ts` fills cached `Path2D` per glyph. An optional `'text'` mode draws small text with `fillText` at the composer's cluster positions using the registered FontFace, so the rasteriser can hint it.
  - `glyphUsage(layout)` lists glyph ids per instance, which is the input a PDF writer needs for subsetting. `registry.faceOf(inst).bytes` provides the font program.
- **Editing (`editing/caret.ts`).** `lineForPosition`, `positionToCaret` (with affinity), `pointToPosition`, `hitLine`, `rangeToRects` (with bidi fragments and paragraph-mark slivers), `moveByGrapheme`, `moveByWord` (`Intl.Segmenter`), `wordRangeAt`, `lineBoundary`, `moveVertical` (with goal x).
- **Editor (`components/text/TextSurface.tsx`).**
  - It renders the SVG and draws caret and selection from engine spans. A hidden textarea follows the caret to receive IME input; composition text is laid out provisionally with a dotted underline.
  - Keys: arrows (word movement with Ctrl/Alt), up/down with goal x, Home/End, Ctrl+Home/End, Backspace/Delete (word-wise with Ctrl), Enter (Shift+Enter inserts U+2028), Tab, Ctrl+A/B/I/U.
  - Mouse: click, drag, Shift+click, double click (word), triple click (paragraph).
  - Clipboard: plain text and HTML.
  - Changes are reported through `onChange(story, ops)`; history is handled by the host through `onUndo` and `onRedo`.

## Quality evidence

- **Tests:** the node and Rust suites cover the following.
  - Shaping: fi/fl ligatures, `liga` off, AV kerning and `kern=0`, Arabic joining, Devanagari i-matra reordering and conjuncts.
  - Hyphenation: en-us `hy-phen-ation` and `ty-pog-ra-phy`, and German.
  - Composition: total fit beats first fit on line-quality demerits on 4 of 6 measures and is never worse; justified lines fill the measure.
  - Layout and editing: optical margins (left and right), threading across 3 frames with an overflow position, two columns, both-sides wrap around a circle with the standoff checked, bidi carets and hit testing, caret stops inside an ffi ligature, selection and vertical movement, drop caps, lists, small caps, old-style figures, variable axes.
  - Model, conversions and WOFF: model ops, op replay, style resolution, Tela and HTML conversion, and WOFF1 unwrapping.
- **Specimen:** `.tela-proofs/text-proof.png`.
- **Lab:** checked with puppeteer — typing, selection, bold, Enter and undo in the real browser.

## Performance

Measured on the dev machine, which was shared with other sessions, so timings are noisy.

| Case | Time |
|---|---|
| 1,000 justified, hyphenated paragraphs (~330 characters each, EB Garamond 11px, 280px measure) | Cold layout 1.7–1.9 s (~1.8 ms per paragraph in wasm); warm relayout from the composition cache ~0.1–0.15 s |
| One paragraph, natively (`bench_breakdown`) | Shaping ~0.15–0.3 ms, full composition ~0.7–0.9 ms |
| Lab editing | Recomposition per keystroke ~1 ms |

The shape-plan cache gave about 35% of the speed. The remaining cost is split roughly evenly
between hyphenation and line rebuilding.

## ArtCraft evaluation (reference only)

The coordinator asked for an evaluation of the storytold ArtCraft crates. Following Kenne's
policy, they are a reference only, never a dependency: Tela documents are rendered inside Fabula
and The Post Man, so every engine stays native to Tela's model, our ABI and our TS API.

What was reviewed, at designcraft@16a73657 and wordcraft@e4b7d155 (both MIT OR Apache-2.0):

- `designcraft/crates/compose` (about 10.5k lines) has a real Knuth–Plass breaker with tiered
  justification, optical margins, kinsoku, balanced ragged text, notes, ruby, warichu and tables.
  It shapes with harfrust and skrifa.
- Their composer is tightly coupled to their own `Document`/`Story` model.
- The project's roadmap describes it as pre-alpha: threading between frames does not work in
  their UI yet.

What was adopted: ideas only, reimplemented in `kp.rs` and credited in `NOTICE`:

- tiered elastic material inside the ratio;
- Knuth's fitness-class pruning;
- the ragged hyphenation zone.

What was kept as our own: everything else. Ruby, warichu, kinsoku tables and footnotes are good
candidates to study next, but they are not built yet.

## Known limits / next

- **Fonts:**
  - WOFF2 is detected but refused (it needs Brotli plus glyf reconstruction).
  - GDEF ligature-caret positions are not used; carets inside a ligature are split evenly per grapheme.
  - Colour fonts (COLR/CBDT) and emoji are not rendered; outlines are monochrome only.
- **Composition:**
  - Vertical text, ruby, warichu, kinsoku line-breaking tables and footnotes are not built.
  - Kashida justification for Arabic is not built; cursive scripts get no letter spacing.
  - Tabs force the first-fit composer for that paragraph.
  - Tab positions are measured from the start of the line, after indents.
- **Layout:**
  - Wrap computes the extent of a contour polygon per line band as min/max, so concave shapes are treated as convex per band.
  - Vertical justification is applied per column. The `justify` mode spreads space between lines, not between paragraphs.
- **Platform:**
  - The PDF writer is not built yet (the data is exposed for it).
  - Tela devices are not wired to the engine yet; that is wave 2.
