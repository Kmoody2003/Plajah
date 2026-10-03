/**
 * Quality gate for a CourseModule file.
 *   npx tsx scripts/validateCourseModule.ts <courseId> [<courseId>...] [--stage k8|hs|college|pro]
 * Exits non-zero if any hard check fails. Warnings are printed but do not fail.
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const STAGES = {
  //          lessons  words/lesson  q/lesson  share of level-3  anchors required per lesson
  k8: { minLessons: 12, minWords: 130, minQ: 4, minL3: 0, anchors: 0 },
  hs: { minLessons: 12, minWords: 220, minQ: 4, minL3: 0.1, anchors: 1 },
  college: { minLessons: 14, minWords: 300, minQ: 5, minL3: 0.2, anchors: 2 },
  pro: { minLessons: 16, minWords: 380, minQ: 5, minL3: 0.35, anchors: 3 },
} as const;
type Stage = keyof typeof STAGES;

const args = process.argv.slice(2);
const si = args.indexOf('--stage');
const stage = (si >= 0 ? args.splice(si, 2)[1] : 'pro') as Stage;
if (!STAGES[stage]) { console.error(`unknown stage ${stage}`); process.exit(2); }
const T = STAGES[stage];

const KINDS = ['case', 'statute', 'regulation', 'treaty', 'mesh', 'drug', 'trial', 'guideline', 'concept'];
const words = (s: string) => (s.trim().match(/\S+/g) || []).length;
const BANNED = [/all of the above/i, /none of the above/i, /both a and b/i, /\bTODO\b/, /lorem ipsum/i, /\[citation needed\]/i];

let failed = 0;
for (const id of args) {
  const errs: string[] = []; const warns: string[] = [];
  let mod: any;
  try { mod = (await import(pathToFileURL(path.resolve('data/practice/courses', `${id}.ts`)).href)).COURSE_MODULE; }
  catch (e: any) { console.log(`FAIL ${id}: cannot import (${e?.message || e})`); failed++; continue; }
  const cur = mod?.curriculum, bank = mod?.bank;
  if (!cur || !bank) { console.log(`FAIL ${id}: COURSE_MODULE needs curriculum and bank`); failed++; continue; }
  if (cur.id !== id) errs.push(`curriculum.id "${cur.id}" must equal "${id}"`);
  if (bank.curriculumId !== id) errs.push(`bank.curriculumId "${bank.curriculumId}" must equal "${id}"`);
  if (!cur.label || !cur.blurb || !/^#[0-9a-fA-F]{6}$/.test(cur.accent || '')) errs.push('label, blurb and a #rrggbb accent are required');

  const lessons = (cur.tracks || []).flatMap((t: any) => t.lessons || []);
  if ((cur.tracks || []).length < 3) errs.push(`needs at least 3 tracks (has ${(cur.tracks || []).length})`);
  if (lessons.length < T.minLessons) errs.push(`needs at least ${T.minLessons} lessons (has ${lessons.length})`);
  const lessonIds = new Set<string>();
  for (const t of cur.tracks || []) {
    if (!t.id?.startsWith(`${id}.`)) errs.push(`track id "${t.id}" must start with "${id}."`);
    if (!t.lessons?.length) errs.push(`track ${t.id} has no lessons`);
  }
  for (const l of lessons) {
    if (lessonIds.has(l.id)) errs.push(`duplicate lesson id ${l.id}`); lessonIds.add(l.id);
    if (!l.id?.startsWith(`${id}.`)) errs.push(`lesson id "${l.id}" must start with "${id}."`);
    const w = words(l.body || '');
    if (w < T.minWords) errs.push(`lesson ${l.id} body is ${w} words (min ${T.minWords})`);
    for (const re of BANNED) if (re.test(l.body || '')) errs.push(`lesson ${l.id} body matches banned pattern ${re}`);
    const an: any[] = l.anchors || [];
    if (an.length < T.anchors) errs.push(`lesson ${l.id} has ${an.length} anchors (min ${T.anchors})`);
    for (const a of an) if (!a.kind || !a.ref || !KINDS.includes(a.kind)) errs.push(`lesson ${l.id} has a malformed anchor ${JSON.stringify(a)}`);
    for (const a of an) if (a.kind === 'case' && a.ref.split('|').length < 3) errs.push(`lesson ${l.id} case anchor "${a.ref}" must be "Name|year|court"`);
    if (!/^\d{4}-\d{2}$/.test(l.asOf || '')) errs.push(`lesson ${l.id} needs asOf "YYYY-MM"`);
  }

  const qs: any[] = bank.questions || [];
  const qIds = new Set<string>(); const prompts = new Set<string>(); const perLesson: Record<string, number> = {};
  let longest = 0, mcqs = 0; const lv = [0, 0, 0, 0];
  for (const q of qs) {
    if (qIds.has(q.id)) errs.push(`duplicate question id ${q.id}`); qIds.add(q.id);
    if (!lessonIds.has(q.lessonId)) errs.push(`question ${q.id} points at missing lesson ${q.lessonId}`);
    if (!q.id?.startsWith(`${q.lessonId}.q`)) errs.push(`question id ${q.id} must be "<lessonId>.q<n>"`);
    perLesson[q.lessonId] = (perLesson[q.lessonId] || 0) + 1;
    const key = (q.prompt || '').trim().toLowerCase();
    if (prompts.has(key)) errs.push(`duplicate prompt in ${q.id}`); prompts.add(key);
    if (!q.prompt || (q.prompt as string).length < 20) errs.push(`question ${q.id} prompt too short`);
    if (!q.explanation || (q.explanation as string).length < 30) errs.push(`question ${q.id} needs a real explanation`);
    if (!q.hint) warns.push(`question ${q.id} has no hint`);
    if (![1, 2, 3].includes(q.level)) errs.push(`question ${q.id} level must be 1, 2 or 3`); else lv[q.level]++;
    for (const re of BANNED) if (re.test(`${q.prompt} ${(q.choices || []).join(' ')}`)) errs.push(`question ${q.id} matches banned pattern ${re}`);
    if (q.kind === 'mcq') {
      mcqs++;
      const c: string[] = q.choices || [];
      if (c.length !== 4) errs.push(`question ${q.id} must have exactly 4 choices`);
      if (new Set(c.map(x => x.trim().toLowerCase())).size !== c.length) errs.push(`question ${q.id} has duplicate choices`);
      if (c.some(x => !x.trim())) errs.push(`question ${q.id} has an empty choice`);
      if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= c.length) errs.push(`question ${q.id} answer index out of range`);
      else { const len = c[q.answer].length; if (c.every((x, i) => i === q.answer || x.length < len)) longest++; }
    } else if (q.kind === 'tf') {
      if (q.answer !== 0 && q.answer !== 1) errs.push(`question ${q.id} tf answer must be 0 or 1`);
    } else errs.push(`question ${q.id} has unknown kind ${q.kind}`);
  }
  // Filler tell: the same trailing words appended to many distractors (and almost never to correct answers).
  const tail = (x: string) => x.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter(Boolean).slice(-5).join(' ');
  const wrongTails: Record<string, number> = {}; const rightTails: Record<string, number> = {};
  for (const q of qs) if (q.kind === 'mcq' && q.choices) q.choices.forEach((c: string, i: number) => { const t = tail(c); (i === q.answer ? rightTails : wrongTails)[t] = ((i === q.answer ? rightTails : wrongTails)[t] || 0) + 1; });
  const filler = Object.entries(wrongTails).filter(([t, n]) => n >= 4 && (rightTails[t] || 0) <= 1);
  const fillerCount = filler.reduce((n, [, c]) => n + c, 0);
  if (fillerCount >= 8) warns.push(`filler tell: ${fillerCount} distractors end with a repeated phrase (e.g. "${filler.sort((a, b) => b[1] - a[1])[0][0]}"); rewrite them instead of padding`);
  for (const l of lessons) if ((perLesson[l.id] || 0) < T.minQ) errs.push(`lesson ${l.id} has ${perLesson[l.id] || 0} questions (min ${T.minQ})`);
  if (mcqs >= 40 && longest / mcqs < 0.12) warns.push(`reverse length tell: correct answer is the longest option in only ${Math.round(100 * longest / mcqs)}% of MCQs (chance is about 25%); the longest option is usually wrong, which is also a tell`);
  if (mcqs && longest / mcqs > 0.42) warns.push(`correct answer is the longest option in ${Math.round(100 * longest / mcqs)}% of MCQs (test-wise tell; aim under 35%)`);
  if (qs.length && lv[3] / qs.length < T.minL3) errs.push(`only ${Math.round(100 * lv[3] / qs.length)}% level-3 questions (min ${Math.round(T.minL3 * 100)}%)`);
  if (mcqs && qs.filter(q => q.kind === 'tf').length / qs.length > 0.15) warns.push('more than 15% true/false; prefer 4-option items');

  const wc = lessons.reduce((n: number, l: any) => n + words(l.body || ''), 0);
  const head = `${errs.length ? 'FAIL' : 'ok  '} ${id}: ${(cur.tracks || []).length} tracks, ${lessons.length} lessons, ${wc} words, ${qs.length} questions (L1/L2/L3 ${lv[1]}/${lv[2]}/${lv[3]})`;
  console.log(head);
  errs.slice(0, 25).forEach(e => console.log(`   ✗ ${e}`)); if (errs.length > 25) console.log(`   ✗ …and ${errs.length - 25} more`);
  warns.slice(0, 6).forEach(w => console.log(`   ! ${w}`));
  if (errs.length) failed++;
}
process.exit(failed ? 1 : 0);
