/**
 * Step 1 of the verification pipeline: export every course as a CLAIM FILE for independent checkers.
 *
 *   npx tsx scripts/content/export-claims.ts            # all courses
 *   npx tsx scripts/content/export-claims.ts civics-hall
 *
 * The claim files deliberately DO NOT include the answer key, so a checker answers each question
 * blind. Lessons are included so a checker can also extract and verify the factual claims in the
 * teaching text. See docs/CONTENT_INTEGRITY.md for the full protocol.
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadAllCourses, OUT, ensure } from './lib';

(async () => {
  const only = process.argv[2];
  const courses = (await loadAllCourses()).filter(c => !only || c.id === only);
  const dir = path.join(OUT, 'claims'); ensure(dir); ensure(path.join(OUT, 'verdicts'));
  for (const c of courses) {
    const lessons = c.curriculum.tracks.flatMap(t => t.lessons.map(l => ({ id: l.id, title: l.title, /* one paragraph per array item: the file reader truncates lines over ~2000 characters, which hid the back half of long lessons */ body: (l.body || l.blurb || '').split(/\n{2,}/).map(x => x.trim()).filter(Boolean).flatMap(x => x.length > 1500 ? (x.match(/[\s\S]{1,1400}(\s|$)/g) || [x]).map(y => y.trim()) : [x]) })));
    const questions = c.questions.map(q => ({ id: q.id, lessonId: q.lessonId, kind: q.kind, prompt: q.prompt, choices: q.kind === 'tf' ? ['True', 'False'] : q.choices }));
    fs.writeFileSync(path.join(dir, `${c.id}.json`), JSON.stringify({ courseId: c.id, label: c.curriculum.label, lessons, questions }, null, 1));
    console.log(`${c.id}: ${lessons.length} lessons, ${questions.length} questions -> scripts/content/out/claims/${c.id}.json`);
  }
})();
