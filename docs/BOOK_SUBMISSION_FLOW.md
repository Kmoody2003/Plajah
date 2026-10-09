# Independent-author ebook submission flow

Entry point: **Dashboard > Publish a Book** (`components/BookCreatorWizard.tsx`). Script formats still open Script Studio. Book formats open `components/bookSubmit/BookSubmitFlow.tsx`. A "classic quick setup" checkbox keeps the old serial / per-chapter / fan-subscription wizard.

## The flow (8 steps, all clickable, all autosaved)

| Step | What the author does | Code |
|---|---|---|
| Manuscript | Drop `.epub .docx .pdf .md .txt` (100 MB). Title, author, language, word count and chapters are detected; chapters can be renamed, reordered, merged, split, excluded. EPUB covers are pulled out automatically. | `services/bookmeta/manuscript.ts`, `epub.ts`, `zip.ts`, reuses `services/documentImport.ts` |
| Cover | Upload, validate (JPG/PNG, <=50 MB, min 625x1000, ideal 1600x2560 ratio 1.6), crop to 1.6, thumbnail test, "Make a cover in Tela" (`plajah:openTela`, draft is flushed first). | `cover.ts`, `coverUpload.ts` |
| Details | Subtitle, series, edition, language, contributors with roles, pen name, description (HTML-lite, 4000), 7 keywords, 3 BISAC (searchable subset), optional Thema, reading age, mature flag, content warnings, dates. | `bisac.ts` |
| Rights | Public-domain declaration, ISBN (own, with checksum / Plajah ARK / none, with honest free-ISBN notes), copyright page generator, territories, AI disclosure (text / images / translation), licence (ARR / CC / CC0 / PD), accessibility readiness score. | `isbn.ts`, `copyright.ts`, `accessibility.ts` |
| Pricing | Multi-currency list price + suggested price, exact take-home table, free sample (first N chapters / %), pre-order, launch code, series bundle, DRM-free default + watermark toggle. Non-exclusive. | `pricing.ts` |
| Print | Placeholder; feature-detects `components/pod/PrintEditionStep.tsx` without a hard import. | `PrintStep.tsx` |
| Check | Preflight: score 0-100, blocking / warnings / notes with fix-its and "go fix" links; phone / tablet / e-ink preview. | `preflight.ts`, `DevicePreview.tsx` |
| Submit | Summary, two acknowledgements, submit, result (LIVE / IN_REVIEW / REJECTED with reasons), ONIX + CSV export. | `review.ts`, `routes/bookSubmissions.ts`, `export.ts` |

Dashboard **My Books** (`MyBooks.tsx`) lists drafts (local + cloud merged) and submissions with live status badges, a sales stub, and "Finish publishing".

## Storage and security

* Draft: IndexedDB (instant, offline) + Firestore `users/{uid}/bookDrafts/{id}` (metadata only) + Storage `users/{uid}/bookDrafts/{id}/manuscript.json` (chapter bodies; Firestore caps docs at 1 MiB). Newest copy wins on resume.
* Submission: `POST /api/books/submit` (`routes/bookSubmissions.ts`). The server re-runs the same pure preflight + review the browser showed and writes `bookSubmissions/{uid}_{draftId}`. Rules: owner or platform admin can read; **no client writes**, so a client cannot mark its own book LIVE. Rules are added to `firestore.rules` and **not deployed**.
* Status: `DRAFT` (local/cloud draft) > `IN_REVIEW` (public-domain, AI-generated text, mature, score < 70, price > 49.99: spot check) / `LIVE` (clean) / `REJECTED` (blocking errors or missing acknowledgements, with reasons). No human queue is required; `IN_REVIEW` rows are the admin-visible list.
* After LIVE the author taps **Finish publishing**; the existing `AlbumCreator` receives `toAlbumPartial()` (`albumMap.ts`) and creates the album the reader/store already consume. `Album.bookDistribution` carries delivery / watermark / ISBN / AI disclosure; `BookReader` passes delivery to `BuyToOwn` (DRM-free default, never an upsell).

## Money

Platform cut on direct sales is **5%**. Card processing is shown as an **estimate** (2.9% + 0.30 USD, a commonly published US card rate; real fees vary and live in Stripe). Take-home = price - 5% - estimated processing. Authors keep their rights and can sell elsewhere (non-exclusive).

## Preflight checks and which platform they mirror

| Check | Mirrors |
|---|---|
| Empty / too short manuscript; placeholder text (`Lorem ipsum`, `[Insert`, TBD/TK/XXX, template text) | KDP and Apple content-quality rejections |
| Duplicate-paragraph ratio (warn >12%, block >40%) | KDP duplicate / low-quality content |
| Project Gutenberg boilerplate; well-known public-domain title not declared; PD with no added value | KDP "differentiated content", Apple / Kobo PD policy, PG trademark licence |
| Missing title page / copyright page; no TOC notice | Apple Books, IngramSpark |
| Title: missing, >200 chars, ALL CAPS, promotional words ("bestseller", "free", "#1") | KDP, Apple, Kobo metadata guidelines |
| Description: empty, >4000 chars, disallowed HTML, keyword stuffing, shouting, URLs, unverifiable claims | Ingram 4000 limit, KDP metadata guidelines |
| Keywords: max 7, 50 chars each, no store / promo terms, duplicates | KDP keyword policy |
| Categories: >=1, max 3, BISAC shape | KDP / Ingram / D2D |
| Adult flag vs reading age; dates out of order; no territories; invalid ISBN check digit | KDP adult content, ONIX, every store (bad ISBNs bounce) |
| Cover: missing, <625x1000 (block), <1600x2560 (warn), ratio off 1.6, not JPG/PNG, >50 MB | KDP (and Apple 1400 px width) |
| Price: < 0.99 USD, > 200, none; pre-order date missing / past / > 1 year; promo code / % | KDP price band, Stripe economics |
| EPUB (below) | epubcheck and store intake |
| Accessibility score < 50 | EPUB Accessibility 1.1 / EU Accessibility Act |

### EPUB validator (`epub.ts`, "epubcheck-lite")

mimetype first / stored / exact / no extra field; `container.xml` and rootfile; OPF version, `unique-identifier` resolving to a non-empty `dc:identifier`, `dc:title`, `dc:language`, `dcterms:modified` (EPUB 3); manifest ids unique, every manifest file exists, unlisted files; spine non-empty and every itemref in the manifest, XHTML or fallback; EPUB 3 `nav` (exactly one, with a `toc` nav) or EPUB 2 NCX; broken `<img>` targets, remote images, oversized images (3 MB warn, 10 MB block), embedded fonts, undeclared scripts, empty documents, DRM (`encryption.xml` other than font obfuscation), missing cover, alt-text coverage. **It is not epubcheck**: no XHTML / CSS / SVG schema validation. Run the official epubcheck for strict pipelines.

## Portability (`export.ts`)

`toOnix()` writes minimal ONIX 3.0 (reference tags; identifiers, title / series / contributors with ONIX roles, language, word count, BISAC + Thema + keywords, reading-age range, description, cover link, dates, copyright, sales rights, DRM flag, prices). Not validated against the ONIX XSD. `toDistributionCsv()` writes one row with 54 columns grouped like the KDP / Ingram / D2D / Smashwords / Kobo / Apple forms; those platforms use web forms or templates that change, so map by meaning.

## Tests

`npm run test:books` (EPUB validator, ISBN, preflight + review, pricing / manuscript / BISAC / cover / copyright / accessibility / export / drafts / album mapping).
