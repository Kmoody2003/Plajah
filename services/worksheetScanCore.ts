// worksheetScanCore — the pure, DOM-free brain of the scanner.
//
// Everything here is deterministic and runs identically in the browser and in node:test, so the
// parts that decide grades and calendar entries are covered by tests rather than eyeballed:
//   · solveArithmetic / autoKeyWorksheet — the answer key fills itself for printed arithmetic
//     ("7 + 6 = ____", "8 × ___ = 56", "1/2 + 1/4 ="), so a scanned math sheet is gradable at once.
//   · applyAnswerKeyReading             — a teacher's filled-in copy becomes the key.
//   · registerFieldsToScan              — maps answer boxes onto a DIFFERENT photo of the same sheet
//     by anchoring on the printed question text, so a student's off-centre phone photo still lines up.
//   · rankAssignmentsForScan            — a student scans paper and the right assignment is found.
//   · selfCheckWorksheet                — "check my work" before turn-in, without revealing answers.
//   · classifyScan / parseFlyer         — school flyers become calendar events, reminders and notes.

import type { DigitalWorksheet, WorksheetField } from './worksheetDigitizer';

export interface PctBox { x: number; y: number; width: number; height: number }
export interface ScanLine { text: string; box: PctBox; confidence?: number }

// ── Numbers ────────────────────────────────────────────────────────────────────

interface Rational { n: number; d: number }
const gcd = (a: number, b: number): number => { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a || 1; };
const rat = (n: number, d = 1): Rational => { if (d < 0) { n = -n; d = -d; } const g = gcd(n, d); return { n: n / g, d: d / g }; };
const fromDecimal = (s: string): Rational => {
  const [whole, frac = ''] = s.split('.');
  const d = 10 ** frac.length;
  return rat(Number(whole + frac) * (s.trim().startsWith('-') && Number(whole) === 0 ? -1 : 1), d);
};

