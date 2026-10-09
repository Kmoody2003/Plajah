# Book to Tela upgrade, and open-format export

Status: built 2026-10-08. Pure services are tested (`npm run test:booktela`, 24 tests). The UI and the Lorea reader integration type-check but have **not been run in a browser** (see "Honest limits").

## What authors get

An author can bring an existing manuscript (docx, pdf, epub, md, txt through `services/documentImport.ts` and the EPUB reader), or take a book already on Plajah, and press **Upgrade to Tela**. In Lorea the book then renders through the full Tela stack: designed chapter openers, narration, motion, 3D, charts, margin notes, glossary, choose-your-path choices, live numbers, author commentary.

When the author (or a buyer who owns the book) **exports**, the result is a normal, DRM-free **EPUB 3**, **PDF**, **Markdown** or **HTML** file. Plajah ethos: you own the real file. Every Tela-only feature degrades to the best static form and the author sees what changes before downloading.

## Model

```
BookSource (chapters of HTML-lite)
   |  bookToTelaDoc()          opt-in, non-destructive
   v
TelaDoc  <-----------------  telaDocToBook()   (text edits sync back; ids stable)
   |  + BookTelaUpgrade { originalChapters snapshot, enhancements[] }
   v
ExportModel (format-neutral, static)  ->  EPUB reflow | EPUB fixed | PDF screen | PDF print | Markdown | HTML
```

* **One source of truth.** After an upgrade the Tela doc owns the prose. `telaDocToBook` projects it back to chapters for the classic reader, search and POD. The round trip is lossless for everything `bookToTelaDoc` writes (tested) and tolerant of what an author adds in Tela (missing chapters and Tela-only elements produce warnings, never silent loss).
* **Frames.** cover (MEDIA) · per chapter: opener (VECTOR, a publication-gallery BOOK template page when one is chosen, else a built-in opener) · page-sized WRITER frames (blocks carry stable ids `<chapter>:b<n>`) · MEDIA frames for inline figures (alt in `device.name`, caption in `frame.label`) · one frame per frame-level enhancement. Frame ids encode the chapter (`book:<id>:f:ch:<chapter>:w2`), see `parseFrameId`.
* **Canonical chapter HTML.** `normalizeChapterHtml` (sanitised, attribute-less tags, `<img src alt>` for figures, leading duplicate of the chapter title removed). Block meaning that Tela blocks cannot express (h3-h6, blockquote, hr, ordered lists) is carried in `semanticLabel`.
* **Reversible.** `createUpgrade` stores a verbatim copy of the original chapters (`originalChapters`, device-local IndexedDB, author-private, never published). `revertUpgrade` restores exactly that. The Tela doc is left on the device.
* **Preview.** `previewUpgrade` returns before/after counts, whether all text is preserved, SVG thumbnails of the chapter openers and the fidelity report.
* **Frame width is 480 Tela px** on purpose: Tela embeds scale a frame to the screen, so 480 keeps 17px body text near 14-17px on a phone.
* **Layout estimate.** Writer frame height is an estimate (`estimateBookWriterHeight`, errs tall); a wrong estimate means an inner scroll, not lost text.

Frames come from `services/journalist/articleTela.ts` helpers (`TemplateLike`, `fillTemplateObjects`), the same pattern the article engine uses. If that sibling file changes shape, `bookToTela.ts` is the only consumer here.

## Enhancement registry (`services/bookTela/enhancements.ts`)

Every enhancement declares `defaultFallback` and `allowedFallbacks`; the author can override within the allowed set. If an enhancement is incomplete (missing required config) or a strategy needs an input that is absent (a poster, alt text), `resolveStrategy` downgrades it and says why; if nothing is possible it is **omitted with a note** (export report + colophon + sidecar).

