// paragraph — model paragraph → engine request, plus a content-addressed composition cache.
//
// `prepareParagraph` resolves styles, fonts (with per-script fallback chains), OpenType
// features, hyphenation and justification settings into the engine's RunSpec/ParaSpec.
// `composeParagraph` calls the engine for a given list of line measures and memoises the result
// by (prepared content hash, measures) — so an edit relayouts only the paragraphs whose text,
// style or geometry actually changed; everything else is a cache hit.

import { ALIGN, RUN, TextEngine, type EngineParagraph, type EngineAlign, type ParaSpec, type RunSpec } from '../engine/wasm';
import type { FontRegistry, FontRequest } from '../fonts/registry';
import { hyphenationReady } from '../hyphenation';
import { type CharAttrs, type Leading, type Paragraph, type ResolvedChar, type ResolvedPara, type StyleSheet, paragraphText, resolveParagraph, resolveRun } from '../model';

export interface LayoutEnv {
  engine: TextEngine;
  fonts: FontRegistry;
  sheet: StyleSheet;
  /** Family used when a requested family is not loaded. */
  fallbackFamily?: string;
}

export interface NominalMetrics { size: number; ascent: number; descent: number; capHeight: number; xHeight: number; leading: number }

export interface DropCapPrep { text: string; run: RunSpec; attrs: ResolvedChar; width: number; size: number; lines: number; chars: number; gap: number; ascentAboveCap: number }

export interface PreparedParagraph {
  id: string;
  /** Text handed to the engine (drop-cap characters removed). */
  text: string;
  /** Code units removed from the front (drop cap). Engine offsets + offset = paragraph offsets. */
  offset: number;
  runs: RunSpec[];
  /** Resolved character attrs per run index (engine run.style). */
  styles: ResolvedChar[];
  para: ResolvedPara;
  char: ResolvedChar;
  spec: Omit<ParaSpec, 'widths'>;
  nominal: NominalMetrics;
  dropCap?: DropCapPrep;
  key: string;
}

export function fontRequest(c: CharAttrs | ResolvedChar): FontRequest {
  return { family: c.fontFamily ?? 'Inter', weight: c.fontWeight, style: c.fontStyle, stretch: c.fontStretch, axes: c.axes, opticalSize: c.opticalSize };
}

const SERIF = /serif|garamond|baskerville|bodoni|lora|crimson|playfair|merriweather|cormorant|spectral|cardo|fraunces|alegreya|gloock|marcellus|cinzel|yeseva|abril|zilla|bitter|slab|tiro|martel|amiri|shippori|mincho/i;

export function resolveInstance(env: LayoutEnv, c: CharAttrs | ResolvedChar, size: number): number {
  const req = fontRequest(c);
  let inst = env.fonts.resolve(req, size);
  if (inst === null && env.fallbackFamily) inst = env.fonts.resolve({ ...req, family: env.fallbackFamily }, size);
  if (inst === null && env.fonts.faces[0]) inst = env.fonts.resolve({ ...req, family: env.fonts.faces[0].family }, size);
  if (inst === null) throw new Error(`text layout: no font loaded for "${req.family}" — await fonts.ensure() first`);
  return inst;
}

function features(c: ResolvedChar): [string, number][] {
  const f = new Map<string, number>();
  if (c.kerning === 'none') f.set('kern', 0);
  switch (c.ligatures) {
    case 'none': f.set('liga', 0); f.set('clig', 0); break;
    case 'discretionary': f.set('dlig', 1); break;
    case 'historical': f.set('dlig', 1); f.set('hlig', 1); break;
  }
  switch (c.numerals) {
    case 'lining': f.set('lnum', 1); break;
    case 'oldstyle': f.set('onum', 1); break;
    case 'tabular-lining': f.set('lnum', 1); f.set('tnum', 1); break;
    case 'tabular-oldstyle': f.set('onum', 1); f.set('tnum', 1); break;
    case 'proportional-lining': f.set('lnum', 1); f.set('pnum', 1); break;
    case 'proportional-oldstyle': f.set('onum', 1); f.set('pnum', 1); break;
  }
  if (c.position === 'superior') f.set('sups', 1);
  if (c.position === 'inferior') f.set('subs', 1);
  if (c.position === 'ordinal') f.set('ordn', 1);
  for (const [t, v] of Object.entries(c.features ?? {})) f.set(t, v === true ? 1 : v === false ? 0 : v);
  return [...f];
}

