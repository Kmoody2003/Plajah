# Living books: the Tela document, the bundle, publishing, export

Companion to `docs/LIVING_BOOKS.md` (the idea and the six editions) and `docs/SHOWCASE_BOOKS.md` (the stories). This file is the plumbing: how a showcase book becomes a Tela document, how that document reaches the Lorea reader, and how it still exports as a flat book. Built 2026-10-09.

## The pieces

| Piece | File |
|---|---|
| Showcase book -> Tela doc, ids, labels, audits | `services/showcase/livingDoc.ts` |
| Large-bundle storage (gzip in Cloud Storage + manifest), verification, loader | `services/bookTela/bundleStorage.ts`, `services/bookTela/upgradeStore.ts#loadReaderBundle` |
| Export report text for the living layer | `services/bookTela/livingNotes.ts` |
| Publisher (dry run by default) | `scripts/showcase/publishLiving.ts` (`npm run showcase:living`) |
| Flat page exporter | `scripts/showcase/exportPages.ts` (`npm run showcase:pages`) |
| What can a behaviour target on a page? | `scripts/showcase/listObjects.ts` |
| Tests | `tests/showcaseLive.test.ts` (`npm run test:showcaselive`) |

## 1. The Tela document

`buildShowcaseTelaDoc(bookId, living?)` is synchronous and pure. `loadShowcaseTelaDoc(bookId)` also imports `data/showcase/living/<book-id>.ts` when that file exists (default export, or any export shaped like a `LivingBook`; a missing file is fine, a file that fails to load is an error).

- **One frame per spread**, `SCREEN`/`FREE`, size from the publication template (768x960, 1024x768 or 816x816), hosting one `VECTOR` device. Frame id `book:showcase_<id>:f:ch:pNN:opener`, device id `book:showcase_<id>:ch:pNN:opener`. Every spread is its own "chapter" `pNN` so the reader's table of contents, saved position, page turns and the exporters treat a spread as a page. Frame label: the book title on the cover, `Page N`, `Back cover`.
- **Objects are exactly what the registered designer draws** (`instantiatePublicationPage(template, pageType, index)`, as the gallery does). A test compares every object to the designer's output; only `id` and generic `objectLabel`s may differ.
- **Stable ids.** The designers mint `rect_<time>_<counter>` ids that change on every run. The builder replaces them with `p<NN>_<label-slug>_<k>`: page, label, and the k-th object with that label on that page (`p03_eye_2`). Deterministic across builds (a test builds twice and compares the JSON). An id drifts only if a designer inserts an object with the same label earlier on the same page. Prefer `{ label }`, `{ group }` or `{ role }` targets for things a designer may redraw; use `{ id }` for a specific one-off object.
- **Labels audit.** Specific designer labels (`Eye`, `Window`, `Planet shade`, `Star`, `Path`) and every `templateRole` are untouched. Missing or generic labels (`Ellipse`, `rect`, `poly`, `Text`, ...) get a meaningful, stable label from a mapping layer in the builder only: size + kind + where on the page (`Small disc (top right)`), or `Text "Boo!"`. No look or geometry changes. Audit today: no designer object is unlabeled; the only generic labels are `Ellipse` (orbit-party 150, little-fox-big-trees 18, below-the-blue 4) and `Vector` (below-the-blue 1), all renamed; after mapping 0 are generic and 0 ids duplicate. `npx tsx scripts/showcase/listObjects.ts <book> --audit` prints it, `--labels` and `--page=N` show what a target sees.
- **Titles of fixed pages.** The designers letter titles one glyph per `HEADLINE` object, so a "title from HEADLINE" rule yields "M". The device carries `objectLabel: 'fixed-page'` (`FIXED_PAGE_MARK`) and `telaDocToBook` / `buildExportModel` take the title from the frame label instead.
- **Metadata** is `TelaDoc.publication` (new optional field in `types.ts`: author, `CC BY 4.0`, ages, language, AI disclosure, template id, page count) and `bundle.book.metadata` (`BookMetadata`: contributors, audience, `license: 'CC-BY'`, `ai`, accessibility summary).
- **Living layer** `TelaDoc.living` is the book's `LivingBook`, normalised to exactly one `LivingPage` per spread (missing pages become empty). Without a living file every page is empty, which is the flat book.
- `checkLivingTargets(doc)` returns every behaviour target, group entry or page number that matches nothing on the doc, plus a wrong `bookId`. The publisher refuses to publish a book with problems. Run it in phase-2 tests: it is how a rebuild is proven not to have broken a behaviour.
- Doc timestamps are a fixed constant (`SHOWCASE_DOC_EPOCH`), so two builds are byte-identical.

## 2. The reader bundle and where it lives

The classic Book-to-Tela path stores `BookTelaBundle` inline as `albums/{id}/telaVersions/{versionId}.bundleJson` (limit 900 KB in `MAX_BUNDLE_BYTES`, and 950 KB in `firestore.rules`). A living picture book is 0.6-3.9 MB of JSON (50-250 objects per page), so:

