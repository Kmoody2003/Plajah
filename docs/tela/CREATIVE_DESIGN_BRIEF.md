# Tela Creative Template Brief — documents, posters, social, presentations, web, menus

Companion to `TEMPLATE_DESIGN_BRIEF.md` (§1 kit, §2 rules, §3 what "designed" means apply). These are the single-page creative templates in `services/telaCreativeEngine.ts` (`TELA_CREATIVE_TEMPLATES`: name, category, width/height, palette `[ground, primary, accent]`, tone). Do **not** edit that file.

Write designers in `services/tela/designs/creative/<group>.ts`:
```ts
import type { CreativeDesigner } from './types';
export const DESIGNS: Record<string /* template NAME exactly */, CreativeDesigner> = { 'Quiet Report': ctx => [...] };
export const LESSONS: Record<string /* template NAME */, DesignLesson> = { ... };
```
`CreativeCtx` = `{ template, W, H, fr (7 % frame), ground, primary, accent, seed }`. Legibility rule for screens: SOCIAL 1080×1080 body ≥ 26 px; PRESENTATION 1920×1080 body ≥ 28 px; WEB 1440×900 body ≥ 18 px. Paper (816×1056) body 10.5–12 px.

Verify (must print `lint clean` for your names — legacy ones will still error until every group lands):
```
cd /c/Users/Kenne/plajah && npx tsx scripts/telaGallery.ts "%TEMP%/creative-<group>.html" creative
```

## Direction

### Group documents (`documents.ts`) — DOCUMENT 816×1056
- **Quiet Report** — `inter` 300 title, a hairline system, executive summary box, 2-column findings with numbered subheads, a chart of rects, footer with confidentiality line.
- **Civic Brief** — `libreBaskerville` + `inter`, a header band in navy with a seal circle, memo fields (TO/FROM/DATE/RE) as a table, body 2 columns, recommendation callout.
- **Field Journal** — kraft tone, `specialElite` + `lora`, ruled lines (hairlines every 22 px in the body area), a sketch slot with a taped corner (rotated small rect), date stamp.
- **Studio Proposal** — dark, `syne` 800 title, magenta accent bar, scope/timeline/budget as three cards (rounded rects), a signature line.
- **Playful Worksheet** — `baloo` heading, numbered question boxes with dashed borders (strokeDash), a name/date header, star reward row, illustration slot.
- **Research Paper** — classic two-column academic: `ebGaramond` body 10.5 px, title centred, authors + affiliations, abstract in a narrower measure, section numbering, figure with caption, footnote rule.
- **Annual Review** — dark teal, `manrope`, a giant year numeral, KPI tiles (4), a bar chart, a letter column.
- **Literary Manuscript** — cream, `courierPrime` 12 px double-spaced (leading 2), title page block, slug line, page number top right — the standard manuscript format.
- **Lesson Plan** — `lexend`, header table (grade/duration/subject), objectives list with checkbox squares, timed sequence table, assessment box in orange.
- **Creative Résumé** — two-tone: a left rail in deep violet with name vertical? (no rotation on text → use a tall narrow rail with stacked short lines), `fraunces` name, skills as pills, timeline dots, right column experience.
- **Press Kit** — black, `archivoBlack` headline, hero image slot, fact sheet (label/value rows in `jetbrains`), quotes, contact block, logo slot.
- **Community Newsletter** — one-page: `nunito`, 3 columns with notices, a dates box, a photo, warm cream + magenta.

### Group posters (`posters.ts`) — POSTER 816×1056
- **Midnight Premiere** — deep purple to black gradient, `bebas` stacked title 140 px, date in magenta, a spotlight ellipse, credits block at the foot in tiny caps (the "billing block").
- **Museum Editorial** — cream, `cormorant` title, one large image slot, hairlines, exhibition dates, museum wordmark block, sponsors row of small rects.
- **Science Field Notes** — teal, `ibmPlexMono` labels, a diagram (rings + radial lines) as the hero, grid paper dot field, `manrope` title.
- **Neighborhood Festival** — sunny cream, `fredoka` title, confetti (orn.confetti), a schedule list, a map slot, sponsor logos row.
- **Monochrome Type** — black on white, one word at 220 px in `archivoBlack` cropped by the page edge (keep the TEXT box inside — use a huge letter and place it so the box fits), tiny details.
- **Exhibition Opening** — black, `playfair` italic title, a single artwork slot with a thin frame, date/time stack, gallery address.
- **Book Launch** — cream, `bodoni` title, a book-cover slot with a drop shadow, author portrait circle, quote, event details in a boxed block.
- **Youth Workshop** — mint, `baloo`, big friendly numbers for age/date, icon circles, tear-off tab row at the bottom (dashed line + small blocks).

