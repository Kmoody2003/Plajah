# RADICAL_MINIMAL: "One Hairline"

## 1. Direction
**One Hairline.** A lesson is a single column of well-set text with one accent hairline as its only structural device. The hairline thickens, breaks and shifts position to carry meaning, so there is almost nothing else to look at.

## 2. Typography
- Body: a serif for ages 12+ (Source Serif 4, or Literata, both on Google Fonts; fallback Georgia). Ages 4-11 use Atkinson Hyperlegible, which has single-storey a/g and clear I/l/1.
- Dyslexia option: OpenDyslexic or Atkinson Hyperlegible, 0.04em tracking, 1.8 leading, left-aligned, never justified.
- Scale: 18px base (20px ages 8-11, 24px ages 4-7). Ratio 1.25. Only three sizes on the page: title, body, label.
- Measure: 62ch (44ch for ages 4-7). Leading 1.65.
- No drop caps. First sentence in small caps (`font-variant-caps: all-small-caps`, 0.06em tracking) marks the opening.
- Lining numerals in body, tabular in math. Large-text option scales rem, and the measure follows in ch, so nothing breaks.

## 3. Layout and pacing
- Title card: lesson number in tabular numerals, the title, and the course name in the accent colour. Then 30vh of nothing. The silence is the title card.
- Body: paragraphs separated by space, not rules. The hairline runs down the left edge for the whole lesson.
- Progress is the hairline itself, filled with the accent up to the current paragraph (a CSS scroll-driven `scaleY`). No bar and no percent.
- Margin notes (connections, tradition) sit on the right at 1024px and up, as 13px text. On a phone they collapse to a single "+" at paragraph end.
- Rhythm: one idea per screen. Long paragraphs break at sentence boundaries into two beats, with a larger gap, never a new element.

## 4. Callouts
Each callout is a change in the hairline, not a box.
- **Worked example:** the hairline doubles to two lines. The label "Worked example" sits in small caps. Steps in tabular numerals.
- **Why it matters:** the hairline thickens to 3px for this paragraph only. No label.
- **Trap:** the hairline breaks into dashes. The label is "Trap", set in the body colour, never red. Colour alone must not carry meaning.
- **Try this:** the hairline ends in an open circle, and the paragraph is followed by empty space equal to its own height.
- **Example:** the paragraph is indented 2ch and set in italics. No other treatment.

## 5. Image and ornament logic
- No ornament. Dividers are 48px of space. Initials, textures and marginalia are removed.
- Generated from data: accent (the hairline), lesson number, track name (label only).
- Hand-authored layer, optional: one diagram per lesson at most. It is a line drawing in the accent colour on the page's own ground, with a 1px stroke, no fills.
- A media strip is allowed only if the media is the lesson's evidence (a score, a painting, a map). It is shown full measure with a caption and nothing else.

## 6. Interaction and motion
- Reveal: none by default. Text is there on arrival.
- Read-aloud: the current sentence gets a 2px underline in the accent colour. No highlight block.
- "Mark as understood": a single keyboard-reachable circle at the end of the hairline. It fills when pressed.
- Notes: select text, press N, and a margin line appears.
- Reduced motion: the hairline fill becomes a stepped change per paragraph.
- Focus rings are 2px accent offsets. Contrast is checked against the dark ground at AA or better, and the accent is lightened when needed.

## 7. How it scales
- 4-7: 24px text, 44ch measure, one sentence per line, larger gaps, a read-aloud underline that is always on, and the hairline thickened to 6px.
- 8-11: 20px, Atkinson, and "Try this" becomes a tappable circle.
- 12-15: serif, standard measure.
- 16+: serif at 17px with the margin notes always visible.
- Subjects change only the hairline's behaviour. Math gets tabular numerals and numbered steps. Art and design show media full-bleed to the measure. Music puts the score on the hairline's right. History gets a date set in small caps in the margin. Myth and literature get no changes, since the text is the thing.

## 8. Human source trace
Minimalism has to leave evidence of a decision. The trace here is **editing**:
- Every hand-authored lesson shows "Cut from 612 words to 340" in a footer, set in 12px.
- The hairline is drawn with a slightly uneven stroke width (SVG, 3 points of variation seeded by lesson number), so no two lessons are identical.
- Spacing is chosen per paragraph by a teacher flag (`breath: long`), which makes the pacing audibly different.
- Authored corrections stay visible: a lesson shows its last revision date and who made it.

## 9. Strongest disagreement
**BAROQUE.** They add light, depth and reveals until something happens. In a lesson the reader is already doing the hard thing, which is understanding, and a reveal delays the sentence they came for. A reveal also cannot be skimmed, scanned or read aloud by a screen reader without a rewrite. I would steal their *timing*: one deliberate pause (the 30vh title card, the empty space after "Try this") is theatre, and I can afford it.

## 10. Risk
It could read as unfinished or cold, especially to a 5-year-old, who might see only a blank page and a line. Emptiness without articulation is just empty. The remedy is to make the three variables (hairline weight, break, spacing) legible through the child's own use, and to let teachers hand-author the one moment of delight per lesson.
