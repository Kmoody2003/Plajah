// Smoke test for the year curriculum: every lesson × tier (+ adaptation profiles on a sample) builds a worksheet and lays
// it out to Tela without throwing, overflowing the page or losing an answer; the offline council reviews a sample.
//   npx esbuild scripts/yearCurriculum/smoke.ts --bundle --platform=node --format=esm --outfile=<tmp>/smoke.mjs && node <tmp>/smoke.mjs
import { YEAR_GRADES, type Tier, type YearSubject } from '../../services/yearCurriculum/types';
import { expandYear } from '../../services/yearCurriculum/yearPlan';
import { buildWorksheet } from '../../services/yearCurriculum/worksheetBuilder';
import { worksheetToTela, PAGE_H, PAGE_W } from '../../services/yearCurriculum/telaWorksheet';
import { PROFILE_PRESETS } from '../../services/yearCurriculum/profiles';
import { convene } from '../../services/educationCouncil/deliberate';

const problems: string[] = [];
let sheets = 0, pagesTotal = 0, maxPages = 0, items = 0, fields = 0;
const pageHist: Record<number, number> = {};
for (const subject of ['math', 'ela'] as YearSubject[]) for (const g of YEAR_GRADES) {
  const lessons = expandYear(g, subject);
  if (lessons.length !== 180) problems.push(`${subject} ${g}: ${lessons.length} lessons`);
  for (const l of lessons) {
    if (subject === 'ela' && !l.passageId) problems.push(`${l.id}: no passage`);
    const profiles = l.dayOfYear % 15 === 0 ? PROFILE_PRESETS.map(p => p.profile) : (['support', 'core', 'stretch'] as Tier[]).map(tier => ({ tier }));
    for (const prof of profiles) {
      try {
        const ws = buildWorksheet(l, prof);
        const its = ws.sections.flatMap(s => s.items);
        if (!its.length) problems.push(`${l.id}/${prof.tier}: no items (${l.kind})`);
        for (const it of its) if (it.answer === undefined || it.answer === 'undefined' || it.answer === 'NaN' || /undefined|NaN/.test(it.prompt)) problems.push(`${l.id}: bad item ${it.skill} ${it.prompt} → ${it.answer}`);
        const { pages, doc } = worksheetToTela(ws, { now: 0 });
        const student = pages.filter(p => !p.teacher);
        sheets++; items += its.length; pagesTotal += student.length; maxPages = Math.max(maxPages, student.length);
        pageHist[student.length] = (pageHist[student.length] || 0) + 1;
        fields += pages.reduce((n, p) => n + p.fields.length, 0);
        for (const p of student) for (const o of p.objects) {
          if (o.templateRole === 'ORNAMENT') continue; // motifs may bleed off the edge; the page clips them
          if (o.y + o.h > PAGE_H + 1 || o.x + o.w > PAGE_W + 2 || o.x < -1 || o.y < -1) { problems.push(`${l.id}/${prof.tier} ${p.id}: ${o.kind} out of page (${Math.round(o.x)},${Math.round(o.y)} ${Math.round(o.w)}×${Math.round(o.h)}) ${o.text?.slice(0, 40) || ''}`); break; }
          if ([o.x, o.y, o.w, o.h].some(v => !Number.isFinite(v))) { problems.push(`${l.id}: non-finite geometry ${o.kind}`); break; }
        }
        if (!doc.frames.length) problems.push(`${l.id}: no frames`);
      } catch (e: any) { problems.push(`${l.id}/${prof.tier}: THROW ${e?.message}\n${e?.stack?.split('\n').slice(1, 3).join('\n')}`); }
    }
  }
}
console.log(`worksheets ${sheets}, items ${items}, answer fields ${fields}, pages ${pagesTotal} (max ${maxPages}), page histogram ${JSON.stringify(pageHist)}`);
const sample = buildWorksheet(expandYear('g4', 'math')[11], { tier: 'support', supports: { fewerChoices: true } });
const s = await convene({ task: 'review-worksheet', worksheet: sample, offline: true });
console.log(`council (offline): ${s.reviews.length} seats, ${s.synthesis.approve} approve / ${s.synthesis.revise} revise; fixes ${s.synthesis.fixes.join(', ') || 'none'}`);
console.log(`  ${s.synthesis.summary}`);
const uniq = [...new Set(problems.map(p => p.replace(/^[^:]+: /, '').replace(/\d+/g, '#').slice(0, 90)))];
console.log(`problems ${problems.length} (${uniq.length} kinds)`);
for (const u of uniq.slice(0, 40)) console.log(' -', u);
for (const p of problems.filter(x => /LINE/.test(x)).slice(0, 3)) console.log(' *', p);
