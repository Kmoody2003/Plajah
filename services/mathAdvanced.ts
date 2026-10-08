/**
 * Procedural math skills for grades 9–12 (Algebra, Geometry, Trigonometry, Precalculus, intro Calculus),
 * extending MathClassroom's grade 1–8 generators so the course map covers K→12. Every generator
 * returns a ready-to-ask PracticeItem with a worked-step explanation, and distractors are built from
 * the common mistakes for that skill (sign errors, forgetting a step) rather than random numbers.
 * Pure + dependency-free so it can be unit-tested.
 */
import type { PracticeItem } from '../components/learn/PracticeView';

type Rng = () => number;
const ri = (r: Rng, a: number, b: number) => a + Math.floor(r() * (b - a + 1));
const pick = <T,>(r: Rng, xs: T[]): T => xs[Math.floor(r() * xs.length)];
const sh = <T,>(r: Rng, a: T[]): T[] => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

/** Build a question from the right answer + wrong answers; shuffles and finds the answer index. */
function mc(r: Rng, id: string, prompt: string, right: string, wrong: string[], explanation: string, hint: string, level: 1 | 2 | 3 = 2): PracticeItem {
  const uniq = [...new Set(wrong.filter(w => w !== right))];
  while (uniq.length < 3) uniq.push(`${right} + ${uniq.length + 1}`); // last-resort filler, never hit for the generators below
  const choices = sh(r, [right, ...uniq.slice(0, 3)]);
  return { id, prompt, choices, answer: choices.indexOf(right), hint, explanation, level };
}

const sgn = (n: number) => (n < 0 ? `- ${-n}` : `+ ${n}`);
const term = (c: number, v: string) => (c === 1 ? v : c === -1 ? `-${v}` : `${c}${v}`);

export interface AdvSkill { topic: string; grade: number; gen: (r: Rng, n: number) => PracticeItem }

