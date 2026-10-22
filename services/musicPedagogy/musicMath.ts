/**
 * Music Math — procedural Math Quest problems where the math IS the music: beats and bars for counting,
 * note values for fractions, tempo for rates, interval ratios for proportion, equal temperament for
 * exponents and sine waves / octaves for high-school functions. Every problem is exact (rational
 * arithmetic in 16ths for rhythm, integer-friendly tempos and frequencies), carries a hint + a worked
 * explanation, and its distractors are the mistakes students really make (adding denominators, treating
 * tempo as direct instead of inverse, linear instead of exponential pitch). Pure + dependency-free;
 * pass a seeded rng for reproducible sets.
 */
import type { MathProblem } from '../../components/MathClassroom';

export const MUSIC_MATH_TOPIC = 'Music Math';

export type MusicMathProblem = Omit<MathProblem, 'id'> & { standardIds: string[]; explanation: string };

/** One sentence per grade on why this math is music — shown above the quest. */
export const MUSIC_MATH_PRIMER: Record<number, string> = {
  1: 'Music is counting you can dance to: every bar holds the same number of beats.',
  2: 'Drummers add beats in their heads, so a groove is really an addition sentence.',
  3: 'A whole note splits into halves, quarters and eighths, so every rhythm is made of fractions.',
  4: 'Filling a bar is fraction addition: the notes must add up to exactly the time signature.',
  5: 'A dot adds half a note\'s value again, and 6/8 vs 3/4 shows equal fractions can feel different.',
  6: 'Tempo is a rate (beats per minute) and harmony is ratios: an octave is 2:1, a fifth is 3:2.',
  7: 'Speed up a song and it gets shorter, halve a string and it sings an octave higher: proportion you can hear.',
  8: 'Every piano key is the one before times 2^(1/12), so exponents literally tune the instrument.',
  9: 'Octaves double the frequency, so pitch climbs exponentially while the keyboard looks linear.',
  10: 'A sound wave is a sine function: its period and frequency are what your ear hears as pitch.',
  11: 'Counting octaves is log base 2, which is why musicians measure intervals in cents and semitones.',
  12: 'Synths are function machines: sine waves, exponential envelopes and logarithmic pitch.',
};

// ── Small exact-math helpers ─────────────────────────────────────────────────────
type Rng = () => number;
const ri = (r: Rng, a: number, b: number) => a + Math.floor(r() * (b - a + 1));
const pick = <T,>(r: Rng, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
const sh = <T,>(r: Rng, a: T[]): T[] => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));
const lcm = (a: number, b: number) => (a / gcd(a, b)) * b;
/** Decimal with at most 4 places and no trailing zeros (0.5, 1.25, 659). */
const num = (x: number) => String(parseFloat(x.toFixed(4)));
/** Reduced fraction "3/8"; whole numbers print bare. */
const frac = (n: number, d: number) => { const g = gcd(n, d) || 1; const a = n / g, b = d / g; return b === 1 ? `${a}` : `${a}/${b}`; };
/** Reduced mixed number "1 1/4" for values past one whole. */
const mixed = (n: number, d: number) => { const g = gcd(n, d) || 1; const a = n / g, b = d / g; if (b === 1) return `${a}`; const w = Math.floor(a / b); return w ? `${w} ${a - w * b}/${b}` : `${a}/${b}`; };

// Note values measured in sixteenths of a whole note, so every rhythm sum stays an integer.
const NOTES = [
  { name: 'whole note', six: 16, f: '1' },
  { name: 'half note', six: 8, f: '1/2' },
  { name: 'quarter note', six: 4, f: '1/4' },
  { name: 'eighth note', six: 2, f: '1/8' },
  { name: 'sixteenth note', six: 1, f: '1/16' },
] as const;
const noteBySix = (six: number) => NOTES.find(n => n.six === six)!;

/**
 * Assemble the problem: the right answer + up to three unique wrong ones. If the hand-written
 * distractors collapse (duplicates, equal to the answer, nonsense), `nudge` supplies near misses.
 */
function build(
  r: Rng, grade: number, question: string, answer: string, wrong: string[], hint: string, explanation: string,
  standardIds: string[], nudge?: (k: number) => string,
): MusicMathProblem {
  const bad = (s: string) => !s || s === answer || s.startsWith('-') || /NaN|Infinity|undefined/.test(s);
  const pool: string[] = [];
  for (const w of wrong) if (!bad(w) && !pool.includes(w)) pool.push(w);
  for (let k = 1; pool.length < 3 && nudge && k < 40; k++) {
    const w = nudge(k % 2 ? Math.ceil(k / 2) : -Math.ceil(k / 2));
    if (!bad(w) && !pool.includes(w)) pool.push(w);
  }
  const choices = sh(r, [answer, ...pool.slice(0, 3)]);
  return { grade, topic: MUSIC_MATH_TOPIC, question, answer, choices, hint, explanation, standardIds };
}

