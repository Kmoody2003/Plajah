/**
 * Guard for distractor-balancing edits.
 *
 *   npx tsx scripts/content/distractor-guard.ts snapshot            # before editing: records the key of every question
 *   npx tsx scripts/content/distractor-guard.ts check [courseId]    # after editing: fails if any key, prompt, hint or explanation moved
 *   npx tsx scripts/content/distractor-guard.ts stats [courseId]    # how often the correct choice is uniquely the longest
 *
 * Editing wrong answers must never change what is correct. The snapshot stores, per question: kind, answer index, the TEXT of the
 * correct choice, prompt, hint and explanation. `check` loads the raw modules again and compares every field, and requires the
 * other choices to remain 4 distinct strings.
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadAllCourses, OUT, ensure } from './lib';

const file = path.join(OUT, 'answer-snapshot.json');
type Snap = Record<string, { k: string; a: number; t: string; p: string; h: string; e: string; n: number }>;

const keyText = (q: any) => (q.kind === 'tf' ? ['True', 'False'][q.answer] : q.choices?.[q.answer]);
const snapOf = (q: any) => ({ k: q.kind, a: q.answer, t: keyText(q), p: q.prompt, h: q.hint || '', e: q.explanation || '', n: q.kind === 'tf' ? 2 : (q.choices?.length || 0) });

(async () => {
  const [mode, only] = [process.argv[2], process.argv[3]];
  const courses = (await loadAllCourses()).filter(c => !only || c.id === only);
  if (mode === 'snapshot') {
    ensure(OUT); const out: Snap = {};
    for (const c of await loadAllCourses()) for (const q of c.questions) out[q.id] = snapOf(q);
    fs.writeFileSync(file, JSON.stringify(out)); console.log(`snapshot of ${Object.keys(out).length} questions`); return;
  }
  if (mode === 'check') {
    const snap: Snap = JSON.parse(fs.readFileSync(file, 'utf-8')); let bad = 0, n = 0;
    for (const c of courses) for (const q of c.questions) {
      const s = snap[q.id]; if (!s) continue; n++;
      const now = snapOf(q); const problems: string[] = [];
      for (const f of ['k', 'a', 't', 'p', 'h', 'e', 'n'] as const) if ((now as any)[f] !== (s as any)[f]) problems.push(f === 'a' ? 'answer index moved' : f === 't' ? 'correct choice text changed' : f === 'p' ? 'prompt changed' : f === 'e' ? 'explanation changed' : f === 'h' ? 'hint changed' : f === 'n' ? 'choice count changed' : 'kind changed');
      if (q.kind === 'mcq' && new Set(q.choices).size !== q.choices!.length) problems.push('duplicate choices');
      if (problems.length) { bad++; if (bad <= 25) console.log(`${q.id}: ${problems.join(', ')}`); }
    }
    console.log(bad ? `FAIL: ${bad} of ${n} questions changed beyond their wrong choices` : `OK: ${n} questions, keys and wording untouched`);
    process.exit(bad ? 1 : 0);
  }
  if (mode === 'stats') {
    let m = 0, l = 0, sh = 0;
    for (const c of courses) for (const q of c.questions) { if (q.kind !== 'mcq' || !q.choices) continue; m++; const len = q.choices.map((x: string) => x.length), mx = Math.max(...len), mn = Math.min(...len); if (len[q.answer] === mx && len.filter((x: number) => x === mx).length === 1) l++; if (len[q.answer] === mn && len.filter((x: number) => x === mn).length === 1) sh++; }
    const pc = (n: number) => (m ? Math.round((100 * n) / m) : 0);
    console.log(`${only || 'all'}: of ${m} multiple-choice questions the correct answer is uniquely longest in ${l} (${pc(l)}%) and uniquely shortest in ${sh} (${pc(sh)}%); chance is about 25% each`); return;
  }
  console.log('usage: snapshot | check [courseId] | stats [courseId]');
})();
