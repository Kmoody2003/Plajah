// effectCost — a static estimate of what an effect costs to render.
//
// Measuring GPU time in the app is not viable as a shipped signal: it needs a timer-query
// extension, a warmed GPU, and interleaved A/B runs to mean anything (the build log records how
// many confidently wrong answers a naive wall-clock harness produced). But users still need to
// know, BEFORE they stack four of them, that a raymarched generator is not a colour tweak.
//
// So this reads the shader instead. It is a static analysis, deliberately crude: count the
// expensive operations, multiply anything inside a loop by that loop's trip count, and bucket the
// result. It cannot predict milliseconds and does not try to — it exists to rank effects, and the
// ranking it produces matches the order measured on the GPU.

export type CostTier = 'light' | 'moderate' | 'heavy';

export interface EffectCost {
  score: number;
  tier: CostTier;
  /** Texture fetches, loop-weighted. */
  samples: number;
  /** sin/cos/exp/pow/sqrt and friends, loop-weighted. */
  transcendentals: number;
  /** Trip count of the deepest loop nest. */
  maxLoopWeight: number;
}

const SAMPLERS = ['prevSrcN', 'prevSrc', 'prev', 'aux', 'inp', 'src', 'texture', 'textureLod'];
const TRANSCENDENTAL = ['inversesqrt', 'smoothstep', 'normalize', 'distance', 'length', 'atan', 'asin', 'acos', 'sqrt', 'exp2', 'exp', 'log2', 'log', 'pow', 'sin', 'cos', 'tan'];
const COLOUR = ['hsv2rgb', 'rgb2hsv'];

/** Cheap builtins: real work, but an order below a texture fetch or a transcendental. */
const CHEAP_FN = ['fract', 'floor', 'ceil', 'mod', 'mix', 'clamp', 'min', 'max', 'abs', 'sign', 'dot', 'cross', 'step', 'round', 'trunc', 'reflect', 'refract'];

// Plain arithmetic has to count. An effect can be dominated by ALU with no transcendentals at
// all — swapping a sin-based hash for a multiply/fract one is exactly that — and a model blind to
// arithmetic ranked the suite's most expensive effect as its cheapest.
const WEIGHT = { sample: 6, transcendental: 2, colour: 4, cheap: 0.5, arith: 0.25 };

/** Cost tiers. Calibrated so a plain colour operation is light and a raymarcher is heavy. */
export const COST_THRESHOLDS = { moderate: 60, heavy: 400 };

export function tierFor(score: number): CostTier {
  if (score >= COST_THRESHOLDS.heavy) return 'heavy';
  if (score >= COST_THRESHOLDS.moderate) return 'moderate';
  return 'light';
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
}

/** Trip count declared by a `for` header, or 1 when it cannot be read. */
function tripCount(header: string): number {
  // The registry's loops are all counted: `for (int i = 0; i < N; i++)`.
  const bound = header.match(/[<>]=?\s*(\d+(?:\.\d+)?)/);
  const from = header.match(/=\s*(-?\d+(?:\.\d+)?)/);
  if (!bound) return 4;                       // an unreadable loop still costs something
  const hi = parseFloat(bound[1]);
  const lo = from ? parseFloat(from[1]) : 0;
  return Math.max(1, Math.round(hi - lo));
}

interface Tally { score: number; samples: number; transcendentals: number; maxLoopWeight: number; }
const empty = (): Tally => ({ score: 0, samples: 0, transcendentals: 0, maxLoopWeight: 1 });

/**
 * Top-level function bodies, by name. The registry's effects put most of their real work in
 * helpers (a terrain's height function calls fbm calls noise calls a hash), so an estimate that
 * only reads the text of `fx()` ranks the most expensive effect in the suite as the cheapest.
 */
function collectFunctions(glsl: string): Map<string, string> {
  const out = new Map<string, string>();
  const sig = /(?:^|[\s;}])(?:float|int|bool|void|vec2|vec3|vec4|mat2|mat3|mat4)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = sig.exec(glsl))) {
    let i = glsl.indexOf('(', m.index + m[0].length - 1);
    let par = 0;
    for (; i < glsl.length; i++) { if (glsl[i] === '(') par++; else if (glsl[i] === ')') { par--; if (!par) break; } }
    let j = i + 1;
    while (j < glsl.length && /\s/.test(glsl[j])) j++;
    if (glsl[j] !== '{') continue;                 // a prototype, not a definition
    let brace = 0, k = j;
    for (; k < glsl.length; k++) { if (glsl[k] === '{') brace++; else if (glsl[k] === '}') { brace--; if (!brace) break; } }
    out.set(m[1], glsl.slice(j + 1, k));
    sig.lastIndex = k;
  }
  return out;
}

/**
 * Walk a body tracking brace depth and the loops in scope, so a texture fetch inside a
 * 48-iteration march counts 48 times. Character-based rather than line-based on purpose: several
 * of the effect packs are written as one long line. Calls to user-defined helpers are resolved
 * through `resolve` and folded in at the current loop weight.
 */