/** Parse "7", "-3.5", "3/4", "1 1/2", "2,400" → a number. NaN when it isn't one. */
export function parseNumberish(value: string | undefined | null): number {
  if (value === undefined || value === null) return NaN;
  const s = String(value).trim().replace(/[−–—]/g, '-').replace(/,(?=\d{3}\b)/g, '').replace(/\s+/g, ' ');
  const mixed = s.match(/^(-?\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixed) { const w = Number(mixed[1]); const f = Number(mixed[2]) / Number(mixed[3]); return w < 0 ? w - f : w + f; }
  const frac = s.match(/^(-?\d+)\s*\/\s*(\d+)$/);
  if (frac) return Number(frac[2]) ? Number(frac[1]) / Number(frac[2]) : NaN;
  const plain = s.match(/^-?\d*\.?\d+$/);
  if (plain) return Number(s);
  const loose = s.replace(/[^0-9.\-/ ]/g, '').trim();
  if (loose && loose !== s) return parseNumberish(loose);
  return NaN;
}

const formatRational = (r: Rational, preferFraction: boolean): string => {
  if (r.d === 1) return String(r.n);
  if (preferFraction) return `${r.n}/${r.d}`;
  const v = r.n / r.d;
  return String(Math.round(v * 1000) / 1000);
};

// ── Arithmetic solver ─────────────────────────────────────────────────────────

const BLANK = /(_{2,}|\?|□|\[\s*\]|\(\s*\)|\bblank\b)/i;

/** Normalise OCR'd math text: operators, dashes, stray ordinals and trailing blanks. */
function normaliseMath(label: string): string {
  return label
    .replace(/^\s*(\(?[0-9]{1,3}[.)]|\(?[a-hA-H][.)])\s+/, '') // printed ordinal "3." / "b)"
    .replace(/[×✕✖]/g, '*').replace(/(\d)\s*[xX]\s*(?=\d|_|\?)/g, '$1 * ')
    .replace(/[÷]/g, ' ÷ ').replace(/[−–—]/g, '-').replace(/＝/g, '=')
    .replace(/\bwhat\s+is\b/i, '').replace(/\btimes\b/gi, '*').replace(/\bplus\b/gi, '+').replace(/\bminus\b/gi, '-')
    .replace(/\bdivided\s+by\b/gi, ' ÷ ')
    .trim();
}

type Tok = { k: 'num'; v: Rational; frac: boolean } | { k: 'op'; v: string } | { k: 'paren'; v: '(' | ')' } | { k: 'blank' };

function tokenize(expr: string): Tok[] | null {
  const out: Tok[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (/\s/.test(ch)) { i++; continue; }
    const rest = expr.slice(i);
    const blank = rest.match(/^(_{2,}|\?|□|\[\s*\])/);
    if (blank) { out.push({ k: 'blank' }); i += blank[0].length; continue; }
    // A slash with NO spaces between digits is a fraction literal; "8 / 2" is division.
    const fraction = rest.match(/^(\d+)\/(\d+)/);
    if (fraction) { if (!Number(fraction[2])) return null; out.push({ k: 'num', v: rat(Number(fraction[1]), Number(fraction[2])), frac: true }); i += fraction[0].length; continue; }
    const num = rest.match(/^\d{1,3}(,\d{3})+(\.\d+)?|^\d*\.?\d+/);
    if (num) { out.push({ k: 'num', v: fromDecimal(num[0].replace(/,/g, '')), frac: false }); i += num[0].length; continue; }
    if ('+-*'.includes(ch)) { out.push({ k: 'op', v: ch }); i++; continue; }
    if (ch === '÷' || ch === '/' || ch === ':') { out.push({ k: 'op', v: '/' }); i++; continue; }
    if (ch === '(' || ch === ')') { out.push({ k: 'paren', v: ch }); i++; continue; }
    return null; // a letter or symbol we don't understand → not pure arithmetic
  }
  return out;
}

const add = (a: Rational, b: Rational) => rat(a.n * b.d + b.n * a.d, a.d * b.d);
const sub = (a: Rational, b: Rational) => rat(a.n * b.d - b.n * a.d, a.d * b.d);
const mul = (a: Rational, b: Rational) => rat(a.n * b.n, a.d * b.d);
const div = (a: Rational, b: Rational) => (b.n === 0 ? null : rat(a.n * b.d, a.d * b.n));

/** Recursive-descent evaluation with precedence; null on any malformed input. */
function evaluate(tokens: Tok[]): Rational | null {
  let pos = 0;
  const expr = (): Rational | null => {
    let left = term(); if (!left) return null;
    while (pos < tokens.length && tokens[pos].k === 'op' && ((tokens[pos] as any).v === '+' || (tokens[pos] as any).v === '-')) {
      const op = (tokens[pos++] as any).v; const right = term(); if (!right) return null;
      left = op === '+' ? add(left, right) : sub(left, right);
    }
    return left;
  };
  const term = (): Rational | null => {
    let left = factor(); if (!left) return null;
    while (pos < tokens.length && tokens[pos].k === 'op' && ((tokens[pos] as any).v === '*' || (tokens[pos] as any).v === '/')) {
      const op = (tokens[pos++] as any).v; const right = factor(); if (!right) return null;
      const next = op === '*' ? mul(left, right) : div(left, right); if (!next) return null; left = next;
    }
    return left;
  };
  const factor = (): Rational | null => {
    const t = tokens[pos];
    if (!t) return null;
    if (t.k === 'op' && t.v === '-') { pos++; const f = factor(); return f ? rat(-f.n, f.d) : null; }
    if (t.k === 'num') { pos++; return t.v; }
    if (t.k === 'paren' && t.v === '(') { pos++; const inner = expr(); if (!inner || tokens[pos]?.k !== 'paren') return null; pos++; return inner; }
    return null;
  };
  const value = expr();
  return value && pos === tokens.length ? value : null;
}

export interface SolvedKey { answer: string; tolerance: number; confidence: number; kind: 'evaluate' | 'missing-operand' }

/**
 * Solve a printed arithmetic prompt. Handles "a op b =", "a op b = ____", "What is a op b?",
 * missing operands ("__ + 5 = 12", "8 × ___ = 56") and fraction literals. Returns null for anything
 * that isn't unambiguous arithmetic — the field then stays teacher-keyed.
 */
export function solveArithmetic(label: string): SolvedKey | null {
  const text = normaliseMath(label).replace(/\?\s*$/, (m) => (/=/.test(label) ? m : ''));
  if (!/[0-9]/.test(text) || /[a-zA-Z]{2,}/.test(text.replace(/÷/g, ''))) return null;
  const parts = text.split('=');
  if (parts.length > 2) return null;
  const lhs = tokenize(parts[0]);
  const rhs = parts.length === 2 ? tokenize(parts[1]) : [];
  if (!lhs || !rhs) return null;
  const blanksL = lhs.filter(t => t.k === 'blank').length;
  const rhsNums = rhs.filter(t => t.k === 'num');
  const rhsBlank = rhs.some(t => t.k === 'blank') || rhs.length === 0;
  const hasOp = lhs.some(t => t.k === 'op');
  if (!hasOp) return null;
  const preferFraction = [...lhs, ...rhs].some(t => t.k === 'num' && t.frac);

  // a op b = ____ (or nothing after "=")
  if (blanksL === 0 && rhsBlank && rhsNums.length === 0) {
    if (parts.length === 1 && !/\?\s*$/.test(label) && !BLANK.test(label)) return null; // "3 + 4" with no ask
    const v = evaluate(lhs);
    if (!v) return null;
    const exact = v.d === 1 || preferFraction || String(v.n / v.d).length < 8;
    return { answer: formatRational(v, preferFraction), tolerance: exact ? 0 : 0.01, confidence: 0.92, kind: 'evaluate' };
  }

  // ____ op b = c  /  a op ____ = c — exactly one blank and a known result.
  if (blanksL === 1 && rhsNums.length === 1 && rhs.length === 1 && lhs.length === 3) {
    const [a, op, b] = lhs; const c = (rhs[0] as any).v as Rational;
    if (op.k !== 'op') return null;
    const blankFirst = a.k === 'blank';
    const known = (blankFirst ? b : a); if (known.k !== 'num') return null;
    const k = known.v; let x: Rational | null = null;
    switch (op.v) {
      case '+': x = sub(c, k); break;
      case '-': x = blankFirst ? add(c, k) : sub(k, c); break;
      case '*': x = div(c, k); break;
      case '/': x = blankFirst ? mul(c, k) : div(k, c); break;
    }
    if (!x) return null;
    return { answer: formatRational(x, preferFraction), tolerance: 0, confidence: 0.88, kind: 'missing-operand' };
  }
  return null;
}

export interface AutoKeyResult { sheet: DigitalWorksheet; keyed: number; fieldIds: string[] }

/** Fill answer keys the sheet itself determines. Never overwrites a key a teacher already set. */
export function autoKeyWorksheet(sheet: DigitalWorksheet): AutoKeyResult {
  const fieldIds: string[] = [];
  const fields = sheet.fields.map((field): WorksheetField => {
    if (field.correctAnswer !== undefined && String(field.correctAnswer).trim() !== '' && !field.needsManualGrade) return field;
    if (field.type === 'long-text' || field.type === 'multiple-choice') return field;
    const solved = solveArithmetic(field.label);
    if (!solved) return field;
    fieldIds.push(field.id);
    return {
      ...field, type: 'numeric', correctAnswer: solved.answer, tolerance: solved.tolerance,
      needsManualGrade: false, keySource: 'solved',
      confidence: Math.max(field.confidence ?? 0.6, Math.min(0.95, (field.confidence ?? 0.6) * 0.4 + solved.confidence * 0.6)),
    };
  });
  const hasManualFields = fields.some(f => f.needsManualGrade || f.correctAnswer === undefined);
  return { sheet: { ...sheet, fields, hasManualFields }, keyed: fieldIds.length, fieldIds };
}

/**
 * The teacher photographs their own filled-in copy: every legible answer becomes the key. Low
 * confidence reads are applied too but stay flagged for review, so nothing is silently trusted.
 */
export function applyAnswerKeyReading(
  sheet: DigitalWorksheet,
  reading: { answers: Record<string, string>; confidence?: Record<string, number> },
  minConfidence = 0.35,
): { sheet: DigitalWorksheet; applied: string[]; review: string[] } {
  const applied: string[] = []; const review: string[] = [];
  const fields = sheet.fields.map((field): WorksheetField => {
    const raw = (reading.answers[field.id] || '').trim();
    if (!raw || field.type === 'long-text') return field;
    const conf = reading.confidence?.[field.id] ?? 0.5;
    if (conf < minConfidence) { review.push(field.id); return field; }
    let answer = raw;
    if (field.type === 'multiple-choice' && field.choices?.length) {
      const pick = matchChoice(raw, field.choices);
      if (!pick) { review.push(field.id); return field; }
      answer = pick;
    }
    if (field.type === 'true-false') {
      const t = /^(t|true|yes)$/i.test(raw) ? 'true' : /^(f|false|no)$/i.test(raw) ? 'false' : '';
      if (!t) { review.push(field.id); return field; }
      answer = t;
    }
    if (field.type === 'numeric' && Number.isNaN(parseNumberish(raw))) { review.push(field.id); return field; }
    applied.push(field.id);
    if (conf < 0.7) review.push(field.id);
    return { ...field, correctAnswer: answer, needsManualGrade: false, keySource: 'key-scan', confidence: Math.min(field.confidence ?? 1, conf) };
  });
  return { sheet: { ...sheet, fields, hasManualFields: fields.some(f => f.needsManualGrade || f.correctAnswer === undefined) }, applied, review };
}

function matchChoice(raw: string, choices: string[]): string | null {
  const letter = raw.trim().match(/^\(?([A-Ha-h])\)?[.)]?$/);
  if (letter) { const idx = letter[1].toUpperCase().charCodeAt(0) - 65; return choices[idx] ?? null; }
  let best: { c: string; s: number } | null = null;
  for (const c of choices) { const s = textSimilarity(raw, c); if (!best || s > best.s) best = { c, s }; }
  return best && best.s >= 0.6 ? best.c : null;
}

