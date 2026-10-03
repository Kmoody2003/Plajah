# Figure authoring brief (Plajah Academia lessons)

Goal: add 2 to 3 high-quality figures to each assigned lesson so the lesson reads like a designed textbook page. ACCURACY IS THE PRIME RULE: every number, date, label and formula must be correct and checkable from standard references. If you are not certain, do not draw it. No invented data. A modelled/worked example must say so in the caption.

Format: see data/lessonFigures.ts (types in components/learn/lesson/figures.ts). Figure kinds you may use:
- graph: function plot. Use `fn` (a JS arrow) + `domain`, `x`/`y` {label, unit}, optional `marks:[{x,label}]`. Best for math/physics laws.
- chart: kind 'line'|'bar'|'scatter' with `series:[{name, points:[[x,y],...]}]`. Only real, well-known measured data (cite in `credit`) or clearly-labelled computed models. For bar/line to render as the Tela chart, all series must share the same x list.
- diagram: `nodes:[{id,label,col,row}]`, `edges:[[from,to,label?]]`. Processes, cycles, hierarchies, apparatus (keep labels short).
- timeline: `events:[{when,label}]`, dated events that are certain.
Every figure needs: unique `id` (kebab, unique inside the lesson), `after` (index of the text paragraph it follows, 0 = after the lede; keep <= number of paragraphs), `layout` ('inline'|'wide'), `title`, `caption` (our words, states the teaching point; 1-2 sentences), and `alt` (full text alternative describing what is shown, with the key values) and, for measured data, `credit` (source name). No archive plates/audio/video.

Rules:
- Read the lesson text first (data/practice/courses/<course>.ts, curriculum lessons; lesson id like `lab-physics.l01`). The figure must support what THAT lesson teaches and agree with its text; if the lesson's own text is wrong, do not copy it; note it in your report.
- Do not use apostrophes inside single-quoted strings unescaped; prefer double quotes or backtick strings for text with apostrophes. Keep each string on one line.
- Choose lessons where a figure truly helps (relationships, processes, cycles, comparisons, timelines). Skip lessons that are pure definition or opinion.
- Put your output ONLY in the file you are assigned: `data/lessonFigures/<name>.ts` exporting `export const FIGURES: Record<string, Figure[]> = {...}` with `import type { Figure } from '../../components/learn/lesson/figures';`. Do not edit any other file.
- Validate: run `npx esbuild data/lessonFigures/<name>.ts --bundle --platform=node --outfile=%TEMP%/x.js` style check (or `npx tsx -e` importing it) and then evaluate every `fn` over its domain to confirm finite values and sensible ranges.
- Final report: list each lesson id, figure ids, and for every number/claim the source/derivation in one line, plus any doubts. Under 300 words of prose.
