# CLASSICAL, the Classical Mind: "The Well-Made Page"

## 1. Direction
**The Well-Made Page.** Every lesson is set like a good book: one measure, one rhythm, a cadence at the end of each section. Structure carries the craft, and the accent colour is the single flourish.

## 2. Typography
- Body: a text serif with real italics and old-style numerals: `Source Serif 4` (optical sizing), fallback `Georgia`. Dyslexia option swaps to `Atkinson Hyperlegible` with looser spacing; the structure is unchanged.
- Titles: `Cormorant Garamond` at display size, otherwise the body serif. Labels and numbers: `Inter` small caps via `font-variant-caps: all-small-caps` plus 0.08em tracking.
- Scale is a 1.25 ratio off a 18px base (large-text option: 22px). Line-height 1.65. Measure 62ch, never wider; margin notes sit outside it on desktop.
- Drop cap on the first paragraph only: three lines tall, accent colour, body serif. Dropped for ages 4-7 (replaced by a large first word).
- Old-style figures in prose, lining and tabular in math and data. Small caps for the first line of each section.
- Paragraphs use first-line indent with no gap after the first of a run, as in books; callouts break that run.

## 3. Layout and pacing
Page anatomy, top to bottom: **title card** (course track in small caps, lesson number in roman numerals, title, a hairline in accent); **opening** (first paragraph, drop cap, set slightly larger as a lede); **body** (remaining paragraphs, a section ornament every 2-3 paragraphs, rhythm 3-2-3-2 so no page is a wall); **callouts** inline; **close** (final paragraph followed by a small "cadence" mark, then connections and tradition panels). Margin notes (desktop only, 240px gutter) hold the connections as numbered notes; on phone they collapse to tap-to-open footnotes at the section end. Progress is a thin accent rule at the page edge, plus "page 3 of 5" counted in paragraphs. Nothing else moves.

## 4. Callouts
Each is a **set-off block, not a box**: left rule in accent, a small-caps label, body in italic or indented roman. Different weight, never different font families.
- **Worked example**: indented block, tabular figures, hairline above and below like a ruled specimen; steps numbered.
- **Why it matters**: pull-quote scale, centred-left, a rule only above; the one place the text gets bigger.
- **Trap**: label "Caution" with a small-caps accent-tinted rule on the left and a 2px heavier stroke; tone is calm, not alarm red.
- **Try this**: a ruled line beginning with a hand-pointing manicule; collapses into a checkable item.
- **Example / Everyday example**: lighter indent, italic, no rule.

## 5. Image and ornament logic
Ornament follows structure: rule, initial, section mark, footnote, nothing else. Generated from data: accent colour, roman lesson number, track label, the section ornament chosen from a small set by track (a fleuron for literature, a ruled lozenge for math, a staff-line fragment for music), and the progress rule. Authored by hand, later: a per-course frontispiece (engraving, diagram or score excerpt), per-lesson marginalia, figures with captions in the book convention ("Fig. 2"). No textures, no gradients, no stock images. Diagrams are line drawings on the same measure grid.

## 6. Interaction and motion
Motion is cadential: on first load the title card rule draws once (300ms), callouts do not animate. Hover on a margin-note number highlights its anchor. Read-aloud highlights the current sentence with an underline in accent, not a background, and paragraph-level for ages 4-7. "Mark as understood" is a quiet closing line at the cadence mark, a sentence the learner clicks to confirm, never a gamified badge. Notes attach to a paragraph and appear in the margin. All reduced-motion safe: the rule is simply present. Full keyboard: j/k paragraph, n note, m mark.

## 7. How it scales
- **4-7**: 24px text, 40ch measure, one idea per screen, large first word instead of drop cap, an illustration slot per paragraph, read-aloud primary.
- **8-11**: 20px, 52ch, drop cap, callouts with icon glyph, short sections.
- **12-15**: the standard page, margin notes on tablet and up.
- **16-adult**: 17-18px, 66ch, footnote apparatus, citations in margin, optional two-column for reference lessons.
- Subjects: math gets numbered equations and the ruled specimen; music gets the staff-line ornament and score figures at measure width; history gets dated margin notes; art and design get larger figure plates that break the measure for full width.

## 8. Human source trace
Proof of a careful maker: optical kerning and hanging punctuation, widow and orphan control, real small caps and old-style figures, margin notes placed beside the anchor paragraph, and a colophon line ("Set by Plajah Academia in Source Serif") with the author's name for authored lessons. The authored layer is visibly a person's: a hand-chosen frontispiece and notes signed with initials. Even the baseline carries the trace of timing: the rule draws at the pace of a pen stroke.

## 9. Strongest disagreement
**BAROQUE.** A reveal that announces itself puts the showmanship between the learner and the lesson, and on 2,000 lessons it becomes the same flourish 2,000 times. I would steal their idea that light and timing are decisions: I would allow a single hand-authored dramatic opening per course, on the frontispiece only.

## 10. Risk
It could read as a polite textbook: handsome, respectful, and inert for a 6-year-old or a restless 14-year-old. A strict system without a strong authored layer will look uniform across 2,000 lessons, and the human trace will turn into mere tidiness. Mitigation: ship the hand-authored frontispiece and margin layer for the first ten courses before calling the baseline finished.
