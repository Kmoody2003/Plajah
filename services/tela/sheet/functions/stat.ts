// stat — Statistical functions: descriptive stats, conditional aggregates
// (COUNTIF(S)/AVERAGEIF(S)/MAXIFS/MINIFS), ranking, regression, and the
// probability distributions.

import { eachValue, makeCriterion, scalarOf, toNum, type Frame } from '../coerce';
import { CellError, ERR, Matrix, Ref, type Scalar, type Value, isErr } from '../values';
import { B, BO, I, IO, M, N, NO, firstErr, nums, numResult, omitted, pairs } from './helpers';
import { invertMatrix } from './math';
import { alias, def } from './registry';
import * as st from './statcore';

const L = { lift: 'all' as const };
const nr = (x: number) => numResult(x);
const fx = (x: number) => (Number.isNaN(x) ? ERR.NUM : numResult(x));

// ── Criteria plumbing that clamps whole-column ranges to the used extent ─────

interface Mask { mask: boolean[]; rows: number; cols: number; fullCells: number; anchors: Value[] }

/** Evaluate (range, criteria) pairs over the shared shape; whole-column ranges are clamped to used rows. */
export function criteriaMask(pairArgs: Value[], f: Frame): Mask | CellError {
  let fullR = -1, fullC = -1;
  for (let i = 0; i < pairArgs.length; i += 2) {
    const v = pairArgs[i];
    const r = v instanceof Ref ? v.rows : v instanceof Matrix ? v.rows : 1;
    const c = v instanceof Ref ? v.cols : v instanceof Matrix ? v.cols : 1;
    if (v instanceof Ref && v.areas.length !== 1) return ERR.VALUE;
    if (fullR < 0) { fullR = r; fullC = c; } else if (r !== fullR || c !== fullC) return ERR.VALUE;
  }
  // Effective (clamped) shape: as many rows/cols as any involved sheet actually uses.
  let effR = 0, effC = 0;
  for (let i = 0; i < pairArgs.length; i += 2) {
    const v = pairArgs[i];
    if (v instanceof Ref) {
      const a = v.single!;
      const u = v.ext ? { r2: a.r2, c2: a.c2 } : f.e.usedExtent(v.sheet);
      effR = Math.max(effR, Math.min(fullR, u.r2 - a.r1 + 1));
      effC = Math.max(effC, Math.min(fullC, u.c2 - a.c1 + 1));
    } else { effR = fullR; effC = fullC; }
  }
  effR = Math.max(0, effR); effC = Math.max(0, effC);
  const mask = new Array(effR * effC).fill(true);
  for (let i = 0; i < pairArgs.length; i += 2) {
    const vals = sliceValues(pairArgs[i], effR, effC, f); if (isErr(vals)) return vals;
    const pred = makeCriterion(scalarOf(pairArgs[i + 1] ?? null, f));
    for (let k = 0; k < vals.length; k++) if (mask[k] && !pred(vals[k])) mask[k] = false;
  }
  // Cells beyond the used extent are blank: do they match every criterion?
  let extraMatch = true;
  for (let i = 1; i < pairArgs.length; i += 2) if (!makeCriterion(scalarOf(pairArgs[i] ?? null, f))(null)) { extraMatch = false; break; }
  return { mask, rows: effR, cols: effC, fullCells: extraMatch ? fullR * fullC - effR * effC : 0, anchors: [] };
}

const flatCache = new WeakMap<Matrix, Scalar[]>();
/** Row-major values of a (pass-cached) range matrix, flattened once. */
function flatOf(m: Matrix): Scalar[] { let x = flatCache.get(m); if (!x) { x = m.data.flat(); flatCache.set(m, x); } return x; }

