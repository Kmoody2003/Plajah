// pubKit — shared typesetting primitives for the ARTICLE and CATALOG publication groups.
//
// The important one is `typeset`: it pours blocks (paragraphs, subheads, Q&A turns) through
// a chain of column boxes the way InDesign threads text frames — line-accurate wrapping,
// widow/orphan control, keep-with-next on subheads, hanging markers, a real drop cap — and
// emits ordinary editable TEXT objects (one per column chunk) so nothing is baked.
//
// Sentences use typographic quotes/apostrophes (’ “ ”) so single-quoted TS literals stay on one line.
import type { TelaVectorObject } from '../../../../types';
import { fontCss, type FontKey } from '../../telaFonts';
import { wrapLine, measureText, textBlockHeight } from '../../telaText';
import { rect, circle, hr, vr, text, imageSlot, below, mix, type Role } from '../../templateKit';
import * as orn from '../../ornaments';

export interface Box { x: number; y: number; w: number; h: number }
export const verso = (i: number) => i % 2 === 0;

export interface Style {
  size?: number; font?: FontKey; weight?: number; color?: string; leading?: number; italic?: boolean;
  tracking?: number; before?: number; after?: number; role?: Role; label?: string; indent?: number;
  keepNext?: boolean; align?: 'left' | 'center' | 'right'; opacity?: number;
}
export interface Marker { t: string; dx?: number; dy?: number; size?: number; font?: FontKey; weight?: number; color?: string; tracking?: number; italic?: boolean; role?: Role; w?: number }
export interface DropCapSpec { font: FontKey; lines?: number; color?: string; weight?: number; scaleX?: number }
export type Block = string | (Style & { t: string; marker?: Marker; drop?: DropCapSpec });

interface Norm { t: string; st: Required<Pick<Style, 'size' | 'font' | 'weight' | 'color' | 'leading' | 'before' | 'after'>> & Style; marker?: Marker; drop?: DropCapSpec; cont?: boolean }

export interface TypesetResult { objs: TelaVectorObject[]; left: number; ends: number[]; fill: number; rest: Block[]; endX: number; endY: number }

