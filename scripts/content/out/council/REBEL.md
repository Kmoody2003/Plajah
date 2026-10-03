# REBEL: "Pulled Proof"

## 1. Direction
Every lesson is a **pulled proof**: a sheet someone inked, registered and checked by hand. The renderer is deterministic, but each page carries visible evidence of a hand (a slightly off rule, a pencil note, a stamp) so the reader knows a person cared enough to mark it.

## 2. Typography
- Body: a serif with real texture, **Source Serif 4** (optical sizing) or **Newsreader**, 18px base mobile / 20px desktop, line-height 1.65, measure 62ch. Never grey: body is warm off-white (#ECE6DA) on near-black, AA+.
- Headings and labels: **Space Grotesk** or **Archivo Narrow** set in caps with 0.08em tracking, like stencil/press labels. Titles in **Fraunces** (soft, wonky axis up) so the cut feels carved, not typed.
- Marginal notes and "hand" labels: **Caveat** or **Kalam**, used sparingly (max 3 per lesson), never for body.
- Drop cap on paragraph one only: 3 lines, accent colour, Fraunces black, with a 1px offset duplicate in 30% alpha (misregistration).
- Oldstyle numerals in prose, tabular lining in math and data. Small caps for the first five words after every section break (`font-variant-caps: all-small-caps`).
- Dyslexia option swaps body to **Atkinson Hyperlegible / OpenDyslexic**, disables misregistration and offsets; large-text option scales rem, never clips.

## 3. Layout and pacing
- **Title card**: course accent as a single oversize flat ink block (rough-edged SVG mask), lesson number stamped like a rubber stamp ("No. 07"), track as a small caps slug. No hero image.
- Opening paragraph larger (1.15x), drop cap, a pencilled "start here" tick.
- Body: one column, 62ch, with a right-hand margin lane (desktop) for notes and connections; on phones notes collapse inline under their paragraph as indented taped slips.
- Rhythm: paragraphs vary only by spacing, plus one **break mark** every 2 paragraphs (a hand-cut dash, a asterism). Never uniform rules.
- Progress: a thin ink line along the left edge that fills as you scroll, drawn rough, with a small "tick" per paragraph. Finish shows a stamp, not confetti.

## 4. Callouts
Each is a different physical object, readable in colour-blind and monochrome via shape and label:
- **Worked example**: ruled graph/notebook paper strip, left border torn, steps numbered in pencil. Math-set tabular type.
- **Why it matters**: pull-quote in a heavy bar, set in Fraunces italic, accent highlighter swipe behind the key clause.
- **Trap**: hazard-taped top edge (diagonal accent hatching), label "TRAP" in stencil, slightly rotated -0.6deg.
- **Try this**: a taped index card, dotted outline, checkbox you can tick.
- **Example / Everyday example**: marginal sticky slip, small, lighter weight, never competes with the body.

## 5. Image and ornament logic
- Rule: ornament must record a gesture. No gradients, no glows, no icon sets.
- **Generated from data**: accent ink block shape (seeded by course id, so the roughness is stable), stamp number, track slug, misregistered rules (seeded jitter of 0-1.5px), paragraph break marks (chosen from 6 hand-cut shapes by hash).
- **Authored later**: hand-drawn diagrams (scanned or SVG with variable stroke width), real marginalia, per-course initials, photographed texture scans (paper, linocut, tape) the teacher made themselves.
- Textures are CSS noise at under 4% opacity, off under reduced-motion/dyslexia mode. Diagrams get a caption in the "hand" font naming who drew them.

## 6. Interaction and motion
- Reveal: ink "pulls" in (clip-path wipe, 240ms) on first view of a callout; disabled under `prefers-reduced-motion`, content simply present.
- Hover/focus: callouts lift 2px and show their name; focus rings are thick, accent, offset.
- Read-aloud: current sentence gets a highlighter-marker underline that draws left to right in time; no dimming of other text.
- Notes: tap any paragraph to pencil a note (stored locally); notes render in the hand font in the margin.
- "Mark as understood": a physical stamp press (scale 1.1 to 1, 120ms) the reader triggers; undoable.

## 7. Scaling
- **4-7**: 24px type, 1-2 sentences per screen chunk, big stamp objects, the accent ink block becomes a mascot-free shape to touch, read-aloud always on, no callout labels beyond icons plus words.
- **8-11**: 20px, callouts as stickers, hand font more frequent, "Try this" ticks collect into a sheet.
- **12-15**: default proof look, tighter, sparse hand notes.
- **16-adult**: 18px, hand font only for the reader's own notes, quieter textures.
- Subjects: art/design gets scan-quality textures and hand diagrams; history gets broadside/typeset-proof energy with datelines; math gets graph-paper worked examples and tabular numerals; music gets pencil staff scrawl and rest marks as breaks; science gets lab-notebook margins.

## 8. Human source trace
Seeded jitter that is stable per lesson (never random per render), pencil notes in the margin, taped and stamped objects with slight rotation, misregistered drop caps, a "proof" slug with the editor's mark. A teacher's own scanned scribble replaces the generated one wherever supplied.

## 9. Strongest disagreement
I most oppose the **Futurist**: a rule that "produces honest imperfection on purpose" is a costume. A mark that cannot fail is not evidence. Reactive layouts also make the page differ each read, which hurts a learner who needs it to stay put. I would steal the Futurist's **state-driven behaviour**: callouts and progress reacting to what the learner has actually done.

## 10. Risk
It tips into craft-fair kitsch: too many tapes and stamps distract, slow reading, and punish dyslexic and young readers. Jitter might look like rendering bugs. Mitigation: hard cap of three ornaments per screen, and one switch ("Clean proof") that sets everything flat while keeping typography and callout shapes.