/** Integer near-miss nudger with an optional unit suffix, never going below `min`. */
const intNudge = (value: number, step = 1, unit = '', min = 0) => (k: number) => { const v = value + k * step; return v >= min ? `${num(v)}${unit}` : ''; };

// ── Grades 1–2: beats, bars, patterns ─────────────────────────────────────────────
function gradeK2(r: Rng, grade: number): MusicMathProblem {
  const ids = [grade === 1 ? 'CCSS.MATH.1.OA' : 'CCSS.MATH.2.NBT', 'MUSIC.RHY.K2'];
  const kind = ri(r, 0, 2);
  if (kind === 0) {
    const per = pick(r, [2, 3, 4]), bars = ri(r, 2, grade === 1 ? 3 : 6), ans = per * bars;
    return build(r, grade, `A song is in ${per}/4 time, so each bar has ${per} beats. How many beats are in ${bars} bars?`, `${ans}`,
      [`${per + bars}`, `${ans + per}`, `${ans - per}`, `${ans + 1}`], `Count ${per} beats for each of the ${bars} bars.`,
      `${bars} bars × ${per} beats = ${Array(bars).fill(per).join(' + ')} = ${ans} beats.`, ids, intNudge(ans, 1, '', 1));
  }
  if (kind === 1) {
    const sounds = sh(r, ['clap', 'stomp', 'snap', 'tap']);
    const cycle = pick(r, [[0, 0, 1], [0, 1], [0, 1, 1], [0, 0, 1, 2], [0, 1, 2]]);
    const pat = cycle.map(i => sounds[i]);
    const n = ri(r, cycle.length + 2, grade === 1 ? 9 : 14);
    const ans = pat[(n - 1) % pat.length];
    const shown = Array.from({ length: cycle.length * 2 }, (_, i) => pat[i % pat.length]).join(', ');
    return build(r, grade, `A rhythm pattern repeats: ${shown}, … What is sound number ${n}?`, ans, sounds.filter(s => s !== ans),
      `The pattern repeats every ${pat.length} sounds. Keep counting the cycle.`,
      `The cycle "${pat.join(', ')}" has ${pat.length} sounds. Sound ${n} lands on position ${((n - 1) % pat.length) + 1} of the cycle: ${ans}.`, ids);
  }
  const a = ri(r, 2, grade === 1 ? 6 : 24), b = ri(r, 2, grade === 1 ? 4 : 24), ans = a + b;
  return build(r, grade, `The drums play ${a} beats, then the piano plays ${b} more beats. How many beats in all?`, `${ans}`,
    [`${ans + 1}`, `${ans - 1}`, `${Math.abs(a - b)}`, `${ans + 10}`], `Start at ${a} and count up ${b}.`,
    `${a} + ${b} = ${ans} beats.`, ids, intNudge(ans, 1, '', 1));
}

// ── Grade 3: note values are unit fractions ─────────────────────────────────────────
function grade3(r: Rng): MusicMathProblem {
  const ids = ['CCSS.MATH.3.NF', 'MUSIC.RHY.35'];
  const kind = ri(r, 0, 2);
  if (kind === 0) {
    const n = pick(r, NOTES.slice(1));
    return build(r, 3, `What fraction of a whole note is one ${n.name}?`, n.f, NOTES.slice(1).map((x): string => x.f).filter(f => f !== n.f).concat(['1/3']),
      'Count how many of this note fit in one whole note, then take one of those parts.',
      `${16 / n.six} ${n.name}s fill a whole note, so one ${n.name} is ${n.f} of it.`, ids);
  }
  if (kind === 1) {
    const big = pick(r, NOTES.slice(0, 3)), small = pick(r, NOTES.filter(x => x.six < big.six && x.six >= 2)), ans = big.six / small.six;
    return build(r, 3, `How many ${small.name}s fill one ${big.name}?`, `${ans}`, [`${ans * 2}`, `${ans / 2}`, `${ans + 1}`, `${ans + 2}`],
      `A ${small.name} is ${small.f} and a ${big.name} is ${big.f}. How many small parts make the big one?`,
      `${big.f} ÷ ${small.f} = ${ans}, so ${ans} ${small.name}s fill a ${big.name}.`, ids, intNudge(ans, 1, '', 1));
  }
  const n = pick(r, NOTES.slice(2, 4)), parts = 16 / n.six, k = ri(r, 2, parts - 1);
  const ans = frac(k, parts);
  return build(r, 3, `${parts} ${n.name}s make one whole note. What fraction of the whole note is ${k} ${n.name}s?`, ans,
    [frac(1, k), `${k}/${parts * 2}`, `${parts}/${k}`, frac(1, parts), `${k + 1}/${parts}`],
    `Each ${n.name} is 1/${parts} of the whole. You have ${k} of them.`, `${k} × 1/${parts} = ${k}/${parts}${ans !== `${k}/${parts}` ? ` = ${ans}` : ''} of a whole note.`, ids);
}