// ── Text similarity ──────────────────────────────────────────────────────────

export function normaliseText(s: string): string {
  return String(s || '').toLowerCase().replace(/_{2,}/g, ' ').replace(/[^a-z0-9+\-*/=÷× ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

const bigrams = (s: string) => { const out = new Map<string, number>(); for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); out.set(g, (out.get(g) || 0) + 1); } return out; };

/** Sørensen–Dice over character bigrams: tolerant of OCR letter swaps, 0..1. */
export function textSimilarity(a: string, b: string): number {
  const x = normaliseText(a).replace(/ /g, ''), y = normaliseText(b).replace(/ /g, '');
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.length < 2 || y.length < 2) return 0;
  const A = bigrams(x), B = bigrams(y);
  let overlap = 0; A.forEach((n, g) => { overlap += Math.min(n, B.get(g) || 0); });
  return (2 * overlap) / (x.length - 1 + y.length - 1);
}

// ── Registration: put answer boxes onto a different photo of the same page ───────

export interface Registration { sheet: DigitalWorksheet; matched: number; total: number; quality: number; transform: { ax: number; bx: number; ay: number; by: number } }

const fitAxis = (pairs: Array<[number, number]>): { a: number; b: number } => {
  if (!pairs.length) return { a: 1, b: 0 };
  if (pairs.length === 1) return { a: 1, b: pairs[0][1] - pairs[0][0] };
  const n = pairs.length; let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const [x, y] of pairs) { sx += x; sy += y; sxx += x * x; sxy += x * y; }
  const den = n * sxx - sx * sx;
  if (Math.abs(den) < 1e-6) return { a: 1, b: (sy - sx) / n };
  let a = (n * sxy - sx * sy) / den;
  a = Math.max(0.6, Math.min(1.6, a));
  return { a, b: (sy - a * sx) / n };
};

/**
 * Map every field box from the sheet's coordinate space onto a new scan. Anchors are the printed
 * prompts: each field's label is matched to a scanned line, and a per-axis scale + offset is fit by
 * least squares (with one outlier-rejection pass). With too few anchors the sheet is returned
 * unchanged and quality reflects that, so callers can warn instead of mis-grading.
 */
