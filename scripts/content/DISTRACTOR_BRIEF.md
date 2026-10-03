# Distractor balancing brief

In this course the correct multiple-choice answer is very often the longest choice, so learners can pass by guessing the longest.
Fix that by editing ONLY the WRONG choices in `data/practice/courses/<courseId>.ts`.

## Rules (a script enforces the first four)
1. Do NOT change the correct choice's text, its position, the question prompt, the hint or the explanation. Do NOT add, remove or reorder choices.
2. Every question must still have exactly one defensible correct answer. A wrong choice you lengthen must remain clearly wrong
   to someone who has read the lesson. Never make a wrong choice true, ambiguous or partly true.
3. Keep every question's 4 choices distinct strings.
4. Edit only `mc(...)` choice strings (or the equivalent `choices` entries); never touch `tf(...)` questions.
5. Goal: the length of the correct choice must carry NO information. Across the course, the correct choice should be uniquely the
   longest in about 25% of questions, uniquely the shortest in about 25%, and neither (somewhere in the middle, or tied) in about 50%.
   Do NOT just make every wrong choice longer: that turns "pick the longest" into "pick the shortest". Vary it question by question:
   lengthen some wrong choices, shorten others, so a given question's correct answer lands at a mixed rank. Wrong choices must be plausible
   misconceptions in the same register and grammar as the right one, never silly, never partly true, and never differing only by an absolute
   word like "always/never/only".
6. Preserve the file's existing syntax (quotes, escaping, helper calls). Escape apostrophes as the surrounding quote style requires, and
   prefer wording without apostrophes. If you use a shell, never rely on backslash escapes surviving a shell heredoc; use your file edit tool.
7. When finished run: `npx tsx scripts/content/distractor-guard.ts check <courseId>` (must print OK) and
   `npx tsx scripts/content/distractor-guard.ts stats <courseId>`, and `npx tsx -e "import('./data/practice/courses/<courseId>.ts').then(()=>console.log('loads'))"`.
   Fix anything they report. Do not edit any other file.

## Report (under 60 words)
The final stats line and whether the guard printed OK.