/** Pour `blocks` through `cols` in order. `base` supplies the default style; blocks override. */
export function typeset(blocks: Block[], cols: Box[], base: Style & { size: number; font: FontKey; color: string }): TypesetResult {
  const baseSt = { weight: 400, leading: 1.5, before: 0, after: base.size * .6, ...base };
  const queue: Norm[] = blocks.map(b => {
    const o = typeof b === 'string' ? { t: b } : b;
    const { t, marker, drop, ...rest } = o as any;
    return { t, marker, drop, st: { ...baseSt, ...rest } as Norm['st'] };
  });
  const objs: TelaVectorObject[] = []; const ends: number[] = []; let used = 0, total = 0;
  for (const c of cols) total += c.h;
  let ci = 0, y = cols[0]?.y ?? 0, atTop = true, endX = cols[0]?.x ?? 0, endY = cols[0]?.y ?? 0;
  const advance = () => { ends[ci] = y; ci++; if (ci < cols.length) { y = cols[ci].y; atTop = true; } };
  let guard = 0;
  while (queue.length && ci < cols.length && guard++ < 400) {
    const col = cols[ci], b = queue[0], st = b.st, lh = st.size * st.leading;
    const top = y + (atTop ? 0 : st.before), bottom = col.y + col.h;
    const m = { fontSize: st.size, fontFamily: fontCss(st.font), fontWeight: st.weight, fontStyle: st.italic ? 'italic' : undefined, letterSpacing: st.tracking || 0 } as const;
    const x = col.x + (st.indent || 0), w = col.w - (st.indent || 0);
    const avail = top + st.size <= bottom + .01 ? Math.floor((bottom - top - st.size) / lh + .001) + 1 : 0;
    const mk = (xx: number, yy: number, ww: number, lines: string[], label: string): TelaVectorObject => text(xx, yy, ww, lines.join(' '), { size: st.size, font: st.font, weight: st.weight, color: st.color, leading: st.leading, italic: st.italic, tracking: st.tracking, align: st.align, opacity: st.opacity, label: st.label ? `${st.label}` : label, role: st.role || 'BODY' });
    // Drop cap: first lines are set narrower beside a large initial.
    if (b.drop && !b.cont && avail >= (b.drop.lines ?? 3) + 2) {
      const L = b.drop.lines ?? 3, cap = b.t.charAt(0), rest = b.t.slice(1);
      const capSize = Math.round(((L - 1) * lh + st.size * .7) / .7);
      const capW = Math.round(capSize * (.62 * (b.drop.scaleX ?? 1))) + 5;
      const l1 = wrapLine(rest, w - capW, m);
      const head = l1.slice(0, L), tail = l1.slice(L).join(' ');
      objs.push(text(x - 1, top - capSize * .17 - 1, capW, cap, { size: capSize, font: b.drop.font, weight: b.drop.weight ?? 700, color: b.drop.color || st.color, wrap: false, label: 'Drop cap', role: 'ORNAMENT', leading: 1 }));
      objs.push(text(x + capW, top, w - capW, head.join(' '), { size: st.size, font: st.font, weight: st.weight, color: st.color, leading: st.leading, italic: st.italic, tracking: st.tracking, label: `Column ${ci + 1} body — opening lines`, role: 'BODY' }));
      let yy = top + L * lh;
      if (tail) {
        const tl = wrapLine(tail, w, m); const n = Math.min(tl.length, Math.max(0, Math.floor((bottom - yy - st.size) / lh + .001) + 1));
        if (n > 0) { objs.push(mk(x, yy, w, tl.slice(0, n), `Column ${ci + 1} body`)); yy += n * lh; }
        if (n < tl.length) { queue[0] = { ...b, t: tl.slice(n).join(' '), cont: true, drop: undefined }; used += yy - col.y; y = yy; advance(); continue; }
      }
      queue.shift(); y = yy + st.after; atTop = false; continue;
    }
    const lines = wrapLine(b.t, w, m);
    const nx = queue[1]; const nextPx = nx ? nx.st.before + nx.st.size * nx.st.leading * 2 : 0;
    const need = st.keepNext ? lines.length + 2 : 2;
    // keep-with-next in pixels: this block plus two lines of the next must fit
    if (st.keepNext && !(atTop) && (bottom - top) < lines.length * lh + st.after + nextPx) { advance(); continue; }
    // Not enough room to start sensibly (orphan / keep-with-next): move on to the next column.
    if ((avail < Math.min(need, lines.length) || (lines.length >= 2 && avail < 2)) && !(atTop && avail >= 1)) { advance(); continue; }
    let take = Math.min(lines.length, avail);
    if (take < lines.length && lines.length - take === 1) take = take - 1;   // widow control
    if (take < 1) { advance(); continue; }
    const chunk = mk(x, top, w, lines.slice(0, take), `Column ${ci + 1} body`);
    objs.push(chunk); endX = x + measureText(lines[take - 1], m); endY = top + (take - 1) * lh;
    if (b.marker && !b.cont) {
      const mk2 = b.marker; objs.push(text(col.x + (mk2.dx ?? 0), top + (mk2.dy ?? 0), mk2.w ?? 60, mk2.t, { size: mk2.size ?? st.size, font: mk2.font ?? st.font, weight: mk2.weight ?? 700, color: mk2.color ?? st.color, tracking: mk2.tracking, italic: mk2.italic, wrap: false, label: 'Hanging marker', role: mk2.role ?? 'LABEL' }));
    }
    const yy = top + take * lh;
    if (take < lines.length) { queue[0] = { ...b, t: lines.slice(take).join(' '), cont: true, drop: undefined, marker: undefined }; used += yy - col.y; y = yy; advance(); }
    else { queue.shift(); y = yy + st.after; atTop = false; }
  }
  if (ci < cols.length) { ends[ci] = y; used += Math.max(0, y - cols[ci].y - 0); }
  const left = queue.reduce((a, q) => a + q.t.length, 0);
  if (typeof process !== 'undefined' && (process as any).env?.TELA_FLOW_DEBUG) console.warn(`[typeset] ${cols.length} cols, fill ${(Math.min(1, used / Math.max(1, total)) * 100).toFixed(0)}%, left ${left} chars`);
  const rest: Block[] = queue.map(q => ({ ...q.st, t: q.t, marker: q.marker, drop: q.drop } as Block));
  return { objs, left, ends: ends.map((e, i) => e ?? cols[i].y), fill: Math.min(1, used / Math.max(1, total)), rest, endX, endY };
}