| Enhancement | Tela form | Default export fallback | Fidelity | What the exported reader gets |
|---|---|---|---|---|
| Narration (`AUDIO_SYNC`) | MEDIA audio frame | `qr-link` | DEGRADED | Full text, callout, QR code + link to the narrated edition. Audio is not embedded. |
| Embedded video (`VIDEO`) | MEDIA video frame | `static-snapshot` | DEGRADED | Poster image with alt text and caption, plus QR/link. No poster: QR/link only. |
| Motion illustration (`MOTION`, Lottie) | VECTOR frame with a LOTTIE object | `static-snapshot` | DEGRADED | The cached poster frame with alt text. No poster: alt text only; no alt either: omitted. |
| Interactive 3D (`INTERACTIVE_3D`) | MEDIA model frame | `static-snapshot` | DEGRADED | Still picture with alt text + QR/link to explore in 3D. |
| Chart (`CHART`) | native CHART device | `plain-text` | DEGRADED | Accessible data table with caption and alt text. |
| Illustrated chapter opener | IMAGE object in the opener frame | `alt-text` | **FULL** | A normal image with alt text at the chapter start. |
| Animated drop cap | chapter decoration | `alt-text` | DEGRADED | The large first letter, static. |
| Margin note (`READER_NOTE`) | reader-side | `footnote` | DEGRADED | EPUB 3 `noteref` + endnote with back link (PDF: numbered notes at chapter end; Markdown: `[^n]`). |
| Glossary popover | reader-side | `footnote` | DEGRADED | Endnote at the first use of the word + a Glossary section at the back. |
| Choose-your-path (`BRANCHING`) | reader-side | `internal-links` | DEGRADED | Each choice is an in-book link to its chapter (EPUB link, PDF link annotation, Markdown/HTML anchor). |
| Live-linked number (`LIVE_DATA`) | GRID device (Tela binding/formula) | `plain-text` | DEGRADED | The value frozen as of the export date, labelled as such. |
| Author commentary | reader-side track | `footnote` | DEGRADED | Endnotes labelled "Author commentary"; toggle per export. |

Fidelity is computed per Tela page (frame) and per format (`pageFidelity`, `instanceFidelity`): **FULL** (exports exactly), **DEGRADED** (with the list of what changes), **OMITTED**. Tela-only elements an author drops into the doc with no registry entry are flagged OMITTED. The UI shows the live badge in the upgrade panel and the export dialog.

## Export formats (`services/bookTela/export/`)

| Format | File | Notes |
|---|---|---|
| EPUB 3 reflowable | `epub.ts` | Text-led default. Real text in XHTML, `nav` + landmarks, `<aside epub:type>`-style endnotes with `noteref`/`backlink`, QR as SVG image with alt, no scripts, no remote resources, deterministic bytes, `mimetype` first/stored/no extra field. |
| EPUB 3 fixed layout | `epub.ts` | `rendition:layout=pre-paginated`, one XHTML page per designed page, viewport meta. Opener pages embed the designed opener as inline SVG (real text) and keep a hidden real `<h1>`. Text pages are chunked by a character budget (an estimate; see limits). |
| PDF screen | `pdf.ts` | RGB, outline (bookmarks), internal link annotations (contents, branching choices), URI links, real selectable text in an embedded font, metadata incl. language. 5.5 x 8.5 in. |
| PDF print | `pdf.ts` | Text-led books reuse `services/pod/interiorPdf.ts` **unchanged** (justified, widow/orphan control, recto chapters, padded page count). Picture books use the paged drawer at trim + 0.125 in bleed (top/bottom/outside), mirrored margins from `printSpec.interiorMargins`, TrimBox/BleedBox set, count padded by `paddedPageCount`, `preflight` messages surfaced. |
| Markdown | `plain.ts` | Zip: `book.md` (front matter, footnotes, GFM tables), `images/`, `plajah-export.json`. |
| HTML | `plain.ts` | Zip: self-contained `index.html` (skip link, reduced-motion CSS, no script), `images/`, sidecar. |
| DOCX | not built | Skipped on purpose: not cheap to do correctly, and EPUB/PDF/Markdown/HTML cover portability. |

Common to all: DRM-free; a **metadata sidecar** (`plajah-export.json`: identifiers, format, fidelity summary, omitted/degraded list, watermark tag, source version); a removable **"Exported from Plajah"** colophon page that lists anything that could not travel; EPUB metadata from `services/bookmeta` (title, subtitle, contributors with MARC roles, language, ISBN or stable `urn:uuid`, publisher, date, description, keywords, rights, series) and schema.org accessibility metadata that only claims what the exporter really produces (`structuralNavigation`, `tableOfContents`, `readingOrder`, `ARIA`, `displayTransformability` only for reflowable, `alternativeText` only when images exist, `noFlashingHazard`/`noMotionSimulationHazard`/`noSoundHazard`, an accessibility summary). Fonts are embedded only when the caller supplies them with an allow-listed licence (OFL, Apache-2.0, MIT, CC0, Ubuntu); anything else is refused with a warning.

