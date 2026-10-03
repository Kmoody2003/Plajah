# Council brief: the lesson presentation layer

You are one director of Plajah's Council of Art Directors. Read `services/council/councilDirectors.ts` (your
director's voice, questions, tensions) and `ARIA_ART_COUNCIL_METHOD` in `services/aria/ariaCreativeRoles.ts`. Work as
that lens, not as a role-play character: this is a design proposal, not a conversation.

## The problem
Plajah Academia has ~100 courses and ~2,000 lessons. Each lesson today is a plain-text body (4-5 paragraphs, ~350
words, paragraphs split on blank lines) rendered by `components/learn/LessonReader.tsx` as grey paragraphs on a dark
panel, with an optional media strip, a connections panel and a tradition panel. Learners range from a 5-year-old being
read to, to a college student reading Schenkerian analysis. Existing lesson text already contains recurring markers
that a renderer can recognise without editing the text: paragraphs beginning "Worked example:", "A worked example:",
"Why it matters:", "Why it mattered:", "Everyday example:", "Example:", "Trap:", "Try this:", "A caution:".
Teachers can also author lessons (Tela documents) on the same stack.

Kenne's brief: the lessons should feel **hand-crafted, meticulous, as if someone who cares about the material deeply
made the experience**; apply it **retroactively** to every existing lesson, and to all new ones. Subjects include
art, design, music, film, history of every region, literature, myth, science, math, civics, business.

## Constraints
- Must work retroactively from the existing text with a deterministic renderer (no per-lesson hand layout required
  for the baseline), and allow an optional hand-authored layer per course and per lesson later.
- React + Tailwind, dark UI with a per-course accent colour, phone to desktop, keyboard accessible, `prefers-reduced-motion`
  respected, WCAG AA contrast, screen-reader friendly, dyslexia-friendly option, large-text option.
- Scales with the reader: choose how presentation changes for ages 4-7, 8-11, 12-15, 16-adult.
- Must not slow reading or distract; ornament must earn its place. No stock-photo filler, no AI-sheen.
- Every direction must keep a **human source trace** (a perceptible sign of making: pressure, gesture, material, light,
  timing) and be judged on concept-content fit, accessibility, editability, originality.

## Deliver (700 words max, plain markdown)
Write ONE file: `scripts/content/out/council/<DIRECTOR_ID>.md` containing:
1. **Direction** in one sentence and a name.
2. **Typography** (families/classes available on the web, scale, measure, drop caps, numerals, small caps).
3. **Layout and pacing** (page anatomy: title card, opening, body, callouts, margin notes, rhythm, progress).
4. **Callouts**: how "Worked example", "Why it matters", "Trap", "Try this" and "Example" should look and feel.
5. **Image and ornament logic** (rules, dividers, initials, marginalia, textures, diagrams) and what is generated from
   data (course accent, lesson number, track) vs authored by hand.
6. **Interaction and motion** (reveal, hover, scroll, read-aloud highlighting, notes, "mark as understood").
7. **How it scales** from age 4 to adult and per subject (art/design vs history vs math vs music).
8. **Human source trace**: what makes it feel made by a person.
9. **Strongest disagreement**: name the one other director whose likely proposal you most oppose and exactly why;
   and one thing you would steal from them.
10. **Risk**: the way your own direction could fail.

Reply in under 60 words saying you wrote the file. Do not edit any other file.