/** Top-left rows×cols block of a ref/array (SUMIF-style anchoring for sum_range). */
export function sliceValues(v: Value, rows: number, cols: number, f: Frame): Scalar[] | CellError {
  if (rows === 0 || cols === 0) return [];
  if (v instanceof Ref) {
    const a = v.single; if (!a) return ERR.VALUE;
    return flatOf(f.e.refMatrix(new Ref(v.sheet, [{ r1: a.r1, c1: a.c1, r2: a.r1 + rows - 1, c2: a.c1 + cols - 1 }], v.ext)));
  }
  const m = M(v, f); if (isErr(m)) return m;
  const out: Scalar[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push(m.get(r, c));
  return out;
}

function maskedNums(mask: Mask, target: Value, f: Frame): number[] | CellError {
  const vals = sliceValues(target, mask.rows, mask.cols, f); if (isErr(vals)) return vals;
  const out: number[] = [];
  for (let i = 0; i < vals.length; i++) if (mask.mask[i]) { const v = vals[i]; if (v instanceof CellError) return v; if (typeof v === 'number') out.push(v); }
  return out;
}

// ── Counting & averages ──────────────────────────────────────────────────────

def('COUNT', 'stat', 1, 255, 'value1, [value2], ...', 'Counts numbers.', (a, f) => {
  let n = 0;
  eachValue(a, f, (v, direct) => {
    if (typeof v === 'number') n++;
    else if (direct && (typeof v === 'boolean' || (typeof v === 'string' && !isErr(toNum(v))))) n++;
  });
  return n;
});
def('COUNTA', 'stat', 1, 255, 'value1, [value2], ...', 'Counts non-empty values.', (a, f) => {
  let n = 0; eachValue(a, f, v => { if (v !== null) n++; }); return n;
});
def('COUNTBLANK', 'stat', 1, 1, 'range', 'Counts empty cells.', (a, f) => {
  const r = a[0];
  if (r instanceof Ref) {
    const total = r.rows * r.cols;
    let filled = 0; eachValue([r], f, v => { if (v !== null && v !== '') filled++; });
    return total - filled;
  }
  const m = M(r, f); if (isErr(m)) return m;
  return m.data.flat().filter(v => v === null || v === '').length;
});
def('COUNTIF', 'stat', 2, 2, 'range, criteria', 'Counts cells meeting a condition.', (a, f) => {
  const m = criteriaMask([a[0], a[1]], f); if (isErr(m)) return m;
  return m.mask.filter(Boolean).length + m.fullCells;
}, { lift: [1] });
def('COUNTIFS', 'stat', 2, 254, 'criteria_range1, criteria1, ...', 'Counts cells meeting multiple conditions.', (a, f) => {
  if (a.length % 2) return ERR.VALUE;
  const m = criteriaMask(a, f); if (isErr(m)) return m;
  return m.mask.filter(Boolean).length + m.fullCells;
}, { lift: [1, 3, 5, 7, 9, 11, 13, 15] });
def('SUMIF', 'math', 2, 3, 'range, criteria, [sum_range]', 'Sum cells meeting a condition.', (a, f) => {
  const m = criteriaMask([a[0], a[1]], f); if (isErr(m)) return m;
  const xs = maskedNums(m, omitted(a[2]) ? a[0] : a[2], f); if (isErr(xs)) return xs;
  return st.sum(xs);
}, { lift: [1] });
def('SUMIFS', 'math', 3, 255, 'sum_range, criteria_range1, criteria1, ...', 'Sum cells meeting multiple conditions.', (a, f) => {
  if ((a.length - 1) % 2) return ERR.VALUE;
  const m = criteriaMask(a.slice(1), f); if (isErr(m)) return m;
  const sr = a[0];
  const fr = sr instanceof Ref ? sr.rows : sr instanceof Matrix ? sr.rows : 1, fc = sr instanceof Ref ? sr.cols : sr instanceof Matrix ? sr.cols : 1;
  const c0 = a[1];
  if (fr !== (c0 instanceof Ref ? c0.rows : c0 instanceof Matrix ? c0.rows : 1) || fc !== (c0 instanceof Ref ? c0.cols : c0 instanceof Matrix ? c0.cols : 1)) return ERR.VALUE;
  const xs = maskedNums(m, sr, f); if (isErr(xs)) return xs;
  return st.sum(xs);
}, { lift: [2, 4, 6, 8, 10, 12, 14, 16] });
def('AVERAGEIF', 'stat', 2, 3, 'range, criteria, [average_range]', 'Average of cells meeting a condition.', (a, f) => {
  const m = criteriaMask([a[0], a[1]], f); if (isErr(m)) return m;
  const xs = maskedNums(m, omitted(a[2]) ? a[0] : a[2], f); if (isErr(xs)) return xs;
  return xs.length ? st.mean(xs) : ERR.DIV0;
}, { lift: [1] });
def('AVERAGEIFS', 'stat', 3, 255, 'average_range, criteria_range1, criteria1, ...', 'Average of cells meeting multiple conditions.', (a, f) => {
  if ((a.length - 1) % 2) return ERR.VALUE;
  const m = criteriaMask(a.slice(1), f); if (isErr(m)) return m;
  const xs = maskedNums(m, a[0], f); if (isErr(xs)) return xs;
  return xs.length ? st.mean(xs) : ERR.DIV0;
}, { lift: [2, 4, 6, 8, 10, 12, 14, 16] });
def('MAXIFS', 'stat', 3, 255, 'max_range, criteria_range1, criteria1, ...', 'Maximum of cells meeting conditions.', (a, f) => {
  if ((a.length - 1) % 2) return ERR.VALUE;
  const m = criteriaMask(a.slice(1), f); if (isErr(m)) return m;
  const xs = maskedNums(m, a[0], f); if (isErr(xs)) return xs;
  return xs.length ? Math.max(...xs) : 0;
}, { lift: [2, 4, 6, 8, 10, 12, 14, 16], future: true });
def('MINIFS', 'stat', 3, 255, 'min_range, criteria_range1, criteria1, ...', 'Minimum of cells meeting conditions.', (a, f) => {
  if ((a.length - 1) % 2) return ERR.VALUE;
  const m = criteriaMask(a.slice(1), f); if (isErr(m)) return m;
  const xs = maskedNums(m, a[0], f); if (isErr(xs)) return xs;
  return xs.length ? Math.min(...xs) : 0;
}, { lift: [2, 4, 6, 8, 10, 12, 14, 16], future: true });

def('AVERAGE', 'stat', 1, 255, 'number1, [number2], ...', 'Arithmetic mean.', (a, f) => { const xs = nums(a, f); if (isErr(xs)) return xs; return xs.length ? st.mean(xs) : ERR.DIV0; });
alias('AVG', 'AVERAGE', { desc: 'Legacy Tela alias of AVERAGE.', category: 'compat' });
def('AVERAGEA', 'stat', 1, 255, 'value1, ...', 'Mean counting text as 0 and logicals.', (a, f) => { const xs = nums(a, f, { aMode: true }); if (isErr(xs)) return xs; return xs.length ? st.mean(xs) : ERR.DIV0; });
const maxOf = (xs: number[]) => { let m = -Infinity; for (const x of xs) if (x > m) m = x; return xs.length ? m : 0; };
const minOf = (xs: number[]) => { let m = Infinity; for (const x of xs) if (x < m) m = x; return xs.length ? m : 0; };
def('MAX', 'stat', 1, 255, 'number1, ...', 'Largest value.', (a, f) => { const xs = nums(a, f); return isErr(xs) ? xs : maxOf(xs); });
def('MIN', 'stat', 1, 255, 'number1, ...', 'Smallest value.', (a, f) => { const xs = nums(a, f); return isErr(xs) ? xs : minOf(xs); });
def('MAXA', 'stat', 1, 255, 'value1, ...', 'Largest value counting text/logicals.', (a, f) => { const xs = nums(a, f, { aMode: true }); return isErr(xs) ? xs : maxOf(xs); });
def('MINA', 'stat', 1, 255, 'value1, ...', 'Smallest value counting text/logicals.', (a, f) => { const xs = nums(a, f, { aMode: true }); return isErr(xs) ? xs : minOf(xs); });
def('MEDIAN', 'stat', 1, 255, 'number1, ...', 'Median.', (a, f) => { const xs = nums(a, f); if (isErr(xs)) return xs; return xs.length ? st.median(xs) : ERR.NUM; });
def('MODE.SNGL', 'stat', 1, 255, 'number1, ...', 'Most frequent value.', (a, f) => { const xs = nums(a, f); if (isErr(xs)) return xs; const m = st.modes(xs); return m.length ? m[0] : ERR.NA; });
alias('MODE', 'MODE.SNGL');
def('MODE.MULT', 'stat', 1, 255, 'number1, ...', 'Vertical array of the most frequent values.', (a, f) => { const xs = nums(a, f); if (isErr(xs)) return xs; const m = st.modes(xs); return m.length ? Matrix.col(m) : ERR.NA; });
def('GEOMEAN', 'stat', 1, 255, 'number1, ...', 'Geometric mean.', (a, f) => { const xs = nums(a, f); if (isErr(xs)) return xs; if (!xs.length || xs.some(x => x <= 0)) return ERR.NUM; return Math.exp(st.mean(xs.map(Math.log))); });
def('HARMEAN', 'stat', 1, 255, 'number1, ...', 'Harmonic mean.', (a, f) => { const xs = nums(a, f); if (isErr(xs)) return xs; if (!xs.length || xs.some(x => x <= 0)) return ERR.NUM; return xs.length / st.sum(xs.map(x => 1 / x)); });
def('AVEDEV', 'stat', 1, 255, 'number1, ...', 'Mean absolute deviation.', (a, f) => { const xs = nums(a, f); if (isErr(xs)) return xs; if (!xs.length) return ERR.NUM; const m = st.mean(xs); return st.mean(xs.map(x => Math.abs(x - m))); });
def('DEVSQ', 'stat', 1, 255, 'number1, ...', 'Sum of squared deviations.', (a, f) => { const xs = nums(a, f); if (isErr(xs)) return xs; return xs.length ? st.devsq(xs) : ERR.NUM; });
def('TRIMMEAN', 'stat', 2, 2, 'array, percent', 'Mean excluding a fraction of extremes.', (a, f) => {
  const xs = nums([a[0]], f); if (isErr(xs)) return xs; const p = N(a[1], f); if (isErr(p)) return p;
  if (p < 0 || p >= 1 || !xs.length) return ERR.NUM;
  const k = Math.floor((xs.length * p) / 2) ; const s = st.sorted(xs).slice(k, xs.length - k);
  return st.mean(s);
});

function varFamily(name: string, sample: boolean, aMode: boolean, sqrt: boolean, desc: string) {
  def(name, 'stat', 1, 255, 'number1, ...', desc, (a, f) => {
    const xs = nums(a, f, { aMode }); if (isErr(xs)) return xs;
    if (xs.length < (sample ? 2 : 1)) return ERR.DIV0;
    const v = sample ? st.varS(xs) : st.varP(xs);
    return sqrt ? Math.sqrt(v) : v;
  });
}
varFamily('STDEV.S', true, false, true, 'Sample standard deviation.');
alias('STDEV', 'STDEV.S');
varFamily('STDEV.P', false, false, true, 'Population standard deviation.');
alias('STDEVP', 'STDEV.P');
varFamily('STDEVA', true, true, true, 'Sample standard deviation counting text/logicals.');
varFamily('STDEVPA', false, true, true, 'Population standard deviation counting text/logicals.');
varFamily('VAR.S', true, false, false, 'Sample variance.');
alias('VAR', 'VAR.S');
varFamily('VAR.P', false, false, false, 'Population variance.');
alias('VARP', 'VAR.P');
varFamily('VARA', true, true, false, 'Sample variance counting text/logicals.');
varFamily('VARPA', false, true, false, 'Population variance counting text/logicals.');
def('SKEW', 'stat', 1, 255, 'number1, ...', 'Sample skewness.', (a, f) => { const xs = nums(a, f); if (isErr(xs)) return xs; return xs.length < 3 ? ERR.DIV0 : fx(st.skew(xs)); });
def('SKEW.P', 'stat', 1, 255, 'number1, ...', 'Population skewness.', (a, f) => { const xs = nums(a, f); if (isErr(xs)) return xs; return xs.length < 1 ? ERR.DIV0 : fx(st.skewP(xs)); }, { future: true });
def('KURT', 'stat', 1, 255, 'number1, ...', 'Kurtosis.', (a, f) => { const xs = nums(a, f); if (isErr(xs)) return xs; return xs.length < 4 ? ERR.DIV0 : fx(st.kurt(xs)); });

// ── Order statistics ─────────────────────────────────────────────────────────

def('LARGE', 'stat', 2, 2, 'array, k', 'k-th largest value.', (a, f) => {
  const xs = nums([a[0]], f); if (isErr(xs)) return xs; const k = N(a[1], f); if (isErr(k)) return k;
  return fx(st.kth(xs, Math.ceil(k), true));
}, { lift: [1] });
def('SMALL', 'stat', 2, 2, 'array, k', 'k-th smallest value.', (a, f) => {
  const xs = nums([a[0]], f); if (isErr(xs)) return xs; const k = N(a[1], f); if (isErr(k)) return k;
  return fx(st.kth(xs, Math.ceil(k), false));
}, { lift: [1] });
def('PERCENTILE.INC', 'stat', 2, 2, 'array, k', 'k-th percentile (inclusive).', (a, f) => {
  const xs = nums([a[0]], f); if (isErr(xs)) return xs; const k = N(a[1], f); if (isErr(k)) return k;
  return fx(st.percentileInc(xs, k));
}, { lift: [1] });
alias('PERCENTILE', 'PERCENTILE.INC');
def('PERCENTILE.EXC', 'stat', 2, 2, 'array, k', 'k-th percentile (exclusive).', (a, f) => {
  const xs = nums([a[0]], f); if (isErr(xs)) return xs; const k = N(a[1], f); if (isErr(k)) return k;
  return fx(st.percentileExc(xs, k));
}, { lift: [1] });
def('QUARTILE.INC', 'stat', 2, 2, 'array, quart', 'Quartile (inclusive).', (a, f) => {
  const xs = nums([a[0]], f); if (isErr(xs)) return xs; const q = N(a[1], f); if (isErr(q)) return q;
  const qi = Math.trunc(q); if (qi < 0 || qi > 4 || !xs.length) return ERR.NUM;
  return st.percentileInc(xs, qi / 4);
}, { lift: [1] });
alias('QUARTILE', 'QUARTILE.INC');
def('QUARTILE.EXC', 'stat', 2, 2, 'array, quart', 'Quartile (exclusive).', (a, f) => {
  const xs = nums([a[0]], f); if (isErr(xs)) return xs; const q = N(a[1], f); if (isErr(q)) return q;
  const qi = Math.trunc(q); if (qi <= 0 || qi >= 4) return ERR.NUM;
  return fx(st.percentileExc(xs, qi / 4));
}, { lift: [1] });
function percentRank(xs: number[], x: number, sig: number, exc: boolean): number | CellError {
  if (!xs.length || sig < 1) return ERR.NUM;
  const s = st.sorted(xs), n = s.length;
  if (x < s[0] || x > s[n - 1]) return ERR.NA;
  let pos: number;
  let i = 0; while (i < n && s[i] < x) i++;
  if (s[i] === x) pos = exc ? (i + 1) / (n + 1) : n === 1 ? 1 : i / (n - 1);
  else {
    const lo = s[i - 1], hi = s[i];
    const plo = exc ? i / (n + 1) : (i - 1) / (n - 1), phi = exc ? (i + 1) / (n + 1) : i / (n - 1);
    pos = plo + ((x - lo) / (hi - lo)) * (phi - plo);
  }
  const p = Math.pow(10, Math.trunc(sig));
  return Math.floor(Number((pos * p).toPrecision(15))) / p;
}
def('PERCENTRANK.INC', 'stat', 2, 3, 'array, x, [significance]', 'Rank as a percentage (inclusive).', (a, f) => {
  const xs = nums([a[0]], f); if (isErr(xs)) return xs; const x = N(a[1], f), s = NO(a[2], 3, f); const e = firstErr(x, s); if (e) return e;
  return percentRank(xs, x as number, s as number, false);
}, { lift: [1, 2] });
alias('PERCENTRANK', 'PERCENTRANK.INC');
def('PERCENTRANK.EXC', 'stat', 2, 3, 'array, x, [significance]', 'Rank as a percentage (exclusive).', (a, f) => {
  const xs = nums([a[0]], f); if (isErr(xs)) return xs; const x = N(a[1], f), s = NO(a[2], 3, f); const e = firstErr(x, s); if (e) return e;
  return percentRank(xs, x as number, s as number, true);
}, { lift: [1, 2] });
function rank(a: Value[], f: Frame, avg: boolean): Value {
  const x = N(a[0], f); if (isErr(x)) return x;
  const xs = nums([a[1]], f); if (isErr(xs)) return xs;
  const ord = NO(a[2], 0, f); if (isErr(ord)) return ord;
  if (!xs.includes(x)) return ERR.NA;
  const better = xs.filter(v => (ord ? v < x : v > x)).length;
  const ties = xs.filter(v => v === x).length;
  return avg ? better + (ties + 1) / 2 : better + 1;
}
def('RANK.EQ', 'stat', 2, 3, 'number, ref, [order]', 'Rank (ties share the top rank).', (a, f) => rank(a, f, false), { lift: [0, 2] });
alias('RANK', 'RANK.EQ');
def('RANK.AVG', 'stat', 2, 3, 'number, ref, [order]', 'Rank (ties get the average rank).', (a, f) => rank(a, f, true), { lift: [0, 2] });

def('FREQUENCY', 'stat', 2, 2, 'data_array, bins_array', 'Frequency distribution as a vertical array.', (a, f) => {
  const xs = nums([a[0]], f); if (isErr(xs)) return xs;
  const bins = nums([a[1]], f); if (isErr(bins)) return bins;
  const order = bins.map((b, i) => [b, i] as [number, number]).sort((p, q) => p[0] - q[0]);
  const counts = new Array(bins.length + 1).fill(0);
  for (const x of xs) {
    let placed = false;
    for (const [b, i] of order) if (x <= b) { counts[i]++; placed = true; break; }
    if (!placed) counts[bins.length]++;
  }
  return Matrix.col(counts);
});

// ── Correlation & regression ─────────────────────────────────────────────────

function paired(name: string, desc: string, fn: (x: number[], y: number[]) => number | CellError, minN = 1, yFirst = false) {
  def(name, 'stat', 2, 2, yFirst ? "known_y's, known_x's" : 'array1, array2', desc, (a, f) => {
    const p = yFirst ? pairs(a[1], a[0], f) : pairs(a[0], a[1], f); if (isErr(p)) return p;
    if (p.x.length < minN) return ERR.DIV0;
    const r = fn(p.x, p.y);
    return typeof r === 'number' ? fx(r) : r;
  });
}
paired('CORREL', 'Correlation coefficient.', (x, y) => { const r = st.correl(x, y); return Number.isFinite(r) ? r : ERR.DIV0; }, 2);
alias('PEARSON', 'CORREL');
paired('RSQ', 'Square of the Pearson correlation.', (x, y) => { const r = st.correl(x, y); return Number.isFinite(r) ? r * r : ERR.DIV0; }, 2, true);
paired('COVARIANCE.P', 'Population covariance.', (x, y) => st.covariance(x, y, false), 1);
alias('COVAR', 'COVARIANCE.P');
paired('COVARIANCE.S', 'Sample covariance.', (x, y) => st.covariance(x, y, true), 2);
paired('SLOPE', 'Slope of the linear regression line.', (x, y) => { const r = st.slopeIntercept(y, x).slope; return Number.isFinite(r) ? r : ERR.DIV0; }, 1, true);
paired('INTERCEPT', 'Intercept of the linear regression line.', (x, y) => { const r = st.slopeIntercept(y, x).intercept; return Number.isFinite(r) ? r : ERR.DIV0; }, 1, true);
paired('STEYX', 'Standard error of the predicted y.', (x, y) => {
  if (x.length < 3) return ERR.DIV0;
  const { slope, intercept } = st.slopeIntercept(y, x);
  let s = 0; for (let i = 0; i < x.length; i++) s += (y[i] - (intercept + slope * x[i])) ** 2;
  return Math.sqrt(s / (x.length - 2));
}, 3, true);
def('FORECAST.LINEAR', 'stat', 3, 3, "x, known_y's, known_x's", 'Linear-trend forecast.', (a, f) => {
  const x = N(a[0], f); if (isErr(x)) return x;
  const p = pairs(a[2], a[1], f); if (isErr(p)) return p;
  if (!p.x.length) return ERR.NA;
  const { slope, intercept } = st.slopeIntercept(p.y, p.x);
  return Number.isFinite(slope) ? intercept + slope * x : ERR.DIV0;
}, { lift: [0], future: true });
alias('FORECAST', 'FORECAST.LINEAR', { future: false });

/** Least squares y ≈ X·b (+ intercept). Returns coefficients [b0 (intercept), b1..bk] and stats. */
function regress(y: number[], X: number[][], withConst: boolean) {
  const n = y.length, k = X[0]?.length ?? 0;
  const A = X.map(r => (withConst ? [1, ...r] : r));
  const p = A[0].length;
  const AtA = Array.from({ length: p }, (_, i) => Array.from({ length: p }, (_, j) => A.reduce((s, r) => s + r[i] * r[j], 0)));
  const Aty = Array.from({ length: p }, (_, i) => A.reduce((s, r, t) => s + r[i] * y[t], 0));
  const inv = invertMatrix(AtA);
  if (!inv) return null;
  const b = inv.map(row => row.reduce((s, v, j) => s + v * Aty[j], 0));
  const yhat = A.map(r => r.reduce((s, v, j) => s + v * b[j], 0));
  const ssResid = y.reduce((s, v, i) => s + (v - yhat[i]) ** 2, 0);
  const my = st.mean(y);
  const ssTot = withConst ? y.reduce((s, v) => s + (v - my) ** 2, 0) : y.reduce((s, v) => s + v * v, 0);
  const df = n - p;
  const ssReg = ssTot - ssResid;
  const sey = df > 0 ? Math.sqrt(ssResid / df) : NaN;
  const se = inv.map((row, i) => Math.sqrt(Math.max(0, row[i]) * (ssResid / df)));
  return { b, se, r2: ssTot ? ssReg / ssTot : 1, sey, F: (ssReg / (withConst ? k : p)) / (ssResid / df), df, ssReg, ssResid };
}
function regressionInputs(a: Value[], f: Frame): { y: number[]; X: number[][]; byRow: boolean } | CellError {
  const ym = M(a[0], f); if (isErr(ym)) return ym;
  const y: number[] = [];
  for (const v of ym.data.flat()) { if (typeof v !== 'number') return ERR.VALUE; y.push(v); }
  const byRow = ym.rows === 1 && ym.cols > 1;
  let X: number[][];
  if (omitted(a[1])) X = y.map((_, i) => [i + 1]);
  else {
    const xm = M(a[1], f); if (isErr(xm)) return xm;
    for (const v of xm.data.flat()) if (typeof v !== 'number') return ERR.VALUE;
    const xd = xm.data as number[][];
    if (byRow) X = xm.rows === 1 ? xd[0].map(v => [v]) : y.map((_, i) => xd.map(r => r[i]));
    else X = xm.cols === 1 || xm.rows === y.length ? xd.map(r => r.slice()) : xd[0].map(v => [v]);
    if (X.length !== y.length) return ERR.REF;
  }
  return { y, X, byRow };
}
def('LINEST', 'stat', 1, 4, "known_y's, [known_x's], [const], [stats]", 'Linear regression coefficients (and statistics).', (a, f) => {
  const inp = regressionInputs(a, f); if (isErr(inp)) return inp;
  const c = BO(a[2], true, f), stats = BO(a[3], false, f); const e = firstErr(c, stats); if (e) return e;
  const r = regress(inp.y, inp.X, c as boolean); if (!r) return ERR.NUM;
  const coef = c ? r.b.slice(1).reverse().concat([r.b[0]]) : r.b.slice().reverse().concat([0]);
  if (!stats) return Matrix.row(coef);
  const se = c ? r.se.slice(1).reverse().concat([r.se[0]]) : r.se.slice().reverse().concat([ERR.NA as unknown as number]);
  const w = coef.length;
  const pad = (vals: Scalar[]) => vals.concat(new Array(w - vals.length).fill(ERR.NA));
  return new Matrix([coef, se, pad([r.r2, r.sey]), pad([r.F, r.df]), pad([r.ssReg, r.ssResid])]);
});
def('LOGEST', 'stat', 1, 4, "known_y's, [known_x's], [const], [stats]", 'Exponential regression coefficients.', (a, f) => {
  const inp = regressionInputs(a, f); if (isErr(inp)) return inp;
  if (inp.y.some(v => v <= 0)) return ERR.NUM;
  const c = BO(a[2], true, f); if (isErr(c)) return c;
  const r = regress(inp.y.map(Math.log), inp.X, c); if (!r) return ERR.NUM;
  const coef = (c ? r.b.slice(1).reverse().concat([r.b[0]]) : r.b.slice().reverse().concat([0])).map(Math.exp);
  return Matrix.row(coef);
});
function trendLike(a: Value[], f: Frame, log: boolean): Value {
  const inp = regressionInputs(a, f); if (isErr(inp)) return inp;
  if (log && inp.y.some(v => v <= 0)) return ERR.NUM;
  const c = BO(a[3], true, f); if (isErr(c)) return c;
  const r = regress(log ? inp.y.map(Math.log) : inp.y, inp.X, c); if (!r) return ERR.NUM;
  let newX: number[][]; let shape: [number, number];
  if (omitted(a[2])) { newX = inp.X; shape = inp.byRow ? [1, inp.y.length] : [inp.y.length, 1]; }
  else {
    const nm = M(a[2], f); if (isErr(nm)) return nm;
    const k = inp.X[0].length;
    if (k === 1) { newX = nm.data.flat().map(v => [typeof v === 'number' ? v : NaN]); shape = [nm.rows, nm.cols]; }
    else { newX = (inp.byRow ? nm.data[0].map((_, j) => nm.data.map(r => r[j] as number)) : nm.data.map(r => r.map(v => v as number))); shape = inp.byRow ? [1, newX.length] : [newX.length, 1]; }
  }
  const preds = newX.map(row => { const v = (c ? r.b[0] : 0) + row.reduce((s, x, j) => s + x * r.b[j + (c ? 1 : 0)], 0); return log ? Math.exp(v) : v; });
  const out: Scalar[][] = [];
  for (let i = 0; i < shape[0]; i++) out.push(preds.slice(i * shape[1], (i + 1) * shape[1]).map(v => (Number.isFinite(v) ? v : ERR.VALUE)));
  return new Matrix(out);
}
def('TREND', 'stat', 1, 4, "known_y's, [known_x's], [new_x's], [const]", 'Values along a linear trend.', (a, f) => trendLike(a, f, false));
def('GROWTH', 'stat', 1, 4, "known_y's, [known_x's], [new_x's], [const]", 'Values along an exponential trend.', (a, f) => trendLike(a, f, true));

// ── Misc ─────────────────────────────────────────────────────────────────────

def('STANDARDIZE', 'stat', 3, 3, 'x, mean, standard_dev', 'Normalized value.', a => {
  const x = N(a[0]), m = N(a[1]), s = N(a[2]); const e = firstErr(x, m, s); if (e) return e;
  return (s as number) <= 0 ? ERR.NUM : ((x as number) - (m as number)) / (s as number);
}, L);
def('FISHER', 'stat', 1, 1, 'x', 'Fisher transformation.', a => { const x = N(a[0]); if (isErr(x)) return x; return Math.abs(x) >= 1 ? ERR.NUM : 0.5 * Math.log((1 + x) / (1 - x)); }, L);
def('FISHERINV', 'stat', 1, 1, 'y', 'Inverse Fisher transformation.', a => { const y = N(a[0]); if (isErr(y)) return y; const e2 = Math.exp(2 * y); return (e2 - 1) / (e2 + 1); }, L);
def('PERMUT', 'stat', 2, 2, 'number, number_chosen', 'Number of permutations.', a => {
  const n = N(a[0]), k = N(a[1]); const e = firstErr(n, k); if (e) return e;
  const ni = Math.trunc(n as number), ki = Math.trunc(k as number);
  if (ni < 0 || ki < 0 || ni < ki) return ERR.NUM;
  let r = 1; for (let i = 0; i < ki; i++) r *= ni - i; return nr(r);
}, L);
def('PERMUTATIONA', 'stat', 2, 2, 'number, number_chosen', 'Permutations with repetition.', a => {
  const n = N(a[0]), k = N(a[1]); const e = firstErr(n, k); if (e) return e;
  if ((n as number) < 0 || (k as number) < 0) return ERR.NUM;
  return nr(Math.pow(Math.trunc(n as number), Math.trunc(k as number)));
}, { ...L, future: true });
def('PROB', 'stat', 3, 4, 'x_range, prob_range, lower_limit, [upper_limit]', 'Probability that values fall between limits.', (a, f) => {
  const p = pairs(a[0], a[1], f); if (isErr(p)) return p;
  const lo = N(a[2], f); if (isErr(lo)) return lo; const hi = omitted(a[3]) ? lo : N(a[3], f); if (isErr(hi)) return hi;
  const total = st.sum(p.y); if (Math.abs(total - 1) > 1e-9 || p.y.some(v => v < 0 || v > 1)) return ERR.NUM;
  let s = 0; for (let i = 0; i < p.x.length; i++) if (p.x[i] >= lo && p.x[i] <= hi) s += p.y[i];
  return s;
});
def('GAMMA', 'stat', 1, 1, 'number', 'Gamma function.', a => { const x = N(a[0]); if (isErr(x)) return x; if (x === 0 || (x < 0 && Number.isInteger(x))) return ERR.NUM; return fx(st.gamma(x)); }, { ...L, future: true });
def('GAMMALN', 'stat', 1, 1, 'x', 'Natural log of the gamma function.', a => { const x = N(a[0]); if (isErr(x)) return x; return x <= 0 ? ERR.NUM : st.gammaln(x); }, L);
alias('GAMMALN.PRECISE', 'GAMMALN', { future: true });
def('PHI', 'stat', 1, 1, 'x', 'Standard normal density.', a => { const x = N(a[0]); if (isErr(x)) return x; return st.normPdf(x); }, { ...L, future: true });
def('GAUSS', 'stat', 1, 1, 'z', 'Probability a standard normal falls between the mean and z.', a => { const z = N(a[0]); if (isErr(z)) return z; return st.normCdf(z) - 0.5; }, { ...L, future: true });

// ── Distributions ────────────────────────────────────────────────────────────

const args = (a: Value[], spec: ('n' | 'b' | number)[]): (number | boolean)[] | CellError => {
  const out: (number | boolean)[] = [];
  for (let i = 0; i < spec.length; i++) {
    const s = spec[i];
    let v: number | boolean | CellError;
    if (s === 'n') v = N(a[i]);
    else if (s === 'b') v = B(a[i]);
    else v = omitted(a[i]) ? s : N(a[i]);
    if (isErr(v)) return v;
    out.push(v);
  }
  return out;
};
const D = (name: string, sig: string, desc: string, spec: ('n' | 'b' | number)[], fn: (...x: any[]) => number | CellError, future = false) =>
  def(name, 'stat', spec.filter(s => s === 'n' || s === 'b').length, spec.length, sig, desc, a => {
    const v = args(a, spec); if (isErr(v)) return v;
    const r = fn(...v);
    return typeof r === 'number' ? fx(r) : r;
  }, { lift: 'all', future });

D('NORM.DIST', 'x, mean, standard_dev, cumulative', 'Normal distribution.', ['n', 'n', 'n', 'b'], (x, m, s, c) => (s <= 0 ? ERR.NUM : c ? st.normCdf(x, m, s) : st.normPdf(x, m, s)), true);
D('NORMDIST', 'x, mean, standard_dev, cumulative', 'Normal distribution (legacy).', ['n', 'n', 'n', 'b'], (x, m, s, c) => (s <= 0 ? ERR.NUM : c ? st.normCdf(x, m, s) : st.normPdf(x, m, s)));
D('NORM.INV', 'probability, mean, standard_dev', 'Inverse normal distribution.', ['n', 'n', 'n'], (p, m, s) => (p <= 0 || p >= 1 || s <= 0 ? ERR.NUM : m + s * st.normSInv(p)), true);
D('NORMINV', 'probability, mean, standard_dev', 'Inverse normal (legacy).', ['n', 'n', 'n'], (p, m, s) => (p <= 0 || p >= 1 || s <= 0 ? ERR.NUM : m + s * st.normSInv(p)));
D('NORM.S.DIST', 'z, cumulative', 'Standard normal distribution.', ['n', 'b'], (z, c) => (c ? st.normCdf(z) : st.normPdf(z)), true);
D('NORMSDIST', 'z', 'Standard normal cumulative (legacy).', ['n'], z => st.normCdf(z));
D('NORM.S.INV', 'probability', 'Inverse standard normal.', ['n'], p => (p <= 0 || p >= 1 ? ERR.NUM : st.normSInv(p)), true);
D('NORMSINV', 'probability', 'Inverse standard normal (legacy).', ['n'], p => (p <= 0 || p >= 1 ? ERR.NUM : st.normSInv(p)));
D('LOGNORM.DIST', 'x, mean, standard_dev, cumulative', 'Lognormal distribution.', ['n', 'n', 'n', 'b'], (x, m, s, c) => (x <= 0 || s <= 0 ? ERR.NUM : c ? st.normCdf(Math.log(x), m, s) : st.normPdf(Math.log(x), m, s) / x), true);
D('LOGNORMDIST', 'x, mean, standard_dev', 'Lognormal cumulative (legacy).', ['n', 'n', 'n'], (x, m, s) => (x <= 0 || s <= 0 ? ERR.NUM : st.normCdf(Math.log(x), m, s)));
D('LOGNORM.INV', 'probability, mean, standard_dev', 'Inverse lognormal.', ['n', 'n', 'n'], (p, m, s) => (p <= 0 || p >= 1 || s <= 0 ? ERR.NUM : Math.exp(m + s * st.normSInv(p))), true);
alias('LOGINV', 'LOGNORM.INV', { future: false });
D('T.DIST', 'x, deg_freedom, cumulative', "Student's t (left tail).", ['n', 'n', 'b'], (x, df, c) => (df < 1 ? ERR.NUM : c ? st.tCdf(x, Math.trunc(df)) : st.tPdf(x, Math.trunc(df))), true);
D('T.DIST.2T', 'x, deg_freedom', "Student's t (two-tailed).", ['n', 'n'], (x, df) => (x < 0 || df < 1 ? ERR.NUM : 2 * (1 - st.tCdf(x, Math.trunc(df)))), true);
D('T.DIST.RT', 'x, deg_freedom', "Student's t (right tail).", ['n', 'n'], (x, df) => (df < 1 ? ERR.NUM : 1 - st.tCdf(x, Math.trunc(df))), true);
D('TDIST', 'x, deg_freedom, tails', "Student's t (legacy).", ['n', 'n', 'n'], (x, df, t) => (x < 0 || df < 1 || (t !== 1 && t !== 2) ? ERR.NUM : t * (1 - st.tCdf(x, Math.trunc(df)))));
D('T.INV', 'probability, deg_freedom', "Inverse Student's t (left tail).", ['n', 'n'], (p, df) => (p <= 0 || p >= 1 || df < 1 ? ERR.NUM : st.tInv(p, Math.trunc(df))), true);
D('T.INV.2T', 'probability, deg_freedom', "Inverse Student's t (two-tailed).", ['n', 'n'], (p, df) => (p <= 0 || p > 1 || df < 1 ? ERR.NUM : st.tInv(1 - p / 2, Math.trunc(df))), true);
alias('TINV', 'T.INV.2T', { future: false });
D('CHISQ.DIST', 'x, deg_freedom, cumulative', 'Chi-squared distribution (left tail).', ['n', 'n', 'b'], (x, k, c) => (x < 0 || k < 1 ? ERR.NUM : c ? st.chisqCdf(x, Math.trunc(k)) : st.chisqPdf(x, Math.trunc(k))), true);
D('CHISQ.DIST.RT', 'x, deg_freedom', 'Chi-squared distribution (right tail).', ['n', 'n'], (x, k) => (x < 0 || k < 1 ? ERR.NUM : 1 - st.chisqCdf(x, Math.trunc(k))), true);
alias('CHIDIST', 'CHISQ.DIST.RT', { future: false });
D('CHISQ.INV', 'probability, deg_freedom', 'Inverse chi-squared (left tail).', ['n', 'n'], (p, k) => (p < 0 || p >= 1 || k < 1 ? ERR.NUM : st.chisqInv(p, Math.trunc(k))), true);
D('CHISQ.INV.RT', 'probability, deg_freedom', 'Inverse chi-squared (right tail).', ['n', 'n'], (p, k) => (p <= 0 || p > 1 || k < 1 ? ERR.NUM : st.chisqInv(1 - p, Math.trunc(k))), true);
alias('CHIINV', 'CHISQ.INV.RT', { future: false });
D('F.DIST', 'x, deg_freedom1, deg_freedom2, cumulative', 'F distribution (left tail).', ['n', 'n', 'n', 'b'], (x, a, b, c) => (x < 0 || a < 1 || b < 1 ? ERR.NUM : c ? st.fCdf(x, Math.trunc(a), Math.trunc(b)) : st.fPdf(x, Math.trunc(a), Math.trunc(b))), true);
D('F.DIST.RT', 'x, deg_freedom1, deg_freedom2', 'F distribution (right tail).', ['n', 'n', 'n'], (x, a, b) => (x < 0 || a < 1 || b < 1 ? ERR.NUM : 1 - st.fCdf(x, Math.trunc(a), Math.trunc(b))), true);
alias('FDIST', 'F.DIST.RT', { future: false });
D('F.INV', 'probability, deg_freedom1, deg_freedom2', 'Inverse F (left tail).', ['n', 'n', 'n'], (p, a, b) => (p < 0 || p > 1 || a < 1 || b < 1 ? ERR.NUM : st.fInv(p, Math.trunc(a), Math.trunc(b))), true);
D('F.INV.RT', 'probability, deg_freedom1, deg_freedom2', 'Inverse F (right tail).', ['n', 'n', 'n'], (p, a, b) => (p < 0 || p > 1 || a < 1 || b < 1 ? ERR.NUM : st.fInv(1 - p, Math.trunc(a), Math.trunc(b))), true);
alias('FINV', 'F.INV.RT', { future: false });
D('BINOM.DIST', 'number_s, trials, probability_s, cumulative', 'Binomial distribution.', ['n', 'n', 'n', 'b'], (k, n, p, c) => {
  k = Math.trunc(k); n = Math.trunc(n);
  if (k < 0 || k > n || p < 0 || p > 1) return ERR.NUM;
  return c ? st.binomCdf(k, n, p) : st.binomPmf(k, n, p);
}, true);
alias('BINOMDIST', 'BINOM.DIST', { future: false });
D('BINOM.INV', 'trials, probability_s, alpha', 'Smallest k with binomial CDF ≥ alpha.', ['n', 'n', 'n'], (n, p, al) => {
  n = Math.trunc(n); if (n < 0 || p < 0 || p > 1 || al < 0 || al > 1) return ERR.NUM;
  let s = 0; for (let k = 0; k <= n; k++) { s += st.binomPmf(k, n, p); if (s >= al - 1e-15) return k; } return n;
}, true);
alias('CRITBINOM', 'BINOM.INV', { future: false });
D('POISSON.DIST', 'x, mean, cumulative', 'Poisson distribution.', ['n', 'n', 'b'], (x, m, c) => { x = Math.trunc(x); return x < 0 || m < 0 ? ERR.NUM : c ? st.poissonCdf(x, m) : st.poissonPmf(x, m); }, true);
alias('POISSON', 'POISSON.DIST', { future: false });
D('EXPON.DIST', 'x, lambda, cumulative', 'Exponential distribution.', ['n', 'n', 'b'], (x, l, c) => (x < 0 || l <= 0 ? ERR.NUM : c ? 1 - Math.exp(-l * x) : l * Math.exp(-l * x)), true);
alias('EXPONDIST', 'EXPON.DIST', { future: false });
D('GAMMA.DIST', 'x, alpha, beta, cumulative', 'Gamma distribution.', ['n', 'n', 'n', 'b'], (x, a, b, c) => (x < 0 || a <= 0 || b <= 0 ? ERR.NUM : c ? st.gammaCdf(x, a, b) : st.gammaPdf(x, a, b)), true);
alias('GAMMADIST', 'GAMMA.DIST', { future: false });
D('GAMMA.INV', 'probability, alpha, beta', 'Inverse gamma distribution.', ['n', 'n', 'n'], (p, a, b) => (p < 0 || p >= 1 || a <= 0 || b <= 0 ? ERR.NUM : p === 0 ? 0 : st.gammaInv(p, a, b)), true);
alias('GAMMAINV', 'GAMMA.INV', { future: false });
D('BETA.DIST', 'x, alpha, beta, cumulative, [A], [B]', 'Beta distribution.', ['n', 'n', 'n', 'b', 0, 1], (x, a, b, c, lo, hi) => {
  if (a <= 0 || b <= 0 || x < lo || x > hi || lo >= hi) return ERR.NUM;
  const z = (x - lo) / (hi - lo);
  return c ? st.betaCdf(z, a, b) : st.betaPdf(z, a, b) / (hi - lo);
}, true);
D('BETADIST', 'x, alpha, beta, [A], [B]', 'Beta cumulative (legacy).', ['n', 'n', 'n', 0, 1], (x, a, b, lo, hi) => (a <= 0 || b <= 0 || x < lo || x > hi ? ERR.NUM : st.betaCdf((x - lo) / (hi - lo), a, b)));
D('BETA.INV', 'probability, alpha, beta, [A], [B]', 'Inverse beta distribution.', ['n', 'n', 'n', 0, 1], (p, a, b, lo, hi) => (p <= 0 || p > 1 || a <= 0 || b <= 0 ? ERR.NUM : lo + (hi - lo) * st.betaInv(p, a, b)), true);
alias('BETAINV', 'BETA.INV', { future: false });
D('WEIBULL.DIST', 'x, alpha, beta, cumulative', 'Weibull distribution.', ['n', 'n', 'n', 'b'], (x, a, b, c) => (x < 0 || a <= 0 || b <= 0 ? ERR.NUM : c ? 1 - Math.exp(-Math.pow(x / b, a)) : (a / Math.pow(b, a)) * Math.pow(x, a - 1) * Math.exp(-Math.pow(x / b, a))), true);
alias('WEIBULL', 'WEIBULL.DIST', { future: false });
D('HYPGEOM.DIST', 'sample_s, number_sample, population_s, number_pop, cumulative', 'Hypergeometric distribution.', ['n', 'n', 'n', 'n', 'b'], (s, n, M2, Np, c) => {
  s = Math.trunc(s); n = Math.trunc(n); M2 = Math.trunc(M2); Np = Math.trunc(Np);
  if (s < 0 || n <= 0 || M2 <= 0 || Np <= 0 || n > Np || M2 > Np || s > n || s > M2) return ERR.NUM;
  const pmf = (k: number) => Math.exp(st.lnComb(M2, k) + st.lnComb(Np - M2, n - k) - st.lnComb(Np, n));
  if (!c) return pmf(s);
  let t = 0; for (let k = Math.max(0, n - (Np - M2)); k <= s; k++) t += pmf(k); return t;
}, true);
D('HYPGEOMDIST', 'sample_s, number_sample, population_s, number_pop', 'Hypergeometric (legacy).', ['n', 'n', 'n', 'n'], (s, n, M2, Np) => Math.exp(st.lnComb(M2, Math.trunc(s)) + st.lnComb(Np - M2, n - Math.trunc(s)) - st.lnComb(Np, n)));
D('NEGBINOM.DIST', 'number_f, number_s, probability_s, cumulative', 'Negative binomial distribution.', ['n', 'n', 'n', 'b'], (fl, s, p, c) => {
  fl = Math.trunc(fl); s = Math.trunc(s);
  if (fl < 0 || s < 1 || p < 0 || p > 1) return ERR.NUM;
  const pmf = (k: number) => Math.exp(st.lnComb(k + s - 1, s - 1) + s * Math.log(p) + k * Math.log(1 - p));
  if (!c) return pmf(fl);
  return st.regIncBeta(p, s, fl + 1);
}, true);
D('NEGBINOMDIST', 'number_f, number_s, probability_s', 'Negative binomial (legacy).', ['n', 'n', 'n'], (fl, s, p) => Math.exp(st.lnComb(Math.trunc(fl) + Math.trunc(s) - 1, Math.trunc(s) - 1) + Math.trunc(s) * Math.log(p) + Math.trunc(fl) * Math.log(1 - p)));
D('CONFIDENCE.NORM', 'alpha, standard_dev, size', 'Confidence interval half-width (normal).', ['n', 'n', 'n'], (al, s, n) => (al <= 0 || al >= 1 || s <= 0 || n < 1 ? ERR.NUM : st.normSInv(1 - al / 2) * s / Math.sqrt(Math.trunc(n))), true);
alias('CONFIDENCE', 'CONFIDENCE.NORM', { future: false });
D('CONFIDENCE.T', 'alpha, standard_dev, size', "Confidence interval half-width (Student's t).", ['n', 'n', 'n'], (al, s, n) => (al <= 0 || al >= 1 || s <= 0 || n < 2 ? (n === 1 ? ERR.DIV0 : ERR.NUM) : st.tInv(1 - al / 2, Math.trunc(n) - 1) * s / Math.sqrt(Math.trunc(n))), true);

def('Z.TEST', 'stat', 2, 3, 'array, x, [sigma]', 'One-tailed z-test P-value.', (a, f) => {
  const xs = nums([a[0]], f); if (isErr(xs)) return xs; const x = N(a[1], f); if (isErr(x)) return x;
  if (xs.length < 2 && omitted(a[2])) return ERR.DIV0;
  const s = omitted(a[2]) ? Math.sqrt(st.varS(xs)) : N(a[2], f); if (isErr(s)) return s;
  return 1 - st.normCdf((st.mean(xs) - x) / (s / Math.sqrt(xs.length)));
}, { future: true });
alias('ZTEST', 'Z.TEST', { future: false });
def('T.TEST', 'stat', 4, 4, 'array1, array2, tails, type', "Student's t-test P-value.", (a, f) => {
  const tails = I(a[2], f), type = I(a[3], f); const e = firstErr(tails, type); if (e) return e;
  if ((tails !== 1 && tails !== 2) || (type as number) < 1 || (type as number) > 3) return ERR.NUM;
  let t: number, df: number;
  if (type === 1) {
    const p = pairs(a[0], a[1], f); if (isErr(p)) return p;
    const d = p.x.map((x, i) => x - p.y[i]); const n = d.length; if (n < 2) return ERR.DIV0;
    t = st.mean(d) / Math.sqrt(st.varS(d) / n); df = n - 1;
  } else {
    const x = nums([a[0]], f), y = nums([a[1]], f); if (isErr(x)) return x; if (isErr(y)) return y;
    if (x.length < 2 || y.length < 2) return ERR.DIV0;
    const vx = st.varS(x), vy = st.varS(y), nx = x.length, ny = y.length;
    if (type === 2) { const sp = ((nx - 1) * vx + (ny - 1) * vy) / (nx + ny - 2); t = (st.mean(x) - st.mean(y)) / Math.sqrt(sp * (1 / nx + 1 / ny)); df = nx + ny - 2; }
    else { const se2 = vx / nx + vy / ny; t = (st.mean(x) - st.mean(y)) / Math.sqrt(se2); df = (se2 * se2) / ((vx / nx) ** 2 / (nx - 1) + (vy / ny) ** 2 / (ny - 1)); }
  }
  const rt = 1 - tCdfReal(Math.abs(t), df);
  return (tails as number) * rt;
}, { future: true });
alias('TTEST', 'T.TEST', { future: false });
function tCdfReal(t: number, df: number) { const x = df / (df + t * t); const tail = 0.5 * st.regIncBeta(x, df / 2, 0.5); return t >= 0 ? 1 - tail : tail; }
def('F.TEST', 'stat', 2, 2, 'array1, array2', 'Two-tailed F-test P-value.', (a, f) => {
  const x = nums([a[0]], f), y = nums([a[1]], f); if (isErr(x)) return x; if (isErr(y)) return y;
  if (x.length < 2 || y.length < 2) return ERR.DIV0;
  const vx = st.varS(x), vy = st.varS(y); if (vx === 0 || vy === 0) return ERR.DIV0;
  const F = vx / vy, d1 = x.length - 1, d2 = y.length - 1;
  const p = st.fCdf(F, d1, d2);
  return 2 * Math.min(p, 1 - p);
}, { future: true });
alias('FTEST', 'F.TEST', { future: false });
def('CHISQ.TEST', 'stat', 2, 2, 'actual_range, expected_range', 'Chi-squared independence test P-value.', (a, f) => {
  const am = M(a[0], f), em = M(a[1], f); if (isErr(am)) return am; if (isErr(em)) return em;
  if (am.rows !== em.rows || am.cols !== em.cols) return ERR.NA;
  let x2 = 0;
  for (let r = 0; r < am.rows; r++) for (let c = 0; c < am.cols; c++) {
    const o = am.data[r][c], e = em.data[r][c];
    if (typeof o === 'number' && typeof e === 'number') { if (e === 0) return ERR.DIV0; x2 += (o - e) ** 2 / e; }
  }
  const df = am.rows > 1 && am.cols > 1 ? (am.rows - 1) * (am.cols - 1) : Math.max(am.rows, am.cols) - 1;
  return 1 - st.chisqCdf(x2, df);
}, { future: true });
alias('CHITEST', 'CHISQ.TEST', { future: false });

export { toNum, IO };

def('BINOM.DIST.RANGE', 'stat', 3, 4, 'trials, probability_s, number_s, [number_s2]', 'Probability of a trial result range.', a => {
  const n = N(a[0]), p = N(a[1]), s1 = N(a[2]), s2 = omitted(a[3]) ? s1 : N(a[3]);
  const e = firstErr(n, p, s1, s2); if (e) return e;
  const nn = Math.trunc(n as number), lo = Math.trunc(s1 as number), hi = Math.trunc(s2 as number);
  if (nn < 0 || (p as number) < 0 || (p as number) > 1 || lo < 0 || lo > nn || hi < lo || hi > nn) return ERR.NUM;
  let t = 0; for (let k = lo; k <= hi; k++) t += st.binomPmf(k, nn, p as number);
  return t;
}, { lift: 'all', future: true });