// ── Grade 4: fill the measure (fraction addition + equivalence) and rule patterns ─────
const noteList = (sixes: number[]) => sixes.map(s => noteBySix(s).f).join(' + ');
function grade4(r: Rng): MusicMathProblem {
  const ids = ['CCSS.MATH.4.NF', 'MUSIC.RHY.35'];
  const kind = ri(r, 0, 3);
  if (kind === 0) {
    const sixes = Array.from({ length: ri(r, 3, 4) }, () => pick(r, [8, 4, 2, 2, 4])), total = sixes.reduce((a, b) => a + b, 0);
    const ans = mixed(total, 16), naiveD = sixes.map(s => 16 / s).reduce((a, b) => a + b, 0);
    return build(r, 4, `Add these note values as fractions of a whole note: ${noteList(sixes)} = ?`, ans,
      [frac(sixes.length, naiveD), mixed(total + 2, 16), mixed(Math.max(1, total - 2), 16), mixed(total + 4, 16)],
      'Rewrite every note in eighths (or sixteenths) first, then add the tops.',
      `In sixteenths: ${sixes.join(' + ')} = ${total}/16 = ${ans} whole note${total > 16 ? 's' : ''}.`, ids, k => mixed(Math.max(1, total + k * 2), 16));
  }
  if (kind === 1) {
    const beats = pick(r, [2, 3, 4]), bar = beats * 4;
    const rest = pick(r, beats === 2 ? [4, 2] : [8, 4, 2]);
    const given: number[] = []; let left = bar - rest;
    while (left > 0) { const s = pick(r, [8, 4, 2].filter(v => v <= left)); given.push(s); left -= s; }
    const target = noteBySix(rest);
    return build(r, 4, `A bar of ${beats}/4 holds ${bar === 16 ? 'one whole note' : `${frac(bar, 16)} of a whole note`}. It already has ${noteList(given)}. Which single note completes the bar?`,
      `${target.name} (${target.f})`, NOTES.filter(n => n.six !== rest).map(n => `${n.name} (${n.f})`).slice(0, 4),
      `Find what is missing: ${frac(bar, 16)} minus the notes you already have.`,
      `${frac(bar, 16)} = ${bar}/16. The notes so far are ${bar - rest}/16, so ${rest}/16 = ${target.f} is missing: a ${target.name}.`, ids);
  }
  if (kind === 2) {
    const from = pick(r, NOTES.slice(1, 3)), to = pick(r, NOTES.filter(n => n.six < from.six && n.six >= 2)), k = ri(r, 2, 5), ans = (k * from.six) / to.six;
    return build(r, 4, `${k} ${from.name}s last as long as how many ${to.name}s?`, `${ans}`, [`${k * 2 === ans ? ans + k : k * 2}`, `${ans / 2}`, `${ans + 2}`, `${k}`],
      `One ${from.name} = ${from.six / to.six} ${to.name}s. Multiply.`, `${k} × ${from.f} = ${frac(k * from.six, 16)} = ${ans} × ${to.f}, so ${ans} ${to.name}s.`, ids, intNudge(ans, 1, '', 1));
  }
  // Rhythmic pattern that follows a rule (4.OA.C.5)
  const start = ri(r, 1, 4), step = ri(r, 2, 4), bar = ri(r, 5, 8), ans = start + (bar - 1) * step;
  const seq = [0, 1, 2, 3].map(i => start + i * step).join(', ');
  return build(r, 4, `A drummer's fill grows by a rule. Hits per bar: ${seq}, … How many hits in bar ${bar}?`, `${ans}`,
    [`${start + bar * step}`, `${ans - step}`, `${bar * step}`, `${ans + 1}`], `What is added each bar? Bar ${bar} gets that ${bar - 1} times after bar 1.`,
    `The rule is "add ${step}". Bar ${bar} = ${start} + ${bar - 1} × ${step} = ${ans} hits.`, ['CCSS.MATH.4.OA.C.5', 'MUSIC.RHY.35'], intNudge(ans, 1, '', 1));
}