/** Column boxes from a grid: n equal columns between y0 and y1. */
export function cols(x: number, y: number, w: number, h: number, n: number, gutter: number): Box[] {
  const cw = (w - gutter * (n - 1)) / n;
  return Array.from({ length: n }, (_, i) => ({ x: x + i * (cw + gutter), y, w: cw, h }));
}

// ── Figures, captions, credits ────────────────────────────────────────────────
export interface FigureOpts {
  hint?: string; tone?: 'light' | 'dark'; rx?: number; frame?: string; frameWidth?: number; shade?: string; label?: string; hero?: boolean;
  caption?: string; credit?: string; capFont?: FontKey; capSize?: number; capColor?: string; creditColor?: string; capGap?: number; capItalic?: boolean; capWeight?: number; capLeading?: number;
  vignette?: boolean; num?: string; numColor?: string; capW?: number; creditFont?: FontKey; opacity?: number; shadow?: any;
}
export function figure(x: number, y: number, w: number, h: number, o: FigureOpts = {}): { objs: TelaVectorObject[]; bottom: number } {
  const slot = imageSlot(x, y, w, h, { tone: o.tone, rx: o.rx, frame: o.frame, frameWidth: o.frameWidth, shade: o.shade, caption: o.hint, label: o.label, opacity: o.opacity, shadow: o.shadow });
  if (o.vignette && o.shade) slot[0].gradient = { kind: 'RADIAL', stops: [{ offset: 0, color: mix(o.shade, .1) }, { offset: 1, color: mix(o.shade, -.4) }] };
  if (o.hero) { slot[0].templateRole = 'HERO'; slot[0].objectLabel = o.label || 'Hero image'; }
  const objs = [...slot]; let bottom = y + h;
  const capSize = o.capSize ?? 9.5, capColor = o.capColor ?? '#666';
  if (o.caption) {
    const cx = x, cw = o.capW ?? w;
    const cap = text(cx, bottom + (o.capGap ?? 8), cw, o.num ? `${o.num}  ${o.caption}` : o.caption, { size: capSize, font: o.capFont ?? 'inter', weight: o.capWeight ?? 400, italic: o.capItalic, color: capColor, leading: o.capLeading ?? 1.4, label: 'Caption', role: 'CAPTION' });
    objs.push(cap); bottom = below(cap, 0);
  }
  if (o.credit) {
    const cr = text(x, bottom + 3, o.capW ?? w, o.credit, { size: Math.max(7.5, capSize - 1.5), font: o.creditFont ?? o.capFont ?? 'inter', weight: 600, color: o.creditColor ?? capColor, tracking: .1, transform: 'uppercase', opacity: .8, label: 'Photo credit', role: 'CREDIT' });
    objs.push(cr); bottom = below(cr, 0);
  }
  return { objs, bottom };
}

