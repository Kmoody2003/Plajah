/**
 * Self-check for services/musicPedagogy/musicMath.ts — generates 500 problems per grade 1–12 and asserts
 * every one is well-formed: 4 unique choices, the answer among them, standards attached, and no
 * NaN/Infinity/undefined leaking into any string. Prints two samples per grade.
 *   npx tsx scripts/checkMusicMath.ts
 */
import { generateMusicMathProblem, musicMathStandardsForGrade, MUSIC_MATH_PRIMER } from '../services/musicPedagogy/musicMath';

const BAD = /NaN|Infinity|undefined|null/;
let failures = 0;
const fail = (grade: number, why: string, p: unknown) => { if (failures++ < 25) console.error(`✗ g${grade}: ${why}\n  ${JSON.stringify(p)}`); };

for (let grade = 1; grade <= 12; grade++) {
  if (!MUSIC_MATH_PRIMER[grade]) fail(grade, 'missing primer', null);
  if (!musicMathStandardsForGrade(grade).length) fail(grade, 'no standards', null);
  const seen = new Set<string>();
  for (let i = 0; i < 500; i++) {
    const p = generateMusicMathProblem(grade);
    const strings = [p.question, p.answer, p.hint || '', p.explanation, ...p.choices];
    if (p.choices.length !== 4) fail(grade, `${p.choices.length} choices`, p);
    if (new Set(p.choices).size !== p.choices.length) fail(grade, 'duplicate choices', p);
    if (!p.choices.includes(p.answer)) fail(grade, 'answer not in choices', p);
    if (strings.some(s => BAD.test(s))) fail(grade, 'bad token in text', p);
    if (strings.some(s => !s.trim())) fail(grade, 'empty string', p);
    if (!p.standardIds.length) fail(grade, 'no standardIds', p);
    seen.add(p.question);
  }
  const a = generateMusicMathProblem(grade), b = generateMusicMathProblem(grade);
  console.log(`g${grade} · ${seen.size} distinct questions · ${musicMathStandardsForGrade(grade).join(', ')}`);
  for (const p of [a, b]) console.log(`   Q: ${p.question}\n      A: ${p.answer}   [${p.choices.join(' | ')}]`);
}

if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log('\nAll music math checks passed.');
