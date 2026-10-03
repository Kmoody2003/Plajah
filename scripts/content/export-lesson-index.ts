/**
 * Writes scripts/content/out/lesson-index.json: every lesson in every course (id, title, blurb) plus
 * the Labs simulator ids and discipline ids. Authors of cross-curricular connections read this so
 * they link to lessons that really exist.
 *
 *   npx tsx scripts/content/export-lesson-index.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadAllCourses, OUT, ensure } from './lib';

(async () => {
  const courses = await loadAllCourses();
  const lessons = courses.flatMap(c => c.curriculum.tracks.flatMap(t => t.lessons.map(l => ({ courseId: c.id, course: c.curriculum.label, lessonId: l.id, title: l.title, blurb: (l.blurb || '').slice(0, 140) }))));
  let sims: string[] = [];
  try { const src = fs.readFileSync(path.resolve('components/labs/Simulators.tsx'), 'utf-8'); const m = src.match(/export const SIMULATORS[^{]*\{([\s\S]*?)\n\};/); sims = m ? [...m[1].matchAll(/^\s{2}'?([a-zA-Z0-9_-]+)'?\s*:/gm)].map(x => x[1]) : []; } catch { /* optional */ }
  const labs = ['physics', 'chemistry', 'biology', 'cs', 'engineering', 'mathematics', 'neuroscience', 'earth', 'astronomy', 'data', 'environment', 'networks', 'history', 'architecture', 'archaeology', 'combat'];
  ensure(OUT);
  fs.writeFileSync(path.join(OUT, 'lesson-index.json'), JSON.stringify({ labsDisciplines: labs, simulators: sims, lessons }, null, 1));
  console.log(`${lessons.length} lessons in ${courses.length} courses; ${sims.length} simulators -> scripts/content/out/lesson-index.json`);
})();