function runFlags(c: ResolvedChar, hyphenate: boolean): number {
  let f = 0;
  if (c.caps === 'small-caps') f |= RUN.SMALLCAPS;
  if (c.caps === 'all-small-caps') f |= RUN.ALLSMALLCAPS;
  if (c.caps === 'all-caps') f |= RUN.UPPER;
  if (c.caps === 'lowercase') f |= RUN.LOWER;
  if (c.position === 'super') f |= RUN.SUPER;
  if (c.position === 'sub') f |= RUN.SUB;
  if (c.noBreak) f |= RUN.NOBREAK;
  if (!hyphenate || c.hyphenate === false) f |= RUN.NOHYPH;
  if (c.object) f |= RUN.OBJECT;
  return f;
}

export function lineLeading(lead: Leading, autoPct: number, size: number): number {
  switch (lead.kind) {
    case 'fixed': return lead.value;
    case 'multiple': return lead.value * size;
    default: return (lead.factor ?? autoPct / 100) * size;
  }
}

export function runSpecFor(env: LayoutEnv, c: ResolvedChar, start: number, end: number, text: string, para: ResolvedPara): RunSpec {
  const size = c.fontSize;
  const primary = resolveInstance(env, c, size);
  const fallbacks = env.fonts.fallbackChain(text.slice(start, end), fontRequest(c), size, SERIF.test(c.fontFamily));
  const hyphenate = para.hyphenation.enabled !== false;
  return {
    start, end,
    fonts: [primary, ...fallbacks.filter(f => f !== primary)],
    size,
    tracking: (c.tracking ?? 0) / 1000 * size,
    shift: c.baselineShift ?? 0,
    flags: runFlags(c, hyphenate),
    hyph: hyphenate && c.hyphenate !== false ? hyphenationReady(env.engine, c.language) : undefined,
    lang: c.language,
    features: features(c),
    object: c.object ? { width: c.object.width, ascent: c.object.ascent, descent: c.object.descent } : undefined,
  };
}

/** FNV-1a over a string → base36 (53-bit safe). */
export function hashString(s: string): string {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619);
    h2 = Math.imul(h2 ^ c, 2246822519);
  }
  return ((h1 >>> 0).toString(36) + (h2 >>> 0).toString(36));
}

const prepCache = new WeakMap<Paragraph, { sheet: StyleSheet; engine: TextEngine; gen: number; prep: PreparedParagraph }>();

/** Resolve a model paragraph into an engine request (memoised per immutable paragraph object). */
export function prepareParagraph(env: LayoutEnv, p: Paragraph): PreparedParagraph {
  const hit = prepCache.get(p);
  if (hit && hit.sheet === env.sheet && hit.engine === env.engine && hit.gen === env.fonts.generation) return hit.prep;
  const prep = prepareParagraphUncached(env, p);
  prepCache.set(p, { sheet: env.sheet, engine: env.engine, gen: env.fonts.generation, prep });
  return prep;
}

