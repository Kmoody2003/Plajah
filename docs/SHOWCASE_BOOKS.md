# Plajah Showcase Books

Six original children's books that ship as the platform's own content and as living templates. They are real stories with real characters, each for a different age range and drawn in a different art medium, released under **CC BY 4.0** so anyone may read, remix, and republish them with credit.

Authorship (disclosed on every book): written and structured with AI (Claude, by Anthropic) at Plajah's direction; illustrated procedurally by Plajah's Tela design engine. Credit line: *Plajah Story Studio*.

## The library (youngest to oldest)

| # | Book | Ages | Medium | Words | Hero + companion | Heart of the story | Refrain |
|---|---|---|---|---|---|---|---|
| 1 | **Moon Blanket** | 2-4 | Felt & stitched textile | ~110 | Bramble the bear, Flit the moth | Making room for someone small | "Snug as a stitch." |
| 2 | **Beep Block Street** | 3-5 | Vibrant pop / screen print | ~150 | Bo the bus, Pip the pigeon | A small friend can fix a big problem | "Beep!" |
| 3 | **Orbit Party!** | 4-6 | Torn cut-paper collage | ~240 | Zib the astronaut, Nova the comet pup | Shyness: invite by sitting beside, not pushing | "Even a planet can feel shy." |
| 4 | **Little Fox, Big Trees** | 5-7 | Linocut / woodblock | ~350 | Tam the fox, Dot the fawn | Courage is helping while you are still scared | "Left foot, right foot, hush." |
| 5 | **Below the Blue** | 6-8 | Watercolor painting | ~470 | Coral the reef fish, Lumi the lanternfish | Light can come from inside, too (true ocean science inside the story) | "Light can come from inside, too." |
| 6 | **The Golden Thread** | 7-9 | Folk papercut with gold | ~670 | Mira the weaver, Glint the thread spirit | Generosity that never counts, and what you will give away | "Tug, tug, tug." |

The ladder is measured, not asserted: average sentence length rises from 3.9 to 9.4 words, words per spread from 22 to 93, and vocabulary from "snug, stitch, moth" to "unravelled, sash, bioluminescence" (glossaries on the two oldest books).

## Characters are locked
Every character has a **Character Bible entry** in `data/showcase/books/*.ts` (`look`, `palette`, `voice`, `signature`, `arc`). The `look` text is the single source of truth for every illustration, template and generation: one likeness everywhere (see the platform's character-consistency rule). New art, translations and remixes must start from it.

## How a book is built (story is data, layout is a template)
- **Story data**: `data/showcase/books/<book>.ts` (typed by `data/showcase/types.ts`): characters, and spreads of `{ n, beat, text, art, characters, turn, sfx }`. `data/showcase/index.ts` exposes `SHOWCASE_BOOKS`, `showcaseByTemplate(templateId)`, `showcaseById(id)`.
- **Layout**: the matching Tela publication template (`story-bedtime`, `story-city`, `story-space`, `story-forest`, `story-ocean`, `story-folktale`) draws each spread from the book's data (beat = layout type, text, art note, characters). Change the data, the same design carries a new story: that is what makes the books remixable.
- **Checks**: `npm run test:showcase` verifies structure (cover/back, 5+ layout beats, a quiet page and a scale-shock reveal), character consistency (referenced ids exist, locked looks, hero named), reading level per age band (word range, sentence length, Flesch-Kincaid, words per spread), refrain recurrence, licence and AI disclosure, and that no book mentions another book's character names.
- **Story analysis** (model-based): `npx tsx scripts/showcase/analyzeStories.ts [book-id]` asks Pokee-Isaac (the reasoning lane behind Taleo Story Intelligence) to report structure, arc strength, age fit, read-aloud rhythm, page-turn quality and safety, and writes `docs/showcase/analysis/<book>.json`. Report only; it never edits a book. The CURRENT Pokee key is in Google Secret Manager (`plajah-api-pokee-api-key`); the copy in `.env.local` is older and is rejected (401). **Run on 2026-10-09:** all six books rated arc OK/strong, read-aloud rhythm strong, age fit true, no page turn judged broken. Its first-round suggestions were applied (activity pages moved after the ending, Bo thanks Pip, the folktale's spool paradox made explicit, clunky lines simplified, a gentler guessing game); a second pass only produced smaller nitpicks, of which four clear improvements were taken.

## Remixing
Licence: CC BY 4.0 (`licensingService` id `CC_BY`: commercial use and derivatives allowed, attribution required). Each book lists `remixIdeas`. A remix keeps the credit "Based on *<title>* by Plajah Story Studio (CC BY 4.0)" and may change text, characters, language, art and layout.

## Status and known gaps (honest)
- **PUBLISHED 2026-10-09** (owner approved) under Kenneth Moody's account, author line "Plajah Story Studio", free, CC BY 4.0. Album ids `showcase_<book-id>` (moon-blanket, beep-block-street, orbit-party, little-fox-big-trees, below-the-blue, golden-thread). Each is an image-page book (Album type BOOK, subType GRAPHIC_NOVEL, one chapter with format COMIC and one image per page, WebP, plus a cover thumbnail) so the Lorea reader opens it in the comic/picture-book reader with the new page turns. Publisher: `npx tsx scripts/showcase/publishBooks.ts` (dry run by default; `--publish` to install or UPDATE in place; `--unpublish` makes all six private again, deletes nothing; `--only=<ids>`). Verified after publishing: each album reads back public, license CC_BY, every page URL serves an image, and all six appear in the public BOOK query.
- Stories, character bibles, reading-level checks, and the data registry are tested (`npm run test:showcase`, 32). The six layouts were wired to the story data (`test:showcasewire-a/b/c`, 29 + 24 + 26): every page is checked to contain the exact words of its spread, and nothing was shortened.
- To change a book: edit `data/showcase/books/<book>.ts`, run the three wiring/story tests, re-export the page PNGs with `npm run showcase:pages` (renders from the same Tela doc as the living edition; `-- --check` pixel-compares against the existing files), then re-run `publishBooks.ts --publish`. The living (interactive) edition is published separately by `scripts/showcase/publishLiving.ts`: see `docs/LIVING_PUBLISHING.md`.
- Pages are images, so they are not selectable text for screen readers; the plain story text is stored on the chapter (`content`) for read-aloud and search, but a proper accessible reading mode for picture books is not built.
- No feed or follower announcement was made for these (they were installed directly, not through the creator flow).
- 'Remix this book' (open the template with the story data) is not built; the story data, characters and remix ideas are stored on the album under `showcase`.
- Not reviewed by a human children's editor or a child. Pokee reviewed the stories (AI second opinion).
- Illustrations are procedural vector art; generated painted plates can be dropped into labelled image slots later.