export const ADVANCED_SKILLS: AdvSkill[] = [
  { grade: 9, topic: 'Solving Linear Equations', gen: (r, n) => {
    const x = ri(r, -9, 12), a = ri(r, 2, 9), b = ri(r, -15, 15), c = a * x + b;
    return mc(r, `adv9a.${n}`, `Solve for x:  ${a}x ${sgn(b)} = ${c}`, `x = ${x}`,
      [`x = ${x + 1}`, `x = ${x - 1}`, `x = ${-x || 2}`],
      `Subtract ${b} from both sides (${a}x = ${c - b}), then divide by ${a}: x = ${x}.`, 'Undo the addition or subtraction first, then undo the multiplication.');
  } },
  { grade: 9, topic: 'Slope & Lines', gen: (r, n) => {
    const x1 = ri(r, -5, 4), y1 = ri(r, -6, 6), dx = ri(r, 1, 5), m = ri(r, -4, 4) || 1, x2 = x1 + dx, y2 = y1 + m * dx;
    return mc(r, `adv9b.${n}`, `What is the slope of the line through (${x1}, ${y1}) and (${x2}, ${y2})?`, `${m}`,
      [`${-m}`, `${m + 1}`, `${(1 / m).toFixed(2).replace(/\.00$/, '')}`], `Slope = rise / run = (${y2} - ${y1}) / (${x2} - ${x1}) = ${m * dx} / ${dx} = ${m}.`, 'Subtract the y-values, subtract the x-values in the same order, then divide.');
  } },
  { grade: 9, topic: 'Exponent Rules', gen: (r, n) => {
    const b = pick(r, ['x', 'y', 'a']), m = ri(r, 2, 7), k = ri(r, 2, 6);
    const kind = ri(r, 0, 2);
    if (kind === 0) return mc(r, `adv9c.${n}`, `Simplify:  ${b}^${m} · ${b}^${k}`, `${b}^${m + k}`, [`${b}^${m * k}`, `${b}^${Math.abs(m - k) || 1}`, `${b}^${m + k + 1}`], `Same base, multiply: add the exponents. ${m} + ${k} = ${m + k}.`, 'When you multiply powers with the same base, what happens to the exponents?', 1);
    if (kind === 1) return mc(r, `adv9c.${n}`, `Simplify:  (${b}^${m})^${k}`, `${b}^${m * k}`, [`${b}^${m + k}`, `${b}^${m ** 1 + k - 1}`, `${b}^${m}`], `A power of a power: multiply the exponents. ${m} × ${k} = ${m * k}.`, 'Raising a power to a power does something different from multiplying powers.');
    const hi = Math.max(m, k) + 1, lo = Math.min(m, k);
    return mc(r, `adv9c.${n}`, `Simplify:  ${b}^${hi} ÷ ${b}^${lo}`, `${b}^${hi - lo}`, [`${b}^${hi + lo}`, `${b}^${hi * lo}`, `${b}^${hi - lo + 1}`], `Same base, divide: subtract the exponents. ${hi} - ${lo} = ${hi - lo}.`, 'Dividing is the opposite of multiplying.');
  } },
  { grade: 9, topic: 'Factoring Quadratics', gen: (r, n) => {
    const p = ri(r, -7, 7) || 2, q = ri(r, -7, 7) || -3, S = p + q, P = p * q;
    const poly = `x² ${S === 0 ? '' : sgn(S) + 'x '}${sgn(P)}`.replace(/\s+/g, ' ').trim();
    const f = (a: number, b: number) => `(x ${sgn(a)})(x ${sgn(b)})`;
    return mc(r, `adv9d.${n}`, `Factor:  ${poly}`, f(-p, -q), [f(p, q), f(-p, q), f(p, -q)].filter(s => s !== f(-p, -q)),
      `Find two numbers that multiply to ${P} and add to ${S}: ${p} and ${q}. So ${poly} = ${f(-p, -q)}.`, 'You need two numbers whose product is the last term and whose sum is the x coefficient.', 3);
  } },
  { grade: 10, topic: 'Geometry: Area & Volume', gen: (r, n) => {
    const kind = ri(r, 0, 2);
    if (kind === 0) { const R = ri(r, 2, 12); return mc(r, `adv10a.${n}`, `A circle has radius ${R}. What is its area? (leave in terms of π)`, `${R * R}π`, [`${2 * R}π`, `${R}π`, `${R * R * 2}π`], `Area = πr² = π × ${R}² = ${R * R}π.`, 'Area uses the radius squared.', 1); }
    if (kind === 1) { const a = ri(r, 3, 9), b = ri(r, 4, 12), h = ri(r, 2, 10); return mc(r, `adv10a.${n}`, `A rectangular prism is ${a} by ${b} by ${h}. What is its volume?`, `${a * b * h}`, [`${2 * (a * b + b * h + a * h)}`, `${a + b + h}`, `${a * b + h}`], `Volume = length × width × height = ${a} × ${b} × ${h} = ${a * b * h}.`, 'Volume multiplies all three dimensions.', 1); }
    const base = ri(r, 4, 14), h = ri(r, 3, 12) * 2; return mc(r, `adv10a.${n}`, `A triangle has base ${base} and height ${h}. What is its area?`, `${(base * h) / 2}`, [`${base * h}`, `${base + h}`, `${(base * h) / 3}`], `Area = ½ × base × height = ½ × ${base} × ${h} = ${(base * h) / 2}.`, 'A triangle is half of a matching rectangle.', 1);
  } },
  { grade: 10, topic: 'Pythagorean Triples & Distance', gen: (r, n) => {
    const t = pick(r, [[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25], [20, 21, 29]]), k = ri(r, 1, 3), [a, b, c] = t.map(v => v * k);
    return mc(r, `adv10b.${n}`, `A right triangle has legs ${a} and ${b}. How long is the hypotenuse?`, `${c}`, [`${a + b}`, `${c + 1}`, `${Math.abs(b - a) || 1}`], `c² = ${a}² + ${b}² = ${a * a} + ${b * b} = ${c * c}, so c = ${c}.`, 'Square both legs, add them, then take the square root.', 2);
  } },
  { grade: 10, topic: 'Trigonometric Ratios', gen: (r, n) => {
    const [o, a, h] = pick(r, [[3, 4, 5], [5, 12, 13], [8, 15, 17]]);
    const which = pick(r, ['sin', 'cos', 'tan'] as const);
    const val = which === 'sin' ? `${o}/${h}` : which === 'cos' ? `${a}/${h}` : `${o}/${a}`;
    const wr = which === 'sin' ? [`${a}/${h}`, `${o}/${a}`, `${h}/${o}`] : which === 'cos' ? [`${o}/${h}`, `${o}/${a}`, `${h}/${a}`] : [`${a}/${o}`, `${o}/${h}`, `${a}/${h}`];
    return mc(r, `adv10c.${n}`, `In a right triangle, the side opposite angle θ is ${o}, the adjacent side is ${a} and the hypotenuse is ${h}. What is ${which} θ?`, val, wr,
      `SOH-CAH-TOA: sin = opposite/hypotenuse, cos = adjacent/hypotenuse, tan = opposite/adjacent. So ${which} θ = ${val}.`, 'Remember SOH-CAH-TOA.', 2);
  } },
  { grade: 11, topic: 'Logarithms', gen: (r, n) => {
    const b = pick(r, [2, 3, 5, 10]), e = ri(r, 2, 5), v = b ** e;
    return mc(r, `adv11a.${n}`, `Evaluate:  log base ${b} of ${v}`, `${e}`, [`${e + 1}`, `${v / b}`, `${b}`], `log_${b}(${v}) asks "${b} to what power is ${v}?" Since ${b}^${e} = ${v}, the answer is ${e}.`, 'Ask: what exponent turns the base into this number?', 2);
  } },
  { grade: 11, topic: 'Quadratic Formula & Discriminant', gen: (r, n) => {
    const p = ri(r, -6, 6) || 1, q = ri(r, -6, 6) || 2, a = 1, b = -(p + q), c = p * q, D = b * b - 4 * a * c;
    return mc(r, `adv11b.${n}`, `What is the discriminant of x² ${b === 0 ? '' : sgn(b) + 'x '}${sgn(c)} = 0?`, `${D}`, [`${b * b + 4 * c}`, `${-D || 1}`, `${b * b - 2 * c}`],
      `Discriminant = b² - 4ac = (${b})² - 4(1)(${c}) = ${b * b} - ${4 * c} = ${D}. ${D > 0 ? 'Positive: two real roots.' : D === 0 ? 'Zero: one repeated root.' : 'Negative: no real roots.'}`, 'Use b² - 4ac.', 3);
  } },
  { grade: 12, topic: 'Derivatives (Power Rule)', gen: (r, n) => {
    const a = ri(r, 2, 9), e = ri(r, 2, 6), form = `${a}x^${e}`;
    return mc(r, `adv12a.${n}`, `Differentiate:  f(x) = ${form}`, `${a * e}x^${e - 1}`, [`${a}x^${e - 1}`, `${a * e}x^${e}`, `${a * (e - 1)}x^${e - 1}`],
      `Power rule: bring the exponent down and subtract one. d/dx[${form}] = ${a}·${e}·x^${e - 1} = ${a * e}x^${e - 1}.`, 'Multiply by the exponent, then lower the exponent by 1.', 2);
  } },
  { grade: 12, topic: 'Limits & Continuity (basic)', gen: (r, n) => {
    if (ri(r, 0, 1) === 0) {
      const x0 = ri(r, 2, 12);
      return mc(r, `adv12b.${n}`, `Evaluate:  lim (x→${x0}) of (x² - ${x0 * x0}) / (x - ${x0})`, `${2 * x0}`, [`${x0}`, `${x0 * x0}`, `does not exist`],
        `Factor the top: (x - ${x0})(x + ${x0}). Cancel (x - ${x0}) to get x + ${x0}, which approaches ${2 * x0} as x → ${x0}.`, 'Try factoring the numerator as a difference of squares.', 3);
    }
    const a = ri(r, 2, 7), b = ri(r, -9, 9), x0 = ri(r, -4, 6), v = a * x0 + b;
    return mc(r, `adv12b.${n}`, `Evaluate:  lim (x→${x0}) of (${a}x ${sgn(b)})`, `${v}`, [`${v + a}`, `${a * x0}`, `does not exist`],
      `A polynomial is continuous, so just substitute x = ${x0}: ${a}(${x0}) ${sgn(b)} = ${v}.`, 'For a continuous function, the limit equals the value.', 2);
  } },
];

export const ADVANCED_TOPICS_BY_GRADE: Record<number, string[]> = ADVANCED_SKILLS.reduce((m, s) => { (m[s.grade] ||= []).push(s.topic); return m; }, {} as Record<number, string[]>);

/** A seeded RNG so a given (skill, seed) always yields the same set — used by tests. */
export function seeded(seed: number): Rng { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

export function advancedItems(grade: number, topic: string, count = 10, rng: Rng = Math.random): PracticeItem[] {
  const sk = ADVANCED_SKILLS.find(s => s.grade === grade && s.topic === topic);
  if (!sk) return [];
  const out: PracticeItem[] = []; const seen = new Set<string>();
  for (let i = 0; i < count * 6 && out.length < count; i++) { const it = sk.gen(rng, i); if (!seen.has(it.prompt)) { seen.add(it.prompt); out.push(it); } }
  return out;
}
