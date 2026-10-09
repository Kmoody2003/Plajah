// magazineKit — shared editorial furniture for the MAGAZINE publication systems.
//
// Everything a magazine page is built from, parameterised so no two titles produce
// the same geometry: a Grid (columns, gutter, baseline, facing-page margins), a
// text flow engine that pours copy through column frames on the baseline grid,
// running heads and folios that alternate verso/recto, photo wells that extend
// into the 0.125in bleed, captions with credits, pull quotes, sidebars, barcode
// plates, and advertising frames with trim / bleed / live-area notes.
//
// Page numbering: the cover is page 1 (a recto). Even page numbers are versos
// (left-hand), odd are rectos, so pageIndex 1 is page 2 — the verso of the
// first interior spread (pages 2–3, 4–5, …).
import type { TelaVectorObject } from '../../../../types';
import type { PublicationCtx } from './types';
import { fontCss, type FontKey } from '../../telaFonts';
import { wrapLine } from '../../telaText';
import { rect, hr, vr, text as rawText, below, imageSlot, columns, mix, alpha, type Role, type TextOpts } from '../../templateKit';
import * as orn from '../../ornaments';
import { line } from '../../templateKit';

export type Obj = TelaVectorObject;
/** 0.125in at 96 px/in — printers want art to run past the trim by this much. */
export const BL = 12;
/** 0.25in live-area inset: type that must survive trimming stays inside this. */
export const SAFE = 24;

// ── Grid ──────────────────────────────────────────────────────────────────────
export interface Grid { cols: number; gutter: number; base: number; top: number; bottom: number; inner: number; outer: number }
export interface Geo { verso: boolean; pageNo: number; W: number; H: number; x: number; w: number; y: number; h: number; right: number; bottom: number; cols: Array<{ x: number; w: number }>; g: Grid }

/** Facing-page geometry: inner margin sits on the gutter side, so versos mirror rectos. */
export function geo(ctx: PublicationCtx, g: Grid): Geo {
  const verso = ctx.pageIndex % 2 === 1;
  const left = verso ? g.outer : g.inner, rightM = verso ? g.inner : g.outer;
  const x = left, w = ctx.W - left - rightM;
  return { verso, pageNo: ctx.pageIndex + 1, W: ctx.W, H: ctx.H, x, w, y: g.top, h: ctx.H - g.top - g.bottom, right: x + w, bottom: ctx.H - g.bottom, cols: columns(x, w, g.cols, g.gutter), g };
}
export const spanOf = (cols: Array<{ x: number; w: number }>, a: number, b = a) => ({ x: cols[a].x, w: cols[b].x + cols[b].w - cols[a].x });
/** Snap a y to the next baseline multiple measured from the top margin. */
export const snap = (y: number, G: Geo) => G.y + Math.ceil((y - G.y) / G.g.base - 1e-6) * G.g.base;

// ── Grounds, photos, rules ────────────────────────────────────────────────────
export const ground = (ctx: PublicationCtx, fill: string, o: { gradient?: Obj['gradient'] } = {}): Obj => rect(-BL, -BL, ctx.W + BL * 2, ctx.H + BL * 2, fill, { role: 'GROUND', label: 'Ground (runs into bleed)', gradient: o.gradient });