// ── Pull quotes ───────────────────────────────────────────────────────────────
export interface PullOpts { size: number; font: FontKey; color: string; weight?: number; italic?: boolean; leading?: number; rule?: 'top' | 'left' | 'both' | 'none' | 'mark'; ruleColor?: string; ruleW?: number; attrib?: string; attribFont?: FontKey; attribColor?: string; attribSize?: number; align?: 'left' | 'center'; markColor?: string; markFont?: FontKey; pad?: number; tracking?: number }
export function pullQuote(x: number, y: number, w: number, quote: string, o: PullOpts): { objs: TelaVectorObject[]; bottom: number } {
  const objs: TelaVectorObject[] = []; const pad = o.pad ?? 14; let ty = y, tx = x, tw = w;
  const rc = o.ruleColor || o.color, rw = o.ruleW ?? 2;
  if (o.rule === 'top' || o.rule === 'both') { objs.push(hr(x, y, w, rc, rw, { label: 'Pull quote rule' })); ty = y + pad; }
  if (o.rule === 'left') { tx = x + pad + rw; tw = w - pad - rw; }
  let mark: TelaVectorObject | undefined;
  if (o.rule === 'mark') {
    mark = text(x - 2, y - o.size * .35, o.size * 1.6, '“', { size: o.size * 2.4, font: o.markFont ?? o.font, weight: 700, color: o.markColor ?? rc, wrap: false, leading: 1, label: 'Quotation mark', role: 'ORNAMENT' });
    objs.push(mark); ty = y + o.size * .55;
  }
  const q = text(tx, ty, tw, quote, { size: o.size, font: o.font, weight: o.weight ?? 400, italic: o.italic, color: o.color, leading: o.leading ?? 1.22, align: o.align, tracking: o.tracking, label: 'Pull quote', role: 'PULLQUOTE' });
  objs.push(q); let bottom = below(q, 0);
  if (o.attrib) { const a = text(tx, bottom + 8, tw, o.attrib, { size: o.attribSize ?? 9.5, font: o.attribFont ?? 'inter', weight: 700, color: o.attribColor ?? rc, tracking: .12, transform: 'uppercase', align: o.align, label: 'Quote attribution', role: 'CREDIT' }); objs.push(a); bottom = below(a, 0); }
  if (o.rule === 'left') objs.push(rect(x, ty, rw, bottom - ty, rc, { label: 'Pull quote bar', role: 'RULE' }));
  if (o.rule === 'both') { bottom += pad; objs.push(hr(x, bottom, w, rc, rw, { label: 'Pull quote rule' })); }
  return { objs, bottom };
}

// ── Tables (spec tables, price lists, logs) with auto row height ─────────────
export interface ColDef { w: number; align?: 'left' | 'right' | 'center'; font?: FontKey; weight?: number; color?: string; size?: number; italic?: boolean; tracking?: number; role?: Role }
export interface TableOpts { size: number; font: FontKey; color: string; rule: string; ruleW?: number; pad?: number; head?: string[]; headSize?: number; headFont?: FontKey; headColor?: string; headWeight?: number; headTracking?: number; headRule?: string; headRuleW?: number; zebra?: string; leading?: number; minH?: number; label?: string; vlines?: boolean; role?: Role; headFill?: string }
export function table(x: number, y: number, cdefs: ColDef[], rows: string[][], o: TableOpts): { objs: TelaVectorObject[]; bottom: number; rowYs: number[] } {
  const objs: TelaVectorObject[] = []; const pad = o.pad ?? 5; const totalW = cdefs.reduce((a, c) => a + c.w, 0); let cy = y; const rowYs: number[] = [];
  const cx: number[] = []; let acc = x; for (const c of cdefs) { cx.push(acc); acc += c.w; }
  const cell = (c: ColDef, i: number, v: string, yy: number, head: boolean) => text(cx[i] + (c.align === 'right' ? 0 : 0) + pad, yy, c.w - pad * 2, v, {
    size: head ? (o.headSize ?? o.size - 1.5) : (c.size ?? o.size), font: head ? (o.headFont ?? o.font) : (c.font ?? o.font), weight: head ? (o.headWeight ?? 700) : (c.weight ?? 400), italic: head ? undefined : c.italic,
    color: head ? (o.headColor ?? o.color) : (c.color ?? o.color), align: c.align, tracking: head ? (o.headTracking ?? .1) : c.tracking, transform: head ? 'uppercase' : undefined, leading: o.leading ?? 1.3,
    label: `${o.label || 'Table'} ${head ? 'header' : 'cell'}`, role: head ? 'LABEL' : (c.role ?? o.role ?? 'BODY'),
  });
  if (o.head) {
    const hs = o.head.map((v, i) => cell(cdefs[i], i, v, cy + pad, true));
    const hh = Math.max(...hs.map(t => t.h)) + pad * 2;
    if (o.headFill) objs.push(rect(x, cy, totalW, hh, o.headFill, { label: `${o.label || 'Table'} header band` }));
    objs.push(...hs); cy += hh; rowYs.push(cy);
    objs.push(hr(x, cy, totalW, o.headRule ?? o.color, o.headRuleW ?? 1.25, { label: 'Header rule' }));
  }
  rows.forEach((r, ri) => {
    const cells = r.map((v, i) => cell(cdefs[i], i, v, cy + pad, false));
    const rh = Math.max(o.minH ?? 0, Math.max(...cells.map(t => t.h)) + pad * 2);
    if (o.zebra && ri % 2 === 1) objs.push(rect(x, cy, totalW, rh, o.zebra, { label: 'Zebra band' }));
    objs.push(...cells); cy += rh; rowYs.push(cy);
    objs.push(hr(x, cy, totalW, o.rule, o.ruleW ?? .6, { label: 'Row rule' }));
  });
  if (o.vlines) cx.slice(1).forEach(v => objs.push(vr(v, y, cy - y, o.rule, .5, { label: 'Column rule' })));
  return { objs, bottom: cy, rowYs };
}

