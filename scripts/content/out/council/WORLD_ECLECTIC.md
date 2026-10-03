# WORLD_ECLECTIC, the World-Eclectic Traveller

## 1. Direction: "Field Notebook"
Every lesson is a page from a traveller's notebook kept by someone who was there: a ruled, annotated, slightly lived-in page where the *structure* (margin, pasted slip, pencilled aside) is borrowed from a universal working habit (note-taking), and the *specifics* (script, numerals, pattern, material) come from the lesson's own region, never from a decorative grab-bag.

## 2. Typography
- Body: Source Serif 4 (Latin), with script-matched companions chosen per lesson language tag: Noto Naskh Arabic, Noto Serif Devanagari, Noto Serif JP, Noto Serif SC, Noto Serif Ethiopic, Noto Serif Hebrew. All free (OFL) on Google Fonts. Never fake a second script with a Latin "ethnic-looking" display face.
- Scale 1.2 ratio, base 18px (age 8+), 22px (4-7). Measure 62ch; 48ch for ages 4-7. Line height 1.65, 1.8 for the dyslexia option (Atkinson Hyperlegible, no italics, wider tracking).
- Drop cap only on the first paragraph, 3 lines, set in the lesson's own script if it has one. Small caps for markers ("WORKED EXAMPLE") via `font-variant-caps`. Numerals: tabular, oldstyle in prose; if a lesson is about a numeral system (Eastern Arabic, Devanagari, Chinese), show it once alongside the Western form, in a margin gloss.
- Proper names get correct diacritics and a tooltip-able pronunciation gloss; never transliterate lazily.

## 3. Layout and pacing
- Title card: lesson number as a handwritten-style ordinal in the margin, course accent as a ribbon-bookmark edge, track name small-caps, and a one-line "Where we are" (region, century) generated from lesson tags when present.
- Body in a main column with a narrow left margin rail (desktop) holding marginalia: date, place, maker, pronunciation. On phones the rail collapses to inline pencilled asides under the paragraph.
- Rhythm: opening paragraph larger, then a paragraph break every ~60-80 words; a thin ruled "pause" after every third paragraph. Progress is a stitched thread along the left edge that fills as you read, not a percent bar.

## 4. Callouts
Each is a **pasted slip**, differing by *material*, not by emoji.
- **Worked example**: graph-paper slip with a faint ruled grid, tabular numerals, step numbers in the margin; looks like working-out done by hand.
- **Why it matters**: a wax-seal-style round stamp at the left, text on a slightly lighter panel; the reason this knowledge was kept.
- **Everyday example**: a folded-corner receipt/postcard slip, plainest text, shortest.
- **Trap**: a torn-edge slip with an accent-red underline and the word "Careful" (not a warning triangle).
- **Try this**: an open-ended slip with a blank ruled line to write on (local-only note).
All contrast AA; role="note" with a visible text label, so shape never carries meaning alone.

## 5. Image and ornament logic
- Generated from data: accent colour, lesson number, track, rule weight, bookmark ribbon, the stitched progress thread, and a **region-keyed border motif** drawn only from a vetted registry (see below).
- Authored by hand: the course/lesson plate (map, photograph, diagram, object), real pattern work, credited captions. No filler imagery; if no authored plate exists the card is typographic only.
- **Motif registry rule**: no pattern (kente, mudéjar tile, seigaiha, ikat) is auto-applied unless the registry entry names the maker tradition, source, date, and a permission status. Default is a plain rule. A lesson *about* a tradition may show its pattern, credited; a lesson about calculus may not borrow one for flavour.
- Dividers are a single hand-drawn rule with visible pen wobble, same for every region.

## 6. Interaction and motion
- Margin glosses expand on focus/hover/tap; a "Say it" button plays a recorded pronunciation where one exists.
- Read-aloud highlights the sentence, not the word (less flicker), in a pencil-underline.
- "Mark as understood" is a tick the learner draws (a short stroke animation); with reduced-motion, it simply appears. Notes attach to a paragraph as a pencilled margin note, stored on the learner's own record.
- Scroll motion limited to the progress thread; no parallax.

## 7. Scaling
- 4-7: 22px, one idea per screen, large audio button, callouts shown as pictures first (a single authored drawing), motif registry off.
- 8-11: single column, glosses shown inline, "Try this" prominent.
- 12-15: margin rail on, maps and dates appear.
- 16+: full notebook, citations and source-credit footnote strip, second-script toggle.
- Per subject: art/design gets a larger plate and a swatch-with-provenance strip; history gets a place/date rail and a map; math gets graph-paper working and no regional ornament; music gets notation in the culture's own system (staff, sargam, solfège, jianpu) beside Western staff.

## 8. Human source trace
Pencil-wobbled rules, ink-bleed on the drop cap, uneven but deterministic seeded jitter in margin notes, a visible credit line ("Plate: photographed by ... , 1974, Dakar"), and handwriting-style ordinals drawn from a real scanned hand. Timing: the thread stitches at reading speed, never faster.

## 9. Strongest disagreement
**RADICAL_MINIMAL**: reduction as "universal" is the likeliest proposal, and I oppose it because stripping every lesson to one grey sans quietly makes the Euro-American default the invisible norm. A lesson on Ethiopian Ge'ez or Yoruba tonality cannot be told without its script and diacritics. I would steal their discipline: one contrast per callout, and ornament only on request.

## 10. Risk
Tourist-brochure aesthetics: auto-applied regional motifs at scale across 2,000 lessons could become exactly the borrowed-ornament trap I forbid. Mitigation is the registry's default-to-plain, but if nobody maintains it, the notebook becomes uniform and the "specifics" never arrive. Also: heavy font loading for many scripts hurts phones; load by lesson language tag only.
