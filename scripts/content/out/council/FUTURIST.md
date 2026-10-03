# FUTURIST: "Living Margin"

## 1. Direction
**Living Margin**: a lesson is a small instrument, not a page. One typed rule set parses the existing text into blocks (opening, body, callouts) and derives every visual decision from three inputs (course accent, reader age band, subject family), so every one of the 2,000 lessons is laid out by the same rules and still comes out specific.

## 2. Typography
- Body: Literata (variable, optical size axis) for 12+; Atkinson Hyperlegible Next for 4-11 and as the dyslexia option (alongside OpenDyslexic as a second choice). Headings: Fraunces (soft/wonk axes driven by subject family: wonk off for math and civics, on for art and myth). Numerals and labels: JetBrains Mono / Spline Sans Mono, tabular.
- Scale is fluid: `clamp()` on a 1.2 ratio; base 17px adult, 20px at 8-11, 24px at 4-7; large-text toggle multiplies the root, never the measure.
- Measure held at 62ch (48ch for ages 4-7); line height 1.65, rising with age band down. Variable `wght` nudges up 20 units on dark backgrounds to compensate for halation.
- Drop cap only on the first paragraph and only for 12+, set as a 3-line initial in the course accent at AA contrast; small caps (`font-variant-caps`) for callout labels and track names; oldstyle figures in prose, tabular lining in math.

## 3. Layout and pacing
Anatomy: **title card** (lesson number as a large mono numeral, course and track as a breadcrumb, estimated minutes computed from word count), **opening** (first paragraph set one step larger as a lede), **body** in a single column with a **margin rail** on desktop (collapses to inline tags on phones), **callouts**, **close** (Why it matters, then Try this). Paragraph rhythm is computed: after every 3 paragraphs or ~120 words, extra space plus a section tick, so the 350 words read as 3 breaths. Progress is a thin spine on the left edge filling by paragraph, with the accent glowing only at the current paragraph. A "you are here" paragraph gets full contrast; neighbours stay at AA minimum (not dimmed below it).

## 4. Callouts
Parsed by their existing prefixes, label stripped and re-set as a small-caps tag.
- **Worked example / A worked example**: a numbered stepper. Sentences become steps (1, 2, 3 in mono), each on its own baseline, collapsible to the first step on small screens. Math gets a ruled "workings" gutter.
- **Why it matters / mattered**: a margin note anchored by a hairline to the paragraph it follows; accent bar, serif italic.
- **Everyday example / Example**: indented with an offset tab, slightly warmer ink.
- **Trap / A caution**: a hazard glyph, plus the word in text; the bar is a notched edge, never colour alone.
- **Try this**: an action row with a checkbox state, writing field, and "mark as understood".

## 5. Image and ornament logic
Ornament must carry data or be cut. **Generated**: a per-lesson sigil (a small grid mark derived from course id, lesson number and track: deterministic, stable between visits), dividers whose rhythm encodes the lesson's section count, the accent ramp (tints and a text-safe shade computed to AA), and the spine. Subject families swap the sigil grammar: math gets a lattice, music a staff-line rhythm, history a timeline tick, art/design a loose registration mark. **Authored by hand** (optional layer, a JSON overlay per course/lesson): pull quotes, diagrams, marginalia, a replaced sigil, a custom first-step image. No stock photos; any image must be a diagram or a primary source.

## 6. Interaction and motion
Reveal on scroll is a 160ms fade/translate of 6px, disabled under `prefers-reduced-motion` (state changes become instant, not removed). Hover on a margin note links it to its paragraph with a hairline. Read-aloud highlights the sentence in a soft accent wash and the spine tracks it; the screen reader gets the plain DOM order, with callouts as `<aside role="note">` with labels. Notes: select text, press N, and it docks in the rail. "Mark as understood" is a single toggle that fills the sigil, writing to the Education Ledger. Full keyboard: J/K paragraph, E expand step.

## 7. Scaling
- 4-7: one idea per screen, 24px Atkinson, read-aloud default, callouts become big picture cards, no margin rail, a mascot-free sigil that grows as you progress.
- 8-11: stepper callouts expanded, a "try this" checkbox, tighter rail.
- 12-15: full anatomy, drop caps on, notes on.
- 16+: density option, marginalia, citations, the dense analytic tier for Schenker-level texts (footnote rail, equation gutter).
Subject: math gets the workings gutter; music inline notation snippets; history the timeline spine; art/design a wide-figure break-out.

## 8. Human source trace
Systems can make honest imperfection deliberately: sigils carry a seeded hand wobble (stroke weight variance from a per-lesson seed), the dividers are drawn from a small set of scanned pen strokes by the Plajah team, never smooth vectors. The hand layer shows an author's name and a "set by" line. Timing: the spine eases like a pen lift, not linear. Fewer than 5 scans means the repetition gets noticed, so the set must be at least 12.

## 9. Strongest disagreement
**BAROQUE**: its reveal choreography (gold, dramatic entry) puts a performance between a learner and the sentence, and with 2,000 lessons it becomes wallpaper by lesson five. Spectacle without a rule behind it is a screensaver. **Steal**: its idea that the closing "Why it matters" earns one considered moment of light, a single timed accent glow, once per lesson.

## 10. Risk
Systematic means samey: 2,000 lessons from one rule set can read as a template, and the "generated hand wobble" may feel like the very AI-sheen the brief bans. Mitigation: the hand layer on top courses early, and judge by whether a learner can tell two lessons apart.