// ── Little parts ──────────────────────────────────────────────────────────────
export function pill(x: number, y: number, label: string, o: { fill: string; color: string; font?: FontKey; size?: number; weight?: number; h?: number; padX?: number; tracking?: number; rx?: number; stroke?: string; role?: Role }): { objs: TelaVectorObject[]; right: number; h: number } {
  const size = o.size ?? 10, h = o.h ?? size + 12, padX = o.padX ?? 12;
  const w = Math.ceil(measureApprox(label, size, o.tracking ?? .1)) + padX * 2;
  return { objs: [rect(x, y, w, h, o.fill, { rx: o.rx ?? h / 2, stroke: o.stroke, strokeWidth: o.stroke ? 1 : 0, label: 'Pill', role: 'ORNAMENT' }), text(x, y + (h - size) / 2 - 1, w, label, { size, font: o.font ?? 'inter', weight: o.weight ?? 700, color: o.color, tracking: o.tracking ?? .1, transform: 'uppercase', align: 'center', wrap: false, label: 'Pill label', role: o.role ?? 'LABEL' })], right: x + w, h };
}
const measureApprox = (s: string, size: number, tracking: number) => s.length * size * (.62 + tracking);

export function button(x: number, y: number, w: number, h: number, label: string, o: { fill: string; color: string; font?: FontKey; size?: number; rx?: number; weight?: number; stroke?: string; tracking?: number }): TelaVectorObject[] {
  const size = o.size ?? 14;
  return [rect(x, y, w, h, o.fill, { rx: o.rx ?? 6, stroke: o.stroke, strokeWidth: o.stroke ? 1.5 : 0, label: 'Button', role: 'ORNAMENT' }),
    text(x, y + (h - size) / 2 - 1, w, label, { size, font: o.font ?? 'inter', weight: o.weight ?? 700, color: o.color, align: 'center', tracking: o.tracking ?? .02, wrap: false, label: 'Button label', role: 'LABEL' })];
}

export function barcode(x: number, y: number, w: number, h: number, color: string, seed: number): TelaVectorObject[] {
  const r = orn.rng(seed); const out: TelaVectorObject[] = []; let cx = x;
  while (cx < x + w - 3) { const t = 1 + Math.floor(r() * 3); out.push(rect(cx, y, t, h, color, { label: 'Barcode bar' })); cx += t + 1 + Math.floor(r() * 3); }
  return out;
}

/** A square checkbox (empty) with a label to its right. */
export function checkbox(x: number, y: number, label: string, o: { size?: number; color: string; font?: FontKey; textSize?: number; w?: number; checked?: boolean; accent?: string }): TelaVectorObject[] {
  const s = o.size ?? 12, ts = o.textSize ?? 11;
  const out = [rect(x, y, s, s, o.checked ? (o.accent ?? o.color) : 'none', { stroke: o.color, strokeWidth: 1.2, rx: 2, label: 'Checkbox', role: 'ORNAMENT' })];
  if (o.checked) out.push(rect(x + 3, y + 3, s - 6, s - 6, o.color === '#000' ? '#fff' : '#fff', { rx: 1, label: 'Check mark', role: 'ORNAMENT' }));
  out.push(text(x + s + 8, y + (s - ts) / 2 - 1, o.w ?? 220, label, { size: ts, font: o.font ?? 'inter', color: o.color, label: 'Checkbox label', role: 'BODY' }));
  return out;
}

