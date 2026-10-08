/**
 * Export the Law and Medicine curricula as an open, portable knowledge base.
 *   npx tsx scripts/exportOpenCurriculum.ts [outDir=open-curriculum]
 * Writes, per course: README.md (all lessons), course.json (full structure with anchors) and
 * questions.json, plus a top-level INDEX.md and LICENSE.md. Courses with no content yet are skipped.
 * Content licence: CC BY-SA 4.0 (all text is originally authored for Plajah).
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROSTER, STAGE_LABEL } from '../data/lawMedicineRoster';
import { MEDICINE_NOTICE, LAW_NOTICE } from '../data/practice/courseKit';

const out = path.resolve(process.argv[2] || 'open-curriculum');
const write = (p: string, s: string) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };
const today = new Date().toISOString().slice(0, 10);

const rows: string[] = []; let courses = 0, lessons = 0, questions = 0;
for (const r of ROSTER) {
  let mod: any;
  try { mod = (await import(`../data/practice/courses/${r.id}.ts`)).COURSE_MODULE; } catch { continue; }
  const cur = mod.curriculum, bank = mod.bank; const dir = path.join(out, r.subject, r.id);
  const md: string[] = [`# ${cur.label}`, '', `*${STAGE_LABEL[r.stage]}${r.group ? ` · ${r.group}` : ''}*`, '', cur.blurb, '', `> ${r.subject === 'law' ? LAW_NOTICE : MEDICINE_NOTICE}`, '', `> Status: AI-drafted, not yet independently verified. Exported ${today}. Licence: CC BY-SA 4.0.`, ''];
  for (const t of cur.tracks) {
    md.push(`## ${t.title}`, '', t.blurb || '', '');
    for (const l of t.lessons) {
      md.push(`### ${l.title}`, '', `*As of ${l.asOf || 'unknown'}*`, '', l.body || l.blurb || '', '');
      if (l.anchors?.length) md.push('**Sources this lesson depends on:** ' + l.anchors.map((a: any) => `${a.ref} (${a.kind})`).join('; '), '');
      lessons++;
    }
  }
  write(path.join(dir, 'README.md'), md.join('\n'));
  write(path.join(dir, 'course.json'), JSON.stringify({ ...cur, stage: r.stage, group: r.group, license: 'CC-BY-SA-4.0', exportedAt: today }, null, 1));
  write(path.join(dir, 'questions.json'), JSON.stringify(bank.questions, null, 1));
  rows.push(`| ${STAGE_LABEL[r.stage]} | [${cur.label}](${r.subject}/${r.id}/README.md) | ${r.subject} | ${cur.tracks.reduce((n: number, t: any) => n + t.lessons.length, 0)} | ${bank.questions.length} |`);
  courses++; questions += bank.questions.length;
}
write(path.join(out, 'INDEX.md'), ['# Plajah open Law and Medicine curricula', '', 'Free, open educational content from PreK to professional-school depth. Educational use only; not legal or medical advice.', '', '| Stage | Course | Field | Lessons | Questions |', '|---|---|---|---|---|', ...rows, ''].join('\n'));
write(path.join(out, 'LICENSE.md'), '# Licence\n\nAll lesson text, questions and structure in this folder are licensed under Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0): https://creativecommons.org/licenses/by-sa/4.0/\n\nAttribution: "Plajah Academia open curriculum". Linked sources (court opinions, PubMed records, agency notices) keep their own terms.\n');
console.log(`Exported ${courses} courses, ${lessons} lessons, ${questions} questions to ${out}`);
