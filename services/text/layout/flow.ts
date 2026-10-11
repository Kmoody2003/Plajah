// flow — lay a story out through a CHAIN of threaded frames.
//
// Frames contribute column slots (insets, columns, gutters). For every paragraph the flow builds
// the line geometry it would get from the current position — one measure per line, honouring
// indents, drop-cap indents, baseline grid, first-baseline rules and text wrap around exclusions
// (a wrap with room on both sides yields TWO measures on the same baseline, read left then
// right) — and hands the measures to the engine's total-fit breaker. The paragraph is then placed
// line by line; widow/orphan control, keep-together and keep-with-next re-run placement with a
// forced column jump. Vertical alignment is applied per column at the end.
//
// Output is absolute (page px): glyph runs ready for SVG/Canvas/PDF, decorations, list markers,
// caret spans per line, overflow flag + the first overset position.

import { LINE, type EngineLine, type EngineParagraph } from '../engine/wasm';
import { type Paragraph, type Position, type ResolvedChar, type TextStory, paragraphLength, resolveParagraph, resolveRun } from '../model';
import { ensureHyphenation } from '../hyphenation';
import { composeParagraph, lineLeading, prepareParagraph, runSpecFor, type LayoutEnv, type PreparedParagraph } from './paragraph';
import { freeIntervals, type Exclusion } from './geometry';

export interface TextFrame {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  columns?: number;
  gutter?: number;
  /** Explicit column widths (sum + gutters should fit the content width). */
  columnWidths?: number[];
  insets?: { top?: number; right?: number; bottom?: number; left?: number };
  verticalAlign?: 'top' | 'center' | 'bottom' | 'justify';
  /** Baseline grid for paragraphs with baselineGrid: true. offset from the frame's content top. */
  baselineGrid?: { increment: number; offset?: number };
  firstBaseline?: { kind: 'ascent' | 'cap-height' | 'x-height' | 'leading' | 'fixed'; value?: number; min?: number };
  /** Text wrap, in page coordinates. */
  exclusions?: Exclusion[];
  /** Narrowest wrap interval that may hold text (default max(6 em, 25% of the column)). */
  minWrapWidth?: number;
}

export interface GlyphRun {
  font: number;
  size: number;
  color: string;
  /** Abs baseline y of the run (after baseline shift). */
  y: number;
  x: number;
  width: number;
  scaleX: number;
  level: number;
  flags: number;
  glyphs: number[];
  /** Abs pen positions (x) and baselines (y, down-positive page coords) per glyph. */
  xs: number[];
  ys: number[];
  clusters: number[];
  styleIndex: number;
  attrs: ResolvedChar;
  paragraphId: string;
}

export interface CaretSpan { start: number; end: number; x0: number; x1: number; rtl: boolean }

export interface LaidLine {
  paragraphId: string;
  paragraphIndex: number;
  lineInParagraph: number;
  frameIndex: number;
  column: number;
  /** Paragraph offsets (UTF-16) — [start, end) partitions the paragraph; contentEnd excludes trailing space. */
  start: number;
  end: number;
  contentEnd: number;
  /** Measure (abs). */
  x: number;
  width: number;
  /** Ink extent of the composed line (abs). */
  inkX: number;
  inkWidth: number;
  baseline: number;
  ascent: number;
  descent: number;
  /** Selection band (half-leading model). */
  top: number;
  bottom: number;
  leading: number;
  rtl: boolean;
  flags: number;
  runs: GlyphRun[];
  spans: CaretSpan[];
}

export interface DecorationRect { kind: 'underline' | 'strike' | 'highlight' | 'border' | 'shading'; x: number; y: number; width: number; height: number; color: string; style?: string; paragraphId: string }

export interface FrameLayout {
  frame: TextFrame;
  columns: { x: number; y: number; width: number; height: number }[];
  lines: LaidLine[];
  decorations: DecorationRect[];
}