```
Cloud Storage  books/<owner>/showcase/<id>/living/<versionId>.json.gz     gzip(JSON.stringify(BookTelaBundle)), public tokenized URL
Firestore      albums/<album>/telaVersions/<versionId>                    manifest, write-once (below)
Firestore      albums/<album>.bookTela                                    { enabled, edition:'living', hasLiving, docId, versionId, upgradedAt,
                                                                            layoutPreference:'FIXED', versions[], pageTurn:{style:'flip'}, bundleUrl }
```

Manifest (`TelaVersionManifest`, about 3 KB):

```
format 'plajah.living-bundle/1' | versionId | bookId (= album id) | ownerId | createdAt | label
bundleUrl | encoding 'gzip' | byteLength | sha256   (of the stored gzip bytes)
rawByteLength | rawSha256                           (of the JSON; lets the publisher prove "same content")
pageCount | hasLiving | flatPages[]                 (the album's flat image URLs, informational)
```

Limits (`bundleStorage.ts`): stored object at most 8,000,000 bytes, JSON at most 48,000,000 bytes. Measured sizes (empty living layer): moon-blanket 3.9 MB -> 907 KB, below-the-blue 2.2 MB -> 467 KB, orbit-party 799 KB -> 179 KB, golden-thread 797 KB -> 148 KB, little-fox 640 KB -> 132 KB, beep-block-street 915 KB -> 100 KB. Behaviours, scores and narration add little.

**versionId** is `living-` + the first 12 hex of SHA-256 over `{ doc, coverUrl, LIVING_BUNDLE_BUILD }`: same content, same id, so publishing is idempotent and versions are naturally write-once. If the bundle format changes for the same doc, bump `LIVING_BUNDLE_BUILD` in `publishLiving.ts`. `bundle.createdAt` is the time of the first publish of that version and is reused afterwards.

### Reader behaviour (`loadReaderBundle`)
1. IndexedDB cache first (key `albumId:versionId`, immutable).
2. Read the version doc. Inline `bundleJson` (classic) is parsed as before. A manifest: check it is well-formed and that `bundleUrl` is https on `firebasestorage.googleapis.com` / `storage.googleapis.com` / `*.firebasestorage.app`; fetch it; check `byteLength` and **SHA-256**; gunzip (`DecompressionStream`); parse; check the bundle's `bookId` equals the album id and `versionId` equals the manifest's; cache the JSON.
3. **Any failure returns null** (offline, HTTP error, hash mismatch, CORS, a browser without `DecompressionStream` or `crypto.subtle`), `useTelaEdition` resolves to `classic`, and the reader opens the album's flat pages from `bookChapters`. The tests flip a byte, truncate, 404, throw, swap the book, and point at a foreign host.
4. `useTelaEdition`/`chooseReaderMode` are unchanged: free books follow the latest version, owners too, a buyer of a paid book is pinned to the newest version at or before purchase. Versions are write-once; the showcase books are free CC BY, so anyone reads the living edition.

### Rules (`firestore.rules`): NOT edited here, needs a decision
The current `telaVersions` create rule demands `bundleJson` as a string under 950 KB. The publisher writes with the admin token, which bypasses rules, so it works today. If an author's client (not the script) should ever publish a manifest, the create rule needs an alternative branch like:

```
|| (request.resource.data.format == 'plajah.living-bundle/1' && request.resource.data.bundleUrl is string
    && request.resource.data.sha256 is string && request.resource.data.byteLength < 8000000
    && !(get(/databases/$(database)/documents/albums/$(albumId)).data.get('price', 0) > 0))
```

Free books only: the storage URL is a public tokenized link, so a paid book's text must never go there. The `read` rule needs no change (world-readable when price is 0). I tried to make this edit and the environment denied the write to `firestore.rules`, so it is left for you.

## 3. Publishing: `scripts/showcase/publishLiving.ts`

```
npx tsx scripts/showcase/publishLiving.ts                          DRY RUN (default): builds each bundle, checks size + hash, reads the albums, writes nothing
npx tsx scripts/showcase/publishLiving.ts --only=moon-blanket --publish
npx tsx scripts/showcase/publishLiving.ts --unpublish-living       removes Album.bookTela (only where edition == 'living'); readers fall back to the flat pages
npx tsx scripts/showcase/publishLiving.ts --only=<id> --test-album [--publish]    proof into a temporary private album showcase_zz_test_<id>
npx tsx scripts/showcase/publishLiving.ts --only=<id> --delete-test-album         removes that album, its version docs and storage objects (only ever showcase_zz_test_*)
```