export function registerFieldsToScan(sheet: DigitalWorksheet, lines: ScanLine[], minSimilarity = 0.58): Registration {
  const segByField = new Map<string, PctBox>();
  for (const seg of sheet.segments || []) for (const fid of seg.fieldIds || []) if (!segByField.has(fid)) segByField.set(fid, seg.box);
  const used = new Set<number>();
  const pairs: Array<{ from: PctBox; to: PctBox; hasX: boolean }> = [];
  const candidates = sheet.fields
    .map(field => ({ field, text: field.label.replace(/_{2,}/g, ' ').trim() }))
    .filter(c => normaliseText(c.text).replace(/ /g, '').length >= 4);
  for (const { field, text } of candidates) {
    let best = -1, bestScore = 0;
    lines.forEach((line, i) => {
      if (used.has(i)) return;
      const s = textSimilarity(text, line.text);
      // A long line containing the prompt (prompt + student's writing) still counts. Spaces are
      // dropped first: OCR spacing around operators and ordinals varies photo to photo.
      const needle = normaliseText(text).replace(/ /g, '').slice(0, 24);
      const contain = needle.length >= 4 && normaliseText(line.text).replace(/ /g, '').includes(needle) ? 0.9 : 0;
      const score = Math.max(s, contain);
      if (score > bestScore) { bestScore = score; best = i; }
    });
    if (best < 0 || bestScore < minSimilarity) continue;
    used.add(best);
    const anchor = segByField.get(field.id);
    pairs.push({ from: anchor || field.box, to: lines[best].box, hasX: !!anchor });
  }
  const fit = (subset: typeof pairs) => {
    const xs = subset.filter(p => p.hasX).map(p => [p.from.x, p.to.x] as [number, number]);
    const ys = subset.map(p => [p.from.y + p.from.height / 2, p.to.y + p.to.height / 2] as [number, number]);
    const Y = fitAxis(ys);
    // Prompts are usually left-aligned, so x anchors rarely spread enough to fit a scale. A phone
    // photo zooms uniformly, so borrow the vertical scale and fit only the horizontal offset.
    const xSpread = xs.length ? Math.max(...xs.map(p => p[0])) - Math.min(...xs.map(p => p[0])) : 0;
    const X = xs.length >= 2 && xSpread >= 8 ? fitAxis(xs)
      : xs.length ? { a: Y.a, b: xs.reduce((sum, [from, to]) => sum + (to - Y.a * from), 0) / xs.length }
      : { a: 1, b: 0 };
    return { X, Y };
  };
  let { X, Y } = fit(pairs);
  if (pairs.length >= 4) {
    const kept = pairs.filter(p => Math.abs(Y.a * (p.from.y + p.from.height / 2) + Y.b - (p.to.y + p.to.height / 2)) < 3.5);
    if (kept.length >= 3 && kept.length < pairs.length) ({ X, Y } = fit(kept));
  }
  const total = sheet.fields.length;
  const quality = total ? Math.min(1, pairs.length / Math.max(2, Math.min(total, 6))) : 0;
  if (pairs.length < 2) return { sheet, matched: pairs.length, total, quality, transform: { ax: 1, bx: 0, ay: 1, by: 0 } };
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  const fields = sheet.fields.map(field => ({
    ...field,
    box: {
      x: clamp(X.a * field.box.x + X.b), y: clamp(Y.a * field.box.y + Y.b),
      width: Math.max(1, field.box.width * X.a), height: Math.max(1, field.box.height * Y.a),
    },
  }));
  return { sheet: { ...sheet, fields }, matched: pairs.length, total, quality, transform: { ax: X.a, bx: X.b, ay: Y.a, by: Y.b } };
}

// ── Assignment matching: which assignment did the student just photograph? ───────

const STOP = new Set(['the', 'and', 'for', 'with', 'what', 'name', 'date', 'class', 'period', 'write', 'answer', 'each', 'your', 'are', 'how', 'many', 'this', 'that', 'from', 'into', 'show', 'work', 'directions']);
const tokens = (s: string) => new Set(normaliseText(s).split(' ').filter(t => (t.length >= 3 || /^\d+$/.test(t)) && !STOP.has(t)));

export interface AssignmentCandidate { id: string; sheet: DigitalWorksheet; dueDate?: number | null; assignedAt?: number }
export interface RankedAssignment extends AssignmentCandidate { score: number; titleHit: boolean }

/** Rank a student's assignments against the OCR text of their photo. Score 0..1. */
export function rankAssignmentsForScan(scanText: string, candidates: AssignmentCandidate[]): RankedAssignment[] {
  const scan = tokens(scanText);
  const scanNorm = normaliseText(scanText);
  return candidates.map(c => {
    const title = c.sheet.title || '';
    const titleHit = normaliseText(title).length >= 4 && (scanNorm.includes(normaliseText(title)) || textSimilarity(title, scanText.split('\n').slice(0, 4).join(' ')) > 0.72);
    const sheetTokens = new Set<string>();
    for (const f of c.sheet.fields) tokens(f.label).forEach(t => sheetTokens.add(t));
    tokens(title).forEach(t => sheetTokens.add(t));
    let hit = 0; sheetTokens.forEach(t => { if (scan.has(t)) hit++; });
    const coverage = sheetTokens.size ? hit / sheetTokens.size : 0;
    const score = Math.min(1, coverage * 0.8 + (titleHit ? 0.3 : 0));
    return { ...c, score, titleHit };
  }).sort((a, b) => b.score - a.score || (b.assignedAt || 0) - (a.assignedAt || 0));
}

/** The flyer's headline: the tallest text line near the top that has real words. */
export function pickHeadline(lines: ScanLine[]): string | undefined {
  const top = lines.slice(0, 10).filter(l => /[a-z]{3,}/i.test(l.text) && l.text.length <= 70 && !findDates(l.text).length);
  if (!top.length) return undefined;
  return top.reduce((a, b) => (b.box.height > a.box.height * 1.15 ? b : a)).text.trim();
}

/** A confident single winner, or null when the student should pick. */
export function confidentMatch(ranked: RankedAssignment[]): RankedAssignment | null {
  const [a, b] = ranked;
  if (!a || a.score < 0.42) return null;
  if (b && a.score - b.score < 0.12) return null;
  return a;
}

// ── Self-check before turn-in ────────────────────────────────────────────────

export type SelfCheckStatus = 'looks-good' | 'try-again' | 'blank' | 'check-read' | 'teacher-reviews';
export interface SelfCheckField { fieldId: string; status: SelfCheckStatus; message: string }
export interface SelfCheckResult {
  perField: Record<string, SelfCheckField>;
  counts: Record<SelfCheckStatus, number>;
  /** No blanks, no try-agains, no unconfirmed reads. Turn-in is still allowed — this is advice. */
  ready: boolean;
  summary: string;
}