export interface StoryLayout {
  frames: FrameLayout[];
  lines: LaidLine[];
  paragraphs: { id: string; firstLine: number; lineCount: number }[];
  overflow: boolean;
  overflowAt?: Position;
  missing: { paragraphId: string; start: number; end: number }[];
  stats: { paragraphs: number; lines: number; ms: number };
}

export interface Slot { frame: number; column: number; x: number; top: number; bottom: number; width: number; contentTop: number }

interface Entry { slot: number; baseline: number; x: number; width: number; overset?: boolean }

function slotsFor(frames: TextFrame[]): Slot[] {
  const out: Slot[] = [];
  frames.forEach((f, fi) => {
    const ins = { top: 0, right: 0, bottom: 0, left: 0, ...f.insets };
    const cx = f.x + ins.left, cy = f.y + ins.top;
    const cw = Math.max(1, f.width - ins.left - ins.right), ch = Math.max(1, f.height - ins.top - ins.bottom);
    const n = Math.max(1, f.columnWidths?.length ?? f.columns ?? 1);
    const gutter = f.gutter ?? 16;
    const widths = f.columnWidths ?? Array(n).fill((cw - gutter * (n - 1)) / n);
    let x = cx;
    for (let c = 0; c < n; c++) {
      out.push({ frame: fi, column: c, x, top: cy, bottom: cy + ch, width: widths[c], contentTop: cy });
      x += widths[c] + gutter;
    }
  });
  return out;
}

/** Load every family, script fallback and hyphenation language the story needs. */
export async function ensureStoryResources(env: LayoutEnv, story: TextStory): Promise<void> {
  const fams = new Set<string>();
  const langs = new Set<string>();
  let text = '';
  for (const p of story.paragraphs) {
    const prep = resolveParagraph(env.sheet, p);
    fams.add(prep.char.fontFamily);
    langs.add(prep.char.language);
    if (prep.para.dropCap?.style?.fontFamily) fams.add(prep.para.dropCap.style.fontFamily);
    for (const r of p.runs) {
      const c = resolveRun(env.sheet, prep.char, r);
      fams.add(c.fontFamily);
      langs.add(c.language);
      text += r.text;
    }
  }
  if (env.fallbackFamily) fams.add(env.fallbackFamily);
  const before = env.fonts.generation;
  await env.fonts.ensure(fams, text);
  let hyphAdded = false;
  for (const l of langs) if ((await ensureHyphenation(env.engine, l)) !== undefined) hyphAdded = true;
  if (hyphAdded || env.fonts.generation !== before) env.fonts.generation++;
}

export function firstBaselineOffset(f: TextFrame, n: PreparedParagraph['nominal']): number {
  const fb = f.firstBaseline ?? { kind: 'ascent' };
  let v: number;
  switch (fb.kind) {
    case 'cap-height': v = n.capHeight; break;
    case 'x-height': v = n.xHeight; break;
    case 'leading': v = n.leading; break;
    case 'fixed': v = fb.value ?? n.ascent; break;
    default: v = n.ascent;
  }
  return Math.max(v, fb.min ?? 0);
}

export function snap(f: TextFrame, slot: Slot, baseline: number): number {
  const g = f.baselineGrid;
  if (!g || g.increment <= 0) return baseline;
  const origin = slot.contentTop + (g.offset ?? 0);
  return origin + Math.ceil((baseline - origin - 1e-6) / g.increment) * g.increment;
}

interface PlaceResult { entries: Entry[]; comp: EngineParagraph; leadings: number[] }

export const LIST_FORMATS = {
  'decimal': (n: number) => String(n),
  'lower-alpha': (n: number) => alpha(n).toLowerCase(),
  'upper-alpha': (n: number) => alpha(n),
  'lower-roman': (n: number) => roman(n).toLowerCase(),
  'upper-roman': (n: number) => roman(n),
};
function alpha(n: number): string { let s = ''; while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26); } return s; }
function roman(n: number): string {
  const t: [number, string][] = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let s = '';
  for (const [v, r] of t) while (n >= v) { s += r; n -= v; }
  return s;
}
const BULLETS = ['•', '◦', '▪'];

