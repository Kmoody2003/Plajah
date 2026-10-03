/**
 * Find likely mis-keyed questions: both independent blind verifiers chose the same option, and it is not the key.
 *   npx tsx scripts/content/find-miskeys.ts [courseId...]
 * Run it after every verification wave. A hit means either the key is wrong (fix the key, then read the explanation to confirm)
 * or the question is ambiguous (rewrite it). On 2026-10-02 this found 6 hits in 2,543 double-verified questions: four
 * keys that pointed at a wrong option in law-crimpro, one in law-civpro (Gibbs) and one in law-college (equity).
 * Note: question indices in verdict files refer to the load-time shuffled order, which loadAllCourses reproduces for law-/med- courses.
 * If a question's key or options were edited AFTER it was verified, the shuffle can differ: re-verify rather than trust a stale hit.
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadAllCourses, OUT } from './lib';

const only = new Set(process.argv.slice(2));
const vdir = path.join(OUT, 'verdicts');
const read = (f: string) => (fs.existsSync(path.join(vdir, f)) ? JSON.parse(fs.readFileSync(path.join(vdir, f), 'utf8')) : null);
let checked = 0, flagged = 0;
for (const c of await loadAllCourses()) {
  // Only law-/med- courses: older courses' verdicts were recorded against authoring order, so comparing them here gives false hits.
  if (only.size ? !only.has(c.id) : !/^(law|med)-/.test(c.id)) continue;
  const A = read(`${c.id}.A.json`), B = read(`${c.id}.B.json`); if (!A || !B) continue;
  const rows: string[] = [];
  for (const q of c.questions) {
    const a = A.questions.find((x: any) => x.id === q.id)?.answer, b = B.questions.find((x: any) => x.id === q.id)?.answer; checked++;
    if (a != null && a === b && a !== q.answer) rows.push(`  ${q.id}: both verifiers chose #${a}: "${String(q.choices?.[a] ?? '').slice(0, 80)}"; key is #${q.answer}: "${String(q.choices?.[q.answer] ?? '').slice(0, 80)}"`);
  }
  if (rows.length) { flagged += rows.length; console.log(`${c.id}: ${rows.length}`); rows.forEach(r => console.log(r)); }
}
console.log(`checked ${checked} questions with two verdicts; ${flagged} flagged`);