/** A photo well; any edge on the trim is extended into the bleed automatically. The hint stays inside the trim. */
export function photo(ctx: PublicationCtx, x: number, y: number, w: number, h: number, o: Parameters<typeof imageSlot>[4] = {}): Obj[] {
  const l = x <= 0 ? -BL : x, t = y <= 0 ? -BL : y, r = x + w >= ctx.W ? ctx.W + BL : x + w, b = y + h >= ctx.H ? ctx.H + BL : y + h;
  const slot = imageSlot(l, t, r - l, b - t, { label: 'Photograph', ...o, silent: true });
  if (!o.silent && Math.min(w, h) > 60) {
    const dark = o.tone === 'dark', ink = o.ink || (dark ? 'rgba(255,255,255,.55)' : 'rgba(20,16,24,.45)');
    const ix = Math.max(0, l) + 12, iw = Math.min(ctx.W, r) - ix - 12, iy = (Math.max(0, t) + Math.min(ctx.H, b)) / 2 - 5;
    slot.push(text(ix, iy, Math.max(40, iw), o.caption || 'Drop a photo', { size: 9, font: 'inter', weight: 700, color: ink, align: 'center', tracking: .14, transform: 'uppercase', rotation: o.rotation, label: 'Image slot hint', role: 'LABEL' }));
  }
  return slot;
}
export const rule = (x: number, y: number, w: number, color: string, weight = 1, label = 'Rule', dash?: number[]) => hr(x, y, w, color, weight, { label, dash });
export const vrule = (x: number, y: number, h: number, color: string, weight = 1, label = 'Vertical rule') => vr(x, y, h, color, weight, { label });

// ── Captions, labels ──────────────────────────────────────────────────────────
export interface CapStyle { font: FontKey; size?: number; color: string; creditColor?: string; creditFont?: FontKey; creditSize?: number; tracking?: number; transform?: TextOpts['transform']; italic?: boolean; weight?: number; leading?: number; align?: 'left' | 'right' | 'center' }
/** Caption + photographer credit, stacked. Returns [caption, credit?]. */
export function caption(x: number, y: number, w: number, cap: string, credit: string | null, s: CapStyle): Obj[] {
  const c = ptext(x, y, w, cap, { size: s.size ?? 8.5, font: s.font, color: s.color, tracking: s.tracking, transform: s.transform, italic: s.italic, weight: s.weight, leading: s.leading ?? 1.35, align: s.align, label: 'Caption', role: 'CAPTION' });
  const out = [c];
  if (credit) out.push(text(x, below(c, 3), w, credit, { size: s.creditSize ?? Math.max(7, (s.size ?? 8.5) - 1), font: s.creditFont ?? s.font, color: s.creditColor ?? alpha(s.color, .65), tracking: .1, transform: 'uppercase', weight: 600, align: s.align, label: 'Photo credit', role: 'CREDIT' }));
  return out;
}
/** Small-caps utility label (kickers, sections, issue slugs). */
export function label(x: number, y: number, w: number, value: string, font: FontKey, color: string, o: { size?: number; tracking?: number; weight?: number; align?: 'left' | 'right' | 'center'; role?: Role; name?: string; transform?: TextOpts['transform']; wrap?: boolean; opacity?: number } = {}): Obj {
  return text(x, y, w, value, { size: o.size ?? 8, font, weight: o.weight ?? 700, color, tracking: o.tracking ?? .16, transform: o.transform ?? 'uppercase', align: o.align, wrap: o.wrap ?? true, opacity: o.opacity, label: o.name ?? 'Label', role: o.role ?? 'LABEL' });
}

// ── Running head + folio ──────────────────────────────────────────────────────
export interface RunOpts { title: string; section: string; color: string; font: FontKey; numberFont?: FontKey; size?: number; numberSize?: number; tracking?: number; where?: 'top' | 'bottom'; y?: number; rule?: string; ruleWeight?: number; accent?: string; weight?: number; transform?: TextOpts['transform'] }
/** Page number at the outer edge, magazine name (verso) or section (recto) beside it. */
export function runHead(G: Geo, o: RunOpts): Obj[] {
  const size = o.size ?? 7.5, nsz = o.numberSize ?? size + 1.5;
  const y = o.y ?? (o.where === 'bottom' ? G.H - G.g.bottom + 26 : G.g.top - 30);
  const out: Obj[] = [];
  const num = text(G.verso ? G.x : G.right - 40, y - (nsz - size) * .5, 40, String(G.pageNo), { size: nsz, font: o.numberFont ?? o.font, weight: 800, color: o.accent ?? o.color, align: G.verso ? 'left' : 'right', wrap: false, label: 'Folio', role: 'FOLIO' });
  const lab = text(G.verso ? G.x + 34 : G.x, y, G.w - 34, G.verso ? o.title : o.section, { size, font: o.font, weight: o.weight ?? 700, color: o.color, tracking: o.tracking ?? .18, transform: o.transform ?? 'uppercase', align: G.verso ? 'left' : 'right', wrap: false, label: 'Running head', role: 'RUNNING_HEAD' });
  if (!G.verso) lab.w = G.w - 34;
  out.push(num, lab);
  if (o.rule) out.push(hr(G.x, o.where === 'bottom' ? y - 8 : y + size + 8, G.w, o.rule, o.ruleWeight ?? .75, { label: 'Running head rule' }));
  return out;
}

