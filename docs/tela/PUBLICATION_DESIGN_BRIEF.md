# Tela Publication Design Brief

Companion to `TEMPLATE_DESIGN_BRIEF.md` (read it first — §1 kit, §2 hard rules, §3 what "designed" means all apply). This brief covers the multi-page **publication systems**: email campaigns, newsletters, magazines, children's books, photo books, comics & manga.

## Contract

`services/telaPublicationTemplates.ts` holds the metadata (`TELA_PUBLICATION_TEMPLATES`: id, name, category, palette `[paper, ink, accent, secondary]`, fontMood, width/height, `pages: TelaPublicationPageType[]`). Do **not** edit it.

You write designers in `services/tela/designs/publications/<group>.ts`:

```ts
import type { PublicationDesigner, PublicationCtx } from './types';
export const DESIGNS: Record<string /* template id */, PublicationDesigner> = { 'mag-culture': ctx => { switch (ctx.pageType) { case 'COVER': …; case 'CONTENTS': …; … } } };
export const LESSONS: Record<string /* template id */, DesignLesson> = { 'mag-culture': { principle, history, tryThis, interestTag, related } };
```

`PublicationCtx` = `{ template, pageType, pageIndex, pageCount, W, H, fr (7 % margin frame — build your own with frame() if the design wants different margins), paper, ink, accent, secondary, seed }`. One designer per template handles **every page type in that template's `pages` list** (see the list in telaPublicationTemplates.ts). Share page-type helpers inside your group file, but parameterise them by a per-template *voice* object (type pairing, grid, masthead treatment, margin, ornament, image ratio) so no two templates produce the same geometry. The lint rejects identical geometry across templates.

Pages are sequential: `pageIndex` lets ARTICLE 1 and ARTICLE 2 differ (alternate the image column, vary the pull-quote position, change the folio side — real magazines never repeat a spread exactly). Left/right pages: even index = verso (folio left), odd = recto (folio right).

Copy: `copy.*` voices per template (culture → 'culture', mag-music → 'music', kids → 'kids', photo → 'photo', comics → 'comic', community/school/faith newsletters → 'community'/'education'/'faith', business → 'business', email → the product/event voice fits 'event'/'personal'). Titles come from `template.name` where the design wants a masthead.

Verify per group (must print `lint clean`):
```
cd /c/Users/Kenne/plajah && npx tsx scripts/telaGallery.ts "%TEMP%/pub-<group>.html" pub
```
(`pub` renders every publication; templates without a designer still fall back to the legacy composer and will show errors — only YOUR templates must be clean. Filter with the third argument: `pub email-product,email-event,…` to see just yours.)

## What a publication system must have

- **Cover**: a masthead treatment that is *the* identity (not just the name at 90 px): stacked/boxed/bleeding/vertical/serif-with-hairlines/knock-out. Cover lines that follow a grid. A dominant image slot with a considered crop ratio. Barcode/issue slug/price as a small typographic block.
- **Contents**: numbers + titles + descriptions with leaders or a grid of thumbnails; a running-head system starts here.
- **Editor's note**: a letter — measure ≈ 55–65 chars, drop cap or signature, small portrait.
- **Feature/Section opener**: the poster moment inside the book — big type, big image, deck, byline block.
- **Article**: 2–3 columns at 10.5–12 px, subheads, pull quote, captioned image, folio + running head. Vary between article 1 and 2.
- **Interview**: Q/A with Q in bold or in the accent, hanging indents.
- **Photo essay / grid / full bleed / captioned photo / timeline**: real image sequencing — a hero, supporting details, breathing room; captions in a caption column or beneath; plates numbered.
- **Story spread (children)**: picture-first, text in a generous serif at 16–22 px with read-aloud line breaks, a quiet page with a single line.
- **Comic / manga page**: panels with real gutters (10–14 px), borders as strokes (2–3 px), balloons with tails (`balloonPath`), caption boxes, SFX in a display face, a splash page, page numbers; manga = RTL reading cue and right-side folio. Webtoon = vertical 800×2400 with breathing gaps.
- **Back cover**: colophon (credits, contact, issue), a closing image or a single line, and the masthead small.
- **Email pages** (800×1400 SCREEN): preheader line, logo/wordmark block, hero image, headline, body at 16–18 px (screen!), ONE primary button (rect rx + label), secondary links, footer with address/unsubscribe. Email is single column with 24–32 px padding; type larger than print.

