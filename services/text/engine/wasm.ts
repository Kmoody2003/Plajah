// wasm — the TypeScript host for rust/plajah-text (the platform text engine).
//
// The engine is a bare wasm32 cdylib with a flat C ABI (no wasm-bindgen), like plajah-audio.
// Requests and replies are little-endian 32-bit word buffers: integers as u32/i32, reals as
// f32 bit patterns, UTF-16 text packed two code units per word. Every layout below mirrors the
// doc comment on the matching `pt_*` function in rust/plajah-text/src/lib.rs — change both or
// bump TEXT_ABI_VERSION on both sides.
//
// Loading works in the browser (Vite turns `new URL('./plajah_text.wasm', import.meta.url)`
// into a fingerprinted asset) and in node (the same URL is a file: URL we read from disk), so
// tests, proof scripts and puppeteer pages all run the exact same engine.

export const TEXT_ABI_VERSION = 1;

interface Exports {
  memory: WebAssembly.Memory;
  pt_abi_version(): number;
  pt_create(): number;
  pt_destroy(p: number): void;
  pt_input(p: number, words: number): number;
  pt_bytes(p: number, n: number): number;
  pt_output_ptr(p: number): number;
  pt_output_len(p: number): number;
  pt_font_load(p: number): number;
  pt_font_unload(p: number, blob: number): void;
  pt_font_info(p: number, blob: number, index: number): number;
  pt_instance_create(p: number, blob: number, index: number): number;
  pt_instance_destroy(p: number, inst: number): void;
  pt_instance_metrics(p: number, inst: number): number;
  pt_glyph_index(p: number, inst: number, cp: number): number;
  pt_outlines(p: number, inst: number): number;
  pt_shape(p: number): number;
  pt_breaks(p: number): number;
  pt_hyph_load(p: number, lang: number, left: number, right: number): number;
  pt_hyphenate(p: number, lang: number, left: number, right: number): number;
  pt_layout(p: number): number;
}

// ── Word codec ──────────────────────────────────────────────────────────────────────────────

export class WordWriter {
  private buf = new ArrayBuffer(1024);
  private view = new DataView(this.buf);
  length = 0;
  private grow(words: number) {
    if ((this.length + words) * 4 <= this.buf.byteLength) return;
    let cap = this.buf.byteLength * 2;
    while (cap < (this.length + words) * 4) cap *= 2;
    const nb = new ArrayBuffer(cap);
    new Uint8Array(nb).set(new Uint8Array(this.buf, 0, this.length * 4));
    this.buf = nb;
    this.view = new DataView(nb);
  }
  u32(v: number) { this.grow(1); this.view.setUint32(this.length * 4, v >>> 0, true); this.length++; return this; }
  i32(v: number) { this.grow(1); this.view.setInt32(this.length * 4, v | 0, true); this.length++; return this; }
  f32(v: number) { this.grow(1); this.view.setFloat32(this.length * 4, v, true); this.length++; return this; }
  bool(v: boolean | undefined) { return this.u32(v ? 1 : 0); }
  /** Raw UTF-16 code units, packed. */
  utf16(s: string) {
    const words = (s.length + 1) >> 1;
    this.grow(words);
    const base = this.length * 4;
    for (let i = 0; i < s.length; i++) this.view.setUint16(base + i * 2, s.charCodeAt(i), true);
    if (s.length & 1) this.view.setUint16(base + s.length * 2, 0, true);
    this.length += words;
    return this;
  }
  /** Length-prefixed UTF-16 string. */
  string(s: string) { this.u32(s.length); return this.utf16(s); }
  words(): Uint32Array { return new Uint32Array(this.buf, 0, this.length); }
}

export class WordReader {
  private view: DataView;
  i = 0;
  constructor(private words: Uint32Array) { this.view = new DataView(words.buffer, words.byteOffset, words.byteLength); }
  u32() { return this.view.getUint32(this.i++ * 4, true); }
  i32() { return this.view.getInt32(this.i++ * 4, true); }
  f32() { return this.view.getFloat32(this.i++ * 4, true); }
  string() {
    const n = this.u32();
    let s = '';
    const base = this.i * 4;
    for (let k = 0; k < n; k++) s += String.fromCharCode(this.view.getUint16(base + k * 2, true));
    this.i += (n + 1) >> 1;
    return s;
  }
  get done() { return this.i >= this.words.length; }
}

