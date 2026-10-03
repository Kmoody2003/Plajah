# Course authoring brief (Plajah Academia)

You are writing ONE self-contained course module: `data/practice/courses/<courseId>.ts`, exporting
`COURSE_MODULE = { curriculum, bank }`. Another agent wires it into the catalog; do NOT edit any other file.

## Format (copy exactly)
- Read `data/practice/courses/ip-protection.ts` (helpers `tf`, `mc`, lesson-id constants `L01...`, `curriculum`, `bank`)
  and `data/practice/courseModule.ts` + `data/practice/types.ts` (Question shape). Also skim `music-theory.ts` for the
  `curriculum` fields (`framework: 'ncas'`, track `level`: FOUNDATION | INTERMEDIATE | ADVANCED).
- Lesson ids `<courseId>.lNN`, track ids `<courseId>.tN`, `bank.curriculumId = '<courseId>'`, accent colour as given.
- 4-6 tracks, the requested number of lessons, each lesson body 200-300 words of clear teaching prose (paragraphs
  separated by `\n\n`; one worked example or concrete case per lesson), a one-line `blurb`, `minutes` 5-8.
- 5 questions per lesson (mix `mc` and `tf`, difficulty 1-3, answer position varied), each with a hint that does not
  give the answer away and a one-sentence explanation. Exactly ONE defensible correct answer; no "all of the above";
  no trick wording; no double negatives. Questions test ideas taught in the lesson, not trivia that needs outside facts.
- Verify: `npx tsx -e "import('./data/practice/courses/<courseId>.ts').then(m=>console.log(m.COURSE_MODULE.curriculum.tracks.length, m.COURSE_MODULE.bank.questions.length))"`

## Scaling
The course must be usable from a curious beginner up to a college-level reader: the first track is accessible to a
12-year-old with no background; later tracks add depth, vocabulary, debate and primary-source thinking. Set `level`
per track honestly. Do not talk down; do not assume prior knowledge in track 1.

## Accuracy and integrity (the prime principle; this content will be independently checked)
- State only facts you are certain of. Dates, names, numbers, attributions, definitions must be ones every standard
  reference agrees on. When a date or claim is disputed, say so ("around", "traditionally", "scholars debate") or omit it.
- No invented quotes, anecdotes, statistics or "fun facts". No legends stated as history.
- History: balanced and multi-perspective; name causes and consequences, including suffering, resistance and
  contested interpretations. Avoid presentism and avoid hagiography. Describe atrocities plainly and age-appropriately.
- Myth and religion: present sacred narratives of living traditions respectfully, attributing ("in the Rig Veda...",
  "according to the Poetic Edda...") rather than asserting them as fact or mocking them. Say which sources survive.
- Art/design/music/film: only works, creators and dates you are certain of; describe works rather than reproduce them.
  Do not quote copyrighted lyrics, scripts, or text beyond a few words; use public-domain examples where you quote.
- Money/legal/engineering: give principles and typical ranges framed as "typically", with a note that terms and rules
  vary and change; never present a figure as a rule unless it is one. U.S. unless stated.
- Do not describe Plajah product features.

## Report (under 120 words)
Counts (tracks/lessons/questions) and every fact you were less than fully certain of.