## Per-template direction

### Group campaigns (file `campaigns.ts`) — EMAIL BLAST (800×1400) + NEWSLETTER (816×1056)
- **email-product** Product Drop — dark ground, product hero full-width with a soft gradient floor, giant price/product name in `archivo` 900, one magenta button, three proof bullets with tiny icons (circles), footer. Voice: personal/event.
- **email-event** Event Invitation — cinematic: black-purple gradient, date in enormous `bodoni` italic numerals, small caps details, a gold RSVP button, a venue map slot. Voice: event.
- **email-editorial** Editorial Dispatch — letter-like: cream, `fraunces` display, `lora` body at 17 px, a hairline rule, a pull quote, small author portrait circle, muted button. Voice: editorial.
- **email-course** Course Launch — light blue ground, `manrope` display, curriculum as a numbered module list with a progress rail (rects), teacher portrait slot, orange enroll button, outcomes grid 2×2. Voice: education.
- **email-nonprofit** Impact Appeal — warm cream, `playfair` headline, story image, three impact figures at 44 px `libreBaskerville` with labels, a red "Give" button, a respectful footer. Voice: community.
- **email-digest** Weekly Digest — dark navy, `inter`, a numbered list of 5 stories each with a small image slot + kicker + headline + one-line summary, dividers, links in teal. Voice: editorial/culture.
- **news-community** Community Current — friendly 3-column front with a hand-drawn-feeling masthead (`baloo`), notices sidebar in a tinted box, dates list, `nunito` body. Voice: community.
- **news-creator** Creator Notes — dark cover, `syne` masthead, a studio photo strip, a personal letter page, project cards. Voice: personal.
- **news-school** School Chronicle — blue/yellow, `lexend` throughout, a "This month" calendar block, student-work photo grid with captions, recognition list with stars (`starPath`). Voice: education.
- **news-culture** Culture Letter — restrained: `cormorant` masthead, hairlines, single-column essay with marginal notes, a review with a rating rule of dots. Voice: culture.
- **news-business** Field Report — `inter` + `ibmPlexMono` figures, a signals table (hairline grid), a bar chart drawn from rects, an analysis column. Voice: business.
- **news-faith** Gathered — `ebGaramond`, a calm cream, a reflection page with a drop cap, a service calendar block, a photo essay page with generous white. Voice: faith.

### Group editorial (file `editorial.ts`) — MAGAZINE (816×1056), 10 pages each
- **mag-culture** New Culture Review — masthead knocked out of a full-bleed image slot, magenta + cyan cover lines, `unbounded` display, `spectral` body; features with huge numerals. Voice: culture.
- **mag-fashion** Atelier Quarterly — `bodoni` masthead hairline-thin at the top, restraint: one cover line, white space, body `karla` 10.5 px in 2 wide columns, captions tiny. Voice: fashion.
- **mag-music** Frequency — poster-scale: `bebas` masthead vertically down the left edge, violet/red, feature openers with rotated kicker, `archivo` body 3 columns. Voice: music.
- **mag-travel** Elsewhere — `fraunces` masthead, map-like dotted routes (dotField lines), full-bleed openers, field-note captions in `courierPrime`, a timeline page with milestones. Voice: travel.
- **mag-science** Observable — `manrope` + `ibmPlexMono`, figure numbering, diagram slots with labelled callouts (lines + small labels), evidence sidebars, deep-teal openers. Voice: science.
- **mag-independent** Small Press — tactile: kraft paper tone, `specialElite` + `playfair`, collage-tilted image slots (rotation ±3), essay pages with wide margins and marginal notes, a portfolio grid. Voice: editorial.