export function tagToU32(tag: string): number {
  const t = (tag + '    ').slice(0, 4);
  return ((t.charCodeAt(0) << 24) | (t.charCodeAt(1) << 16) | (t.charCodeAt(2) << 8) | t.charCodeAt(3)) >>> 0;
}
export function u32ToTag(v: number): string {
  return String.fromCharCode((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
}

// ── Public shapes ───────────────────────────────────────────────────────────────────────────

export interface FontMetrics {
  upem: number; ascender: number; descender: number; lineGap: number; capHeight: number; xHeight: number;
  underlinePos: number; underlineThickness: number; strikePos: number; strikeThickness: number; italicAngle: number; glyphCount: number;
}
export interface FontAxis { tag: string; min: number; default: number; max: number; hidden: boolean; name: string }
export interface FontInfo {
  faces: number; family: string; subfamily: string; postscriptName: string; metrics: FontMetrics;
  weight: number; width: number; italic: boolean; monospace: boolean; variable: boolean;
  axes: FontAxis[]; namedInstances: { name: string; coords: Record<string, number> }[];
  gsub: string[]; gpos: string[];
}
export interface InstanceMetrics extends FontMetrics { gsub: string[]; gpos: string[] }

export type PathOp = { op: 'M' | 'L'; x: number; y: number } | { op: 'Q'; x1: number; y1: number; x: number; y: number } | { op: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number } | { op: 'Z' };
export interface GlyphOutline { gid: number; bbox: [number, number, number, number]; advance: number; ops: PathOp[] }

/** Run flags (mirror shape.rs R_*). */
export const RUN = { SMALLCAPS: 1, ALLSMALLCAPS: 2, UPPER: 4, LOWER: 8, SUPER: 16, SUB: 32, NOBREAK: 64, NOHYPH: 128, OBJECT: 256 } as const;
/** Glyph flags (mirror shape.rs G_*). */
export const GLYPH = { UNSAFE: 1, NOTDEF: 2, HYPHEN: 4, OBJECT: 8, SPACE: 16, LEADER: 32, TAB: 64, SYNTH: 128 } as const;
/** Line flags (mirror para.rs L_*). */
export const LINE = { HYPHENATED: 1, FORCED: 2, LAST: 4, JUSTIFIED: 8, OVERFULL: 16 } as const;
export const ALIGN = { start: 0, end: 1, center: 2, justify: 3, 'justify-all': 4, 'justify-center': 5, 'justify-end': 6, left: 7, right: 8 } as const;
export type EngineAlign = keyof typeof ALIGN;

export interface RunSpec {
  start: number; end: number;
  /** Fallback chain of instance ids; the first is primary. */
  fonts: number[];
  size: number;
  /** Extra advance after every cluster, px. */
  tracking?: number;
  /** Baseline shift, px, up-positive. */
  shift?: number;
  flags?: number;
  hyph?: number;
  lang?: string;
  features?: [string, number][];
  object?: { width: number; ascent: number; descent: number };
}

export interface TabSpec { pos: number; kind: 'left' | 'right' | 'center' | 'decimal'; leader?: string; alignChar?: string }

export interface ParaSpec {
  align?: EngineAlign;
  dir?: 'auto' | 'ltr' | 'rtl';
  /** Word spacing min/desired/max as fractions of the font's space. */
  word?: [number, number, number];
  /** Letter spacing min/desired/max in em. */
  letter?: [number, number, number];
  /** Glyph scaling min/desired/max (1 = 100%). */
  glyph?: [number, number, number];
  pretolerance?: number; tolerance?: number; linePenalty?: number;
  doubleHyphenDemerits?: number; finalHyphenDemerits?: number; adjDemerits?: number;
  looseness?: number; emergencyStretch?: number; maxHyphens?: number;
  /** Ragged-edge stretch per line, px (0 = engine default: a quarter of the measure). */
  rag?: number;
  /** Ragged text: no hyphen when breaking before the word leaves less than this (px). */
  hyphZone?: number;
  /** Minimum last-line length, fraction of the measure. */
  lastMin?: number;
  hyphenPenalty?: number; explicitHyphenPenalty?: number;
  hyphMinWord?: number; hyphBefore?: number; hyphAfter?: number; hyphCaps?: boolean;
  /** Optical margin alignment strength (0 off, 1 = full protrusion table). */
  oma?: number;
  /** 'total-fit' (Knuth–Plass) or 'first-fit'. */
  composer?: 'total-fit' | 'first-fit';
  singleWord?: 'start' | 'full' | 'center' | 'end';
  defaultTab?: number;
  tabs?: TabSpec[];
  /** Measure of each line; the last repeats. */
  widths: number[];
}

export interface ShapedGlyph { gid: number; cluster: number; font: number; xAdvance: number; yAdvance: number; xOffset: number; yOffset: number; flags: number }

export interface EngineGlyph { gid: number; cluster: number; x: number; y: number; advance: number; flags: number }
export interface EngineRun { font: number; size: number; level: number; style: number; x: number; width: number; shift: number; scaleX: number; flags: number; glyphs: EngineGlyph[] }
export interface EngineSpan { start: number; end: number; x0: number; x1: number; rtl: boolean }
export interface EngineLine {
  start: number; end: number; contentEnd: number; flags: number;
  x: number; width: number; natural: number; ascent: number; descent: number; lineGap: number; maxSize: number;
  ratio: number; glyphScale: number; wordExtra: number; letterExtra: number;
  runs: EngineRun[]; spans: EngineSpan[];
}
export interface EngineParagraph { lines: EngineLine[]; paraLevel: number; algo: 'total-fit' | 'total-fit+hyphenation' | 'total-fit+emergency' | 'first-fit'; demerits: number; badness: number; missing: [number, number][] }

const ALGOS = ['total-fit', 'total-fit+hyphenation', 'total-fit+emergency', 'first-fit'] as const;

function readMetrics(r: WordReader): FontMetrics {
  return {
    upem: r.f32(), ascender: r.f32(), descender: r.f32(), lineGap: r.f32(), capHeight: r.f32(), xHeight: r.f32(),
    underlinePos: r.f32(), underlineThickness: r.f32(), strikePos: r.f32(), strikeThickness: r.f32(), italicAngle: r.f32(), glyphCount: r.f32(),
  };
}

// ── Engine ──────────────────────────────────────────────────────────────────────────────────

export class TextEngine {
  private metricsCache = new Map<number, InstanceMetrics>();
  private constructor(private ex: Exports, private p: number) {}

  static async create(bytes?: BufferSource): Promise<TextEngine> {
    const mod = await compileModule(bytes);
    const instance = await WebAssembly.instantiate(mod, {});
    const ex = instance.exports as unknown as Exports;
    const v = ex.pt_abi_version();
    if (v !== TEXT_ABI_VERSION) throw new Error(`plajah_text.wasm ABI ${v} ≠ host ${TEXT_ABI_VERSION} — run npm run text:build`);
    return new TextEngine(ex, ex.pt_create());
  }

  private send(w: WordWriter) {
    const words = w.words();
    const ptr = this.ex.pt_input(this.p, words.length);
    new Uint32Array(this.ex.memory.buffer, ptr, words.length).set(words);
  }
  private reply(): WordReader {
    const ptr = this.ex.pt_output_ptr(this.p);
    const len = this.ex.pt_output_len(this.p);
    return new WordReader(new Uint32Array(this.ex.memory.buffer.slice(ptr, ptr + len * 4)));
  }

  /** Registers font file bytes (TTF/OTF/TTC). Returns the blob id. */
  loadFont(bytes: Uint8Array): number {
    const ptr = this.ex.pt_bytes(this.p, bytes.length);
    new Uint8Array(this.ex.memory.buffer, ptr, bytes.length).set(bytes);
    const id = this.ex.pt_font_load(this.p);
    if (id < 0) throw new Error('text engine: bytes are not a TrueType/OpenType font');
    return id;
  }
  unloadFont(blob: number) { this.ex.pt_font_unload(this.p, blob); }

  fontInfo(blob: number, index = 0): FontInfo {
    if (this.ex.pt_font_info(this.p, blob, index) < 0) throw new Error(`text engine: no face ${index} in blob ${blob}`);
    const r = this.reply();
    const faces = r.u32();
    const family = r.string(), subfamily = r.string(), postscriptName = r.string();
    const metrics = readMetrics(r);
    const weight = r.u32(), width = r.u32(), flags = r.u32();
    const axes: FontAxis[] = [];
    for (let n = r.u32(), k = 0; k < n; k++) axes.push({ tag: u32ToTag(r.u32()), min: r.f32(), default: r.f32(), max: r.f32(), hidden: !!r.u32(), name: r.string() });
    const namedInstances: FontInfo['namedInstances'] = [];
    for (let n = r.u32(), k = 0; k < n; k++) {
      const name = r.string();
      const coords: Record<string, number> = {};
      for (let c = r.u32(), j = 0; j < c; j++) { const v = r.f32(); if (axes[j]) coords[axes[j].tag] = v; }
      namedInstances.push({ name, coords });
    }
    const gsub: string[] = []; for (let n = r.u32(), k = 0; k < n; k++) gsub.push(u32ToTag(r.u32()));
    const gpos: string[] = []; for (let n = r.u32(), k = 0; k < n; k++) gpos.push(u32ToTag(r.u32()));
    return { faces, family, subfamily, postscriptName, metrics, weight, width, italic: !!(flags & 1), monospace: !!(flags & 2), variable: !!(flags & 4), axes, namedInstances, gsub, gpos };
  }

  /** A face of a blob at fixed axis coordinates ({ wght: 650, opsz: 14 }). */
  createInstance(blob: number, index = 0, axes: Record<string, number> = {}): number {
    const w = new WordWriter();
    const entries = Object.entries(axes).filter(([, v]) => Number.isFinite(v));
    w.u32(entries.length);
    for (const [t, v] of entries) w.u32(tagToU32(t)).f32(v);
    this.send(w);
    const id = this.ex.pt_instance_create(this.p, blob, index);
    if (id < 0) throw new Error('text engine: could not create font instance');
    this.metricsCache.delete(id);
    return id;
  }
  destroyInstance(inst: number) { this.ex.pt_instance_destroy(this.p, inst); this.metricsCache.delete(inst); }

  metrics(inst: number): InstanceMetrics {
    const hit = this.metricsCache.get(inst);
    if (hit) return hit;
    if (this.ex.pt_instance_metrics(this.p, inst) < 0) throw new Error(`text engine: no instance ${inst}`);
    const r = this.reply();
    const m = readMetrics(r);
    const gsub: string[] = []; for (let n = r.u32(), k = 0; k < n; k++) gsub.push(u32ToTag(r.u32()));
    const gpos: string[] = []; for (let n = r.u32(), k = 0; k < n; k++) gpos.push(u32ToTag(r.u32()));
    const out = { ...m, gsub, gpos };
    this.metricsCache.set(inst, out);
    return out;
  }

  glyphIndex(inst: number, codePoint: number): number { return this.ex.pt_glyph_index(this.p, inst, codePoint); }

  /** True when every code point of `text` has a glyph in `inst` (controls/space ignored). */
  covers(inst: number, text: string): boolean {
    for (const ch of text) {
      const cp = ch.codePointAt(0)!;
      if (cp < 0x21 || (cp >= 0x200B && cp <= 0x200F) || cp === 0xFEFF || cp === 0xAD || cp === 0xFFFC) continue;
      if (!this.glyphIndex(inst, cp)) return false;
    }
    return true;
  }

  outlines(inst: number, gids: number[]): GlyphOutline[] {
    const w = new WordWriter();
    w.u32(gids.length);
    for (const g of gids) w.u32(g);
    this.send(w);
    if (this.ex.pt_outlines(this.p, inst) < 0) throw new Error(`text engine: no instance ${inst}`);
    const r = this.reply();
    const out: GlyphOutline[] = [];
    for (let n = r.u32(), k = 0; k < n; k++) {
      const gid = r.u32(); const count = r.u32();
      const bbox: [number, number, number, number] = [r.f32(), r.f32(), r.f32(), r.f32()];
      const advance = r.f32();
      const ops: PathOp[] = [];
      for (let j = 0; j < count; j++) {
        const op = r.u32();
        if (op === 0) ops.push({ op: 'M', x: r.f32(), y: r.f32() });
        else if (op === 1) ops.push({ op: 'L', x: r.f32(), y: r.f32() });
        else if (op === 2) ops.push({ op: 'Q', x1: r.f32(), y1: r.f32(), x: r.f32(), y: r.f32() });
        else if (op === 3) ops.push({ op: 'C', x1: r.f32(), y1: r.f32(), x2: r.f32(), y2: r.f32(), x: r.f32(), y: r.f32() });
        else ops.push({ op: 'Z' });
      }
      out.push({ gid, bbox, advance, ops });
    }
    return out;
  }

  private writeRun(w: WordWriter, r: RunSpec) {
    w.u32(r.start).u32(r.end).f32(r.size).f32(r.tracking ?? 0).f32(r.shift ?? 0).u32(r.flags ?? 0);
    w.u32(r.fonts.length);
    for (const f of r.fonts) w.u32(f);
    w.u32(r.hyph ?? 0xFFFFFFFF);
    w.string(r.lang ?? '');
    const feats = r.features ?? [];
    w.u32(feats.length);
    for (const [t, v] of feats) w.u32(tagToU32(t)).u32(v);
    w.f32(r.object?.width ?? 0).f32(r.object?.ascent ?? 0).f32(r.object?.descent ?? 0);
  }

  /** Raw shaping of one run; glyphs in VISUAL order, px. */
  shape(text: string, run: Omit<RunSpec, 'start' | 'end'>, dir: 'auto' | 'ltr' | 'rtl' = 'auto', script = ''): ShapedGlyph[] {
    const w = new WordWriter();
    w.u32(text.length).utf16(text);
    this.writeRun(w, { ...run, start: 0, end: text.length });
    w.u32(dir === 'ltr' ? 1 : dir === 'rtl' ? 2 : 0).u32(script ? tagToU32(script) : 0);
    this.send(w);
    this.ex.pt_shape(this.p);
    const r = this.reply();
    const out: ShapedGlyph[] = [];
    for (let n = r.u32(), k = 0; k < n; k++) out.push({ gid: r.u32(), cluster: r.u32(), font: r.u32(), xAdvance: r.f32(), yAdvance: r.f32(), xOffset: r.f32(), yOffset: r.f32(), flags: r.u32() });
    return out;
  }

  /** UAX #14 break opportunities before each offset. */
  breaks(text: string): { offset: number; mandatory: boolean }[] {
    const w = new WordWriter();
    w.u32(text.length).utf16(text);
    this.send(w);
    this.ex.pt_breaks(this.p);
    const r = this.reply();
    const out: { offset: number; mandatory: boolean }[] = [];
    for (let n = r.u32(), k = 0; k < n; k++) out.push({ offset: r.u32(), mandatory: r.u32() === 2 });
    return out;
  }

  loadHyphenation(lang: number, patterns: string, exceptions = '', left = 2, right = 3): number {
    const w = new WordWriter();
    w.string(patterns).string(exceptions);
    this.send(w);
    return this.ex.pt_hyph_load(this.p, lang, left, right);
  }

  /** UTF-16 offsets inside `word` where a hyphen may go. */
  hyphenate(lang: number, word: string, left = 0, right = 0): number[] {
    const w = new WordWriter();
    w.string(word);
    this.send(w);
    if (this.ex.pt_hyphenate(this.p, lang, left, right) < 0) return [];
    const r = this.reply();
    const out: number[] = [];
    for (let n = r.u32(), k = 0; k < n; k++) out.push(r.u32());
    return out;
  }

  /** Compose one paragraph: shaping, breaking, justification, bidi, caret spans. */
  layoutParagraph(text: string, runs: RunSpec[], spec: ParaSpec): EngineParagraph {
    const w = new WordWriter();
    w.u32(text.length).utf16(text);
    w.u32(runs.length);
    for (const r of runs) this.writeRun(w, r);
    const s = spec;
    w.u32(ALIGN[s.align ?? 'justify']).u32(s.dir === 'ltr' ? 1 : s.dir === 'rtl' ? 2 : 0);
    for (const v of s.word ?? [0.8, 1, 1.33]) w.f32(v);
    for (const v of s.letter ?? [0, 0, 0]) w.f32(v);
    for (const v of s.glyph ?? [1, 1, 1]) w.f32(v);
    w.f32(s.pretolerance ?? 100).f32(s.tolerance ?? 200).f32(s.linePenalty ?? 10)
      .f32(s.doubleHyphenDemerits ?? 10000).f32(s.finalHyphenDemerits ?? 5000).f32(s.adjDemerits ?? 10000)
      .i32(s.looseness ?? 0).f32(s.emergencyStretch ?? 0).u32(s.maxHyphens ?? 3).f32(s.rag ?? 0).f32(s.lastMin ?? 0).f32(s.hyphZone ?? 0)
      .f32(s.hyphenPenalty ?? 50).f32(s.explicitHyphenPenalty ?? 50)
      .u32(s.hyphMinWord ?? 6).u32(s.hyphBefore ?? 2).u32(s.hyphAfter ?? 3).bool(s.hyphCaps ?? true)
      .f32(s.oma ?? 0).u32(s.composer === 'first-fit' ? 1 : 0)
      .u32({ start: 0, full: 1, center: 2, end: 3 }[s.singleWord ?? 'start']).f32(s.defaultTab ?? 36);
    const tabs = s.tabs ?? [];
    w.u32(tabs.length);
    for (const t of tabs) w.f32(t.pos).u32({ left: 0, right: 1, center: 2, decimal: 3 }[t.kind]).u32(t.leader ? t.leader.codePointAt(0)! : 0).u32((t.alignChar ?? '.').codePointAt(0)!);
    w.u32(s.widths.length);
    for (const x of s.widths) w.f32(x);
    this.send(w);
    this.ex.pt_layout(this.p);
    const r = this.reply();
    const lineCount = r.u32(), paraLevel = r.u32(), algo = r.u32(), demerits = r.f32(), badness = r.f32();
    const missing: [number, number][] = [];
    for (let n = r.u32(), k = 0; k < n; k++) missing.push([r.u32(), r.u32()]);
    const lines: EngineLine[] = [];
    for (let l = 0; l < lineCount; l++) {
      const line: EngineLine = {
        start: r.u32(), end: r.u32(), contentEnd: r.u32(), flags: r.u32(),
        x: r.f32(), width: r.f32(), natural: r.f32(), ascent: r.f32(), descent: r.f32(), lineGap: r.f32(), maxSize: r.f32(),
        ratio: r.f32(), glyphScale: r.f32(), wordExtra: r.f32(), letterExtra: r.f32(), runs: [], spans: [],
      };
      for (let n = r.u32(), k = 0; k < n; k++) {
        const run: EngineRun = { font: r.u32(), size: r.f32(), level: r.u32(), style: r.u32(), x: r.f32(), width: r.f32(), shift: r.f32(), scaleX: r.f32(), flags: r.u32(), glyphs: [] };
        for (let g = r.u32(), j = 0; j < g; j++) run.glyphs.push({ gid: r.u32(), cluster: r.u32(), x: r.f32(), y: r.f32(), advance: r.f32(), flags: r.u32() });
        line.runs.push(run);
      }
      for (let n = r.u32(), k = 0; k < n; k++) line.spans.push({ start: r.u32(), end: r.u32(), x0: r.f32(), x1: r.f32(), rtl: !!r.u32() });
      lines.push(line);
    }
    return { lines, paraLevel, algo: ALGOS[algo] ?? 'total-fit', demerits, badness, missing };
  }

  dispose() { this.ex.pt_destroy(this.p); }
}

// ── Module loading (browser + node) ─────────────────────────────────────────────────────────

let modulePromise: Promise<WebAssembly.Module> | null = null;
async function compileModule(bytes?: BufferSource): Promise<WebAssembly.Module> {
  if (bytes) return WebAssembly.compile(bytes);
  if (!modulePromise) {
    modulePromise = (async () => {
      const url = new URL('./plajah_text.wasm', import.meta.url);
      if (url.protocol === 'file:') {
        const spec = 'node:fs/promises';
        const fs = await import(/* @vite-ignore */ spec) as typeof import('node:fs/promises');
        return WebAssembly.compile(await fs.readFile(url));
      }
      const res = await fetch(url);
      if (!res.ok) throw new Error(`plajah_text.wasm: HTTP ${res.status}`);
      return WebAssembly.compile(await res.arrayBuffer());
    })();
    modulePromise.catch(() => { modulePromise = null; });
  }
  return modulePromise;
}

let shared: Promise<TextEngine> | null = null;
let sharedSync: TextEngine | null = null;
/** The process-wide engine (fonts and hyphenation are registered once and shared). */
export function getTextEngine(): Promise<TextEngine> {
  if (!shared) {
    shared = TextEngine.create().then(e => (sharedSync = e));
    shared.catch(() => { shared = null; });
  }
  return shared;
}
/** The shared engine if it has finished loading (layout is synchronous once fonts are in). */
export function textEngineSync(): TextEngine | null { return sharedSync; }