// ── Grade 5: dotted notes, compound metre, beat decimals ─────────────────────────────
const DOTTED = [
  { name: 'dotted half note', beats: 3, f: '3/4' },
  { name: 'dotted quarter note', beats: 1.5, f: '3/8' },
  { name: 'dotted eighth note', beats: 0.75, f: '3/16' },
] as const;
function grade5(r: Rng): MusicMathProblem {
  const ids = ['CCSS.MATH.5.NF', 'MUSIC.RHY.68'];
  const kind = ri(r, 0, 3);
  if (kind === 0) {
    const d = pick(r, DOTTED), base = (d.beats * 2) / 3;
    const bt = (x: number) => `${num(x)} beat${x === 1 ? '' : 's'}`;
    return build(r, 5, `A quarter note gets 1 beat. A dot adds half the note's value. How many beats does a ${d.name} get?`, bt(d.beats),
      [bt(base), bt(base * 2), bt(base + 1), bt(base + 0.5)],
      'Take the plain note\'s beats, then add half of that again.', `Plain note = ${num(base)} beat${base === 1 ? '' : 's'}; half of it = ${num(base / 2)}; total ${num(base)} + ${num(base / 2)} = ${num(d.beats)} beats.`, ids,
      k => bt(d.beats + k * 0.25));
  }
  if (kind === 1) {
    const d = pick(r, DOTTED), plain = d.f === '3/4' ? '1/2' : d.f === '3/8' ? '1/4' : '1/8';
    return build(r, 5, `A ${d.name.replace('dotted ', '')} is ${plain} of a whole note. What fraction of a whole note is a ${d.name}?`, d.f,
      DOTTED.map((x): string => x.f).filter(f => f !== d.f).concat([plain, `${plain.split('/')[0]}/${Number(plain.split('/')[1]) * 2}`, '1']),
      'Dot = the note plus half of the note.', `${plain} + half of ${plain} = ${plain} + ${frac(1, Number(plain.split('/')[1]) * 2)} = ${d.f}.`, ids);
  }
  if (kind === 2) {
    const top = pick(r, [6, 9, 12]), ans = top / 3;
    return build(r, 5, `In ${top}/8 time, the beat is a dotted quarter note (3 eighths). How many beats are in one bar?`, `${ans}`,
      [`${top}`, `${top / 2}`, `${ans + 1}`, `${ans * 2}`], 'Group the eighth notes in threes.',
      `${top} eighths ÷ 3 eighths per beat = ${ans} beats. (${top}/8 = ${mixed(top, 8)} of a whole note, felt as ${ans} big beats.)`, ids, intNudge(ans, 1, '', 1));
  }
  const parts = Array.from({ length: 3 }, () => pick(r, [{ n: 'half note', b: 2 }, { n: 'quarter note', b: 1 }, { n: 'eighth note', b: 0.5 }, ...DOTTED.map(d => ({ n: d.name, b: d.beats as number }))]));
  const total = parts.reduce((a, p) => a + p.b, 0);
  return build(r, 5, `With a quarter note = 1 beat, how many beats is ${parts.map(p => `${/^[aeiou]/.test(p.n) ? 'an' : 'a'} ${p.n}`).join(' + ')}? (decimal)`, num(total),
    [num(total + 0.5), num(total - 0.5), num(total + 0.25), num(total + 1)], 'Turn each note into beats as a decimal, then add.',
    `${parts.map(p => num(p.b)).join(' + ')} = ${num(total)} beats.`, ids, intNudge(total, 0.25, '', 0.25));
}