function scanBody(body: string, resolve: (name: string) => Tally | null): Tally {
  const loops: { depth: number; mult: number }[] = [];
  let depth = 0;
  let pendingLoop: number | null = null;
  const acc = empty();

  const weight = () => loops.reduce((m, l) => m * l.mult, 1);
  const ident = /[A-Za-z_][A-Za-z0-9_]*/y;

  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '{') {
      depth++;
      if (pendingLoop !== null) { loops.push({ depth, mult: pendingLoop }); pendingLoop = null; acc.maxLoopWeight = Math.max(acc.maxLoopWeight, weight()); }
      continue;
    }
    if (ch === '}') {
      while (loops.length && loops[loops.length - 1].depth === depth) loops.pop();
      depth--;
      continue;
    }
    if (ch === ';' && pendingLoop !== null) { pendingLoop = null; continue; }
    if (ch === '*' || ch === '/' || ch === '+' || ch === '-') { acc.score += WEIGHT.arith * weight(); continue; }
    if (!/[A-Za-z_]/.test(ch)) continue;

    ident.lastIndex = i;
    const m = ident.exec(body);
    if (!m) continue;
    const name = m[0];
    i = ident.lastIndex - 1;

    // Only count a name that is actually being CALLED, so a variable named `length` is ignored.
    let j = ident.lastIndex;
    while (j < body.length && /\s/.test(body[j])) j++;
    if (body[j] !== '(') continue;

    if (name === 'for') {
      let k = j, par = 0, end = j;
      for (; k < body.length; k++) { if (body[k] === '(') par++; else if (body[k] === ')') { par--; if (!par) { end = k; break; } } }
      pendingLoop = tripCount(body.slice(j + 1, end));
      i = end;
      continue;
    }

    const w = weight();
    if (SAMPLERS.includes(name)) { acc.samples += w; acc.score += WEIGHT.sample * w; continue; }
    if (COLOUR.includes(name)) { acc.score += WEIGHT.colour * w; continue; }
    if (TRANSCENDENTAL.includes(name)) { acc.transcendentals += w; acc.score += WEIGHT.transcendental * w; continue; }
    if (CHEAP_FN.includes(name)) { acc.score += WEIGHT.cheap * w; continue; }
    const helper = resolve(name);
    if (helper) {
      acc.score += helper.score * w;
      acc.samples += helper.samples * w;
      acc.transcendentals += helper.transcendentals * w;
      acc.maxLoopWeight = Math.max(acc.maxLoopWeight, w * helper.maxLoopWeight);
    }
  }
  return acc;
}

/** Cost of one shader, with helper calls expanded. */
export function estimateShaderCost(glslRaw: string): Omit<EffectCost, 'tier'> {
  const glsl = stripComments(glslRaw || '');
  const fns = collectFunctions(glsl);
  const memo = new Map<string, Tally>();
  const inProgress = new Set<string>();

  const resolve = (name: string): Tally | null => {
    const body = fns.get(name);
    if (body === undefined) return null;
    const hit = memo.get(name);
    if (hit) return hit;
    if (inProgress.has(name)) return empty();      // GLSL forbids recursion; guard anyway
    inProgress.add(name);
    const cost = scanBody(body, resolve);
    inProgress.delete(name);
    memo.set(name, cost);
    return cost;
  };

  // The entry point is what actually runs per pixel; helpers only count where they are called.
  const entry = fns.has('fx') ? resolve('fx')! : scanBody(glsl, resolve);
  return {
    score: Math.round(entry.score),
    samples: Math.round(entry.samples),
    transcendentals: Math.round(entry.transcendentals),
    maxLoopWeight: entry.maxLoopWeight,
  };
}

/**
 * Cost of a whole effect, summed across its passes. A helper the shader calls inside a loop is
 * NOT expanded — the estimate reads the source as written, so an effect that hides its work in a
 * helper reads cheaper than it is. That is a known floor, not a claim of accuracy.
 */
export function estimateEffectCost(effect: { glsl?: string; passes?: { glsl: string }[] }): EffectCost {
  const bodies = effect.passes?.length ? effect.passes.map((p) => p.glsl) : [effect.glsl || ''];
  let score = 0, samples = 0, transcendentals = 0, maxLoopWeight = 1;
  for (const body of bodies) {
    const c = estimateShaderCost(body);
    score += c.score; samples += c.samples; transcendentals += c.transcendentals;
    maxLoopWeight = Math.max(maxLoopWeight, c.maxLoopWeight);
  }
  return { score, samples, transcendentals, maxLoopWeight, tier: tierFor(score) };
}

export const TIER_LABEL: Record<CostTier, string> = { light: '', moderate: 'HEAVY', heavy: 'VERY HEAVY' };

export const TIER_HINT: Record<CostTier, string> = {
  light: '',
  moderate: 'Costs noticeably more than a typical effect. Fine on its own; watch the preview if you stack several.',
  heavy: 'One of the most expensive effects here. Expect the preview to slow at full resolution, especially stacked.',
};