- Auth: the signed-in gcloud user, like `publishBooks.ts`. Writes go to production.
- `--publish` does: upload the gzip object -> write the manifest -> patch `bookTela` on the album (merging the existing `versions`) -> **verify**: re-read the album, flat pages untouched, manifest well-formed, fetch `bundleUrl`, hash matches, gunzip + parse + identity OK, downloaded JSON byte-identical to what was built, and `chooseReaderMode` picks the version for an anonymous reader. Any failed check exits 1. It also reports an anonymous (rules-enforced) read of the version doc as information.
- **Never touches** `bookChapters`, `coverImage`, `price`, `license`. The flat pages stay as the export version and the fallback.
- A book with **no living data** is not published for real (`--allow-empty-living` overrides). Phase 2 adds `data/showcase/living/<id>.ts`; then `--publish`. Until then the album has no `bookTela` and readers see the flat comic-style reader exactly as before.
- Idempotent: second run says "up to date" and writes nothing. A changed doc produces a new versionId (new manifest + object); old versions stay (write-once), the newest wins for free books.
- `Album.bookTela` gained `edition?: 'standard' | 'living'`, `hasLiving?`, `bundleUrl?` (types.ts); `pageTurn.style = 'flip'` is the picture-book default.
- Unpublish leaves bundles and version docs in place (cheap, immutable). Re-publishing the same content re-uses them.

## 4. Flat export from the doc

`npm run showcase:pages` (`scripts/showcase/exportPages.ts`) renders every page of every book from `buildShowcaseTelaDoc` -> `objectsToSvg` in system Chrome (puppeteer, one page at a time, 2x) to `.tela-proofs/showcase-pages/<book-id>/page-NN.png`, the files `publishBooks.ts` uploads. `-- --only=<ids>`, `-- --out=<dir>`, and **`-- --check`**: render to a temp folder and pixel-compare with the files that exist (a pixel differs when any channel is off by more than 24; a page matches when at most 1% of pixels differ), writing nothing. Result on 2026-10-09: all 6 books / 70 pages match (worst page 0.038% of pixels). Fonts come from Google Fonts, so it needs network. Sizes: 1536x1920, 2048x1536 (x4), 1632x1632.

## 5. Export of a living book

The EPUB / PDF / Markdown / HTML exporters never read `doc.living`: they draw each page's vector objects at rest. Verified for the fixed-layout EPUB and PDF (screen). Nothing of the living layer appears in the output (test greps the files). The fidelity report lists what was dropped: `ExportReport.readerOnly` = the page-turn note plus lines from `livingReaderOnlyNotes(doc.living)`, e.g. "Touch and pointer interactions are reader-only (2 tap, 1 drag...)", drag and tilt, idle animations, music and sound (cue / effect / ambience counts), read-aloud narration, goals, haptics. `fidelityFor(...).readerOnly` carries the same lines to `ExportDialog` / `FidelityReport`, which now print them. A flat-only book reports exactly what it did before. Pages stay `FULL`: the flat page is the page.

How a showcase doc maps onto the exporters: each spread is a chapter `pNN` whose opener frame is the page, so fixed EPUB gives one XHTML page per spread with the page embedded as inline SVG (real, selectable text) and a hidden `<h1>`; the recommended layout is `FIXED`; the contents list is Cover / Page 2 ... / Back cover. Set `bundle.book.coverUrl` (the publisher passes the flat cover) so the EPUB gets a real cover; without one the exporter generates a typographic cover (and, before this change, produced an invalid package from a duplicate manifest id `cover`, fixed in `epub.ts`).

## 6. Honest limits and open risks

- **No browser run.** Nothing here was opened in the Lorea reader in a browser. Proven in node: doc, bundle round trip, manifest, loader fallbacks, export, and against production: upload, manifest, `bookTela`, fetch of the bundle by URL (CORS `*` on the bucket confirmed), hash check, a real EPUB export using the real webp cover URL. Unproven: `TelaBookReader` rendering a 250-object `VECTOR` page per frame at speed on a phone (2,000+ SVG nodes with filters; the moon-blanket page took ~5 s to screenshot in headless Chrome), `DecompressionStream` on older Safari (falls back to flat), IndexedDB quota for a 4 MB cached JSON.
- **Firestore rules for `telaVersions` are not deployed** (BOOK_TELA_UPGRADE.md) and the manifest branch above is not written. An anonymous read of a version doc returned HTTP 403 in the proof run, so until the rules are deployed a signed-out reader cannot read the manifest and falls back to the flat pages. Deploying the rules is a prerequisite for the living edition to be seen by anyone but the owner.
- A bundle is public to anyone holding its tokenized URL. Fine for free CC BY books; never use this path for paid text (the proposed rule refuses it).
- Ids can drift if a designer inserts a same-labelled object earlier on a page. `checkLivingTargets` catches the result.
- The PDF exporter shrinks a page to 60% of the text area height (it is the chapter-opener drawer), so a PDF of a picture book is smaller pages than the EPUB. Not changed here.
- `epubcheck` was not run (no Java); `inspectEpub` and the XML well-formedness pass were.