/** Horizontal meter: filled track proportional to value/max. */
export function meter(x: number, y: number, w: number, h: number, value: number, max: number, fill: string, track: string, o: { rx?: number } = {}): TelaVectorObject[] {
  return [rect(x, y, w, h, track, { rx: o.rx ?? h / 2, label: 'Meter track' }), rect(x, y, Math.max(h, w * value / max), h, fill, { rx: o.rx ?? h / 2, label: 'Meter value' })];
}

/** Running head (top) + folio (bottom) with the page number on the outer edge. */
export function runningFoot(ctx: { pageIndex: number; W: number; H: number }, o: { left: number; right: number; y: number; head?: string; headY?: number; font: FontKey; size?: number; color: string; rule?: string; tracking?: number; weight?: number; folioText?: string; alternate?: boolean }): TelaVectorObject[] {
  const size = o.size ?? 8.5, v = verso(ctx.pageIndex), n = o.folioText ?? String(ctx.pageIndex + 1);
  const out: TelaVectorObject[] = [];
  const w = o.right - o.left;
  const num = text(v ? o.left : o.right - 60, o.y, 60, n, { size, font: o.font, weight: o.weight ?? 700, color: o.color, tracking: o.tracking ?? .1, align: v ? 'left' : 'right', wrap: false, label: 'Folio', role: 'FOLIO' });
  out.push(num);
  if (o.head) out.push(text(v ? o.right - w * .7 : o.left, o.y, w * .7, o.head, { size, font: o.font, weight: 500, color: o.color, tracking: o.tracking ?? .1, align: v ? 'right' : 'left', transform: 'uppercase', wrap: false, opacity: .8, label: 'Running head', role: 'FOLIO' }));
  if (o.rule) out.push(hr(o.left, o.y - 8, w, o.rule, .6, { label: 'Foot rule' }));
  return out;
}

/** Make a label/role-tagged text shortcut with 12 opinions removed. */
export function label(x: number, y: number, w: number, value: string, o: { size?: number; font?: FontKey; color: string; weight?: number; tracking?: number; align?: 'left' | 'center' | 'right'; role?: Role; label?: string; opacity?: number; transform?: 'uppercase' | 'none'; wrap?: boolean; italic?: boolean }): TelaVectorObject {
  return text(x, y, w, value, { size: o.size ?? 9, font: o.font ?? 'inter', weight: o.weight ?? 600, color: o.color, tracking: o.tracking ?? .14, transform: o.transform ?? 'uppercase', align: o.align, wrap: o.wrap ?? false, opacity: o.opacity, italic: o.italic, label: o.label ?? 'Label', role: o.role ?? 'LABEL' });
}

export { circle };

/** Pour one story through several pages in sequence: each page takes what the previous one left over. */
export function pour(blocks: Block[], pages: Box[][], base: Style & { size: number; font: FontKey; color: string }): TypesetResult[] {
  const out: TypesetResult[] = []; let rest = blocks;
  for (const boxes of pages) { const r = typeset(rest, boxes, base); out.push(r); rest = r.rest; }
  return out;
}

/** Post-process a designer's output: long single-line text becomes wrapping text; empty text spacers are dropped. */
export function sanitize(objs: TelaVectorObject[]): TelaVectorObject[] {
  for (const o of objs) if (o.kind === 'TEXT' && o.wrap === false && (o.text || '').length > 60 && !(o.text || '').includes('\n')) { o.wrap = true; o.h = Math.ceil(textBlockHeight(o)); }
  return objs.filter(o => !(o.kind === 'TEXT' && !(o.text || '').trim()));
}
export const safeDesigns = <T extends Record<string, (c: any) => TelaVectorObject[]>>(d: T): T => Object.fromEntries(Object.entries(d).map(([k, f]) => [k, (c: any) => sanitize(f(c))])) as T;