// ── Text flow ─────────────────────────────────────────────────────────────────
export interface BodyStyle { font: FontKey; size: number; lead: number; color: string; weight?: number; tracking?: number; italic?: boolean; /** first-line indent in px for paragraphs after the first; 0 = none */ indent?: number; /** px between paragraphs (0 with indent) */ gap?: number; label?: string; role?: Role }
export interface FlowFrame { x: number; y: number; w: number; b: number }
export interface FlowOpts { dropCap?: { lines: number; font: FontKey; color: string; weight?: number; italic?: boolean; scale?: number; pad?: number }; startY?: number[] }

/**
 * The node text estimator (telaText) under-measures some wide faces by 4–35%. In the browser the canvas measures true
 * metrics, so lines wrap correctly; in node (gallery, tests, SVG export) they overshoot the column. Wide faces are
 * therefore wrapped to w / k, so the proof and the app agree and nothing crosses a gutter. k < 1 faces are left alone.
 */
export const WIDTH_K: Record<string, number> = { inter: 1.04, workSans: 1.1, epilogue: 1.09, lexend: 1.07, spaceGrotesk: 1.07, libreBaskerville: 1.12, lora: 1.03, robotoSlab: 1.04, tenor: 1.07, bodoni: 1.04, cinzel: 1.23, archivoBlack: 1.21, yeseva: 1.12, sora: 1.1, syne: 1.1, unbounded: 1.3, jetbrains: 1.35, spaceMono: 1.38, courierPrime: 1.35, specialElite: 1.16, ibmPlexMono: 1.3, dmMono: 1.3, quicksand: 1.04, orbitron: 1.2, shrikhand: 1.16, permanentMarker: 1.12, rockSalt: 1.39, notoSansJp: 1.04, notoSerifJp: 1.1, karla: 1.02, nunito: 1.01, manrope: 1.02, bitter: 1.02, uncial: 1.25, limelight: 1.17 };
export const wk = (font: string, weight = 400) => { const k = WIDTH_K[font] ?? 1; return weight >= 600 ? k * 1.03 : k; };
const probe = (st: BodyStyle) => ({ fontSize: st.size, fontFamily: fontCss(st.font), fontWeight: st.weight ?? 400, fontStyle: st.italic ? 'italic' as const : undefined, letterSpacing: st.tracking });
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Frames from a column list: each column from y to bottom. */
export const colFrames = (cols: Array<{ x: number; w: number }>, y: number, b: number): FlowFrame[] => cols.map(c => ({ x: c.x, y, w: c.w, b }));

/**
 * Pour copy through frames in order. Paragraphs are separated by "\n". Lines sit
 * on `lead` px; orphans/widows are avoided; the drop cap claims `lines` lines of
 * the first frame. Returns text objects (role BODY) and what did not fit.
 */
