/**
 * Shared loader for the content-verification pipeline. Collects every course (curriculum + question
 * bank) into one structure so the same code exports claims for checking and merges the results.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Curriculum } from '../../services/schoolChassis';
import type { Question } from '../../data/practice/types';

export interface LoadedCourse { id: string; curriculum: Curriculum; questions: Question[] }

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export async function loadAllCourses(): Promise<LoadedCourse[]> {
  const out: LoadedCourse[] = [];

  // Curricula that ship as separate curriculum + bank files (via the same loaders the app uses).
  const { COURSES, loadCurriculum } = await import('../../services/courseCatalog');
  const { loadBank, hasBank } = await import('../../data/practice');
  for (const c of COURSES.filter(x => x.curriculumId)) {
    if (fs.existsSync(path.join(root, 'data/practice/courses', `${c.curriculumId}.ts`))) continue; // course modules, loaded below
    const cur = await loadCurriculum(c.curriculumId!);
    if (!cur || !hasBank(cur.id)) continue;
    const bank = await loadBank(cur.id);
    if (bank) out.push({ id: cur.id, curriculum: cur, questions: bank.questions });
  }

  // Self-contained course modules (data/practice/courses/*.ts).
  const dir = path.join(root, 'data/practice/courses');
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir).filter(n => n.endsWith('.ts')).sort()) {
      let m: any;
      try { m = await import(pathToFileURL(path.join(dir, f)).href); } catch (e: any) { console.warn(`skipping ${f}: ${String(e?.message || e).split('\n')[0]}`); continue; }
      if (m.COURSE_MODULE) {
        // Law and Medicine only (older courses' verdicts were recorded against authoring order). Same deterministic answer-position shuffle learners see, so a "blind" checker cannot exploit authors' habit of putting the key first.
        const { balanceBank } = await import('../../data/practice/balance');
        out.push({ id: m.COURSE_MODULE.curriculum.id, curriculum: m.COURSE_MODULE.curriculum, questions: /^(law|med)-/.test(m.COURSE_MODULE.curriculum.id) ? balanceBank(m.COURSE_MODULE.bank).questions : m.COURSE_MODULE.bank.questions });
      }
    }
  }
  return out;
}

export const OUT = path.join(root, 'scripts/content/out');
export const ensure = (d: string) => fs.mkdirSync(d, { recursive: true });
