// Structural check of every authored lesson figure: unique ids, `after` within the lesson's paragraphs, finite function values,
// diagram edges that point at real nodes, captions and alt text present. Accuracy of the content itself is checked by blind verifiers.
import { LESSON_FIGURES } from '../data/lessonFigures';
import { loadAllCourses } from './content/lib';
import { parseFolio } from '../components/learn/lesson/folioParse';
const lessonText: Record<string, string> = {};
for (const c of await loadAllCourses()) for (const t of c.curriculum.tracks) for (const l of t.lessons as any[]) lessonText[l.id] = String(l.body || l.blurb || '');
let bad = 0, n = 0;
const fail = (id: string, m: string) => { bad++; console.log('FAIL', id, m); };
for (const [lid, figs] of Object.entries(LESSON_FIGURES)) {
  const body = lessonText[lid];
  if (body === undefined) { fail(lid, 'lesson id not found'); continue; }
  const paras = parseFolio(body).blocks.filter(b => b.kind !== 'callout').length;
  const seen = new Set<string>();
  for (const f of figs as any[]) {
    n++;
    if (seen.has(f.id)) fail(lid, 'duplicate id ' + f.id); seen.add(f.id);
    if (!f.caption || f.caption.length < 20) fail(lid, f.id + ' caption');
    if ((f.type === 'graph') && !f.alt) fail(lid, f.id + ' missing alt');
    if ((f.after ?? 0) > paras) fail(lid, `${f.id} after=${f.after} but only ${paras} text blocks`);
    if (f.type === 'graph' && f.fn) { let ok = 0; for (let i = 0; i <= 50; i++) { const x = f.domain[0] + (f.domain[1] - f.domain[0]) * i / 50; if (isFinite(f.fn(x))) ok++; } if (ok < 40) fail(lid, f.id + ' fn mostly non-finite'); }
    if (f.type === 'diagram') for (const [a, b] of f.edges) if (!f.nodes.some((x: any) => x.id === a) || !f.nodes.some((x: any) => x.id === b)) fail(lid, f.id + ' bad edge');
    if (f.type === 'chart') for (const s of f.series) if (s.points.some((p: number[]) => !isFinite(p[0]) || !isFinite(p[1]))) fail(lid, f.id + ' non-finite point');
  }
}
console.log(`${n} figures in ${Object.keys(LESSON_FIGURES).length} lessons, ${bad} problems`);
