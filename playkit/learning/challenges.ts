// playkit/learning/challenges.ts
//
// Word + math challenge generators for any Plajah game that teaches while it plays (Lexicon, Academia
// games, creator quiz rooms). Pure functions: the game passes its own word bank and an rng, gets back a
// four-choice challenge. No DOM, no three — runs in Node tests.
//
// Kinds:
//   letter — a word with one letter missing ("L _ G H T"), clue = its definition
//   arith  — arithmetic at three tiers; tier 2+ sometimes hides an operand (early algebra)
//   value  — a word's weight with A=1 … Z=26
// Gates: subsetReaching() / makeSumTarget() build "weigh your words" locks that are always solvable.

export interface LexEntry { w: string; def: string; tier: number }
export type ChallengeKind = 'letter' | 'arith' | 'value';
export interface Challenge {
  kind: ChallengeKind;
  prompt: string;
  sub: string;
  choices: string[];
  answer: number;
  /** The word this challenge is about (letter / value). */
  entry?: LexEntry;
}

export type Rng = () => number;
const ri = (rng: Rng, n: number) => Math.floor(rng() * n);
const pick = <T,>(rng: Rng, a: readonly T[]): T => a[ri(rng, a.length)];

export const letterValue = (c: string) => c.toUpperCase().charCodeAt(0) - 64;
export const wordValue = (w: string) => [...w.toUpperCase()].reduce((s, c) => s + (c >= 'A' && c <= 'Z' ? letterValue(c) : 0), 0);

function withAnswer(rng: Rng, correct: string, wrong: string[]): { choices: string[]; answer: number } {
  const all = [correct, ...wrong.slice(0, 3)];
  for (let i = all.length - 1; i > 0; i--) { const j = ri(rng, i + 1); [all[i], all[j]] = [all[j], all[i]]; }
  return { choices: all, answer: all.indexOf(correct) };
}

/** Entries at or under `tier`, preferring ones `prefer` accepts (e.g. words the player still needs). */
function pool(bank: readonly LexEntry[], tier: number, prefer?: (e: LexEntry) => boolean, maxLen = 99): LexEntry[] {
  const base = bank.filter((e) => e.tier <= tier && e.w.length <= maxLen);
  const preferred = prefer ? base.filter(prefer) : [];
  return preferred.length ? preferred : base.length ? base : [...bank];
}

export function letterChallenge(bank: readonly LexEntry[], tier: number, prefer?: (e: LexEntry) => boolean, rng: Rng = Math.random): Challenge {
  const entry = pick(rng, pool(bank, tier, prefer));
  const w = entry.w.toUpperCase();
  const i = ri(rng, w.length);
  const missing = w[i];
  const vowels = 'AEIOU', cons = 'BCDFGHKLMNPRSTW';
  const src = vowels.includes(missing) ? vowels : cons;
  const wrong = new Set<string>();
  while (wrong.size < 3) { const c = src[ri(rng, src.length)]; if (c !== missing) wrong.add(c); }
  const { choices, answer } = withAnswer(rng, missing, [...wrong]);
  return { kind: 'letter', prompt: [...w].map((c, k) => (k === i ? '_' : c)).join(' '), sub: `“${entry.def}”`, choices, answer, entry };
}

export function arithChallenge(tier: number, rng: Rng = Math.random): Challenge {
  const t = Math.max(1, Math.min(3, Math.round(tier)));
  let a: number, b: number, op: string;
  if (t === 1) { a = 2 + ri(rng, 9); b = 2 + ri(rng, 9); op = pick(rng, ['+', '×']); }
  else if (t === 2) { a = 6 + ri(rng, 14); b = 3 + ri(rng, 9); op = pick(rng, ['+', '−', '×']); }
  else { a = 11 + ri(rng, 30); b = 4 + ri(rng, 13); op = pick(rng, ['−', '×', '+', '÷']); }
  if (op === '÷') { const q = a; a = q * b; } // keep division whole: (q·b) ÷ b = q
  if (op === '−' && a < b) [a, b] = [b, a];   // no negatives (and the wrong-choice picker needs room above 0)
  const res = op === '+' ? a + b : op === '−' ? a - b : op === '×' ? a * b : a / b;
  const hideB = t >= 2 && rng() < 0.4;
  const prompt = hideB ? `${a} ${op} ? = ${res}` : `${a} ${op} ${b} = ?`;
  const correct = hideB ? b : res;
  const wrong = new Set<number>();
  while (wrong.size < 3) { const w = correct + pick(rng, [-10, -5, -3, -2, -1, 1, 2, 3, 5, 10]); if (w !== correct && w >= 0) wrong.add(w); }
  const { choices, answer } = withAnswer(rng, String(correct), [...wrong].map(String));
  return { kind: 'arith', prompt, sub: 'Numerals bind the word. Break the bond.', choices, answer };
}

export function valueChallenge(bank: readonly LexEntry[], tier: number, prefer?: (e: LexEntry) => boolean, rng: Rng = Math.random): Challenge {
  const entry = pick(rng, pool(bank, tier, prefer, 6));
  const v = wordValue(entry.w);
  const wrong = new Set<number>();
  while (wrong.size < 3) { const w = v + pick(rng, [-9, -4, -3, -2, -1, 1, 2, 3, 4, 9]); if (w !== v && w > 0) wrong.add(w); }
  const { choices, answer } = withAnswer(rng, String(v), [...wrong].map(String));
  return { kind: 'value', prompt: entry.w.toUpperCase(), sub: 'A = 1 … Z = 26. What does it weigh?', choices, answer, entry };
}

/** Indices of values summing exactly to target (first found), or null. */
export function subsetReaching(values: readonly number[], target: number): number[] | null {
  const from = new Map<number, number[]>([[0, []]]);
  values.forEach((v, i) => {
    for (const [s, idx] of [...from]) {
      const n = s + v;
      if (n <= target && !from.has(n)) from.set(n, [...idx, i]);
    }
  });
  return from.get(target) ?? null;
}

/** A gate target that some 2–3 of `values` reach exactly (always solvable). */
export function makeSumTarget(values: readonly number[], rng: Rng = Math.random): number {
  if (values.length < 2) return values[0] ?? 0;
  const idx = values.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) { const j = ri(rng, i + 1); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  const k = values.length >= 3 && rng() < 0.5 ? 3 : 2;
  return idx.slice(0, k).reduce((s, i) => s + values[i], 0);
}
