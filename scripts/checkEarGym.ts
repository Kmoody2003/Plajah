// Headless check of the Ear Gym question builder: every mode × level × direction produces a
// well-formed question (answer among choices, unique choices, rhythm bars of exactly 4 beats
// with distinct onsets, dictation of the right length). Run: npx tsx scripts/checkEarGym.ts
import { MODES, buildQuestion, loadGym, modeStat, recordAnswer, cellLength, type GymProgress } from '../services/musicPedagogy/earTraining';

(globalThis as any).localStorage = { getItem: () => null, setItem: () => {} };
let fails = 0;
const fail = (m: string) => { fails++; if (fails < 20) console.error('FAIL', m); };

for (const mode of MODES) {
  for (let level = 0; level < mode.levels.length; level++) {
    for (const direction of ['asc', 'desc', 'harm', 'mixed'] as const) {
      const g: GymProgress = loadGym('t');
      modeStat(g, mode.id).level = level;
      for (let i = 0; i < 300; i++) {
        const q = buildQuestion(g, mode.id, { direction });
        const tag = `${mode.id} L${level} ${direction}`;
        if (q.kind === 'choice') {
          const ids = q.choices.map(c => c.id);
          if (!ids.includes(q.answer)) fail(`${tag}: answer ${q.answer} not in choices`);
          if (new Set(ids).size !== ids.length) fail(`${tag}: duplicate choices`);
          if (ids.length < 2) fail(`${tag}: <2 choices`);
          if (q.bars) {
            if (ids.length !== 4) fail(`${tag}: rhythm options ${ids.length}`);
            for (const id of ids) {
              const len = q.bars[id].reduce((s, c) => s + cellLength(c), 0);
              if (Math.abs(len - 4) > 1e-6) fail(`${tag}: bar ${id} = ${len} beats`);
            }
          }
        } else {
          if (q.answer.split(' ').length !== q.length) fail(`${tag}: dictation length`);
          if (!q.answer.startsWith('do')) fail(`${tag}: dictation must start on do`);
        }
        if (/undefined|NaN/.test(q.prompt + q.explain(q.answer))) fail(`${tag}: bad text`);
        recordAnswer(g, q, Math.random() < 0.8 ? q.answer : 'x', 0);
      }
    }
  }
}
// Gating: 16 right answers at level 0 should unlock level 1.
const g = loadGym('t');
for (let i = 0; i < 16; i++) { const q = buildQuestion(g, 'intervals'); recordAnswer(g, q, q.answer, i); }
if (modeStat(g, 'intervals').level !== 1) fail('intervals did not level up after 16/16');
console.log(fails ? `${fails} failures` : 'Ear Gym check passed');
process.exit(fails ? 1 : 0);