export interface LayoutOptions {
  /** Stop after this many frames' worth of overflow (default: lay out until overset). */
  maxLines?: number;
}

export function layoutStory(env: LayoutEnv, story: TextStory, frames: TextFrame[], _opts: LayoutOptions = {}): StoryLayout {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const slots = slotsFor(frames);
  const out: StoryLayout = { frames: frames.map(f => ({ frame: f, columns: [], lines: [], decorations: [] })), lines: [], paragraphs: [], overflow: false, missing: [], stats: { paragraphs: 0, lines: 0, ms: 0 } };
  for (const s of slots) out.frames[s.frame].columns.push({ x: s.x, y: s.top, width: s.width, height: s.bottom - s.top });
  let slotIdx = 0;
  let cursorY = slots[0]?.top ?? 0;
  let atTop = true;
  const counters: number[] = [];
  let lastListId: string | undefined;
  const paragraphs = story.paragraphs;
  const boxes: { first: number; count: number; id: string; para: PreparedParagraph['para'] }[] = [];

  for (let pi = 0; pi < paragraphs.length && !out.overflow; pi++) {
    const p = paragraphs[pi];
    const prep = prepareParagraph(env, p);
    const para = prep.para;
    // Lists: counters and marker text.
    let marker: string | undefined;
    let listIndent = 0;
    if (para.list) {
      const lvl = Math.max(1, para.list.level ?? 1);
      const listId = para.list.listId ?? para.list.kind;
      if (lastListId !== listId) counters.length = 0;
      lastListId = listId;
      counters.length = lvl;
      counters[lvl - 1] = (counters[lvl - 1] ?? (para.list.start ?? 1) - 1) + 1;
      listIndent = (para.list.indent ?? prep.nominal.size * 1.6) * lvl;
      if (para.list.kind === 'bullet') marker = para.list.bullet ?? BULLETS[(lvl - 1) % BULLETS.length];
      else marker = (para.list.template ?? '%1.').replace('%1', LIST_FORMATS[para.list.format ?? 'decimal'](counters[lvl - 1]));
    } else {
      lastListId = undefined;
      counters.length = 0;
    }
    if (pi > 0 && para.startOn !== 'anywhere' && !atTop) {
      const cur = slots[slotIdx];
      let next = slotIdx + 1;
      if (para.startOn === 'next-frame') while (next < slots.length && slots[next].frame === cur.frame) next++;
      if (next >= slots.length) { markOverflow(out, p, 0); break; }
      slotIdx = next; cursorY = slots[next].top; atTop = true;
    }
    const spaceBefore = atTop ? 0 : para.spaceBefore;

    const place = (startSlot: number, startY: number, top: boolean, jumps: Set<number>): PlaceResult => {
      const nominalLead = prep.nominal.leading;
      let leadings: number[] = [];
      let entries: Entry[] = [];
      let comp: EngineParagraph | null = null;
      let estimate = Math.max(4, Math.ceil((prep.text.length * prep.nominal.size * 0.5) / Math.max(40, slots[startSlot]?.width ?? 300) * 1.4) + 3);
      for (let iter = 0; iter < 4; iter++) {
        entries = buildEntries(startSlot, startY + (top ? 0 : spaceBefore), top, Math.max(estimate, leadings.length + 2), leadings, nominalLead, jumps);
        comp = composeParagraph(env, prep, entries.map(e => e.width));
        const lines = comp.lines;
        const actual = lines.map(l => lineLeading(para.leading, para.justification.autoLeading, Math.max(l.maxSize, 0.01)));
        const needMore = lines.length > entries.length;
        const leadDiff = actual.some((v, i) => Math.abs(v - (leadings[i] ?? nominalLead)) > 0.25);
        if (!needMore && !leadDiff) break;
        leadings = actual;
        estimate = lines.length + 2;
      }
      return { entries: entries.slice(0, comp!.lines.length), comp: comp!, leadings: comp!.lines.map(l => lineLeading(para.leading, para.justification.autoLeading, Math.max(l.maxSize, 0.01))) };
    };

    const buildEntries = (startSlot: number, startY: number, top: boolean, count: number, leadings: number[], nominalLead: number, jumps: Set<number>): Entry[] => {
      const entries: Entry[] = [];
      let si = startSlot;
      let y = startY;
      let first = top;
      let prevBaseline = startY;
      let guard = 0;
      let line = 0;
      while (entries.length < count && guard++ < count * 40 + 200) {
        if (si >= slots.length) {
          entries.push({ slot: -1, baseline: prevBaseline, x: 0, width: entries[entries.length - 1]?.width ?? slots[slots.length - 1]?.width ?? 100, overset: true });
          continue;
        }
        const slot = slots[si];
        const f = frames[slot.frame];
        if (jumps.has(line) && !first) { si++; if (si < slots.length) { y = slots[si].top; first = true; } continue; }
        const lead = leadings[line] ?? nominalLead;
        let baseline = first ? y + firstBaselineOffset(f, prep.nominal) : prevBaseline + lead;
        if (para.baselineGrid) baseline = snap(f, slot, baseline);
        if (baseline + prep.nominal.descent > slot.bottom + 0.01 && !(first && slot.bottom - slot.top < lead)) {
          si++;
          if (si < slots.length) { y = slots[si].top; first = true; }
          continue;
        }
        // Measure with indents (first line, drop cap, list hang).
        const dropIndent = prep.dropCap && line < prep.dropCap.lines ? prep.dropCap.width + prep.dropCap.gap : 0;
        const startIndent = para.indentStart + listIndent + (line === 0 ? para.indentFirst : 0) + dropIndent;
        const x0 = slot.x + Math.max(0, startIndent);
        const x1 = slot.x + slot.width - para.indentEnd;
        const band0 = baseline - prep.nominal.ascent, band1 = baseline + prep.nominal.descent;
        const minW = f.minWrapWidth ?? Math.max(prep.nominal.size * 6, slot.width * 0.25);
        const ivs = f.exclusions?.length ? freeIntervals(x0, x1, band0, band1, f.exclusions, minW) : [{ x: x0, width: Math.max(1, x1 - x0) }];
        if (!ivs.length) {
          // Nothing fits beside the wrap at this baseline: move down a line.
          prevBaseline = baseline;
          first = false;
          continue;
        }
        for (const iv of ivs) {
          entries.push({ slot: si, baseline, x: iv.x, width: iv.width });
        }
        line += ivs.length;
        prevBaseline = baseline;
        first = false;
      }
      return entries;
    };

    let startSlot = slotIdx, startY = cursorY, top = atTop;
    let jumps = new Set<number>();
    let res = place(startSlot, startY, top, jumps);
    // Widows / orphans / keep-together.
    for (let attempt = 0; attempt < 3; attempt++) {
      const lines = res.comp.lines;
      const groups: { slot: number; from: number; count: number }[] = [];
      res.entries.forEach((e, i) => {
        const g = groups[groups.length - 1];
        if (g && g.slot === e.slot) g.count++;
        else groups.push({ slot: e.slot, from: i, count: 1 });
      });
      if (groups.length < 2 || lines.length < 2) break;
      if ((para.keepTogether || groups[0].count < para.orphans) && !top) {
        const ns = startSlot + 1;
        if (ns >= slots.length) break;
        startSlot = ns; startY = slots[ns].top; top = true; jumps = new Set();
        res = place(startSlot, startY, top, jumps);
        continue;
      }
      const last = groups[groups.length - 1];
      if (last.count < para.widows && last.slot !== -1) {
        const need = para.widows - last.count;
        const jumpAt = last.from - need;
        if (jumpAt >= Math.max(1, para.orphans) && !jumps.has(jumpAt)) {
          jumps = new Set([...jumps, jumpAt]);
          res = place(startSlot, startY, top, jumps);
          continue;
        }
        // Widow and orphan rules cannot both hold for this split (a short paragraph): move the
        // whole paragraph on, as InDesign does.
        if (!top && startSlot + 1 < slots.length && groups.length === 2) {
          startSlot = startSlot + 1; startY = slots[startSlot].top; top = true; jumps = new Set();
          res = place(startSlot, startY, top, jumps);
          continue;
        }
      }
      break;
    }
    // Keep with next: if the next paragraph's first lines cannot follow in this column, move.
    if (para.keepWithNext && pi + 1 < paragraphs.length && !top) {
      const lastE = res.entries[res.entries.length - 1];
      if (lastE && lastE.slot >= 0) {
        const nextPrep = prepareParagraph(env, paragraphs[pi + 1]);
        const need = para.spaceAfter + nextPrep.para.spaceBefore + nextPrep.nominal.leading * Math.max(1, nextPrep.para.orphans) + nextPrep.nominal.descent;
        if (lastE.baseline + need > slots[lastE.slot].bottom && startSlot + 1 < slots.length) {
          startSlot = startSlot + 1; startY = slots[startSlot].top; top = true;
          res = place(startSlot, startY, top, new Set());
        }
      }
    }

    // Commit.
    const firstLine = out.lines.length;
    for (const mr of res.comp.missing) {
      out.missing.push({ paragraphId: p.id, start: mr[0] + prep.offset, end: mr[1] + prep.offset });
    }
    let overset = false;
    for (let li = 0; li < res.comp.lines.length; li++) {
      const e = res.entries[li];
      if (!e || e.overset || e.slot < 0) { markOverflow(out, p, res.comp.lines[li].start + prep.offset); overset = true; break; }
      const laid = commitLine(env, prep, p, pi, li, res.comp.lines[li], e, slots[e.slot], res.leadings[li], res.comp.paraLevel % 2 === 1);
      if (li === 0 && prep.dropCap) addDropCap(env, prep, laid, res.leadings[0]);
      if (li === 0 && marker) addMarker(env, prep, laid, marker, slots[e.slot], para.indentStart + listIndent);
      out.lines.push(laid);
      out.frames[laid.frameIndex].lines.push(laid);
    }
    const committed = out.lines.length - firstLine;
    out.paragraphs.push({ id: p.id, firstLine, lineCount: committed });
    boxes.push({ first: firstLine, count: committed, id: p.id, para });
    if (overset) break;
    const lastE = res.entries[res.comp.lines.length - 1];
    if (lastE) {
      // The next paragraph's first baseline = this baseline + spaceAfter + spaceBefore + its leading.
      slotIdx = lastE.slot;
      cursorY = lastE.baseline + para.spaceAfter;
      atTop = false;
    }
  }
  verticalAlign(out, slots, frames);
  for (const fl of out.frames) for (const l of fl.lines) decorate(env, l, fl.decorations);
  for (const b of boxes) if (b.count) paragraphBox(out, b.first, b.id, b.para);
  out.stats = { paragraphs: out.paragraphs.length, lines: out.lines.length, ms: (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0 };
  return out;
}

function markOverflow(out: StoryLayout, p: Paragraph, offset: number) {
  if (out.overflow) return;
  out.overflow = true;
  out.overflowAt = { paragraphId: p.id, offset: Math.min(offset, paragraphLength(p)) };
}

export function commitLine(env: LayoutEnv, prep: PreparedParagraph, p: Paragraph, pi: number, li: number, l: EngineLine, e: { slot: number; baseline: number; x: number; width: number }, slot: Slot, leading: number, rtl: boolean): LaidLine {
  const off = prep.offset;
  const runs: GlyphRun[] = l.runs.map(r => {
    const attrs = prep.styles[r.style] ?? prep.char;
    const rx = e.x + r.x;
    const y = e.baseline - r.shift;
    return {
      font: r.font, size: r.size, color: attrs.color, y, x: rx, width: r.width, scaleX: r.scaleX, level: r.level, flags: r.flags,
      glyphs: r.glyphs.map(g => g.gid), xs: r.glyphs.map(g => rx + g.x), ys: r.glyphs.map(g => y - g.y), clusters: r.glyphs.map(g => g.cluster + off),
      styleIndex: r.style, attrs, paragraphId: p.id,
    };
  });
  const half = (leading - (l.ascent + l.descent)) / 2;
  const top = e.baseline - l.ascent - half;
  return {
    paragraphId: p.id, paragraphIndex: pi, lineInParagraph: li, frameIndex: slot.frame, column: slot.column,
    start: li === 0 ? 0 : l.start + off, end: l.end + off, contentEnd: l.contentEnd + off,
    x: e.x, width: e.width, inkX: e.x + l.x, inkWidth: l.width,
    baseline: e.baseline, ascent: l.ascent, descent: l.descent, top, bottom: top + leading, leading, rtl, flags: l.flags,
    runs, spans: l.spans.map(s => ({ start: s.start + off, end: s.end + off, x0: e.x + s.x0, x1: e.x + s.x1, rtl: s.rtl })),
  };
}

export function addDropCap(env: LayoutEnv, prep: PreparedParagraph, line: LaidLine, leading: number) {
  const dc = prep.dropCap!;
  const shaped = env.engine.shape(dc.text, dc.run);
  const baseline = line.baseline + (dc.lines - 1) * leading;
  const x0 = line.x - dc.width - dc.gap;
  let x = x0;
  const xs: number[] = [], ys: number[] = [];
  for (const g of shaped) { xs.push(x + g.xOffset); ys.push(baseline - g.yOffset); x += g.xAdvance; }
  line.runs.unshift({ font: shaped[0]?.font ?? dc.run.fonts[0], size: dc.size, color: dc.attrs.color, y: baseline, x: x0, width: dc.width, scaleX: 1, level: 0, flags: 0, glyphs: shaped.map(g => g.gid), xs, ys, clusters: shaped.map(g => g.cluster), styleIndex: -1, attrs: dc.attrs, paragraphId: line.paragraphId });
  // Carets inside the drop cap.
  const n = dc.text.length;
  line.spans.unshift({ start: 0, end: n, x0, x1: x0 + dc.width, rtl: false });
  line.start = 0;
}

function addMarker(env: LayoutEnv, prep: PreparedParagraph, line: LaidLine, marker: string, slot: Slot, hang: number) {
  const c = prep.styles[0] ?? prep.char;
  const run = runSpecFor(env, c, 0, marker.length, marker, prep.para);
  const shaped = env.engine.shape(marker, run);
  const w = shaped.reduce((s, g) => s + g.xAdvance, 0);
  const gap = prep.nominal.size * 0.45;
  const right = slot.x + hang - gap;
  let x = Math.max(slot.x, right - w);
  const x0 = x;
  const xs: number[] = [], ys: number[] = [];
  for (const g of shaped) { xs.push(x + g.xOffset); ys.push(line.baseline - g.yOffset); x += g.xAdvance; }
  line.runs.unshift({ font: shaped[0]?.font ?? run.fonts[0], size: c.fontSize, color: c.color, y: line.baseline, x: x0, width: w, scaleX: 1, level: 0, flags: 0, glyphs: shaped.map(g => g.gid), xs, ys, clusters: shaped.map(() => -1), styleIndex: -2, attrs: c, paragraphId: line.paragraphId });
}

function decoColor(d: unknown, fallback: string): string {
  return d && typeof d === 'object' && 'color' in d && typeof (d as { color?: string }).color === 'string' ? (d as { color: string }).color : fallback;
}

export function decorate(env: LayoutEnv, line: LaidLine, out: DecorationRect[]) {
  for (const r of line.runs) {
    const a = r.attrs;
    if (!a.underline && !a.strike && !a.highlight) continue;
    const m = env.engine.metrics(r.font);
    const sc = r.size / m.upem;
    if (a.highlight) out.push({ kind: 'highlight', x: r.x, y: line.baseline - line.ascent, width: r.width, height: line.ascent + line.descent, color: a.highlight, paragraphId: r.paragraphId });
    if (a.underline) {
      const th = Math.max(0.5, (typeof a.underline === 'object' && a.underline.thickness) || m.underlineThickness * sc);
      const yy = r.y - m.underlinePos * sc + ((typeof a.underline === 'object' && a.underline.offset) || 0);
      out.push({ kind: 'underline', x: r.x, y: yy - th / 2, width: r.width, height: th, color: decoColor(a.underline, r.color), style: typeof a.underline === 'object' ? a.underline.style : undefined, paragraphId: r.paragraphId });
    }
    if (a.strike) {
      const th = Math.max(0.5, m.strikeThickness * sc);
      const yy = r.y - m.strikePos * sc;
      out.push({ kind: 'strike', x: r.x, y: yy - th / 2, width: r.width, height: th, color: decoColor(a.strike, r.color), paragraphId: r.paragraphId });
    }
  }
}

export function paragraphBox(out: StoryLayout, first: number, id: string, para: PreparedParagraph['para']) {
  if (!para.border && !para.shading) return;
  const lines = out.lines.slice(first);
  // One box per column segment.
  const segs: LaidLine[][] = [];
  for (const l of lines) {
    const s = segs[segs.length - 1];
    if (s && s[0].frameIndex === l.frameIndex && s[0].column === l.column) s.push(l);
    else segs.push([l]);
  }
  for (const s of segs) {
    const pad = para.shading?.padding ?? para.border?.padding ?? 4;
    const x = Math.min(...s.map(l => l.x)) - pad;
    const r = Math.max(...s.map(l => l.x + l.width)) + pad;
    const y = s[0].top - pad, b = s[s.length - 1].bottom + pad;
    const fl = out.frames[s[0].frameIndex].decorations;
    if (para.shading?.color) fl.unshift({ kind: 'shading', x, y, width: r - x, height: b - y, color: para.shading.color, paragraphId: id });
    if (para.border?.color) fl.push({ kind: 'border', x, y, width: r - x, height: b - y, color: para.border.color, style: String(para.border.width ?? 1), paragraphId: id });
  }
}

function shiftLine(l: LaidLine, dy: number) {
  l.baseline += dy; l.top += dy; l.bottom += dy;
  for (const r of l.runs) { r.y += dy; for (let i = 0; i < r.ys.length; i++) r.ys[i] += dy; }
}

function verticalAlign(out: StoryLayout, slots: Slot[], frames: TextFrame[]) {
  slots.forEach((slot, si) => {
    const f = frames[slot.frame];
    const va = f.verticalAlign ?? 'top';
    if (va === 'top') return;
    const fl = out.frames[slot.frame];
    const lines = fl.lines.filter(l => l.column === slot.column);
    if (!lines.length) return;
    void si;
    const used = lines[lines.length - 1].baseline + lines[lines.length - 1].descent;
    const free = slot.bottom - used;
    if (free <= 0) return;
    if (va === 'justify' && lines.length > 1) {
      const step = free / (lines.length - 1);
      lines.forEach((l, i) => shiftLine(l, step * i));
      return;
    }
    const dy = va === 'center' ? free / 2 : free;
    for (const l of lines) shiftLine(l, dy);
  });
}

/** True when a paragraph's line was composed with an inserted hyphen. */
export function isHyphenated(l: LaidLine): boolean { return (l.flags & LINE.HYPHENATED) !== 0; }