function prepareParagraphUncached(env: LayoutEnv, p: Paragraph): PreparedParagraph {
  const { para, char } = resolveParagraph(env.sheet, p);
  const full = paragraphText(p);
  // Drop cap: first N graphemes come out of the flowing text.
  let offset = 0;
  let dropCap: DropCapPrep | undefined;
  const dc = para.dropCap;
  if (dc && dc.lines >= 2 && full.length) {
    const seg = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(full)].slice(0, dc.chars ?? 1) : [{ segment: full[0] }];
    offset = (seg as { segment: string }[]).reduce((n: number, s) => n + s.segment.length, 0);
  }
  const text = full.slice(offset);
  const runs: RunSpec[] = [];
  const styles: ResolvedChar[] = [];
  let pos = 0;
  let maxSize = 0;
  for (const r of p.runs) {
    const s = pos, e = pos + r.text.length;
    pos = e;
    const a = Math.max(s, offset) - offset, b = e - offset;
    const c = resolveRun(env.sheet, char, r);
    if (b <= a && !(text.length === 0 && runs.length === 0)) continue;
    styles.push(c);
    runs.push(runSpecFor(env, c, a, Math.max(a, b), text, para));
    maxSize = Math.max(maxSize, c.fontSize);
  }
  if (!runs.length) { styles.push(char); runs.push(runSpecFor(env, char, 0, 0, text, para)); maxSize = char.fontSize; }
  const j = para.justification;
  const firstRun = runs[0];
  const m = env.engine.metrics(firstRun.fonts[0]);
  const sc = styles[0].fontSize / m.upem;
  const leading = lineLeading(para.leading, j.autoLeading, maxSize);
  const nominal: NominalMetrics = { size: maxSize, ascent: m.ascender * sc, descent: -m.descender * sc, capHeight: m.capHeight * sc, xHeight: m.xHeight * sc, leading };
  if (dc && offset) {
    const dcAttrs = resolveRun(env.sheet, char, { text: '', attrs: { ...(p.runs[0]?.attrs ?? {}), ...(dc.style ?? {}) }, styleId: p.runs[0]?.styleId });
    const probeInst = resolveInstance(env, dcAttrs, 100);
    const pm = env.engine.metrics(probeInst);
    // Cap height of the drop cap spans (lines-1) leadings + the body cap height.
    const target = (dc.lines - 1) * leading + nominal.capHeight;
    const size = target / (pm.capHeight / pm.upem);
    const dcText = full.slice(0, offset);
    const run = runSpecFor(env, { ...dcAttrs, fontSize: size }, 0, dcText.length, dcText, para);
    const shaped = env.engine.shape(dcText, run);
    const width = shaped.reduce((w, g) => w + g.xAdvance, 0);
    dropCap = { text: dcText, run, attrs: { ...dcAttrs, fontSize: size }, width, size, lines: dc.lines, chars: dc.chars ?? 1, gap: dc.gap ?? nominal.size * 0.25, ascentAboveCap: 0 };
  }
  const align = (para.align in ALIGN ? para.align : 'start') as EngineAlign;
  const oma = j.opticalMargin === true ? 1 : typeof j.opticalMargin === 'number' ? j.opticalMargin : 0;
  const spec: Omit<ParaSpec, 'widths'> = {
    align,
    dir: para.direction,
    word: [j.wordSpacing[0] / 100, j.wordSpacing[1] / 100, j.wordSpacing[2] / 100],
    letter: [j.letterSpacing[0] / 100, j.letterSpacing[1] / 100, j.letterSpacing[2] / 100],
    glyph: [j.glyphScaling[0] / 100, j.glyphScaling[1] / 100, j.glyphScaling[2] / 100],
    pretolerance: -1,
    tolerance: j.tolerance,
    looseness: j.looseness,
    emergencyStretch: j.emergencyStretch * nominal.size,
    maxHyphens: para.hyphenation.limit,
    hyphenPenalty: para.hyphenation.penalty,
    hyphZone: para.hyphenation.zone ?? 0,
    hyphMinWord: para.hyphenation.minWord,
    hyphBefore: para.hyphenation.before,
    hyphAfter: para.hyphenation.after,
    hyphCaps: para.hyphenation.capitalized,
    oma,
    composer: j.composer === 'single-line' ? 'first-fit' : 'total-fit',
    singleWord: j.singleWord,
    lastMin: j.minLastLine / 100,
    defaultTab: para.defaultTab,
    tabs: para.tabs.map(t => ({ pos: t.position, kind: t.align ?? 'left', leader: t.leader, alignChar: t.alignChar })),
  };
  const key = hashString(JSON.stringify([text, runs, spec]));
  return { id: p.id, text, offset, runs, styles, para, char, spec, nominal, dropCap, key };
}

// Per engine: instance ids are engine-local, so a cache must never be shared across engines.
const caches = new WeakMap<TextEngine, Map<string, EngineParagraph>>();
let hits = 0, misses = 0;
const CACHE_MAX = 8000;

export function composeParagraph(env: LayoutEnv, prep: PreparedParagraph, widths: number[]): EngineParagraph {
  let cache = caches.get(env.engine);
  if (!cache) caches.set(env.engine, (cache = new Map()));
  const k = prep.key + '|' + widths.map(w => w.toFixed(2)).join(',');
  const hit = cache.get(k);
  if (hit) { hits++; cache.delete(k); cache.set(k, hit); return hit; }
  misses++;
  const out = env.engine.layoutParagraph(prep.text, prep.runs, { ...prep.spec, widths });
  cache.set(k, out);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
  return out;
}

export function compositionCacheStats() { return { hits, misses }; }
export function clearCompositionCache(engine?: TextEngine) { if (engine) caches.delete(engine); hits = misses = 0; }
export function compositionCacheSize(engine: TextEngine) { return caches.get(engine)?.size ?? 0; }