// ── Grade 6: ratios & rates (tempo, intervals, polyrhythm) ──────────────────────────
const INTERVALS = [
  { name: 'an octave above', p: 2, q: 1, ratio: '2:1' },
  { name: 'a perfect fifth above', p: 3, q: 2, ratio: '3:2' },
  { name: 'a perfect fourth above', p: 4, q: 3, ratio: '4:3' },
  { name: 'a major third above', p: 5, q: 4, ratio: '5:4' },
] as const;
function grade6(r: Rng): MusicMathProblem {
  const kind = ri(r, 0, 4);
  if (kind === 0) {
    const bpm = pick(r, [30, 40, 48, 60, 75, 80, 96, 100, 120, 150, 240]), s = 60 / bpm;
    return build(r, 6, `A metronome is set to ${bpm} beats per minute. How many seconds does each beat last?`, `${num(s)} s`,
      [`${num(bpm / 60)} s`, `${num(s * 2)} s`, `${num(s / 2)} s`, `${num(s + 0.25)} s`], '60 seconds are shared equally among the beats in a minute.',
      `60 s ÷ ${bpm} beats = ${num(s)} s per beat.`, ['CCSS.MATH.6.RP', 'MUSIC.RHY.68'], intNudge(s, 0.1, ' s', 0.05));
  }
  if (kind === 1) {
    const bpm = pick(r, [60, 80, 90, 100, 120, 150]), unit = bpm / gcd(240, bpm); // bars must be a multiple of unit for whole seconds
    const bars = unit * ri(r, Math.ceil(8 / unit), Math.floor(64 / unit));
    const beats = bars * 4, secs = (beats * 60) / bpm;
    return build(r, 6, `A song has ${bars} bars of 4/4 at ${bpm} BPM. How many seconds long is it?`, `${secs} s`,
      [`${beats} s`, `${secs * 2} s`, `${num((bars * 60) / bpm)} s`, `${secs + (240 / bpm)} s`], 'Find the total beats, then use the rate: beats ÷ BPM gives minutes.',
      `${bars} × 4 = ${beats} beats. ${beats} ÷ ${bpm} = ${num(beats / bpm)} min = ${secs} s.`, ['CCSS.MATH.6.RP', 'MUSIC.RHY.68'], intNudge(secs, 5, ' s', 1));
  }
  if (kind === 2) {
    const iv = pick(r, INTERVALS), isA = r() < 0.5 && iv.p <= 3;
    const f = isA ? pick(r, [110, 220, 440]) : 12 * ri(r, 10, 35), ans = (f * iv.p) / iv.q;
    const label = isA ? `A${f === 110 ? 2 : f === 220 ? 3 : 4} = ${f} Hz` : `A note at ${f} Hz`;
    const others = INTERVALS.filter(x => x !== iv).map(x => `${Math.round((f * x.p) / x.q)} Hz`);
    return build(r, 6, `${label}. In just intonation, ${iv.name} has frequency ratio ${iv.ratio}. What frequency is ${iv.name}?`, `${num(ans)} Hz`,
      [...others, `${f + iv.p * 10} Hz`], `Multiply by ${iv.p}/${iv.q}.`, `${f} × ${iv.p}/${iv.q} = ${num(ans)} Hz.`, ['CCSS.MATH.6.RP', 'MUSIC.HAR.68'], intNudge(ans, 10, ' Hz', 1));
  }
  if (kind === 3) {
    const iv = pick(r, INTERVALS), k = 12 * ri(r, 10, 30), lo = k * iv.q, hi = k * iv.p;
    return build(r, 6, `Two strings vibrate at ${lo} Hz and ${hi} Hz. What is the ratio of the higher to the lower, in simplest form?`, iv.ratio,
      INTERVALS.filter(x => x !== iv).map(x => x.ratio), 'Divide both frequencies by their greatest common factor.',
      `${hi}:${lo} → divide by ${k} → ${iv.ratio}, ${iv.name.replace(' above', '')}.`, ['CCSS.MATH.6.RP', 'MUSIC.HAR.68']);
  }
  const [a, b] = pick(r, [[3, 2], [4, 3], [5, 2], [5, 3], [5, 4], [4, 6], [6, 9], [6, 4]]), L = lcm(a, b);
  return build(r, 6, `A ${a}-against-${b} polyrhythm: one hand plays ${a} even notes while the other plays ${b} in the same time. What is the fewest equal pulses that fits both?`, `${L}`,
    [`${a + b}`, `${a * b}`, `${L * 2}`, `${Math.max(a, b)}`], 'You need a number both counts divide into evenly: the least common multiple.',
    `Multiples of ${a}: ${[1, 2, 3, 4].map(i => a * i).join(', ')}… Multiples of ${b}: ${[1, 2, 3, 4].map(i => b * i).join(', ')}… LCM = ${L} pulses.`, ['CCSS.MATH.6.RP', 'MUSIC.RHY.68'], intNudge(L, 1, '', 2));
}