export function flow(str: string, frames: FlowFrame[], st: BodyStyle, o: FlowOpts = {}): { objs: Obj[]; rest: string; fit: boolean } {
  const objs: Obj[] = [];
  let paras = str.split('\n').map(norm).filter(Boolean).map((t, i) => ({ t, fresh: true, first: i === 0 }));
  const pr = probe(st), lh = st.lead / st.size, role = st.role ?? 'BODY', lbl = st.label ?? 'Body copy';
  const mk = (x: number, y: number, w: number, lines: string[]) => rawText(x, y, w, lines.join(st.indent ? ' ' : ' '), { size: st.size, font: st.font, weight: st.weight, color: st.color, tracking: st.tracking, italic: st.italic, leading: lh, h: lines.length * st.lead, label: lbl, role });
  const k = wk(st.font, st.weight);
  frames.forEach((f0, fi) => {
    const f = { ...f0, w: f0.w / k };
    let cur = o.startY?.[fi] ?? f.y;
    if (fi === 0 && o.dropCap && paras.length) {
      const dc = o.dropCap, p0 = paras[0], cap = p0.t.charAt(0), rest = p0.t.slice(1);
      const capSize = Math.round(dc.lines * st.lead * (dc.scale ?? 1.08)), capW = Math.round(capSize * .66) + (dc.pad ?? 6);
      const lines = wrapLine(rest, f.w - capW, pr);
      const take = Math.min(dc.lines, lines.length);
      objs.push(rawText(f.x - 1, cur + st.size + (dc.lines - 1) * st.lead - capSize + 1, capW, cap, { size: capSize, font: dc.font, weight: dc.weight ?? 700, italic: dc.italic, color: dc.color, wrap: false, leading: 1, label: 'Drop cap', role: 'ORNAMENT' }));
      objs.push(mk(f.x + capW, cur, f.w - capW, lines.slice(0, take)));
      cur += take * st.lead;
      const left = lines.slice(take).join(' ');
      paras[0] = { t: left, fresh: false, first: false };
      if (!left) paras.shift();
    }
    while (paras.length) {
      const p = paras[0];
      if (!p.t) { paras.shift(); continue; }
      if (cur > f.y && p.fresh && (st.gap ?? 0) > 0) cur += st.gap!;
      const avail = Math.floor((f.b - cur + 1e-6) / st.lead);
      if (avail < 1) break;
      const ind = p.fresh && !p.first && st.indent ? st.indent : 0;
      let first: string | undefined, rest = p.t;
      let lines: string[];
      if (ind) { const l1 = wrapLine(p.t, f.w - ind, pr); first = l1[0]; rest = norm(p.t.slice(first.length)); lines = rest ? wrapLine(rest, f.w, pr) : []; }
      else lines = wrapLine(p.t, f.w, pr);
      const total = lines.length + (first !== undefined ? 1 : 0);
      let take = Math.min(total, avail);
      if (take < total) { if (total - take === 1 && take >= 3) take -= 1; if (take < 2 && p.fresh && total >= 2) break; }
      if (take < 1) break;
      let y0 = cur, n = take;
      if (first !== undefined) { objs.push(mk(f.x + ind, y0, f.w - ind, [first])); y0 += st.lead; n -= 1; }
      if (n > 0) objs.push(mk(f.x, y0, f.w, lines.slice(0, n)));
      cur += take * st.lead;
      if (take < total) { paras[0] = { t: lines.slice(n).join(' '), fresh: false, first: false }; break; }
      paras.shift();
    }
  });
  return { objs, rest: paras.map(p => p.t).join('\n'), fit: paras.length === 0 };
}