### Group books (file `books.ts`) — CHILDREN'S BOOK + PHOTO BOOK (1024×768 landscape)
- **story-forest** The Lantern Forest — dark green woods, warm lantern circles (ellipses with radial gradient), `baloo` title, `lora` read-aloud text 20 px in a soft cream panel with rounded corners; quiet spread = one line, one small lantern. Voice: kids.
- **story-space** Little Orbit — navy with a dot starfield, `fredoka` title, big friendly circles (planets) as image slots, text in white 20 px; activity page: connect-the-stars dots. Voice: kids.
- **story-ocean** Below the Blue — layered wave bands (wavePath) darkening downward, `nunito` text, bubbles; quiet spread deep and nearly empty. Voice: kids.
- **story-bedtime** The Moon's Pocket — indigo, a crescent (two ellipses), `cormorant` text 22 px low on the page, very few objects, a dotted path. Voice: kids.
- **story-city** My Block Sings — collage energy: tilted colour blocks as buildings, window grids (checker), `bangers` title, speech-bubble captions, `comicNeue` text. Voice: kids.
- **story-folktale** The Golden Thread — ornamental frame pages (frieze of leaf/star), `cinzel` chapter heads, `ebGaramond` text, a golden thread (sineOpenPath stroke) running across spreads. Voice: kids.
- **photo-family** Family Archive — warm cream, `lora` captions, mixed grids (one big + two small), dates in `courierPrime`, a timeline page. Voice: photo.
- **photo-travel** Road & Horizon — full-bleed panoramas with a thin caption bar, `spaceGrotesk` captions, a route timeline with dots. Voice: travel/photo.
- **photo-portfolio** Photographer's Edit — gallery white, one image per page centred with generous margins, plate numbers in `inter` 8 px, a single red mark. Voice: photo.
- **photo-wedding** Vows & Light — blush/ivory, `cormorant` italic captions, paired portraits, a vow page in large italic, gold hairlines. Voice: photo.
- **photo-yearbook** The Year We Made — playful grids of 6–9 slots with sticker-like labels (rounded rects), `outfit` headings, milestone timeline with numbers. Voice: photo/education.
- **photo-minimal** Quiet Frames — near-white, small centred images on large fields, `manrope` 300 captions, nothing else. Voice: photo.

### Group comics (file `comics.ts`) — COMIC & MANGA (816×1056; webtoon 800×2400)
- **comic-superhero** Velocity Comics — yellow/red/blue, `bangers` masthead with a burst badge, diagonal panels (paths as quadrilaterals), thick black borders, SFX in `bangers` with a stroke, caption boxes in yellow. Voice: comic.
- **comic-noir** Midnight Casefiles — cream + black, wide cinematic panels, heavy black inset shadows (rects), narration boxes in `specialElite`, title in `anton`. Voice: comic.
- **comic-kids** Bright Side Comics — open 4-panel grids with rounded corners (rx 14), big balloons, `comicNeue` lettering, pastel panel fills. Voice: comic/kids.
- **comic-anthology** Panel Stories — literary: `playfair` titles, contents page, varied page rhythms (3-panel tall, 6-grid, 1-splash), creator notes page in `lora`. Voice: comic/editorial.
- **manga-shonen** Rising Impact — white/black/red, RTL cue and right-side folio, speed lines (radialLines) behind a splash, reaction panel strips, SFX in `delaGothic`, `notoSansJp` for a katakana-flavoured SFX line is NOT allowed — keep Latin SFX like "KRAK" and "WHOOM" in `bangers`; use `zenKaku` for dialogue. Voice: comic.
- **manga-shojo** Petals & Promises — airy: borderless panels (fills only, no strokes), petal shapes (leafPath) drifting, `shippori` title, soft pink/lavender, portrait insets. Voice: comic.
- **manga-seinen** Afterimage — measured: 5–6 panel grids with silent panels (empty), environmental wide, `zenKaku` dialogue, restrained grey palette with one red. Voice: comic.
- **comic-webtoon** Infinite Scroll — 800×2400: panels stacked with 120–200 px breathing gaps, dark ground, `sora` dialogue, one reveal panel taller than the rest, a "scroll ↓" cue. Voice: comic.

## Lessons

Per template id. Principle about that system (pacing, grid, hierarchy), history of the *genre* (the magazine tradition it draws on, the picture-book canon, comics/manga publishing history — accurate, name real magazines/artists only when certain), tryThis, interestTag (e.g. "Magazine design", "Picture books", "Manga", "Email design", "Photo books", "Newsletter design").