// ── Grade 7: proportional reasoning & equations ────────────────────────────────────
function grade7(r: Rng): MusicMathProblem {
  const kind = ri(r, 0, 3);
  if (kind === 0) {
    let bpm = 120, s = 60;
    for (let t = 0; t < 30; t++) { bpm = 6 * ri(r, 10, 30); s = pick(r, [20, 30, 40, 45, 90, 150]); if ((bpm * s) % 60 === 0) break; bpm = 120; s = 60; }
    const n = (bpm * s) / 60;
    return build(r, 7, `A drummer plays ${n} beats in ${s} seconds. Solve n = (BPM ÷ 60) × t for the tempo in BPM.`, `${bpm} BPM`,
      [`${num(n / s)} BPM`, `${num((n * s) / 60)} BPM`, `${bpm + 10} BPM`, `${n} BPM`], 'Divide both sides by t, then multiply by 60.',
      `BPM = 60 × n ÷ t = 60 × ${n} ÷ ${s} = ${bpm} BPM.`, ['CCSS.MATH.7.EE', 'MUSIC.RHY.68'], intNudge(bpm, 6, ' BPM', 6));
  }
  if (kind === 1) {
    let b1 = 90, b2 = 120, t1 = 240;
    for (let t = 0; t < 40; t++) { b1 = pick(r, [60, 72, 80, 90, 96, 100, 120]); b2 = pick(r, [60, 72, 80, 90, 96, 100, 120, 144, 150].filter(x => x !== b1)); t1 = 30 * ri(r, 4, 10); if ((t1 * b1) % b2 === 0) break; b1 = 90; b2 = 120; t1 = 240; }
    const t2 = (t1 * b1) / b2;
    return build(r, 7, `A song at ${b1} BPM lasts ${t1} seconds. If the band plays the same notes at ${b2} BPM, how long does it last?`, `${t2} s`,
      [`${num((t1 * b2) / b1)} s`, `${t1 + (b1 - b2)} s`, `${t1} s`, `${t2 + 30} s`], 'Faster tempo → shorter song. Time is inversely proportional to tempo.',
      `t × BPM stays constant: ${t1} × ${b1} = t × ${b2}, so t = ${t1 * b1} ÷ ${b2} = ${t2} s.`, ['CCSS.MATH.7.EE', 'MUSIC.RHY.68'], intNudge(t2, 10, ' s', 1));
  }
  if (kind === 2) {
    const L1 = 60, [p, q] = pick(r, [[1, 2], [2, 3], [3, 4], [4, 5]]), L2 = (L1 * p) / q, f1 = 12 * ri(r, 10, 30), f2 = (f1 * q) / p;
    return build(r, 7, `A ${L1} cm string plays ${f1} Hz. Frequency is inversely proportional to length. What frequency does ${L2} cm of the string play?`, `${num(f2)} Hz`,
      [`${num((f1 * p) / q)} Hz`, `${f1 + (L1 - L2)} Hz`, `${f1 * 2 === f2 ? f1 * 3 : f1 * 2} Hz`, `${num(f2 + 20)} Hz`], 'Shorter string → higher pitch. Length × frequency stays the same.',
      `${L1} × ${f1} = ${L2} × f, so f = ${L1 * f1} ÷ ${L2} = ${num(f2)} Hz.`, ['CCSS.MATH.7.EE', 'MUSIC.HAR.68'], intNudge(f2, 12, ' Hz', 1));
  }
  const b1 = pick(r, [80, 90, 100, 120]), pct = pick(r, [10, 20, 25, 50]), ans = (b1 * (100 + pct)) / 100;
  return build(r, 7, `A practice track at ${b1} BPM is sped up by ${pct}%. What is the new tempo?`, `${num(ans)} BPM`,
    [`${b1 + pct} BPM`, `${num((b1 * (100 - pct)) / 100)} BPM`, `${num((b1 * pct) / 100)} BPM`, `${num(ans + 10)} BPM`], `New = old × (1 + ${pct}/100).`,
    `${b1} × ${num(1 + pct / 100)} = ${num(ans)} BPM.`, ['CCSS.MATH.7.EE', 'MUSIC.RHY.68'], intNudge(ans, 5, ' BPM', 1));
}