### Validation
`buildEpub` runs `services/bookmeta/epub.ts#inspectEpub` (the Plajah epubcheck-style validator) on its own output **and** a well-formedness pass over every XHTML/OPF/SVG part (`xmlCheck.ts`). Any `error` finding sets `ok=false`; `exportBook` then returns no files. **epubcheck itself was not run**: there is no Java on the build machine (`java: command not found`) and it is not an npm dependency. The UI says so ("also run the official epubcheck before a strict store"). MuPDF (PyMuPDF) was used as an independent reader for a smoke test: it opened the reflowable and fixed EPUBs, and the PDF with text extraction and the outline.

### PDF: why drawn, not rasterised, not puppeteer
puppeteer is a devDependency (cannot ship, cannot run in the author's browser). Rasterising every page would make text unselectable and unsearchable. So pages are drawn with pdf-lib; designed openers go through a vector **subset**: rect, ellipse, line, path, text, image. Gradients become one flat colour, shadow/blur/blend are dropped, rotated text is drawn upright, template fonts are replaced by the book font (EB Garamond, OFL); each of these is reported as a warning. `PdfOptions.rasterize` is an optional hook (browser canvas) for SVG assets pdf-lib cannot embed. Not produced: tagged PDF, PDF/A, PDF/X, CMYK (printers convert from RGB).

## Lorea reader

* `BookReader` calls `useTelaEdition`. When `Album.bookTela.enabled` and a published version exists, it renders `TelaBookReader` (TelaEmbed per frame, lazy for long books) and otherwise falls through to the classic reader (flag off, no versions, bundle unreachable).
* **Version policy** (`chooseReaderMode`, tested): the author and readers of free books **follow the latest** published version; a buyer is **pinned** to the newest version created at or before their `ContentLicense.issuedAt`. This is derived, not stored, so no change to the purchase webhook is needed and a sold copy can never move (versions are write-once). If no version existed at purchase time the buyer stays on the classic text they bought.
* **Publishing** (`publishBookTela`): freezes a Tela version (`telaStore.publishTelaVersion`), copies a reader bundle to `albums/{id}/telaVersions/{versionId}` (`bundleJson` < 950 KB, no original-chapters snapshot) and stamps `Album.bookTela` including the small `versions[]` list.
* **Rules** (`firestore.rules`, **not deployed**): write-once, owner-only create; a PAID book's bundle is readable only by the author, an admin, or a holder of `users/{uid}/contentLicenses/book_{albumId}`; free books are world-readable.
* **Position**: same `lorea_pos_<id>` key and `{chapter, page}` shape as the classic reader; bookmarks key `plajah-bookmarks-<id>` is shared. **Highlights and notes** are new for the Tela reader (the classic reader keeps notes in memory only): stored on the device, painted with the CSS Custom Highlight API where the browser has it, always listed in the notes panel.
* **Accessibility**: prose is real DOM text (Writer blocks), openers are SVG text; margin notes, glossary, commentary and choices render as real HTML under their page (`<aside>`, `<details>`, buttons), not popovers; `prefers-reduced-motion` is honoured by the reader CSS and by TelaLottie/MotionTemplate themselves.
* **Offline**: published bundles are cached in IndexedDB per immutable `versionId` and read cache-first. Tela's own OPFS store is used for the author's working doc.

## Rights (`export/rights.ts`)

Author (or admin): everything, latest. Buyer of a paid book: only with a non-expired `PURCHASE`/`PPV` license whose `delivery` is `DOWNLOAD_OPEN`, from the version pinned at purchase, with the license's `watermarkTag` (or the caller-computed `watermarkTagFor` when the book watermark is on) written into EPUB (`plajah:watermark`), PDF info dictionary and the sidecar. Rentals, `PLAJAH_ONLY`, strangers and signed-out users are refused. Free books are exportable by non-authors only under an open licence (CC-*, CC0, PD).

**Choice: client-side gate, no `/api/books/export-token`.** It uses the same facts the reader already uses (`useOwnership`, `ContentLicense`, `watermarkTagFor`), and the real protection is the Firestore rule above that keeps a paid bundle away from non-owners. An entitled client already holds the full text, the product promise is DRM-free, and a token would add friction without protection. The watermark is a forensic stamp, not a lock.

## Mount points

* `components/bookSubmit/MyBooks.tsx`: "Tela / Export" on drafts, "Export" on submitted books.
* `components/BookAuthoringStudio.tsx`: Export menu gets "Tela edition" and "EPUB / PDF (open formats)" (pages become chapters; comic panels become pictures whose alt text carries captions and speech; text sync is one-way, Studio to Tela).
* `components/AlbumCreator.tsx`: an "Open" card above the chapter list when editing an existing BOOK.
* `components/BookReader.tsx`: the Tela reader, with a download button for owners and entitled buyers.
* UI: `components/bookTela/` (`UpgradeToTelaPanel`, `ExportDialog`, `BookTelaModal`, `FidelityBadge`, `TelaBookReader`, ...). Tokens `--pj-success/warning/danger` for fidelity; layout is a bottom sheet on phones.

## Tests (`npm run test:booktela`)

Round trip (chapters <-> Tela, edits, missing chapters, foreign frames), enhancement-frames-never-change-text, upgrade/preview/revert, adapters, fidelity classification for all 12 enhancements x 6 formats and per page, **fallback markup validity for four variants** (good, minimal, broken, forced-omit) in EPUB reflow + fixed, HTML and Markdown (no empty elements, no missing alt/src, no remote media, no scripts, no unresolved markers), reflowable and fixed EPUB through `inspectEpub` with zero findings, deterministic output, licence-safe fonts, PDF structure (outline, link annotations, metadata, RGB, trim/bleed boxes, mirrored margins, padding), POD interior reuse, Markdown/HTML/sidecar, export rights, buy-to-own pinning, bundle privacy, XML checker. `test:pod` (18) and `test:books` (49) still pass untouched.

## Honest limits

* **No browser run.** The panel, export dialog, mounts and Tela reader compile (`tsc -p tsconfig.booktela.json` is clean for these files; remaining errors are in unrelated files) and the Tela device renderers were exercised in node (SSR) on book docs, but nothing was clicked in a browser. Unverified: the Vite `?url` font imports in `components/bookTela/browserFonts.ts`, the CSS Custom Highlight API painting, selection capture on touch, `LazyFrame` virtualisation, the ?proxy fallback for CORS-blocked images.
* **epubcheck not run** (no Java). Our validator plus well-formedness is not a schema validation: no XHTML/OPF/SVG/CSS schema, no EPUB Accessibility conformance check. Do not claim WCAG/EPUB-A11y conformance from this output.
* **Fixed-layout text pagination is an estimate** (character budget per page). A very long paragraph can overflow a fixed page; reflowable is the safe choice for prose.
* **Narration sync:** cue points are stored but the reader does not do word-by-word highlighting yet. Narration plays as audio.
* **Studio text sync is one-way.** `StudioBook` pages are not 1:1 with chapters.
* **Tela docs are device-local** (OPFS). Publishing the edition needs the device where the book was upgraded. Embedded `data:` images inflate the bundle; > 900 KB is refused with a message.
* **`Album.bookTela.versions` update is an `arrayUnion`** on the album doc, so concurrent publishes from two devices are both kept.
* **Rules are edited but not deployed.** Until deployed, publishing a version will be denied by Firestore.
* **PDF vector subset** and **no tagged PDF** as described above. PDF print for text-led books is text-only (the POD interior pipeline), so pictures, tables and QR codes in that path are written as text. Books the exporter recommends as visual-led (pictures about as common as paragraphs) automatically use the paged drawer instead, which keeps them; `PdfOptions.usePodInterior=false` forces the paged drawer for any book.
* **Colour:** RGB only.
* Frames from `articleTela.ts` helpers: if the article agent changes `fillTemplateObjects`, opener templates may fill differently (built-in opener is unaffected).