function hintFor(field: WorksheetField, given: string): string {
  const g = parseNumberish(given), k = parseNumberish(field.correctAnswer);
  if (field.type === 'numeric' && Number.isFinite(g) && Number.isFinite(k)) {
    const parts = normaliseMath(field.label).split('=')[0];
    const nums = (parts.match(/\d*\.?\d+/g) || []).map(Number);
    if (nums.length === 2) {
      const [a, b] = nums;
      if (/\+/.test(parts) && Math.abs(g - (a - b)) < 1e-9) return 'Check the sign — is this adding or subtracting?';
      if (/-/.test(parts) && Math.abs(g - (a + b)) < 1e-9) return 'Check the sign — is this subtracting or adding?';
      if (/\*/.test(parts) && Math.abs(g - (a + b)) < 1e-9) return 'Looks like you added — this one multiplies.';
    }
    if (Math.abs(g - k) <= Math.max(1, Math.abs(k) * 0.1)) return "You're close — recount this one.";
    if (k !== 0 && Math.abs(g / k - 10) < 1e-9 || k !== 0 && Math.abs(g / k - 0.1) < 1e-9) return 'Check your place value.';
  }
  return 'Take another look at this one.';
}

/**
 * Check a student's work in progress. Correct answers are never revealed — a wrong answer is just
 * marked "try again" with a gentle, non-giving-away hint. Handwriting reads below `readTrust` ask the
 * student to confirm what Plajah read, since a misread must never count against them.
 */
export function selfCheckWorksheet(
  sheet: DigitalWorksheet,
  answers: Record<string, string>,
  readConfidence: Record<string, number> = {},
  readTrust = 0.6,
): SelfCheckResult {
  const perField: Record<string, SelfCheckField> = {};
  const counts: Record<SelfCheckStatus, number> = { 'looks-good': 0, 'try-again': 0, blank: 0, 'check-read': 0, 'teacher-reviews': 0 };
  for (const field of sheet.fields) {
    const given = (answers[field.id] ?? '').toString().trim();
    let entry: SelfCheckField;
    if (!given) entry = { fieldId: field.id, status: 'blank', message: 'Still blank.' };
    else if (field.id in readConfidence && readConfidence[field.id] < readTrust) entry = { fieldId: field.id, status: 'check-read', message: `Plajah read "${given}" — fix it if that's not what you wrote.` };
    else if (field.needsManualGrade || field.correctAnswer === undefined) entry = { fieldId: field.id, status: 'teacher-reviews', message: 'Your teacher reviews this one.' };
    else if (answerMatches(field, given)) entry = { fieldId: field.id, status: 'looks-good', message: 'Looks good.' };
    else entry = { fieldId: field.id, status: 'try-again', message: hintFor(field, given) };
    perField[field.id] = entry; counts[entry.status]++;
  }
  const ready = counts.blank === 0 && counts['try-again'] === 0 && counts['check-read'] === 0;
  const bits: string[] = [];
  if (counts['try-again']) bits.push(`${counts['try-again']} to try again`);
  if (counts.blank) bits.push(`${counts.blank} blank`);
  if (counts['check-read']) bits.push(`${counts['check-read']} to confirm`);
  const summary = ready ? 'Everything is filled in. Ready to turn in when you are.' : `Almost there — ${bits.join(', ')}.`;
  return { perField, counts, ready, summary };
}

/** Shared answer matcher (numbers: tolerance + fractions/mixed numbers; text: case/space-insensitive). */
export function answerMatches(field: WorksheetField, given: string | undefined): boolean {
  if (given === undefined || given === null || field.correctAnswer === undefined) return false;
  const key = String(field.correctAnswer);
  if (field.type === 'numeric') {
    const g = parseNumberish(given), k = parseNumberish(key);
    if (Number.isNaN(g) || Number.isNaN(k)) return false;
    return Math.abs(g - k) <= (field.tolerance || 0) + 1e-9;
  }
  if (field.type === 'true-false') {
    const tf = (s: string) => /^(t|true|yes)$/i.test(s.trim()) ? 'true' : /^(f|false|no)$/i.test(s.trim()) ? 'false' : s.trim().toLowerCase();
    return tf(given) === tf(key);
  }
  if (field.type === 'multiple-choice' && field.choices?.length) {
    const picked = matchChoice(given, field.choices) ?? given;
    return norm(picked) === norm(key);
  }
  return norm(given) === norm(key);
}
const norm = (s: string) => String(s).trim().toLowerCase().replace(/[.!]+$/, '').replace(/\s+/g, ' ');

// ── Scan classification ──────────────────────────────────────────────────────