// ── Pull quote ────────────────────────────────────────────────────────────────
export interface PullStyle { font: FontKey; size: number; color: string; weight?: number; italic?: boolean; leading?: number; rule?: 'top' | 'bottom' | 'both' | 'left' | 'none'; ruleColor?: string; ruleWeight?: number; attribFont?: FontKey; attribColor?: string; align?: 'left' | 'center' | 'right'; tracking?: number; transform?: TextOpts['transform']; pad?: number }
export function pullQuote(x: number, y: number, w: number, quote: string, attrib: string | null, s: PullStyle): Obj[] {
  const out: Obj[] = [], pad = s.pad ?? 10, rc = s.ruleColor ?? s.color, rw = s.ruleWeight ?? 1.25;
  const lx = s.rule === 'left' ? x + 12 : x;
  const q = ptext(lx, y + (s.rule === 'top' || s.rule === 'both' ? pad + 4 : 0), s.rule === 'left' ? w - 12 : w, quote, { size: s.size, font: s.font, weight: s.weight ?? 400, italic: s.italic, color: s.color, leading: s.leading ?? 1.2, align: s.align, tracking: s.tracking, transform: s.transform, label: 'Pull quote', role: 'PULLQUOTE' });
  out.push(q);
  let bottom = below(q, 0);
  if (attrib) { const a = text(lx, bottom + 7, s.rule === 'left' ? w - 12 : w, attrib, { size: Math.max(7.5, Math.round(s.size * .3)), font: s.attribFont ?? 'inter', weight: 700, color: s.attribColor ?? alpha(s.color, .72), tracking: .14, transform: 'uppercase', align: s.align, label: 'Quote attribution', role: 'CREDIT' }); out.push(a); bottom = below(a, 0); }
  if (s.rule === 'top' || s.rule === 'both') out.push(hr(x, y, w, rc, rw, { label: 'Pull quote rule' }));
  if (s.rule === 'bottom' || s.rule === 'both') out.push(hr(x, bottom + pad, w, rc, rw, { label: 'Pull quote rule' }));
  if (s.rule === 'left') out.push(vr(x, y + 2, bottom - y, rc, rw * 2.2, { label: 'Pull quote rule' }));
  return out;
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
export interface SidebarStyle { fill: string; titleFont: FontKey; titleColor: string; bodyFont: FontKey; bodyColor: string; size?: number; lead?: number; titleSize?: number; pad?: number; rule?: string; stroke?: string; rx?: number; accent?: string; numbered?: boolean; tracking?: number }
/** A boxed sidebar: title, then items on a baseline. Returns [panel, …text]; panel height is measured from content. */
export function sidebar(x: number, y: number, w: number, title: string, items: string[], s: SidebarStyle): Obj[] {
  const pad = s.pad ?? 12, size = s.size ?? 9, lead = s.lead ?? 13;
  const t = text(x + pad, y + pad, w - pad * 2, title, { size: s.titleSize ?? 10, font: s.titleFont, weight: 800, color: s.titleColor, tracking: s.tracking ?? .14, transform: 'uppercase', label: 'Sidebar title', role: 'KICKER' });
  const out: Obj[] = [t]; let cy = below(t, 8);
  if (s.rule) { out.push(hr(x + pad, cy, w - pad * 2, s.rule, .75, { label: 'Sidebar rule' })); cy += 8; }
  items.forEach((it, i) => {
    const o = ptext(x + pad + (s.numbered ? 16 : 0), cy, w - pad * 2 - (s.numbered ? 16 : 0), it, { size, font: s.bodyFont, color: s.bodyColor, leading: lead / size, label: 'Sidebar item', role: 'SIDEBAR' });
    if (s.numbered) out.push(text(x + pad, cy, 14, String(i + 1), { size, font: s.titleFont, weight: 800, color: s.accent ?? s.titleColor, wrap: false, label: 'Sidebar number', role: 'LABEL' }));
    out.push(o); cy = below(o, 6);
  });
  const h = cy - y + pad - 6;
  return [rect(x, y, w, h, s.fill, { rx: s.rx ?? 0, stroke: s.stroke, strokeWidth: s.stroke ? 1 : 0, label: 'Sidebar panel', role: 'SIDEBAR' }), ...out];
}
/** Bottom y of an object stack. */
export const bottomOf = (objs: Obj[]) => Math.max(...objs.map(o => o.y + o.h));

// ── Barcode plate ─────────────────────────────────────────────────────────────
export function barcodeBox(x: number, y: number, w: number, h: number, o: { plate: string; ink: string; seed: number; code?: string; note?: string; font?: FontKey; rx?: number }): Obj[] {
  const r = orn.rng(o.seed), out: Obj[] = [rect(x, y, w, h, o.plate, { rx: o.rx ?? 0, label: 'Barcode box', role: 'ORNAMENT' })];
  let cx = x + 8; const top = y + 7, bh = h - (o.note ? 24 : 18);
  while (cx < x + w - 10) { const t = 1 + Math.floor(r() * 3); out.push(rect(cx, top, t, bh, o.ink, { label: 'Barcode bar' })); cx += t + 1 + Math.floor(r() * 3); }
  out.push(text(x, y + h - (o.note ? 20 : 14), w, o.code ?? '0 71896 02140 6', { size: 7, font: o.font ?? 'ibmPlexMono', weight: 600, color: o.ink, align: 'center', wrap: false, tracking: .06, label: 'Barcode digits', role: 'CAPTION' }));
  if (o.note) out.push(text(x, y + h - 11, w, o.note, { size: 7, font: o.font ?? 'ibmPlexMono', weight: 500, color: o.ink, align: 'center', wrap: false, tracking: .1, label: 'Barcode note', role: 'CAPTION' }));
  return out;
}

// ── Advertising frame ─────────────────────────────────────────────────────────
/** An ad slot: tone field, dashed trim and live-area guides, and a spec line in the margin. */
export function adSlot(x: number, y: number, w: number, h: number, o: { fill: string; ink: string; accent: string; font: FontKey; spec: string; kind?: string; bleed?: boolean; live?: number; ctx?: PublicationCtx }): Obj[] {
  const l = o.bleed && o.ctx && x <= 0 ? -BL : x, t = o.bleed && o.ctx && y <= 0 ? -BL : y;
  const r = o.bleed && o.ctx && x + w >= o.ctx.W ? o.ctx.W + BL : x + w, b = o.bleed && o.ctx && y + h >= o.ctx.H ? o.ctx.H + BL : y + h;
  const live = o.live ?? 18;
  const guides: Obj[] = [];
  if (o.bleed && o.ctx) {
    const c = o.ctx, tick = (x1: number, y1: number, x2: number, y2: number) => line(x1, y1, x2, y2, o.accent, .75, { label: 'Trim tick' });
    guides.push(rect(-BL, -BL, c.W + BL * 2, c.H + BL * 2, 'none', { stroke: o.accent, strokeWidth: .75, dash: [2, 3], label: 'Bleed guide (0.125 in)', role: 'RULE' }), rect(0, 0, c.W, c.H, 'none', { stroke: o.accent, strokeWidth: .75, label: 'Trim guide', role: 'RULE' }));
    for (const [cx, cy, sx, sy] of [[0, 0, -1, -1], [c.W, 0, 1, -1], [0, c.H, -1, 1], [c.W, c.H, 1, 1]] as const) guides.push(tick(cx, cy, cx + sx * BL, cy), tick(cx, cy, cx, cy + sy * BL));
  }
  return [
    rect(l, t, r - l, b - t, o.fill, { label: 'Ad slot (live art)', role: 'AD_SLOT' }),
    rect(x + live, y + live, w - live * 2, h - live * 2, 'none', { stroke: o.accent, strokeWidth: 1, dash: [5, 4], label: 'Live area guide', role: 'RULE' }),
    text(x + live + 10, y + h / 2 - 10, w - (live + 10) * 2, o.kind ?? 'Advertisement', { size: 11, font: o.font, weight: 800, color: alpha(o.ink, .6), tracking: .24, transform: 'uppercase', align: 'center', label: 'Ad slot hint', role: 'LABEL' }),
    ...guides,
    text(x + live + 10, y + h / 2 + 8, w - (live + 10) * 2, o.spec, { size: 8, font: o.font, weight: 500, color: alpha(o.ink, .55), align: 'center', tracking: .06, label: 'Ad spec', role: 'CAPTION' }),
  ];
}

export { rect, hr, vr, below, imageSlot, columns, mix, alpha, orn };
export type { PublicationCtx };

// ── Small shared helpers ──────────────────────────────────────────────────────
import type { TelaGradientPaint } from '../../../../types';
export const fade = (angle: number, color: string, from: number, to: number): TelaGradientPaint => ({ kind: 'LINEAR', angle, stops: [{ offset: 0, color, opacity: from }, { offset: 1, color, opacity: to }] });
/** Print slug: tiny text at the edge of the live area — issue, folio-less pages. */
export const slug = (x: number, y: number, w: number, value: string, font: FontKey, color: string, o: { align?: 'left' | 'right' | 'center'; size?: number; opacity?: number } = {}): Obj => text(x, y, w, value, { size: o.size ?? 7, font, weight: 600, color, tracking: .18, transform: 'uppercase', align: o.align, opacity: o.opacity, wrap: false, label: 'Issue slug', role: 'LABEL' });
/** Dev-only: report how much of a copy pool a flow consumed (set MAG_DEBUG=1). */
export function warnFlow(tag: string, r: { rest: string; fit: boolean }): void {
  const dbg = typeof process !== 'undefined' && (process as unknown as { env?: Record<string, string> }).env?.MAG_DEBUG;
  if (dbg && !r.fit) console.log(`  [mag] ${tag}: ${r.rest.length} chars did not fit`);
}

/** Pour copy so every frame ends at the same height (balanced columns): the shortest frame height that still fits all the copy. */
export function balance(str: string, frames: FlowFrame[], st: BodyStyle, o: FlowOpts = {}): { objs: Obj[]; rest: string; fit: boolean } {
  const base = Math.min(...frames.map(f => f.y)), maxH = Math.max(...frames.map(f => f.b - base));
  for (let h = st.lead * 3; h <= maxH; h += st.lead) {
    const r = flow(str, frames.map(f => ({ ...f, b: Math.min(f.b, base + h) })), st, o);
    if (r.fit) return r;
  }
  return flow(str, frames, st, o);
}

// ── Charts (rect / path built, so every mark stays an editable object) ───────
import { path as pathObj } from '../../templateKit';
export interface ChartStyle { font: FontKey; ink: string; accent: string; muted?: string; size?: number; grid?: boolean }
/** Vertical bar chart. data = [label, value]; highlight index gets the accent colour. */
export function barChart(x: number, y: number, w: number, h: number, data: Array<[string, number]>, s: ChartStyle & { max?: number; highlight?: number; unit?: string; barColor?: string; gap?: number; ticks?: number }): Obj[] {
  const out: Obj[] = [], size = s.size ?? 7.5, max = s.max ?? Math.max(...data.map(d => d[1])), top = y + 14, base = y + h - 16, ph = base - top;
  const ticks = s.ticks ?? 3;
  if (s.grid !== false) for (let i = 0; i <= ticks; i++) { const gy = base - ph * i / ticks; out.push(hr(x, gy, w, alpha(s.ink, i === 0 ? .8 : .14), i === 0 ? 1 : .6, { label: 'Chart gridline' })); if (i) out.push(text(x, gy - 9, 40, String(Math.round(max * i / ticks)) + (i === ticks ? (s.unit ?? '') : ''), { size: size - .5, font: s.font, color: alpha(s.ink, .55), wrap: false, label: 'Axis value', role: 'CAPTION' })); }
  const gap = s.gap ?? 8, bw = (w - gap * (data.length - 1)) / data.length;
  data.forEach(([k, v], i) => {
    const bh = Math.max(1, ph * v / max), bx = x + i * (bw + gap);
    out.push(rect(bx, base - bh, bw, bh, i === s.highlight ? s.accent : (s.barColor ?? s.ink), { label: `Bar: ${k}`, role: 'ORNAMENT' }));
    out.push(text(bx - 6, base - bh - size - 4, bw + 12, String(v), { size, font: s.font, weight: 700, color: i === s.highlight ? s.accent : s.ink, align: 'center', wrap: false, label: 'Bar value', role: 'CAPTION' }));
    out.push(text(bx - 6, base + 5, bw + 12, k, { size: size - .5, font: s.font, color: alpha(s.ink, .7), align: 'center', wrap: false, label: 'Bar label', role: 'CAPTION' }));
  });
  return out;
}
/** Line chart through normalised points (0..1 each axis, y up) with end dot + value label. */
export function lineChart(x: number, y: number, w: number, h: number, pts: Array<[number, number]>, s: ChartStyle & { endLabel?: string; fill?: string; xlabels?: string[]; weight?: number }): Obj[] {
  const out: Obj[] = [], size = s.size ?? 7.5, top = y + 6, base = y + h - 16, ph = base - top;
  for (let i = 0; i <= 3; i++) out.push(hr(x, base - ph * i / 3, w, alpha(s.ink, i === 0 ? .8 : .14), i === 0 ? 1 : .6, { label: 'Chart gridline' }));
  const P = pts.map(([px, py]) => [px * 100, (1 - py) * 100]);
  const d = P.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`).join(' ');
  if (s.fill) out.push(pathObj(x, top, w, ph, `${d} L${P[P.length - 1][0]} 100 L${P[0][0]} 100 Z`, s.fill, { label: 'Chart area' }));
  out.push(pathObj(x, top, w, ph, d, 'none', { stroke: s.accent, strokeWidth: s.weight ?? 2, open: true, label: 'Chart line' }));
  const [lx, ly] = pts[pts.length - 1]; const ex = x + lx * w, ey = top + (1 - ly) * ph;
  out.push(circle(ex, ey, 3.5, s.accent, { label: 'Chart end dot' }));
  if (s.endLabel) out.push(text(ex - 80, ey - 17, 80, s.endLabel, { size: size + 1, font: s.font, weight: 800, color: s.accent, align: 'right', wrap: false, label: 'Chart end value', role: 'CAPTION' }));
  if (s.xlabels) s.xlabels.forEach((l, i) => out.push(text(x + (s.xlabels!.length === 1 ? 0 : i * w / (s.xlabels!.length - 1)) - 20, base + 5, 40, l, { size: size - .5, font: s.font, color: alpha(s.ink, .65), align: i === 0 ? 'left' : i === s.xlabels!.length - 1 ? 'right' : 'center', wrap: false, label: 'Axis label', role: 'CAPTION' })));
  return out;
}
/** Tiny inline sparkline of n bars. */
export function sparkBars(x: number, y: number, w: number, h: number, vals: number[], color: string, hi?: string): Obj[] {
  const bw = (w - (vals.length - 1) * 2) / vals.length, mx = Math.max(...vals);
  return vals.map((v, i) => rect(x + i * (bw + 2), y + h - h * v / mx, bw, h * v / mx, i === vals.length - 1 && hi ? hi : color, { label: 'Spark bar' }));
}
import { circle } from '../../templateKit';

/**
 * text() for the magazines: wrapped text is laid out to w / k (see WIDTH_K) so wide faces stay inside their column in
 * every renderer; unwrapped single-line labels (wrap: false) pass through untouched.
 */
export function text(x: number, y: number, w: number, value: string, o: TextOpts): Obj {
  if (o.wrap === false || !o.font) return rawText(x, y, w, value, o);
  const k = wk(String(o.font), o.weight), w2 = w / k, dx = o.align === 'right' ? w - w2 : o.align === 'center' ? (w - w2) / 2 : 0;
  return rawText(x + dx, y, w2, value, o);
}
export const ptext = text;
