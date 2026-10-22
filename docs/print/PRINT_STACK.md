# Tela print stack and periodicals

Tela can now take a document from a home printer to a commercial press or a wide-format shop. The same layer lets students and professionals run real numbered publications that are laid out in Tela, printed, and distributed on Lorea.

## Print production (`services/print/`)

| Module | What it does |
|---|---|
| `types.ts` | Shared model in inches. `DocPrintSpec` is stored on `TelaDoc.print`, alongside the neutral `PrintJob` that preflight reads. |
| `products.ts` | Product catalog: books, magazines, newspapers, zines, comics, manga, flyers, posters, cards, brochures, stickers, banners, and vehicle and object wraps. |
| `conditions.ts` | Press conditions: home RGB, FOGRA39, FOGRA52, GRACoL 2013, SWOP, ISOnewspaper26 and wide format. Each carries a TAC, image resolution targets and minimum stroke and reverse-text sizes. Also holds the paper calipers. |
| `preflight.ts` | Finds image resolution problems, RGB in CMYK jobs, text outside the safe area or cut by the trim, rich-black small type, hairlines, reversed type, missing bleed, ink over the limit, page multiples and range, page size and unknown spot colours. |
| `binding.ts` | Spine width from the paper caliper, cover spreads (perfect, case, jacket, saddle) and page-count rules. |
| `imposition.ts` | Saddle-stitch printer spreads, creep, perfect-bound signatures, n-up ganging and home-booklet order. |
| `marks.ts` | Crop, bleed and registration marks, a colour bar and the slug. |
| `wrap.ts` | Vehicle wraps from measured dimensions: surfaces, hazard zones, tiling into roll-width panels with overlaps and seams snapped to door gaps, plus wrap preflight. Also object dielines: cylinder labels, cone sleeves, tuck-end boxes and stickers. |
| `pressPdf.ts` | Writes the press PDF. For CMYK it separates with the condition's GCR and TAC, prints pure black as K only and flattens transparency. It sets the trim, bleed and media boxes, draws marks in registration colour, and adds the OutputIntent and PDF/X-1a:2003 keys. Dielines go in as CutContour and Crease Separation spots with overprint. It also does home-booklet imposition and writes full-size wrap panel PDFs. Text and shapes go on top of the raster as real vector (live text in embedded fonts, paths). |
| `vector.ts` | The vector layer model: words (position, baseline, width, size, font key, colour, letter spacing) and shapes (absolute paths, fill, stroke, dashes). |
| `vectorPage.ts` | Browser only. Splits a rendered page into the vector layer and a raster underlay (images and effects). HTML words are measured with Ranges, with the baseline from a probe in the same font; SVG `<text>` lines and SVG shapes go through their CTM. Whatever can't be exact vector stays raster and is counted by reason. |
| `fontSource.ts` | Embeddable fonts: Google Fonts TrueType fetched through `/api/proxy` (a server fetch gets `.ttf`; browsers get WOFF2, which fontkit can't subset). System families are replaced by an open family of the same class. |
| `svgPath.ts` | The full SVG path grammar reduced to absolute M/L/C/Z (arcs and quadratics become cubics), plus transforms and shape helpers. |
| `domPrintJob.ts` | Browser only. Measures a rendered Tela page into a `JobPage`, rasterises pages and regions at press resolution, samples the ink coverage and builds the soft proof. |

**UI:** Tela → File → *Prepress & print production…* opens `components/tela/print/PrepressPanel.tsx`.
- Its *Wraps & dielines* tab is `WrapDesigner.tsx`.
- Guides that land on a board are labelled `Non-printing guide`. `renderFrameForPrint` drops them, so they never print.

### Exports
- **Press PDF:** CMYK, bleed, marks, PDF/X-1a structure.
- **Digital/POD PDF:** RGB with bleed and TrimBox.
- **Home: pages** or **Home: booklet:** fold and staple, duplex on the short edge.
- **Wrap panel PDF:** one page per panel at real size, at 72–150 ppi.

### Honest limits
- **Text and shapes are vector; images and effects are raster.** With *Vector text & shapes* on (the default), words become live text in embedded, subset-tagged fonts and SVG shapes become paths. What stays raster, and why, is listed in the export notes: transparency, gradients and patterns, filters, clips, masks, blend modes, rotated or transformed text, small caps, text shadows, words broken across lines, glyphs a font lacks, and anything an image may paint over. HTML box backgrounds and borders stay in the raster underlay. Underlines disappear from vector words (the decoration is hidden with the raster text).
- **Fonts.** Google fonts embed as the same family and weight. System fonts (Georgia, Arial, Segoe UI…) can't be embedded and are set in Source Serif 4, Inter or JetBrains Mono at the browser's positions; preflight says so up front. Each word is scaled horizontally (`Tz`) to the browser's measured width, so line endings never move. fontkit's subsetter drops glyph outlines for some fonts (Inter): every subset is dry-run checked, and fonts that fail are embedded whole and noted.
- **Fonts need the app's proxy.** Without `/api/proxy` (offline), text keeps rendering, but as raster.
- **CMYK is approximate.** It comes from Tela's printer model (`services/tela/raster/color.ts`), not an ICC profile conversion.
- **PDF/X is structure only, not certified.** The OutputIntent references the registered condition by name, and no profile is embedded. Run the printer's preflight, or Acrobat or PitStop, before a long run.
- **Spine, creep and hardcover dimensions are planning estimates.** The printer's template is final; `services/pod/printSpec.ts` holds the Lulu, KDP and Ingram figures.
- **Vehicle surface sizes are ratios of the measured vehicle, not OEM data.** The shop measures every panel.
- **Condition TAC values and registry identifiers have `verified: false`** until someone checks them against the published characterisations.

## Periodicals (`services/publication/`)

- **Model:**
  - A `Periodical` is a journalist `Publication` plus masthead fields: kind, tier, frequency, staff roles, imprint, ISSN, class and adviser.
  - Issues live in `periodicalIssues`. Each has stories, a flatplan, approvals and the published Tela bundle.
  - Follows live in `publicationFollows`.
- **`issueLogic.ts`** (pure, tested):
  - It validates the ISSN check digit and auto-builds the flatplan.
  - `issueReadiness` covers student rules (stories approved from a teacher account, and the adviser's account approves the issue) and pro rules (publisher, address, contact, ISSN, corrections policy, editor-in-chief sign-off).
  - `buildIssueTelaDoc` lays the issue out as a Tela newspaper or magazine: nameplate, folio, lead story with deck and columns, secondary stories with jumps, inside section pages, and a staff box. The print spec and issue stamp are already attached.
- **`periodicalStore.ts`** handles Firestore: queries the rules can prove, follows, the adviser approval, and publishing the digital edition (`publishTelaVersion`, with the bundle stored on the issue).
- **UI:**
  - `components/publication/PublicationStudio.tsx`: student tier in Journalism School → *Our publication*; pro tier from Journalist Desk → *Publications* → Publication Studio.
  - `IssueReader.tsx`: view `ISSUE_READER`, opened by `plajah:openIssue`.
  - `PeriodicalShelf.tsx`: Lorea library and Newsstand.
- **Rules** (`firestore.rules`, `periodicalIssues`):
  - Staff edit the issue.
  - Only the adviser's account writes `adviserApproval`.
  - A student issue cannot become `published` without that approval.
  - **These rules are not deployed yet.** Deploy them through CI from master.

## Verify
- Run the tests: `npx tsx --test tests/printPress.test.ts tests/printWrap.test.ts tests/printImposition.test.ts tests/publicationIssue.test.ts`.
- Typecheck with `tsconfig.print.json`, `tsconfig.publication.json` and `tsconfig.tela-print.json`. TelaView has pre-existing errors that are unrelated to this work.
- Lab: start `journalism-lab` from `.claude/launch.json`, then open `http://127.0.0.1:3145/print-lab.html` for Prepress on a sample document. The wraps tab creates a board with the panel map.