export type ScanKind = 'worksheet' | 'flyer';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?';
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export function classifyScan(text: string): { kind: ScanKind; worksheetScore: number; flyerScore: number } {
  const t = text.toLowerCase();
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const numbered = lines.filter(l => /^\s*\(?\d{1,2}[.)]\s/.test(l)).length;
  const blanks = (text.match(/_{3,}/g) || []).length;
  const arithmetic = lines.filter(l => solveArithmetic(l) !== null).length;
  let worksheetScore = numbered * 1.2 + Math.min(blanks, 15) * 0.6 + arithmetic * 1.5;
  if (/\bname\s*[:_]/.test(t)) worksheetScore += 1;
  if (/\b(directions|answer the|circle the|fill in|show your work|solve)\b/.test(t)) worksheetScore += 2;
  const dates = (t.match(new RegExp(`\\b${MONTH_RE}\\s+\\d{1,2}`, 'g')) || []).length + (t.match(/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g) || []).length;
  const times = (t.match(/\b\d{1,2}(:\d{2})?\s*(a\.?m\.?|p\.?m\.?)/g) || []).length;
  let flyerScore = dates * 2 + times * 1.5;
  if (/\b(join us|you'?re invited|rsvp|field trip|picture day|pta|pto|fundraiser|book fair|open house|conference|early (dismissal|release)|no school|spirit week|families|parents|permission slip|tickets|admission|concert|game night|bake sale|registration|sign up)\b/.test(t)) flyerScore += 3;
  if (WEEKDAYS.some(d => t.includes(d))) flyerScore += 1;
  return { kind: flyerScore > worksheetScore + 1 ? 'flyer' : 'worksheet', worksheetScore, flyerScore };
}

// ── Flyer parsing ────────────────────────────────────────────────────────────

export interface FlyerEvent {
  title: string;
  start: number;
  end: number;
  allDay: boolean;
  kind: 'event' | 'deadline';
  location?: string;
  /** The flyer line this came from, shown so the person can verify. */
  sourceLine: string;
  /** Minutes before start. */
  reminders: number[];
}
export interface FlyerParse {
  title: string;
  events: FlyerEvent[];
  /** Things to remember: bring/wear/cost/contact lines. */
  notes: string[];
  contacts: string[];
  links: string[];
  text: string;
}

const DAY = 86_400_000;

function monthIndex(word: string): number { return MONTHS.indexOf(word.toLowerCase().slice(0, 3)); }

function parseTimeToken(h: string, m: string | undefined, mer: string | undefined, fallbackMer?: 'am' | 'pm'): { h: number; m: number } | null {
  let hour = Number(h); const min = m ? Number(m) : 0;
  if (hour > 23 || min > 59) return null;
  const meridiem = mer ? (mer.toLowerCase().startsWith('p') ? 'pm' : 'am') : fallbackMer;
  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  if (!meridiem && hour >= 1 && hour <= 6) hour += 12; // "from 3-5" on a school flyer means afternoon
  return { h: hour, m: min };
}

function findTimes(line: string): { start?: { h: number; m: number }; end?: { h: number; m: number } } {
  const l = line.toLowerCase().replace(/\bnoon\b/g, '12:00 pm').replace(/\bmidnight\b/g, '12:00 am');
  const range = l.match(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\s*(?:-|–|—|to|until|till)\s*(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)/);
  if (range) {
    const endMer = range[6].startsWith('p') ? 'pm' : 'am';
    const end = parseTimeToken(range[4], range[5], range[6]);
    let start = parseTimeToken(range[1], range[2], range[3], endMer);
    // "11-1 pm": start is 11 AM, not 11 PM.
    if (start && end && !range[3] && start.h > end.h) start = parseTimeToken(range[1], range[2], 'am');
    if (start && end) return { start, end };
  }
  const single = l.match(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)/) || l.match(/\b(?:at|@)\s*(\d{1,2}):(\d{2})\b/);
  if (single) { const start = parseTimeToken(single[1], single[2], single[3]); if (start) return { start }; }
  return {};
}

interface DateHit { y?: number; mo: number; d: number; index: number; raw: string }

function findDates(line: string): DateHit[] {
  const hits: DateHit[] = [];
  const l = line.toLowerCase();
  const named = new RegExp(`\\b${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?`, 'g');
  for (const m of l.matchAll(named)) { const mo = monthIndex(m[1]); const d = Number(m[2]); if (mo >= 0 && d >= 1 && d <= 31) hits.push({ mo, d, y: m[3] ? Number(m[3]) : undefined, index: m.index || 0, raw: m[0] }); }
  const dayFirst = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_RE}(?:,?\\s*(\\d{4}))?`, 'g');
  for (const m of l.matchAll(dayFirst)) { const mo = monthIndex(m[2]); const d = Number(m[1]); if (mo >= 0 && d >= 1 && d <= 31 && !hits.some(h => Math.abs(h.index - (m.index || 0)) < 4)) hits.push({ mo, d, y: m[3] ? Number(m[3]) : undefined, index: m.index || 0, raw: m[0] }); }
  for (const m of l.matchAll(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g)) {
    const mo = Number(m[1]) - 1, d = Number(m[2]);
    if (mo < 0 || mo > 11 || d < 1 || d > 31) continue;
    let y = m[3] ? Number(m[3]) : undefined; if (y !== undefined && y < 100) y += 2000;
    hits.push({ mo, d, y, index: m.index || 0, raw: m[0] });
  }
  return hits.sort((a, b) => a.index - b.index);
}

function resolveYear(mo: number, d: number, now: Date, explicit?: number): number {
  if (explicit) return explicit;
  const y = now.getFullYear();
  const candidate = new Date(y, mo, d).getTime();
  // Flyers announce upcoming things; a date more than 60 days past is next year's.
  return candidate < now.getTime() - 60 * DAY ? y + 1 : y;
}

function weekdayDate(line: string, now: Date): Date | null {
  const l = line.toLowerCase();
  if (/\btomorrow\b/.test(l)) { const d = new Date(now); d.setDate(d.getDate() + 1); return d; }
  if (/\btoday|tonight\b/.test(l)) return new Date(now);
  const idx = WEEKDAYS.findIndex(w => new RegExp(`\\b(this\\s+|next\\s+)?${w}\\b`).test(l));
  if (idx < 0) return null;
  const next = /\bnext\s+\w+day\b/.test(l);
  const d = new Date(now); const delta = (idx - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + delta + (next && delta < 7 ? 7 : 0));
  return d;
}

const LOCATION_RE = /\b(?:location|where|place|venue)\s*[:\-]\s*(.+)$|\b(?:in|at)\s+the\s+((?:school\s+)?(?:gym(?:nasium)?|cafeteria|auditorium|library|media center|front office|multipurpose room|playground|field|stadium|park|main hall|classroom|room\s+\d+)[^,.;]*)/i;
const DEADLINE_RE = /\b(due|deadline|by|no later than|return(?:ed)?|turn in|rsvp|sign up|register|registration closes|last day)\b/i;
const NOTE_RE = /\b(bring|wear|dress|cost|\$\s?\d|fee|free|pack|lunch|snack|permission slip|chaperones?|volunteers?|please|remember|don'?t forget|reminder|required|tickets?)\b/i;

/** Strip dates/times/labels from a line to leave a human title. */
function titleFromLine(line: string): string {
  return line
    .replace(new RegExp(`\\b(${WEEKDAYS.join('|')}),?`, 'gi'), '')
    .replace(new RegExp(`\\b${MONTH_RE}\\s+\\d{1,2}(st|nd|rd|th)?(,?\\s*\\d{4})?`, 'gi'), '')
    .replace(/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g, '')
    .replace(/\b\d{1,2}(:\d{2})?\s*(a\.?m\.?|p\.?m\.?)?\s*(-|–|—|to)\s*\d{1,2}(:\d{2})?\s*(a\.?m\.?|p\.?m\.?)/gi, '')
    .replace(/\b\d{1,2}(:\d{2})?\s*(a\.?m\.?|p\.?m\.?)/gi, '')
    .replace(/\b(date|time|when)\s*:/gi, '')
    .replace(/\b(on|at|from)\s*$/i, '')
    .replace(/[|•·,:;\-–—]+\s*$/g, '').replace(/^\s*[|•·,:;\-–—]+/g, '')
    .replace(/\s+/g, ' ').trim();
}

/**
 * Parse OCR'd flyer text into calendar-ready events, deadlines and notes. Pure; `now` makes it
 * testable. Every event carries its source line so the review screen can show what it came from.
 */
export function parseFlyer(text: string, now: Date = new Date(), headline?: string): FlyerParse {
  const lines = text.split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim()).filter(l => l.length > 1);
  // The biggest type on a flyer is its name; callers with OCR boxes pass it as `headline`.
  const title = (headline && headline.trim()) || lines.find(l => /[a-z]{3,}/i.test(l) && !findDates(l).length && l.length <= 70) || lines[0] || 'School flyer';
  const events: FlyerEvent[] = [];
  const notes: string[] = [];
  const contacts = Array.from(new Set((text.match(/[\w.+-]+@[\w-]+\.[\w.]+|\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/g) || [])));
  const links = Array.from(new Set((text.match(/\b(?:https?:\/\/|www\.)\S+/gi) || []).map(s => s.replace(/[),.]+$/, ''))));
  let location: string | undefined;
  for (const l of lines) { const m = l.match(LOCATION_RE); if (m) { location = (m[1] || m[2] || '').trim().replace(/[.]+$/, ''); break; } }

  // A time on its own line ("6:00 - 7:30 PM") belongs to the nearest dated line.
  const timeOnly = lines.map(l => (!findDates(l).length && !weekdayDate(l, now) ? findTimes(l) : {}));

  lines.forEach((line, i) => {
    let hits = findDates(line);
    let dateFromWeekday: Date | null = null;
    if (!hits.length) { dateFromWeekday = weekdayDate(line, now); if (!dateFromWeekday) return; }
    const deadline = DEADLINE_RE.test(line) && !/\b(join|celebrate|show|concert|party|night|fair|day)\b/i.test(line.replace(DEADLINE_RE, ''));
    let times = findTimes(line);
    if (!times.start) times = timeOnly[i + 1]?.start ? timeOnly[i + 1] : timeOnly[i - 1]?.start ? timeOnly[i - 1] : times;
    const dates: Date[] = hits.length
      ? hits.map(h => new Date(resolveYear(h.mo, h.d, now, h.y), h.mo, h.d))
      : [dateFromWeekday!];
    // "Nov 10 - 14" style ranges: a dated line with a trailing "- 14" becomes a multi-day all-day event.
    const span = hits.length === 1 ? line.toLowerCase().slice(hits[0].index + hits[0].raw.length).match(/^\s*(?:-|–|—|to|through|thru)\s*(\d{1,2})\b(?!\s*(?::|am|pm|a\.m|p\.m))/) : null;
    let own = titleFromLine(line);
    if (own.length < 4 || /^(date|time|when|where)$/i.test(own)) own = '';
    const label = own && own.toLowerCase() !== title.toLowerCase() ? (own.length < 60 ? own : own.slice(0, 57) + '…') : title;
    for (const date of dates.slice(0, 4)) {
      const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      if (span) {
        const endDay = new Date(day.getFullYear(), day.getMonth(), Number(span[1]) + 1);
        if (endDay > day) { events.push({ title: label, start: day.getTime(), end: endDay.getTime(), allDay: true, kind: 'event', location, sourceLine: line, reminders: [1440] }); continue; }
      }
      if (times.start && !deadline) {
        const start = new Date(day); start.setHours(times.start.h, times.start.m, 0, 0);
        const end = new Date(day);
        if (times.end) end.setHours(times.end.h, times.end.m, 0, 0); else end.setTime(start.getTime() + 60 * 60_000);
        if (end <= start) end.setTime(start.getTime() + 60 * 60_000);
        events.push({ title: label, start: start.getTime(), end: end.getTime(), allDay: false, kind: 'event', location, sourceLine: line, reminders: [1440, 60] });
      } else {
        const dlTitle = deadline && !/\b(due|deadline)\b/i.test(label) ? `Due: ${label}` : label;
        events.push({ title: dlTitle, start: day.getTime(), end: day.getTime() + DAY, allDay: true, kind: deadline ? 'deadline' : 'event', location: deadline ? undefined : location, sourceLine: line, reminders: deadline ? [2880, 1440] : [1440] });
      }
    }
  });

  for (const l of lines) if (NOTE_RE.test(l) && !notes.includes(l)) notes.push(l);
  // De-duplicate events that landed on the same instant with the same title.
  const seen = new Set<string>();
  const unique = events.filter(e => { const k = `${e.title.toLowerCase()}|${e.start}`; if (seen.has(k)) return false; seen.add(k); return true; });
  return { title, events: unique.sort((a, b) => a.start - b.start), notes: notes.slice(0, 12), contacts, links, text };
}

// ── Pixel helpers for the on-device digitizer ────────────────────────────────
// Tesseract drops underscore blanks entirely and reads "÷" as "+", so both are recovered from
// the page pixels. Pure over a luminance array so they are testable without a DOM.

export interface GrayImage { data: Uint8Array; width: number; height: number }
export interface PxBox { x0: number; y0: number; x1: number; y1: number }

const DARK = 140;
const dark = (img: GrayImage, x: number, y: number) => img.data[y * img.width + x] < DARK;

/**
 * A printed "+" has a vertical stroke crossing its bar; a "÷" has white gaps directly above and
 * below the bar (then a dot). Looks at the centre column of the glyph box, grown to the line height.
 */
export function classifyPlusOrDivide(img: GrayImage, glyph: PxBox, lineTop: number, lineBottom: number): '+' | '÷' | null {
  const x0 = Math.max(0, Math.floor(glyph.x0)), x1 = Math.min(img.width - 1, Math.ceil(glyph.x1));
  const y0 = Math.max(0, Math.floor(Math.min(glyph.y0, lineTop))), y1 = Math.min(img.height - 1, Math.ceil(Math.max(glyph.y1, lineBottom)));
  if (x1 - x0 < 3 || y1 - y0 < 5) return null;
  let barRow = -1, best = 0;
  for (let y = y0; y <= y1; y++) { let n = 0; for (let x = x0; x <= x1; x++) if (dark(img, x, y)) n++; if (n > best) { best = n; barRow = y; } }
  if (barRow < 0 || best < (x1 - x0) * 0.5) return null;
  const cx = Math.round((x0 + x1) / 2);
  const half = Math.max(1, Math.round((x1 - x0) * 0.08));
  const colDark = (y: number) => { for (let x = cx - half; x <= cx + half; x++) if (x >= 0 && x < img.width && dark(img, x, y)) return true; return false; };
  const barTop = (() => { let y = barRow; while (y - 1 >= y0 && colDark(y - 1) && barRow - y < 4) y--; return y; })();
  const barBottom = (() => { let y = barRow; while (y + 1 <= y1 && colDark(y + 1) && y - barRow < 4) y++; return y; })();
  // Walk outward from the bar along the centre column, inside the glyph box: a "+" stroke stays
  // dark all the way to the glyph edge; a "÷" goes white (even for a pixel or two) and then hits a dot.
  const walk = (from: number, dir: 1 | -1, edge: number) => {
    let gap = false, dotAfterGap = false, steps = 0;
    for (let y = from + dir; dir < 0 ? y >= edge : y <= edge; y += dir) {
      steps++;
      if (!colDark(y)) gap = true; else if (gap) { dotAfterGap = true; break; }
    }
    return { gap, dotAfterGap, steps };
  };
  const up = walk(barTop, -1, Math.max(y0, Math.floor(glyph.y0)));
  const down = walk(barBottom, 1, Math.min(y1, Math.ceil(glyph.y1)));
  if (up.steps < 2 || down.steps < 2) return null;
  if (up.dotAfterGap && down.dotAfterGap) return '÷';
  if (!up.gap && !down.gap) return '+';
  return null;
}

/**
 * Find the printed answer blank on a line: the longest horizontal ink run to the right of the
 * prompt that no word box covers. Returns where the student writes — the blank plus the space
 * above it — or null when the line has no blank (the caller then places the box after the text).
 */
export function findAnswerBlank(img: GrayImage, line: PxBox, words: PxBox[], limitX = img.width * 0.97): PxBox | null {
  const h = Math.max(4, line.y1 - line.y0);
  const ys = Math.max(0, Math.floor(line.y0 + h * 0.3)), ye = Math.min(img.height - 1, Math.ceil(line.y1 + h * 0.7));
  const xs = Math.max(0, Math.floor(line.x0)), xe = Math.min(img.width - 1, Math.floor(limitX));
  const covered = (x: number, y: number) => words.some(w => x >= w.x0 - 2 && x <= w.x1 + 2 && y >= w.y0 - 2 && y <= w.y1 + 2);
  const minRun = Math.max(img.width * 0.03, h * 1.5);
  let best: { x0: number; x1: number; y: number } | null = null;
  for (let y = ys; y <= ye; y++) {
    let start = -1;
    for (let x = xs; x <= xe + 1; x++) {
      const on = x <= xe && dark(img, x, y) && !covered(x, y);
      if (on && start < 0) start = x;
      if (!on && start >= 0) {
        const len = x - start;
        if (len >= minRun && (!best || len > best.x1 - best.x0 + 2)) best = { x0: start, x1: x - 1, y };
        start = -1;
      }
    }
  }
  if (!best) return null;
  return { x0: best.x0, y0: Math.max(0, best.y - h * 1.7), x1: best.x1, y1: Math.min(img.height - 1, best.y + h * 0.35) };
}

/**
 * Split printed question numbers off OCR'd lines. "2.8+9=" is ambiguous on its own (question 2,
 * or 2.8 + 9?), so a leading number only counts as an ordinal when it is followed by a space or
 * the lines run in sequence (1, 2, 3…), which is how worksheets number questions.
 */
export function splitOrdinals(texts: string[]): Array<{ ordinal?: string; text: string }> {
  const lead = texts.map(t => t.match(/^\s*\(?(\d{1,2})\s*[.)]\s*/));
  const nums = lead.map(m => (m ? Number(m[1]) : NaN));
  const inSequence = nums.map((n, i) => {
    if (!Number.isFinite(n)) return false;
    const prev = nums.slice(0, i).reverse().find(Number.isFinite);
    const next = nums.slice(i + 1).find(Number.isFinite);
    return prev === n - 1 || next === n + 1;
  });
  return texts.map((t, i) => {
    const m = lead[i];
    if (m && (/\s$/.test(m[0]) || inSequence[i])) return { ordinal: `${m[1]}.`, text: t.slice(m[0].length).trim() };
    const letter = t.match(/^\s*\(?([a-hA-H])[.)]\s+/);
    if (letter) return { ordinal: `${letter[1]}.`, text: t.slice(letter[0].length).trim() };
    return { text: t.trim() };
  });
}