### Group screens (`screens.ts`) — PRESENTATION 1920×1080, SOCIAL 1080×1080, WEB 1440×900
- **Spatial Keynote** — dark, gradient ring, `unbounded` title 96 px, subtitle, speaker/date block, slide number.
- **Research Brief** — cream, `manrope`, title left, agenda list right with numbers, hairline.
- **Product Story** — black, magenta→orange gradient blob, product slot, `sora` title, three feature pills.
- **Classroom Canvas** — cream, `lexend`, big lesson title, three learning-objective cards, a doodle (sineOpenPath).
- **Black Type** — black, one white sentence in `inter` 300 at 72 px, tiny footer. That's it.
- **Investor Narrative** — light, `inter`, headline + one big number (KPI) + supporting chart of rects.
- **Portfolio Review** — dark plum, `fraunces` italic title, 3 image slots in a filmstrip.
- **Live Show Deck** — black, orange/magenta diagonal bands, `bebas` title, set-list block.
- **Creator Drop** — square, dark, `archivo` 900 headline, product slot, "drops Friday" pill, handle at foot.
- **Quote Prism** — square, deep violet, a gradient prism (polygon paths), `playfair` italic quote 56 px, attribution.
- **Album Notice** — square, cream, album art slot with shadow, `spaceGrotesk` title, tracklist mini, "out now" pill.
- **Learning Card** — square, light teal, `lexend` fact headline, an icon circle, a "did you know" tag, footer.
- **Event Countdown** — square, dark purple, giant number 400 px `anton`, "days" label, event name, date.
- **Reading List** — square, cream, `lora`, numbered list of 5 books with author lines, a bookmark ribbon (ribbon path from TELA_SHAPE_LIBRARY or `chevronPath`).
- **Community Prompt** — square, mint, `nunito`, a question in 60 px, reply pill, avatar circles row.
- **Portfolio Hero** — web, dark, nav row (wordmark + 4 links), `syne` hero headline 88 px, two buttons, a hero image slot right, footer strip.
- **Editorial Landing** — web, cream, nav, `fraunces` headline, deck, three story cards with image slots + kicker + title.
- **Course Launch** — web, dark teal, nav, headline, module list (numbered rows), pricing card, enroll button.
- **Local Business** — web, warm cream, nav, `outfit` headline, hours/location card, a menu preview, map slot, phone button.
- **Quiet Product** — web, white, nav, centred `manrope` 300 headline, product slot, single grey button.
- **Artist Archive** — web, cream, nav, `cormorant` name, a masonry of 5 image slots of different heights, captions.
- **Magazine Feature** — web, white, `playfair` headline, hero image, byline row, 2-column article start, share icons row.
- **Learning Hub** — web, light, `lexend`, course cards grid 3×2 with progress bars.

### Group menus (`menus.ts`) — MENU 816×1056
- **Bistro Fold** — dark brown, `playfair` italic section heads, items with leader dots (dotted lines via dash) to prices, `karla` descriptions, orange rule, chef's note.
- **Modern Café** — cream, `inter` 300 items in 2 columns, prices right-aligned, hairline dividers, a small logo circle.
- **Night Market** — black, `bebas` stall-style headings in violet, orange prices, a lantern dot row, dishes in `workSans`.
- **Kids Lunch** — cream, `fredoka`, items with icon circles, a maze/colouring slot with a dashed border, crayon colour dots.
- **Tasting Notes** — ivory, `cormorant`, courses numbered in roman numerals, wine pairing in italic, generous leading.
- **Pop-up Menu** — dark violet, `spaceGrotesk`, a date badge, QR code slot (checker 6×6), items with cyan prices.

## Lessons
Per template NAME: principle (about this format — a poster's one-second read, a menu's price alignment, a résumé's scanning path), history of the FORMAT (the billing block, the manuscript format, the web hero, the tasting menu), tryThis, interestTag ("Poster design", "Document design", "Social media design", "Presentation design", "Web design", "Menu design", "Résumé design", "Data visualisation" where apt).