// ── Grade 8: exponents (equal temperament, octaves, wavelength) ──────────────────────
function grade8(r: Rng): MusicMathProblem {
  const ids = ['CCSS.MATH.8.EE', 'MUSIC.HAR.68'];
  const kind = ri(r, 0, 4);
  if (kind === 0) {
    const n = pick(r, [12, 24, 36, -12, -24]), ans = 440 * 2 ** (n / 12);
    return build(r, 8, `Equal temperament: f = 440 · 2^(n/12), where n counts semitones from A4. What is f when n = ${n}?`, `${num(ans)} Hz`,
      [`${num(440 + (440 * n) / 12)} Hz`, `${num(440 * 2 ** (n / 12 + 1))} Hz`, `${num(440 * 2 ** (n / 12 - 1))} Hz`, `${num(440 * Math.abs(n) / 12)} Hz`],
      `n/12 = ${num(n / 12)}, so multiply 440 by 2^${num(n / 12)}.`, `2^(${n}/12) = 2^${num(n / 12)} = ${num(2 ** (n / 12))}; 440 × ${num(2 ** (n / 12))} = ${num(ans)} Hz.`, ids, intNudge(ans, 55, ' Hz', 1));
  }
  if (kind === 1) {
    const n = pick(r, [1, 2, 3, 4, 5, 7, 9, 10, 11, -2, -5, -7]), exact = 440 * 2 ** (n / 12), ans = Math.round(exact);
    const just: Record<number, number> = { 7: 660, 5: 586.67, 4: 550, 3: 528, [-5]: 330, [-7]: 293.33 };
    return build(r, 8, `f = 440 · 2^(n/12). Round to the nearest Hz: what is f when n = ${n}?`, `${ans} Hz`,
      [just[n] != null ? `${Math.round(just[n])} Hz` : '', `${Math.round(440 * (1 + n / 12))} Hz`, `${Math.round(440 * 2 ** ((n + 1) / 12))} Hz`, `${Math.round(440 * 2 ** ((n - 1) / 12))} Hz`],
      `Each semitone multiplies by 2^(1/12) ≈ 1.0595. Raise it to the power ${n}.`, `2^(${n}/12) ≈ ${num(2 ** (n / 12))}; 440 × that ≈ ${num(exact)} → ${ans} Hz.`, ['CCSS.MATH.8.EE', 'MUSIC.EAR.68'], intNudge(ans, 3, ' Hz', 1));
  }
  if (kind === 2) {
    const f = pick(r, [55, 110, 65, 82]), k = ri(r, 2, 5), ans = f * 2 ** k;
    return build(r, 8, `Going up one octave doubles the frequency. A note at ${f} Hz goes up ${k} octaves. What is its frequency?`, `${ans} Hz`,
      [`${f * 2 * k} Hz`, `${f * 2 ** (k + 1)} Hz`, `${f * 2 ** (k - 1)} Hz`, `${f * k} Hz`], `Multiply by 2 for each octave: ${f} × 2^${k}.`,
      `2^${k} = ${2 ** k}; ${f} × ${2 ** k} = ${ans} Hz.`, ids, intNudge(ans, f, ' Hz', 1));
  }
  if (kind === 3) {
    const ask = r() < 0.5, semis = ask ? ri(r, 1, 24) : 3 * ri(r, 1, 8), cents = semis * 100; // multiples of 300 cents → exact quarter-octaves
    return ask
      ? build(r, 8, `One semitone is 100 cents and an octave is 12 semitones. How many cents is an interval of ${semis} semitones?`, `${cents}`,
        [`${semis * 12}`, `${semis * 10}`, `${cents + 100}`, `${semis * 1200}`], 'Multiply semitones by 100.', `${semis} × 100 = ${cents} cents.`, ids, intNudge(cents, 100, '', 100))
      : build(r, 8, `An interval measures ${cents} cents. How many octaves is that? (1 octave = 1200 cents)`, num(cents / 1200),
        [num(cents / 100), num(cents / 12), num(1200 / cents), num(cents / 1200 + 1)], 'Divide by 1200.', `${cents} ÷ 1200 = ${num(cents / 1200)} octaves.`, ids, intNudge(cents / 1200, 0.25, '', 0.05));
  }
  const f = pick(r, [49, 98, 140, 196, 245, 343, 686, 1372]), lam = 343 / f;
  return build(r, 8, `Sound travels at 343 m/s. Wavelength = speed ÷ frequency. What is the wavelength of a ${f} Hz tone?`, `${num(lam)} m`,
    [`${num(f / 343)} m`, `${num(lam * 2)} m`, `${num(lam / 2)} m`, `${num(lam + 1)} m`], 'Divide 343 by the frequency.',
    `λ = 343 ÷ ${f} = ${num(lam)} m.`, ['CCSS.MATH.8.EE', 'MUSIC.EAR.68'], intNudge(lam, 0.5, ' m', 0.05));
}

// ── Grades 9–12: sine waves, exponential vs linear, log2 octaves ─────────────────────
function gradeHS(r: Rng, grade: number): MusicMathProblem {
  const kind = ri(r, 0, 4);
  if (kind === 0) {
    const f = pick(r, [40, 50, 80, 100, 125, 200, 250, 400, 500, 1000]), ms = 1000 / f;
    return build(r, grade, `A tuning fork's sound is modelled by y = sin(2π · ${f} · t). What is the period of the wave, in milliseconds?`, `${num(ms)} ms`,
      [`${num(ms * 2)} ms`, `${num(ms / 2)} ms`, `${num(f / 100)} ms`, `${num(2 * Math.PI * ms)} ms`], 'Period = 1 ÷ frequency (in seconds), then convert to ms.',
      `T = 1/${f} s = ${num(1 / f)} s = ${num(ms)} ms.`, ['CCSS.MATH.HSF-TF', 'MUSIC.EAR.HS'], intNudge(ms, 1, ' ms', 0.5));
  }
  if (kind === 1) {
    const f = pick(r, [110, 220, 330, 440, 523, 880]), b = 2 * f;
    return build(r, grade, `A synth plays y = 0.5 · sin(${b}π · t), t in seconds. What frequency (Hz) does it play?`, `${f} Hz`,
      [`${b} Hz`, `${f / 2} Hz`, `${num(b * Math.PI)} Hz`, `0.5 Hz`], 'In sin(2π f t), the number multiplying π is 2f.',
      `${b}π t = 2π · ${f} · t, so f = ${f} Hz. (0.5 is the amplitude, i.e. the volume.)`, ['CCSS.MATH.HSF-TF', 'MUSIC.EAR.HS'], intNudge(f, 55, ' Hz', 1));
  }
  if (kind === 2) {
    const base = pick(r, [55, 110]), n = ri(r, 2, 5), fx = base * 2 ** n, gx = base + base * n;
    return build(r, grade, `Octaves above ${base} Hz follow f(n) = ${base} · 2^n. A student guesses g(n) = ${base} + ${base}n instead. At n = ${n}, how much higher is f than g?`, `${fx - gx} Hz`,
      [`${fx} Hz`, `${gx} Hz`, `${fx + gx} Hz`, `${base * n} Hz`], 'Evaluate both functions at n, then subtract.',
      `f(${n}) = ${base} × ${2 ** n} = ${fx}; g(${n}) = ${base} + ${base * n} = ${gx}; difference ${fx - gx} Hz. Exponential pulls away from linear.`, ['CCSS.MATH.HSF-LE', 'MUSIC.HAR.HS'], intNudge(fx - gx, base, ' Hz', 1));
  }
  if (kind === 3) {
    const base = pick(r, [55, 110, 220]);
    return build(r, grade, `Which function gives the frequency n octaves above ${base} Hz?`, `f(n) = ${base} · 2^n`,
      [`f(n) = ${base} + ${base}n`, `f(n) = ${base}n²`, `f(n) = ${base * 2}n`, `f(n) = 2^n + ${base}`], 'Each octave multiplies the frequency by the same factor.',
      `Multiplying by 2 for every step is exponential growth: f(n) = ${base} · 2^n, not a constant addition.`, ['CCSS.MATH.HSF-LE', 'MUSIC.HAR.HS']);
  }
  const lo = pick(r, [55, 110, 220]), k = ri(r, 1, 5), hi = lo * 2 ** k, semis = r() < 0.5;
  return semis
    ? build(r, grade, `How many equal-tempered semitones from ${lo} Hz up to ${hi} Hz? (semitones = 12 · log₂(f₂/f₁))`, `${12 * k}`,
      [`${2 ** k}`, `${12 * 2 ** k}`, `${k}`, `${12 * (k + 1)}`], `First find f₂/f₁ = ${2 ** k}, then log₂ of that.`,
      `log₂(${hi}/${lo}) = log₂(${2 ** k}) = ${k} octaves; × 12 = ${12 * k} semitones.`, ['CCSS.MATH.HSF-LE', 'MUSIC.EAR.HS'], intNudge(12 * k, 12, '', 1))
    : build(r, grade, `How many octaves is it from ${lo} Hz to ${hi} Hz? (octaves = log₂(f₂/f₁))`, `${k}`,
      [`${2 ** k}`, `${k + 1}`, `${num(hi / lo / 2)}`, `${k * 12}`], 'Ask: 2 to what power gives f₂/f₁?',
      `${hi}/${lo} = ${2 ** k} = 2^${k}, so ${k} octave${k === 1 ? '' : 's'}.`, ['CCSS.MATH.HSF-LE', 'MUSIC.EAR.HS'], intNudge(k, 1, '', 1));
}

/** A Music Math problem for a grade (1–12; out-of-range grades clamp). */
export function generateMusicMathProblem(grade: number, rng: Rng = Math.random): MusicMathProblem {
  const g = Math.max(1, Math.min(12, Math.round(grade)));
  if (g <= 2) return gradeK2(rng, g);
  if (g === 3) return grade3(rng);
  if (g === 4) return grade4(rng);
  if (g === 5) return grade5(rng);
  if (g === 6) return grade6(rng);
  if (g === 7) return grade7(rng);
  if (g === 8) return grade8(rng);
  return gradeHS(rng, g);
}

/** Every standard a grade's Music Math set can touch — for ledger writes after a mixed quiz. */
export function musicMathStandardsForGrade(grade: number): string[] {
  const g = Math.max(1, Math.min(12, Math.round(grade)));
  const ids = new Set<string>();
  const r = (() => { let s = 7; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })();
  for (let i = 0; i < 200; i++) generateMusicMathProblem(g, r).standardIds.forEach(id => ids.add(id));
  return [...ids];
}
