// templatesData — Chart & data slides: animated bars, lines, donuts, counters,
// progress, comparisons, timelines, icon arrays and composition bars.
//
// Designers compute every mark and label to scale (real axes, nice ticks,
// labels that name values the chart reaches) and hand the animated marks to
// live drawers (dataDrawers.ts). Words people read — titles, axis and
// category labels, legends — are ordinary TEXT objects, so they enter with
// the theme and never move afterwards.
import { rect, text, line, type TextOpts } from '../../tela/templateKit';
import { box, fitText, Stack, bbox, maxLineWidth, type Box } from './layout';
import { typeset } from './themes';
import { prelude } from './parts';
import { measureText } from '../../tela/telaText';
import { pathPx, dPoly } from './motifKit';
import './dataDrawers';
import './liveCaptionDrawer';
import type { FontSpec, TextSpec, BarMark, BarsProps, LineProps, LineSeries, DonutProps, KpiProps, GoalProps, DumbbellProps, TimelineProps, PictoProps, StackProps } from './dataDrawers';
import { chartStyle, markColor, onPanel, blend, contrast } from './chartStyle';
import { parseData, parseMilestones, parseRatio, formatValue, formatDelta, niceScale, stepDecimals, numberIn, pick, type DataSet, type DataRow, type NumFormat } from './dataParse';
import type { DesignCtx, FieldDef, SlideDesigner, SlideObj, SlideTemplateDef } from './types';

const X = (d: DesignCtx) => ({ ...d, u: d.L.u, S: d.L.safe, ty: typeset(d.th), m: d.th.motif, c: d.th.c, s: chartStyle(d.th) });
type DX = ReturnType<typeof X>;

// ── small helpers ───────────────────────────────────────────────────────────
function fontOf(o: TextOpts): FontSpec {
  const p = text(0, 0, 100, '0', o);
  return { family: p.fontFamily || 'Inter, sans-serif', weight: p.fontWeight || 400, italic: p.fontStyle === 'italic', track: p.letterSpacing || 0, upper: p.textTransform === 'uppercase' };
}
function measureSpec(str: string, f: FontSpec, size: number): number {
  return measureText(f.upper ? str.toUpperCase() : str, { fontSize: size, fontFamily: f.family, fontWeight: f.weight, fontStyle: f.italic ? 'italic' : undefined, letterSpacing: f.track });
}
const spec = (x: number, y: number, size: number, font: FontSpec, color: string, align: TextSpec['align'], maxW: number): TextSpec => ({ x, y, size, font, color, align, maxW });
/** The live chart box: a fill-less RECT the drawer paints into. */
function liveBox(b: Box, drawer: string, props: object, label = 'Chart'): SlideObj {
  const o = rect(b.x, b.y, Math.max(1, b.w), Math.max(1, b.h), 'none', { label }) as SlideObj;
  o.live = { drawer, props: props as Record<string, unknown> };
  return o;
}
const lineW = (u: number, k: number) => Math.max(1, u * k);
/** Value font: display numerals or the label face, per chart style. */
const valueFont = (x: DX) => fontOf(x.s.valueFace === 'display' ? x.ty.display(10, { transform: 'none', italic: x.th.t.displayItalic }) : x.ty.label(10));

function fmtOf(f: Record<string, string>, ds: DataSet | null): NumFormat {
  const pre = (f.prefix ?? '').trim(), suf = f.suffix ?? '';
  return { prefix: pre || ds?.prefix || '', suffix: suf.trim() ? (suf.startsWith(' ') || /^[%]/.test(suf.trim()) ? suf : ' ' + suf.trim()).replace(/^ %/, '%') : ds?.suffix === '%' ? '%' : '', decimals: ds?.decimals ?? 0 };
}
const sorted = (rows: DataRow[], mode: 'none' | 'desc' | 'asc') => mode === 'none' ? rows : [...rows].sort((a, b) => mode === 'desc' ? (b.values[0] ?? 0) - (a.values[0] ?? 0) : (a.values[0] ?? 0) - (b.values[0] ?? 0));
const SORT = { desc: /large|desc|high|most|rank/, asc: /small|asc|low|least/, none: /entered|none|as / };

/** Placeholder rows (drawn ghosted) when the data field is empty. */
const GHOST: DataRow[] = [3, 5, 4, 7, 6, 8].map((v, i) => ({ label: '', values: [v, v * .8], raw: `#${i}` }));
function hint(x: DX, b: Box, msg = 'Add your numbers — one “Label, value” per line'): SlideObj {
  const t = fitText(b.x + b.w * .1, 0, b.w * .8, msg, x.ty.body(x.u * 1.8, { align: 'center', color: x.c.muted, label: 'Data hint', role: 'CAPTION' }), b.h * .4, x.u * 1.1);
  t.y = b.cy - t.h / 2;
  return t;
}

// ── page: header + plot + source note ───────────────────────────────────────
interface Page { out: SlideObj[]; plot: Box }
function page(d: DesignCtx, o: { side?: boolean; titleScale?: number } = {}): Page {
  const x = X(d), { L, f, u, S, ty, m, c } = x;
  const out = prelude(d, false);
  const srcO = f.source ? fitText(0, 0, 10, f.source, ty.label(u * .95, { color: c.muted, label: 'Source', role: 'CAPTION' }), u * 2.6, u * .95) : null;
  const ts = o.titleScale ?? 1;
  if (L.stretched && o.side !== false) {
    const hw = Math.min(S.w * (L.cls === 'panorama' ? .23 : .3), u * 60);
    const src = srcO ? fitText(S.x, 0, hw, f.source, ty.label(u * .95, { color: c.muted, label: 'Source', role: 'CAPTION' }), u * 2.6, u * .95) : null;
    const avail = S.h - (src ? src.h + u * 2 : 0);
    const st = new Stack();
    if (f.kicker) st.add(text(S.x, 0, hw, f.kicker, ty.label(u * 1.5)));
    if (f.title) st.add(fitText(S.x, 0, hw, f.title, ty.display(u * 5.4 * ts), avail * .46), u * 1.1);
    st.add(m.divider(S.x, 0, hw, 'left', L).objs, u * 2);
    if (f.subtitle) st.add(fitText(S.x, 0, hw, f.subtitle, ty.accent(u * 2.2, { color: c.muted, label: 'Subtitle' }), avail * .24, u * 1.1), u * 1.8);
    out.push(...st.centre(S.y, avail));
    if (src) { src.y = S.bottom - src.h; out.push(src); }
    const px = S.x + hw + u * 6;
    return { out, plot: box(px, S.y, S.right - px, S.h) };
  }
  const st = new Stack();
  if (f.kicker) st.add(text(S.x, 0, S.w, f.kicker, ty.label(u * 1.5)));
  if (f.title) st.add(fitText(S.x, 0, S.w, f.title, ty.display(u * (L.vertical ? 5.6 : 5) * ts), S.h * (L.vertical ? .13 : .17)), u * .9);
  if (f.subtitle) st.add(fitText(S.x, 0, S.w, f.subtitle, ty.accent(u * 2.1, { color: c.muted, label: 'Subtitle' }), S.h * .09, u * 1.1), u * 1);
  const placed = st.place(S.y);
  out.push(...placed);
  const top = placed.length ? bbox(placed).bottom + u * 3.2 : S.y;
  let bottom = S.bottom;
  if (srcO) {
    const src = fitText(S.x, 0, S.w, f.source, ty.label(u * .95, { color: c.muted, label: 'Source', role: 'CAPTION' }), u * 2.6, u * .95);
    src.y = S.bottom - src.h; out.push(src); bottom = src.y - u * 2;
  }
  return { out, plot: box(S.x, top, S.w, Math.max(u * 8, bottom - top)) };
}

/** Inline legend (swatch + name), wrapping. */
function legend(x: DX, x0: number, y: number, w: number, items: Array<{ name: string; color: string; dash?: boolean }>, align: 'left' | 'right' = 'left'): { objs: SlideObj[]; h: number } {
  const { u, ty, c, s } = x;
  const size = u * 1.3, sw = size * 1.05, gap = u * .7, sep = u * 2.4;
  const objs: SlideObj[] = [];
  const cells = items.map(it => {
    const t = text(0, 0, 4000, it.name, ty.label(size, { color: c.ink, wrap: false, label: 'Legend', role: 'CAPTION' }));
    const tw = Math.min(w - sw - gap, maxLineWidth(t));
    return { it, t, tw, w: sw + gap + tw };
  });
  const rows: Array<typeof cells> = [[]];
  let rw = 0;
  for (const cl of cells) { if (rows[rows.length - 1].length && rw + sep + cl.w > w) { rows.push([]); rw = 0; } rw += (rows[rows.length - 1].length ? sep : 0) + cl.w; rows[rows.length - 1].push(cl); }
  const th = Math.max(size, cells[0]?.t.h || size), rowH = th + u * .8;
  rows.forEach((r, ri) => {
    const tot = r.reduce((a, cl, i) => a + cl.w + (i ? sep : 0), 0);
    let cx = align === 'right' ? x0 + w - tot : x0;
    const yy = y + ri * rowH;
    for (const cl of r) {
      const sy = yy + (th - sw) / 2;
      if (cl.it.dash) objs.push(line(cx, sy + sw / 2, cx + sw, sy + sw / 2, cl.it.color, lineW(u, .3), { label: 'Legend key', dash: [u * .4, u * .3] }) as SlideObj);
      else objs.push(rect(cx, sy, sw, sw, cl.it.color, { rx: s.round >= .3 ? sw / 2 : s.round * sw, label: 'Legend key' }) as SlideObj);
      cl.t.x = cx + sw + gap; cl.t.y = yy; cl.t.w = cl.tw + 2;
      objs.push(cl.t);
      cx += cl.w + sep;
    }
  });
  return { objs, h: rows.length * rowH - u * .8 };
}

/** Category label set that fits slots of width `slot`; thins to every k-th when crowded. */
function categoryLabels(x: DX, labels: string[], centres: number[], slot: number, y: number, maxH: number, bounds?: [number, number]): SlideObj[] {
  const { u, ty, c } = x;
  const short = labels.every(l => l.length <= 10);
  const mk = (str: string, cx: number, w: number, size: number) => text(cx - w / 2, y, w, str, short
    ? ty.label(size, { align: 'center', color: c.muted, label: 'Category', role: 'CAPTION' })
    : ty.body(size * 1.12, { align: 'center', color: c.ink, weight: Math.max(500, x.th.t.textWeight), label: 'Category', role: 'CAPTION' }));
  for (const k of [1, 2, 3, 4, 6, 12]) {
    const w = slot * k - u * .5;
    for (let size = u * 1.35; size >= u * .82; size *= .9) {
      const objs: SlideObj[] = [];
      let ok = true;
      for (let i = 0; i < labels.length; i++) {
        if (k > 1 && i % k !== 0 && i !== labels.length - 1) continue;
        if (k > 1 && i === labels.length - 1 && i % k !== 0 && i % k < k * .6) continue; // last would collide with the previous kept one
        const o = mk(labels[i], centres[i], Math.max(u * 2, w), size);
        if (maxLineWidth(o) > o.w + 1 || o.h > maxH || (o.fontSize || 0) < u * .92) { ok = false; break; }
        if (bounds) { // tighten to the words, then keep inside the plot
          const need = Math.min(o.w, maxLineWidth(o) + 2);
          o.x = Math.max(bounds[0], Math.min(bounds[1] - need, centres[i] - need / 2)); o.w = need;
        }
        objs.push(o);
      }
      if (ok) return objs;
    }
  }
  return [];
}

// ── bar engine (columns, rows, grouped, ranked) ─────────────────────────────
interface BarOpts { orient: 'v' | 'h'; series: number; values: 'all' | 'hi' | 'none'; hiMode: 'max' | 'last' | 'none'; ranked?: boolean; names?: string[]; ghost?: boolean }
function barChart(x: DX, plot: Box, rows0: DataRow[], fmt: NumFormat, o: BarOpts): SlideObj[] {
  const { u, ty, c, s, L } = x;
  const out: SlideObj[] = [];
  const ns = Math.max(1, Math.min(2, o.series));
  let top = plot.y;
  if (ns > 1 && !o.ghost) {
    const lg = legend(x, plot.x, top, plot.w, [{ name: o.names?.[0] || 'This year', color: s.hi }, { name: o.names?.[1] || 'Last year', color: s.second }], 'right');
    out.push(...lg.objs); top += lg.h + u * 1.6;
  }
  // Rows the frame can hold legibly.
  const maxRows = o.orient === 'h' ? Math.max(2, Math.floor((plot.bottom - top) / (u * (ns > 1 ? 3.2 : 2.3)))) : Math.max(2, Math.floor(plot.w / (u * (ns > 1 ? 4.6 : 3))));
  const rows = rows0.slice(0, maxRows);
  const n = rows.length;
  const v0 = rows.map(r => r.values[0] ?? 0);
  const hiIdx = o.hiMode === 'none' ? -1 : o.hiMode === 'last' ? n - 1 : v0.indexOf(Math.max(...v0));
  const colorOf = (i: number, si: number) => si > 0 ? s.second : ns > 1 ? s.hi
    : s.mono ? markColor(s, i, hiIdx, false)
      : s.flavor === 'geo' ? s.series[i % s.series.length]
        : hiIdx < 0 || i === hiIdx ? s.hi : blend(s.hi, x.c.ground, x.th.dark ? .42 : .38);
  const vf = valueFont(x);
  const bars: BarMark[] = [];
  const allV = rows.flatMap(r => r.values.slice(0, ns));
  const showVal = (i: number) => !o.ghost && (o.values === 'all' || (o.values === 'hi' && i === hiIdx));

  if (o.orient === 'v') {
    const sc = niceScale(Math.min(0, ...allV), Math.max(0, ...allV), (plot.bottom - top) > u * 30 ? 5 : 4);
    const tf = ty.label(u * 1.1, { color: c.muted, align: 'right', wrap: false, label: 'Axis tick', role: 'CAPTION' });
    const tickStr = sc.ticks.map(v => formatValue(v, { ...fmt, decimals: stepDecimals(sc.step), compact: true }));
    const tickObjs = o.ghost ? [] : tickStr.map(t => text(0, 0, 2000, t, tf));
    const gw = o.ghost ? 0 : Math.max(...tickObjs.map(maxLineWidth)) + u * 1.2;
    const x0 = plot.x + gw, pw = plot.right - x0, slot = pw / n;
    const centres = rows.map((_, i) => x0 + slot * (i + .5));
    const labs = o.ghost ? [] : categoryLabels(x, rows.map(r => r.label), centres, slot, 0, u * 3.4, [x0, plot.right]);
    const labH = labs.length ? Math.max(...labs.map(l => l.h)) : 0;
    const baseY = plot.bottom - labH - (labs.length ? u * 1 : 0);
    for (const l of labs) l.y = baseY + u * 1;
    // value labels: size to the slot
    let vsize = Math.min(u * 1.9, slot * .5);
    const finals = rows.map(r => r.values.slice(0, ns).map(v => formatValue(v, fmt)));
    const subW = ns > 1 ? slot * .86 / ns : slot * .96;
    const widest = Math.max(...finals.flat().map(t => measureSpec(t, vf, vsize)));
    if (widest > subW) vsize = Math.max(u * 1.02, vsize * subW / widest);
    const valuesFit = Math.max(...finals.flat().map(t => measureSpec(t, vf, vsize))) <= subW + 1;
    const headroom = o.values === 'none' ? u : vsize * 1.7;
    const yTop = top + headroom;
    const Y = (v: number) => baseY - (v - sc.lo) / (sc.hi - sc.lo || 1) * (baseY - yTop);
    // grid + ticks
    if (!o.ghost) sc.ticks.forEach((tv, i) => {
      const yy = Y(tv);
      if (tv !== 0) out.push(line(x0, yy, plot.right, yy, s.grid, lineW(u, s.gridW), { label: 'Gridline', dash: s.gridDash?.map(k => k * u * .4) }) as SlideObj);
      const t = tickObjs[i]; t.x = plot.x; t.w = gw - u * 1.2; t.y = yy - (t.fontSize || u) * .62;
      out.push(t);
    });
    const zeroY = Y(0);
    out.push(line(x0, zeroY, plot.right, zeroY, s.axis, lineW(u, s.axisW), { label: 'Axis' }) as SlideObj);
    const bw = Math.min(slot * (ns > 1 ? .8 : .62), u * (ns > 1 ? 15 : 11));
    rows.forEach((r, i) => {
      for (let si = 0; si < ns; si++) {
        const v = r.values[si] ?? 0;
        const sub = ns > 1 ? (bw - u * .3) / ns : bw;
        const bx = centres[i] - bw / 2 + si * (sub + (ns > 1 ? u * .3 : 0));
        const yv = Y(v), neg = v < 0;
        const lab = showVal(i) && valuesFit && (ns === 1 || o.values === 'all') ? spec(bx + sub / 2, neg ? yv + vsize * .45 : yv - vsize * 1.45, vsize, vf, si > 0 ? c.muted : s.valueInk, 'center', ns > 1 ? sub + u * .3 : slot * .96) : null;
        bars.push({ x: bx, y: Math.min(yv, zeroY), w: sub, h: Math.abs(zeroY - yv), from: neg ? 't' : 'b', c: colorOf(i, si), i: i * ns + si, hi: i === hiIdx && si === 0, v, label: lab });
      }
    });
    out.push(liveBox(box(x0, top, pw, baseY - top + u * .5), 'data.bars', { bars, fmt, ghost: o.ghost, n: n * ns } satisfies BarsProps));
    out.push(...labs);
    return out;
  }

  // horizontal rows (ranked / long labels / vertical screens)
  const avail = plot.bottom - top, rowH = avail / n;
  const thick = Math.min(rowH * (ns > 1 ? .78 : .58), u * (ns > 1 ? 6 : 5));
  const lsize = Math.max(u * .95, Math.min(u * 2.4, rowH * .4));
  const lf = ty.body(lsize, { weight: Math.max(500, x.th.t.textWeight), color: c.ink, label: 'Category', role: 'CAPTION' });
  let vsize = Math.max(u * 1.05, Math.min(u * 2.6, rowH * .42));
  const finals = rows.map(r => r.values.slice(0, ns).map(v => formatValue(v, fmt)));
  const rankF = fontOf(ty.display(10, { transform: 'none' }));
  const rsize = Math.min(rowH * .5, u * 3.2);
  const rankStr = (i: number) => { const nm = x.m.numeral(String(i + 1)); return /^\d$/.test(nm) ? nm.padStart(2, '0') : nm; };
  const rw = o.ranked ? Math.max(...rows.map((_, i) => measureSpec(rankStr(i), rankF, rsize))) + u * 1.6 : 0;
  let vw = Math.max(...finals.flat().map(t => measureSpec(t, vf, vsize))) + u * 1.8;
  const lwMax = plot.w * (L.vertical ? .36 : .3);
  const lws = rows.map(r => maxLineWidth(text(0, 0, 4000, r.label, { ...lf, wrap: false })));
  const lw = o.ghost ? 0 : Math.min(lwMax, Math.max(...lws) + u * .4);
  if (vw > plot.w * .24) { vsize *= plot.w * .24 / vw; vw = plot.w * .24; }
  const bx0 = plot.x + rw + lw + (o.ghost ? 0 : u * 1.4), bwMax = Math.max(u * 6, plot.right - vw - bx0);
  const vmax = Math.max(1e-9, ...allV.map(v => Math.max(0, v)));
  const endGap = u * .8 + (s.slab ? s.slab.dx * u : 0) + (s.outline ? s.outline.w * u : 0) + (s.misreg ? s.misreg.dx * u : 0);
  // faint track lines + labels
  rows.forEach((r, i) => {
    const cy = top + rowH * (i + .5);
    if (!o.ghost) {
      const lo = fitText(plot.x + rw, 0, lw, r.label, { ...lf, align: o.ranked ? 'left' : 'right' }, rowH * .92, u * .95);
      lo.y = cy - lo.h / 2 - (lo.fontSize || 0) * .06;
      out.push(lo);
      if (o.ranked) {
        const no = text(plot.x, 0, rw - u * .8, rankStr(i), ty.display(rsize, { transform: 'none', color: i === 0 ? s.hi : c.muted, wrap: false, label: 'Rank', role: 'CAPTION' }));
        if (maxLineWidth(no) <= no.w + 1) { no.y = cy - no.h / 2; out.push(no); }
      }
    }
    for (let si = 0; si < ns; si++) {
      const v = Math.max(0, r.values[si] ?? 0);
      const sub = ns > 1 ? (thick - u * .3) / ns : thick;
      const by = cy - thick / 2 + si * (sub + (ns > 1 ? u * .3 : 0));
      const w = v / vmax * bwMax;
      const sv = showVal(i) && (ns === 1 || o.values === 'all');
      bars.push({ x: bx0, y: by, w, h: sub, from: 'l', c: colorOf(i, si), i: i * ns + si, hi: i === hiIdx && si === 0, v,
        label: sv ? spec(bx0 + w + endGap, by + sub / 2 - Math.min(vsize, sub * (ns > 1 ? 1.1 : 1.6)) / 2, Math.min(vsize, sub * (ns > 1 ? 1.1 : 1.6)), vf, si > 0 ? c.muted : s.valueInk, 'left', vw) : null });
    }
  });
  out.push(line(bx0, top, bx0, plot.bottom, s.axis, lineW(u, s.axisW), { label: 'Axis' }) as SlideObj);
  out.push(liveBox(box(bx0, top, plot.right - bx0, avail), 'data.bars', { bars, fmt, ghost: o.ghost, n: n * ns } satisfies BarsProps));
  return out;
}

// ── 1. Bar chart ────────────────────────────────────────────────────────────
const barsDesign: SlideDesigner = d => {
  const x = X(d), { L, f } = x;
  const pg = page(d);
  const ds = parseData(f.data);
  const ghost = !ds.rows.length;
  const orientSel = pick(f.orient, { v: /column|vert|up/, h: /row|horiz|side/, auto: /auto/ }, 'auto');
  const longLabels = ds.rows.some(r => r.label.length > 12);
  const orient: 'v' | 'h' = orientSel === 'auto' ? (L.vertical || (longLabels && !L.stretched) ? 'h' : 'v') : orientSel;
  const sort = pick(f.sort, SORT, 'none');
  const values = pick(f.values, { none: /none|hide|off/, hi: /high|top|only/, all: /all|show|every/ }, 'all');
  const hiMode = pick(f.highlight, { max: /larg|high|max|top/, last: /last|latest|recent/, none: /none|off/ }, 'max');
  pg.out.push(...barChart(x, pg.plot, ghost ? GHOST : sorted(ds.rows, sort), fmtOf(f, ds), { orient, series: Math.min(2, ds.width), values, hiMode, names: ds.series, ghost }));
  if (ghost) pg.out.push(hint(x, pg.plot));
  return pg.out;
};

// ── 2. Ranked bars ──────────────────────────────────────────────────────────
const rankedDesign: SlideDesigner = d => {
  const x = X(d), { f } = x;
  const pg = page(d);
  const ds = parseData(f.data);
  const ghost = !ds.rows.length;
  const sort = pick(f.sort, SORT, 'desc');
  const values = pick(f.values, { none: /none|hide|off/, hi: /high|top|only/, all: /all|show|every/ }, 'all');
  pg.out.push(...barChart(x, pg.plot, ghost ? GHOST : sorted(ds.rows, sort), fmtOf(f, ds), { orient: 'h', series: 1, values, hiMode: 'max', ranked: !ghost && sort !== 'none', ghost }));
  if (ghost) pg.out.push(hint(x, pg.plot));
  return pg.out;
};

// ── 3. Line / area ──────────────────────────────────────────────────────────
const lineDesign: SlideDesigner = d => {
  const x = X(d), { f, u, ty, c, s } = x;
  const pg = page(d), plot = pg.plot, out = pg.out;
  const ds = parseData(f.data);
  const ghost = ds.rows.length < 2;
  const rows = ghost ? GHOST : ds.rows.slice(0, Math.max(2, Math.floor(plot.w / (u * 2.2))));
  const ns = ghost ? 1 : Math.min(2, ds.width);
  const fmt = fmtOf(f, ds);
  const area = pick(f.style, { line: /^line|plain|no area/, area: /area|fill/ }, 'area') === 'area';
  const mode = pick(f.points, { none: /none|hide|off/, all: /all|every/, peaks: /peak|high|low/, last: /last|latest|end/ }, 'last');
  let top = plot.y;
  if (ns > 1) {
    const lg = legend(x, plot.x, top, plot.w, [{ name: ds.series[0] || 'This year', color: s.hi }, { name: ds.series[1] || 'Last year', color: s.second, dash: true }], 'right');
    out.push(...lg.objs); top += lg.h + u * 1.6;
  }
  const allV = rows.flatMap(r => r.values.slice(0, ns));
  const lo0 = Math.min(...allV), hi0 = Math.max(...allV);
  // Trend lines may float: start the axis near the data when every value is far above zero.
  const floor = lo0 > 0 && lo0 > (hi0 - lo0) * 1.2 ? lo0 - (hi0 - lo0) * .35 : Math.min(0, lo0);
  const sc0 = niceScale(floor, hi0, (plot.bottom - top) > u * 30 ? 5 : 4);
  const sc = floor !== Math.min(0, lo0) ? (() => { const step = sc0.step, l = Math.floor(floor / step) * step, h = Math.ceil(hi0 / step) * step; const t: number[] = []; for (let v = l; v <= h + step * .001; v += step) t.push(+v.toPrecision(12)); return { lo: l, hi: h, step, ticks: t }; })() : sc0;
  const tf = ty.label(u * 1.1, { color: c.muted, align: 'right', wrap: false, label: 'Axis tick', role: 'CAPTION' });
  const tickObjs = ghost ? [] : sc.ticks.map(v => text(0, 0, 2000, formatValue(v, { ...fmt, decimals: stepDecimals(sc.step), compact: true }), tf));
  const gw = ghost ? 0 : Math.max(...tickObjs.map(maxLineWidth)) + u * 1.4;
  const x0 = plot.x + gw, pw = plot.right - x0, n = rows.length;
  const vf = valueFont(x);
  const vsize = Math.min(u * 1.8, Math.max(u * 1.05, pw / n * .3));
  const padX = Math.max(u * 1.6, vsize * 2.2);
  const step = (pw - padX * 2) / Math.max(1, n - 1);
  const xs = rows.map((_, i) => n === 1 ? x0 + pw / 2 : x0 + padX + i * step);
  const labs = ghost ? [] : categoryLabels(x, rows.map(r => r.label), xs, step, 0, u * 3.4, [x0, plot.right]);
  const labH = labs.length ? Math.max(...labs.map(l => l.h)) : 0;
  const baseY = plot.bottom - labH - (labs.length ? u * 1 : 0);
  for (const l of labs) l.y = baseY + u * 1;
  const yTop = top + vsize * 1.9;
  const Y = (v: number) => baseY - (v - sc.lo) / (sc.hi - sc.lo || 1) * (baseY - yTop);
  if (!ghost) sc.ticks.forEach((tv, i) => {
    const yy = Y(tv);
    if (i > 0) out.push(line(x0, yy, plot.right, yy, s.grid, lineW(u, s.gridW), { label: 'Gridline', dash: s.gridDash?.map(k => k * u * .4) }) as SlideObj);
    const t = tickObjs[i]; t.x = plot.x; t.w = gw - u * 1.4; t.y = yy - (t.fontSize || u) * .62; out.push(t);
  });
  out.push(line(x0, baseY, plot.right, baseY, s.axis, lineW(u, s.axisW), { label: 'Axis' }) as SlideObj);
  const r = u * (s.point === 'ring' ? .62 : .55) * (n > 16 ? .7 : 1);
  const series: LineSeries[] = [];
  for (let si = 0; si < ns; si++) {
    const pts: number[] = [];
    rows.forEach((row, i) => pts.push(xs[i], Y(row.values[si] ?? row.values[0] ?? 0)));
    const vals = rows.map(row => row.values[si] ?? 0);
    const labels: LineSeries['labels'] = [];
    if (si === 0 && !ghost && mode !== 'none') {
      const fin = vals.map(v => formatValue(v, fmt));
      const wOf = (i: number) => measureSpec(fin[i], vf, vsize);
      let pickIdx: number[];
      const maxI = vals.indexOf(Math.max(...vals)), minI = vals.indexOf(Math.min(...vals));
      if (mode === 'all' && Math.max(...fin.map((_, i) => wOf(i))) < step * .92) pickIdx = vals.map((_, i) => i);
      else if (mode === 'last') pickIdx = [n - 1];
      else pickIdx = [...new Set([maxI, minI, n - 1])];
      const placed: Box[] = [];
      for (const i of pickIdx) {
        const w = Math.min(wOf(i), pw * .4), px = pts[i * 2], py = pts[i * 2 + 1];
        const cx = Math.max(x0 + w / 2, Math.min(plot.right - w / 2, px));
        const prevY = i > 0 ? pts[i * 2 - 1] : py, nextY = i < n - 1 ? pts[i * 2 + 3] : py;
        // Above a peak, below a trough — away from the line.
        let below = (prevY < py && nextY < py) || (i === minI && i !== maxI && mode !== 'last');
        let ly = below ? py + r + u * .7 : py - r - u * .7 - vsize;
        if (ly < top) { below = true; ly = py + r + u * .7; }
        if (ly + vsize > baseY - u * .3) ly = py - r - u * .7 - vsize;
        const bb = box(cx - w / 2, ly, w, vsize);
        if (placed.some(p => p.x < bb.right && bb.x < p.right && p.y < bb.bottom && bb.y < p.bottom)) continue;
        placed.push(bb);
        labels.push({ ...spec(cx, ly, vsize, vf, s.valueInk, 'center', w + 2), v: vals[i], at: i });
      }
    }
    series.push({ pts, c: si ? s.second : s.hi, w: lineW(u, s.lineW * (si ? .75 : 1)), dash: si > 0, area: area && si === 0, r: si ? r * .75 : r, labels, delay: si ? .3 : 0 });
  }
  // Draw the comparison underneath the main line.
  series.reverse();
  out.push(liveBox(box(x0, top, pw, baseY - top), 'data.line', { series, baseY, x0: xs[0], x1: xs[xs.length - 1], fmt, ghost, areaTop: yTop } satisfies LineProps));
  out.push(...labs);
  if (ghost) out.push(hint(x, plot, 'Add two or more “Label, value” lines to draw a trend'));
  return out;
};

// ── 4. Donut / pie ──────────────────────────────────────────────────────────
function donutColors(x: DX, n: number): string[] {
  const { s, c } = x;
  if (s.mono) {
    const base = [s.hi, c.ink, blend(c.ink, c.ground, .45), blend(s.hi, c.ground, .5), blend(c.ink, c.ground, .7), blend(c.ink, c.ground, .25)];
    return Array.from({ length: n }, (_, i) => base[i % base.length]);
  }
  const ser = s.series.filter(col => col !== c.muted);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const b = ser[i % ser.length], round = Math.floor(i / ser.length);
    out.push(round ? blend(b, c.ground, Math.min(.6, .3 * round)) : b);
  }
  return out;
}
const donutDesign: SlideDesigner = d => {
  const x = X(d), { L, f, u, ty, c, s, th } = x;
  const pg = page(d), plot = pg.plot, out = pg.out;
  const ds = parseData(f.data, 10);
  const ghost = !ds.rows.length;
  const sort = pick(f.sort, SORT, 'none');
  const rows = ghost ? GHOST.slice(0, 4) : sorted(ds.rows.filter(r => (r.values[0] ?? 0) > 0), sort);
  const fmt = fmtOf(f, ds);
  const pie = pick(f.style, { pie: /pie/, donut: /donut|ring/ }, 'donut') === 'pie';
  const show = pick(f.legendValues, { pct: /percent|%/, val: /^value/, both: /both/ }, 'both');
  const total = rows.reduce((a, r) => a + (r.values[0] ?? 0), 0) || 1;
  const cols = donutColors(x, rows.length);
  const n = rows.length;
  // geometry
  let dsz: number, cx: number, cy: number, lgBox: Box;
  if (L.vertical) {
    const legendH = Math.min(plot.h * .42, n * u * 3.6);
    dsz = Math.min(plot.w * .78, plot.h - legendH - u * 3);
    cx = plot.cx; cy = plot.y + dsz / 2;
    lgBox = box(plot.x + plot.w * .06, plot.y + dsz + u * 3, plot.w * .88, plot.bottom - (plot.y + dsz + u * 3));
  } else {
    dsz = Math.min(plot.h, plot.w * (L.stretched ? .42 : .46));
    const gap = u * 5, lw = Math.min(plot.w - dsz - gap, u * 60);
    const totalW = dsz + gap + lw, x0 = plot.x + (plot.w - totalW) / 2 * (L.stretched ? .3 : .5);
    cx = x0 + dsz / 2; cy = plot.cy;
    lgBox = box(x0 + dsz + gap, plot.y, lw, plot.h);
  }
  const R = dsz / 2, ring = pie ? R : R * (s.flavor === 'slab' ? .42 : s.flavor === 'grid' ? .24 : .3);
  const r0 = R - ring;
  // centre total + caption
  let totalSpec: DonutProps['total'] = null;
  if (!pie && !ghost && r0 > u * 4) {
    const vf = valueFont(x), str = formatValue(total, fmt);
    let size = Math.min(r0 * .62, u * 8);
    const w = measureSpec(str, vf, size);
    if (w > r0 * 1.45) size *= r0 * 1.45 / w;
    const cap = f.centerLabel ? fitText(cx - r0 * .72, 0, r0 * 1.44, f.centerLabel, ty.label(Math.max(u * .95, Math.min(u * 1.2, size * .24)), { align: 'center', color: c.muted, label: 'Total caption', role: 'CAPTION' }), r0 * .5, u * .95) : null;
    const blockH = size + (cap ? cap.h + u * .6 : 0);
    const ty0 = cy - blockH / 2;
    totalSpec = { spec: spec(cx, ty0, size, vf, s.valueInk, 'center', r0 * 1.5), v: total, fmt };
    if (cap) { cap.y = ty0 + size + u * .6; out.push(cap); }
  }
  out.push(liveBox(box(cx - R, cy - R, R * 2, R * 2), 'data.donut', { cx, cy, r: R, w: ring, slices: rows.map((r, i) => ({ v: r.values[0] ?? 0, c: cols[i] })), total: totalSpec, ghost } satisfies DonutProps));
  if (ghost) { out.push(hint(x, box(lgBox.x, lgBox.y, lgBox.w, lgBox.h))); return out; }
  // legend rows
  const rowH = Math.min(u * 4.6, lgBox.h / n);
  const size = Math.max(u * .95, Math.min(u * 1.9, rowH * .42));
  const lblock = n * rowH, ly0 = lgBox.y + (lgBox.h - lblock) / 2;
  const vf2 = ty.label(size * .9, { color: c.muted, align: 'right', wrap: false, label: 'Legend value', role: 'CAPTION' });
  const valStr = (v: number) => {
    const p = v / total * 100, ps = `${p >= 10 || p === 0 ? Math.round(p) : p.toFixed(1)}%`;
    return show === 'pct' ? ps : show === 'val' ? formatValue(v, fmt) : `${formatValue(v, fmt)} · ${ps}`;
  };
  const vObjs = rows.map(r => text(0, 0, 4000, valStr(r.values[0] ?? 0), vf2));
  const vw = Math.min(lgBox.w * .45, Math.max(...vObjs.map(maxLineWidth)) + u);
  rows.forEach((r, i) => {
    const yy = ly0 + i * rowH, sw = size * .95;
    const mid = yy + rowH / 2;
    out.push(rect(lgBox.x, mid - sw / 2, sw, sw, cols[i], { rx: s.round >= .3 ? sw / 2 : 0, stroke: s.outline?.color, strokeWidth: s.outline ? lineW(u, s.outline.w * .6) : 0, label: 'Legend key' }) as SlideObj);
    const lx = lgBox.x + sw + u * 1.1, lwid = lgBox.right - vw - lx - u;
    const lo = fitText(lx, 0, Math.max(u * 4, lwid), r.label, ty.body(size, { weight: Math.max(500, th.t.textWeight), color: c.ink, label: 'Legend', role: 'CAPTION' }), rowH * .9, u * .95);
    lo.y = mid - lo.h / 2 - (lo.fontSize || 0) * .06; out.push(lo);
    const vo = vObjs[i]; vo.x = lgBox.right - vw; vo.w = vw; vo.y = mid - (vo.fontSize || 0) * .56;
    if (maxLineWidth(vo) <= vo.w + 1) out.push(vo);
    if (i < n - 1) out.push(line(lgBox.x, yy + rowH, lgBox.right, yy + rowH, s.grid, lineW(u, s.gridW), { label: 'Legend rule' }) as SlideObj);
  });
  return out;
};

// ── 5. Big numbers (KPIs) ───────────────────────────────────────────────────
const kpiDesign: SlideDesigner = d => {
  const x = X(d), { L, f, u, ty, c, s, th, m } = x;
  const pg = page(d), plot = pg.plot, out = pg.out;
  const ds = parseData(f.data, 4);
  const ghost = !ds.rows.length;
  const rows = ghost ? [{ label: 'Add up to four', values: [0], raw: '' }, { label: '“Label, value, last”', values: [0], raw: '' }] : ds.rows.slice(0, 4);
  const n = rows.length;
  const fmt = fmtOf(f, ds);
  const deltaMode = pick(f.delta, { percent: /percent|%/, difference: /diff|change|amount/, hide: /hide|none|off/ }, 'percent');
  const cards = pick(f.cards, { open: /open|none|plain|no/, cards: /card|panel/ }, 'cards') === 'cards';
  // grid
  const colsN = L.vertical ? (n === 4 && L.cls === 'portrait' ? 2 : 1) : n === 4 && L.cls === 'standard' ? 2 : n;
  const rowsN = Math.ceil(n / colsN), gut = u * 2.4;
  const cw = (plot.w - gut * (colsN - 1)) / colsN;
  const chMax = (plot.h - gut * (rowsN - 1)) / rowsN;
  const ch = Math.min(chMax, Math.max(u * 16, cw * (L.vertical ? .5 : .95)), u * 34);
  const gy = plot.y + (plot.h - (ch * rowsN + gut * (rowsN - 1))) / 2;
  const vf = valueFont(x);
  const items: KpiProps['items'] = [];
  const pad = cards ? Math.min(u * 2.4, cw * .08) : 0;
  const hexPanel = /^#[0-9a-f]{6}$/i.test(c.panel);
  const ink = cards && hexPanel ? c.panelInk : c.ink, muted = cards && hexPanel ? c.panelMuted : c.muted;
  const acc = cards ? onPanel(th, s.hi) : s.hi;
  const numInk = cards && hexPanel ? (contrast(s.valueInk, c.panel) >= 3 ? s.valueInk : c.panelInk) : s.valueInk;
  // One size for every number so the row reads as a set.
  const finals = rows.map(r => ghost ? '—' : formatValue(r.values[0] ?? 0, fmt));
  const innerW = cw - pad * 2;
  // Each number fills its card, but no number is more than 1.5× the smallest — they read as a set.
  const cap = Math.min(ch * .42, u * (L.vertical ? 9 : 11));
  const fits = finals.map(t => Math.min(cap, cap * innerW / Math.max(1, measureSpec(t, vf, cap))));
  const sizes = fits.map(z => Math.min(z, Math.min(...fits) * 1.5));
  rows.forEach((r, i) => {
    const col = i % colsN, row = Math.floor(i / colsN);
    const bx = plot.x + col * (cw + gut), by = gy + row * (ch + gut);
    if (cards) out.push(...m.panel(bx, by, cw, ch, L));
    const align: 'left' | 'center' = cards || L.vertical ? 'left' : 'center';
    const tx = bx + pad, tw = innerW;
    const lab = fitText(tx, 0, tw, r.label, ty.label(u * 1.45, { color: cards ? onPanel(th, c.accent) === c.accent ? c.accent : ink : c.accent, align, label: 'KPI label', role: 'CAPTION' }), ch * .22, u * .95);
    const prev = r.values[1];
    const dl = !ghost && deltaMode !== 'hide' && prev !== undefined ? formatDelta(r.values[0] ?? 0, prev, deltaMode === 'difference' ? 'difference' : 'percent', fmt) : null;
    const dsz = u * (L.vertical ? 1.5 : 1.7);
    const dText = dl ? fitText(tx + (align === 'left' ? dsz * 1.3 : 0), 0, tw - dsz * 1.3, `${dl.text} ${f.vsLabel || 'vs last year'}`, ty.body(dsz, { color: dl.dir >= 0 ? (cards ? acc : s.hi) : muted, weight: 600, align, label: 'KPI change', role: 'CAPTION' }), dsz * 2.6, u * .95) : null;
    const nsz = sizes[i];
    const blockH = lab.h + u * 1 + nsz + (dText ? u * 1.4 + dText.h : 0);
    const top = by + (ch - blockH) / 2;
    lab.y = top; out.push(lab);
    const nx = align === 'left' ? tx : bx + cw / 2;
    items.push({ spec: spec(nx, top + lab.h + u * 1, nsz, vf, ghost ? muted : numInk, align, innerW), v: r.values[0] ?? 0, fmt: ghost ? { prefix: '—' } : fmt,
      rule: cards ? { x: tx, y: by + ch - pad * .9, w: innerW * .26, h: Math.max(2, u * .35), c: acc } : undefined });
    if (dText) {
      dText.y = top + lab.h + u * 1 + nsz + u * 1.4;
      if (align === 'left') {
        const tri = dsz * .8, ty0 = dText.y + (dsz - tri) / 2 + dsz * .05;
        const pts = dl!.dir >= 0 ? [tx, ty0 + tri, tx + tri, ty0 + tri, tx + tri / 2, ty0] : [tx, ty0, tx + tri, ty0, tx + tri / 2, ty0 + tri];
        out.push(pathPx(tx, ty0, tri, tri, dPoly(pts), dl!.dir >= 0 ? (cards ? acc : s.hi) : muted, { label: 'KPI arrow' }) as SlideObj);
      }
      out.push(dText);
    }
  });
  out.push(liveBox(box(plot.x, gy, plot.w, ch * rowsN + gut * (rowsN - 1)), 'data.kpis', { items } satisfies KpiProps, 'Counters'));
  return out;
};

// ── 6. Goal / campaign progress ─────────────────────────────────────────────
const goalDesign: SlideDesigner = d => {
  const x = X(d), { L, f, u, ty, c, s } = x;
  const pg = page(d), plot = pg.plot, out = pg.out;
  const raised = Math.max(0, numberIn(f.raised) ?? 0), goal = Math.max(1e-9, numberIn(f.goal) ?? 0);
  const fmt: NumFormat = { prefix: (f.prefix || '').trim(), suffix: (f.suffix || '').trim() ? ' ' + f.suffix.trim() : '', decimals: 0 };
  if (fmt.suffix === ' %') fmt.suffix = '%';
  const hasGoal = (numberIn(f.goal) ?? 0) > 0;
  const pct = hasGoal ? raised / goal : 0;
  const modeSel = pick(f.style, { arc: /arc|gauge|dial/, thermo: /thermo|tube/, bar: /bar|line|track/, auto: /auto/ }, 'auto');
  const mode = modeSel === 'auto' ? (L.vertical ? 'thermo' : L.stretched ? 'bar' : 'arc') : modeSel;
  const vf = valueFont(x);
  const goalStr = formatValue(goal, fmt);
  const capText = (f.caption || '').trim() || (hasGoal ? `raised of our ${goalStr} goal` : 'Add a goal amount');
  const color = s.hi;
  const props: GoalProps = { mode: mode as GoalProps['mode'], pct, c: color, track: s.track, raised: { spec: spec(0, 0, 10, vf, s.valueInk, 'center', 10), v: raised, fmt }, pctText: null };
  const tickLab = (v: number) => formatValue(v, { ...fmt, compact: true });
  if (mode === 'arc') {
    const a0 = Math.PI * .75, a1 = Math.PI * 2.25; // 270° sweep, opening at the bottom
    const capH = u * 5;
    const R = Math.max(u * 8, Math.min(plot.w * .42, (plot.h - capH - u * 2.4) / (1 + Math.sin(Math.PI / 4))));
    const cx = plot.cx, cy = plot.y + R + (plot.h - capH - u * 2.4 - R * (1 + Math.sin(Math.PI / 4))) / 2;
    const w = R * (s.flavor === 'slab' ? .2 : s.flavor === 'grid' ? .1 : .14);
    props.arc = { cx, cy, r: R, w, a0, a1 };
    const inner = R - w;
    let size = Math.min(inner * .5, u * 9);
    const sw = measureSpec(formatValue(raised, fmt), vf, size);
    if (sw > inner * 1.5) size *= inner * 1.5 / sw;
    const psize = Math.max(u * 1.5, size * .34);
    props.pctText = hasGoal ? spec(cx, cy - size * .62 - psize * 1.5, psize, fontOf(ty.label(10)), c.accent, 'center', inner) : null;
    props.raised.spec = spec(cx, cy - size * .62, size, vf, s.valueInk, 'center', inner * 1.55);
    const cap = fitText(cx - inner * .8, 0, inner * 1.6, capText, ty.accent(Math.max(u * 1.4, Math.min(u * 2, size * .26)), { align: 'center', color: c.muted, label: 'Goal caption', role: 'CAPTION' }), inner * .55, u * .95);
    cap.y = cy + size * .48 + u * .6;
    out.push(cap);
    // scale ends under the arc
    const endY = cy + Math.sin(a0) * R + u * 1.1;
    for (const [v, ang, al] of [[0, a0, 'right'], [goal, a1, 'left']] as Array<[number, number, 'left' | 'right']>) {
      if (!hasGoal) break;
      const ex = cx + Math.cos(ang) * (R - w / 2), wv = R * .9;
      const t = text(al === 'right' ? ex - wv + w : ex - w, endY, wv, tickLab(v), ty.label(u * 1.05, { color: c.muted, align: al === 'right' ? 'right' : 'left', wrap: false, label: 'Scale end', role: 'CAPTION' }));
      t.x = Math.max(plot.x, t.x); t.w = Math.min(t.w, plot.right - t.x);
      if (t.y + t.h <= plot.bottom + u && maxLineWidth(t) <= t.w + 1) out.push(t);
    }
    out.push(liveBox(box(cx - R, cy - R, R * 2, R * (1 + Math.sin(Math.PI / 4))), 'data.goal', props, 'Goal gauge'));
    return out;
  }
  if (mode === 'thermo') {
    // Number block + tube with a labelled scale.
    const vertical = L.vertical;
    const numBox = vertical ? box(plot.x, plot.y, plot.w, Math.min(plot.h * .26, u * 16)) : box(plot.x + plot.w * .42, plot.y, plot.w * .58, plot.h);
    const tubeArea = vertical ? box(plot.x, numBox.bottom + u * 2, plot.w, plot.bottom - numBox.bottom - u * 2) : box(plot.x, plot.y, plot.w * .38, plot.h);
    const tw = Math.min(u * 5.2, tubeArea.w * .2), bulbR = tw * 1.05;
    const th0 = tubeArea.y + u * 1, thH = tubeArea.h - bulbR * 2.1 - u * 1.2;
    const tx = tubeArea.x + tubeArea.w * .4 - tw / 2;
    props.thermo = { x: tx, y: th0, w: tw, h: thH, bulbR };
    // ticks: 0..100% of goal
    if (hasGoal) for (const k of [0, .25, .5, .75, 1]) {
      const yy = th0 + thH - thH * k;
      out.push(line(tx + tw + u * .6, yy, tx + tw + u * 1.8, yy, s.axis, lineW(u, .12), { label: 'Scale tick' }) as SlideObj);
      const t = text(tx + tw + u * 2.4, yy - u * .7, tubeArea.right - (tx + tw + u * 2.4), tickLab(goal * k), ty.label(u * 1.05, { color: k === 1 ? c.ink : c.muted, wrap: false, label: 'Scale label', role: 'CAPTION' }));
      if (maxLineWidth(t) <= t.w + 1) out.push(t);
    }
    let size = Math.min(numBox.h * .5, u * 10);
    const al: 'left' | 'center' = vertical ? 'center' : 'left';
    const sw = measureSpec(formatValue(raised, fmt), vf, size);
    if (sw > numBox.w * .95) size *= numBox.w * .95 / sw;
    const cap = fitText(numBox.x, 0, numBox.w, capText, ty.accent(u * 2, { align: al, color: c.muted, label: 'Goal caption', role: 'CAPTION' }), numBox.h * .3, u * .95);
    const psize = u * 1.5;
    const blockH = psize * 1.6 + size + u * .8 + cap.h;
    const y0 = numBox.y + (numBox.h - blockH) / 2;
    const ax = al === 'center' ? numBox.cx : numBox.x;
    props.pctText = hasGoal ? spec(ax, y0, psize, fontOf(ty.label(10)), c.accent, al, numBox.w) : null;
    props.raised.spec = spec(ax, y0 + psize * 1.6, size, vf, s.valueInk, al, numBox.w);
    cap.y = y0 + psize * 1.6 + size + u * .8; out.push(cap);
    out.push(liveBox(box(tx - bulbR, th0, bulbR * 2 + tw, thH + bulbR * 2.2), 'data.goal', props, 'Goal thermometer'));
    return out;
  }
  // bar
  const bh = Math.min(u * 4.4, plot.h * .14);
  let size = Math.min(u * 7, plot.h * .3);
  const sw0 = measureSpec(formatValue(raised, fmt), vf, size);
  if (sw0 > plot.w * .4) size *= plot.w * .4 / sw0;
  const goalT = hasGoal ? text(plot.x, 0, plot.w * .5, `Goal ${goalStr}`, ty.label(u * 1.3, { color: c.ink, align: 'right', wrap: false, label: 'Goal label', role: 'CAPTION' })) : null;
  const tickH = u * 1.2 * 1.15;
  const cap = fitText(plot.x, 0, plot.w * .6, capText, ty.accent(u * 1.9, { color: c.muted, label: 'Goal caption', role: 'CAPTION' }), u * 5, u * .95);
  const blockH = size + u * 1.4 + bh + u * 1.2 + tickH + u * 1.6 + cap.h;
  const y0 = plot.y + (plot.h - blockH) / 2;
  const by = y0 + size + u * 1.4;
  props.bar = { x: plot.x, y: by, w: plot.w, h: bh };
  const gw = goalT ? maxLineWidth(goalT) : 0;
  props.raised = { spec: spec(plot.x, y0, size, vf, s.valueInk, 'center', Math.max(u * 10, plot.w - gw - u * 4)), v: raised, fmt, ride: true, rideMax: plot.right - (gw ? gw + u * 3 : 0) };
  if (goalT) { goalT.x = plot.right - plot.w * .5; goalT.y = by - u * 1 - goalT.h; out.push(goalT); }
  if (hasGoal) [0, .25, .5, .75, 1].forEach(k => {
    const tx = plot.x + plot.w * k;
    out.push(line(tx, by + bh + u * .3, tx, by + bh + u * 1, s.axis, lineW(u, .12), { label: 'Scale tick' }) as SlideObj);
    const str = `${Math.round(k * 100)}%`, w = u * 8;
    const t = text(k === 0 ? tx : k === 1 ? tx - w : tx - w / 2, by + bh + u * 1.2, w, str, ty.label(u * 1.05, { color: c.muted, align: k === 0 ? 'left' : k === 1 ? 'right' : 'center', wrap: false, label: 'Scale label', role: 'CAPTION' }));
    out.push(t);
  });
  cap.y = by + bh + u * 1.2 + tickH + u * 1.6; out.push(cap);
  out.push(liveBox(box(plot.x, y0, plot.w, by + bh - y0), 'data.goal', props, 'Goal bar'));
  return out;
};

// ── 7. Comparison: grouped bars or dumbbell ─────────────────────────────────
const compareDesign: SlideDesigner = d => {
  const x = X(d), { L, f, u, ty, c, s } = x;
  const pg = page(d), plot = pg.plot, out = pg.out;
  const ds = parseData(f.data);
  const ghost = !ds.rows.length;
  const fmt = fmtOf(f, ds);
  const names = [f.seriesA || ds.series[0] || 'This year', f.seriesB || ds.series[1] || 'Last year'];
  const style = pick(f.style, { bars: /bar|group|column/, dumbbell: /dumb|dot|arrow/ }, 'dumbbell');
  const rows = ghost ? GHOST : ds.rows.map(r => ({ ...r, values: [r.values[0] ?? 0, r.values[1] ?? r.values[0] ?? 0] }));
  if (style === 'bars' || ghost) {
    out.push(...barChart(x, plot, rows, fmt, { orient: L.vertical ? 'h' : 'v', series: 2, values: 'all', hiMode: 'none', names, ghost }));
    if (ghost) out.push(hint(x, plot, 'Add “Label, this year, last year” lines'));
    return out;
  }
  let top = plot.y;
  const lg = legend(x, plot.x, top, plot.w, [{ name: names[0], color: s.hi }, { name: names[1], color: s.second }], 'right');
  out.push(...lg.objs); top += lg.h + u * 2;
  const maxRows = Math.max(2, Math.floor((plot.bottom - top) / (u * 2.6)));
  const rs = rows.slice(0, maxRows), n = rs.length;
  const axisH = u * 2.8, bottom = plot.bottom - axisH;
  const rowH = (bottom - top) / n;
  const lsize = Math.max(u * .95, Math.min(u * 2.3, rowH * .38));
  const lf = ty.body(lsize, { weight: Math.max(500, x.th.t.textWeight), color: c.ink, label: 'Category', role: 'CAPTION' });
  const vf = valueFont(x);
  let vsize = Math.max(u * 1.05, Math.min(u * 2, rowH * .4));
  const fa = rs.map(r => formatValue(r.values[0], fmt)), fb = rs.map(r => formatValue(r.values[1], fmt));
  let vwA = Math.max(...fa.map(t => measureSpec(t, vf, vsize))) + u * 1.6, vwB = Math.max(...fb.map(t => measureSpec(t, vf, vsize * .82))) + u * 1.2;
  const cap = plot.w * (L.vertical ? .34 : .22);
  if (vwA + vwB > cap) { const k = cap / (vwA + vwB); vsize *= k; vwA *= k; vwB *= k; }
  const lws = rs.map(r => maxLineWidth(text(0, 0, 4000, r.label, { ...lf, wrap: false })));
  const lw = Math.min(plot.w * (L.vertical ? .3 : .26), Math.max(...lws) + u * .4);
  const x0 = plot.x + lw + u * 2.4, x1 = plot.right - vwA - vwB - u * 1.6;
  const vmax = Math.max(1e-9, ...rs.flatMap(r => r.values.map(v => Math.max(0, v))));
  const sc = niceScale(0, vmax, 4);
  const Xv = (v: number) => x0 + Math.max(0, v) / sc.hi * (x1 - x0);
  // Real scale: faint verticals at each tick and their labels under the rows.
  const tf = ty.label(u * 1.05, { color: c.muted, align: 'center', wrap: false, label: 'Axis tick', role: 'CAPTION' });
  const tickW = (x1 - x0) / Math.max(1, sc.ticks.length - 1);
  sc.ticks.forEach((tv, i) => {
    const tx = Xv(tv);
    out.push(line(tx, top, tx, bottom, s.grid, lineW(u, s.gridW), { label: 'Gridline', dash: s.gridDash?.map(k => k * u * .4) }) as SlideObj);
    const t = text(tx - tickW * .45, bottom + u * .9, tickW * .9, formatValue(tv, { ...fmt, decimals: stepDecimals(sc.step), compact: true }), tf);
    if (i === 0) { t.x = tx - u * .5; t.w = tickW * .9; t.textAlign = 'left'; }
    if (maxLineWidth(t) > t.w + 1) return;
    const need = maxLineWidth(t) + 2;
    if (i > 0) { t.x = tx - need / 2; }
    t.w = need; t.x = Math.min(t.x, plot.right - need);
    out.push(t);
  });
  const rr: DumbbellProps['rows'] = [], values: DumbbellProps['values'] = [];
  rs.forEach((r, i) => {
    const cy = top + rowH * (i + .5);
    const lo = fitText(plot.x, 0, lw, r.label, { ...lf, align: 'right' }, rowH * .92, u * .95);
    lo.y = cy - lo.h / 2 - (lo.fontSize || 0) * .06; out.push(lo);
    rr.push({ y: cy, xa: Xv(r.values[0]), xb: Xv(r.values[1]), ca: s.hi, cb: s.second, i });
    values.push({ spec: spec(plot.right - vwB - u * .4, cy - vsize / 2, vsize, vf, s.valueInk, 'right', vwA - u * .6), v: r.values[0], fmt, i });
    values.push({ spec: spec(plot.right, cy - vsize * .41, vsize * .82, vf, c.muted, 'right', vwB - u * .4), v: r.values[1], fmt, i });
  });
  const r = Math.max(u * .55, Math.min(u * 1.1, rowH * .2));
  out.push(liveBox(box(x0 - r, top, plot.right - x0 + r, bottom - top), 'data.dumbbell', { rows: rr, r, lineW: Math.max(2, r * .9), x0, x1, values } satisfies DumbbellProps, 'Comparison'));
  return out;
};

// ── 8. Timeline / milestones ────────────────────────────────────────────────
const timelineDesign: SlideDesigner = d => {
  const x = X(d), { L, f, u, ty, c, s } = x;
  const pg = page(d), plot = pg.plot, out = pg.out;
  let ms = parseMilestones(f.items, L.vertical ? 7 : L.cls === 'panorama' ? 8 : 6);
  const ghost = !ms.length;
  if (ghost) ms = [{ when: 'Then', what: 'Add one “Date, milestone” per line' }, { when: 'Now', what: '' }, { when: 'Next', what: '' }];
  const n = ms.length;
  const r = u * (s.point === 'ring' ? 1 : .9), lw = lineW(u, .32);
  const dateF = (size: number, align: 'left' | 'center') => ty.display(size, { align, color: c.accent, transform: 'none', label: 'Milestone date', role: 'CAPTION', wrap: true });
  const nodes: TimelineProps['nodes'] = [];
  if (L.vertical) {
    const lx = plot.x + r * 1.4, tx = lx + r + u * 2.4, tw = plot.right - tx;
    const rowH = plot.h / n;
    ms.forEach((mm, i) => {
      const y0 = plot.y + rowH * i;
      const st = new Stack();
      if (mm.when) st.add(fitText(tx, 0, tw, mm.when, dateF(u * 3.4, 'left'), rowH * .4, u * 1.2));
      if (mm.what) st.add(fitText(tx, 0, tw, mm.what, ty.body(u * 2.4, { color: c.ink, label: 'Milestone', role: 'CAPTION' }), rowH * .5, u * .95), u * .5);
      const placed = st.place(y0 + u * .2);
      out.push(...placed);
      const first = placed[0];
      nodes.push({ x: lx, y: first ? first.y + Math.min(first.h, (first.fontSize || u) * 1.1) / 2 : y0 + rowH / 2 });
    });
    const a: [number, number] = [lx, nodes[0].y], b: [number, number] = [lx, nodes[n - 1].y];
    out.push(liveBox(box(lx - r * 1.5, plot.y, r * 3, plot.h), 'data.timeline', { a, b, nodes, c: s.hi, r, lineW: lw, track: s.track } satisfies TimelineProps, 'Timeline'));
    return out;
  }
  const step = plot.w / n;
  const dsz = Math.min(u * 4.4, step * .24);
  const dates = ms.map((mm, i) => fitText(plot.x + step * i + step * .04, 0, step * .92, mm.when || ' ', dateF(dsz, 'center'), u * 4.6, u * 1.1));
  const dateH = Math.max(...dates.map(o => o.h));
  const whats = ms.map((mm, i) => mm.what ? fitText(plot.x + step * i + step * .05, 0, step * .9, mm.what, ty.body(Math.min(u * 2.5, step * .11), { align: 'center', color: c.ink, label: 'Milestone', role: 'CAPTION' }), plot.h * .5, u * .95) : null);
  const whatH = Math.max(0, ...whats.map(o => o?.h || 0));
  const blockH = dateH + u * 1.6 + r * 2 + u * 1.8 + whatH;
  const y0 = plot.y + Math.max(0, (plot.h - blockH) / 2);
  const ly = y0 + dateH + u * 1.6 + r;
  dates.forEach(o => { o.y = ly - r - u * 1.6 - o.h; out.push(o); });
  whats.forEach(o => { if (o) { o.y = ly + r + u * 1.8; out.push(o); } });
  ms.forEach((_, i) => nodes.push({ x: plot.x + step * (i + .5), y: ly }));
  out.push(liveBox(box(plot.x, ly - r * 2, plot.w, r * 4), 'data.timeline', { a: [plot.x + step * .5 - (n > 1 ? step * .5 : step * .3), ly], b: [plot.right - step * .5 + (n > 1 ? step * .5 : step * .3), ly], nodes, c: s.hi, r, lineW: lw, track: s.track } satisfies TimelineProps, 'Timeline'));
  return out;
};

// ── 9. Pictogram: "1 in 4" ──────────────────────────────────────────────────
const pictoDesign: SlideDesigner = d => {
  const x = X(d), { L, f, u, S, ty, c, s, m } = x;
  const out = prelude(d, false);
  const ratio = parseRatio(f.ratio) || { num: 0, den: 10, fraction: 0 };
  const iconKind = pick(f.icon, { heart: /heart|love/, house: /house|home/, meal: /meal|food|bowl/, person: /person|people/ }, 'person');
  const countSel = pick(f.count, { n10: /^10\b|ten/, n20: /20|twenty/, n50: /50|fifty/, n100: /100|hundred/, auto: /auto/ }, 'auto');
  const N = countSel === 'n10' ? 10 : countSel === 'n20' ? 20 : countSel === 'n50' ? 50 : countSel === 'n100' ? 100
    : ratio.den <= 5 ? ratio.den * 5 : ratio.den <= 20 ? ratio.den : 100;
  const on = Math.max(0, Math.min(N, ratio.fraction * N));
  // zones
  let tb: Box, gb: Box;
  if (L.vertical) { tb = box(S.x, S.y, S.w, S.h * .42); gb = box(S.x, S.y + S.h * .46, S.w, S.h * .54); }
  else { const tw = Math.min(S.w * (L.stretched ? .34 : .44), u * 70); tb = box(S.x, S.y, tw, S.h); gb = box(S.x + tw + u * 5, S.y, S.w - tw - u * 5, S.h); }
  const ratioText = ((f.ratio || '').split(/\r?\n/)[0].trim() || '—').slice(0, 18);
  let st = new Stack();
  for (let k = 1; k > .3; k *= .8) {
    st = new Stack();
    if (f.kicker) st.add(fitText(tb.x, 0, tb.w, f.kicker, ty.label(u * 1.5), u * 4 * k, u * .95));
    st.add(fitText(tb.x, 0, tb.w, ratioText, ty.display(u * (L.vertical ? 11 : 12), { color: s.hi, transform: 'none', wrap: false, label: 'Ratio' }), tb.h * .42 * k), u * 1);
    st.add(m.divider(tb.x, 0, tb.w, 'left', L).objs, u * 1.6);
    if (f.statement) st.add(fitText(tb.x, 0, tb.w, f.statement, ty.sentence(u * 3, { label: 'Statement' }), tb.h * .34 * k, u * 1.2), u * 1.8);
    if (f.source) st.add(fitText(tb.x, 0, tb.w, f.source, ty.label(u * .95, { color: c.muted, label: 'Source', role: 'CAPTION' }), u * 2.6, u * .95), u * 2);
    if (st.height() <= tb.h) break;
  }
  out.push(...st.centre(tb.y, tb.h));
  // grid
  // "1 in 4" reads best as groups of four with one lit in each: prefer column counts that are
  // multiples of the denominator, and light the first `num` of every group.
  const den = Math.round(ratio.den), grouped = den >= 2 && den <= 12 && N % den === 0 && Number.isInteger(ratio.num) && ratio.num < den;
  let best = { cols: N, rows: 1, cell: 0 };
  for (let cols = 1; cols <= N; cols++) {
    if (grouped && cols % den !== 0 && den % cols !== 0) continue;
    const rows = Math.ceil(N / cols), cell = Math.min(gb.w / cols, gb.h / rows);
    if (cell > best.cell * 1.001) best = { cols, rows, cell };
  }
  const cell = Math.min(best.cell, u * 12), isz = cell * .82;
  const gw = best.cols * cell, gh = best.rows * cell;
  const gx = gb.x + (gb.w - gw) / 2 * (L.vertical ? 1 : .6), gy = gb.y + (gb.h - gh) / 2;
  const cells: PictoProps['cells'] = [];
  const litCells: PictoProps['cells'] = [];
  for (let i = 0; i < N; i++) {
    const cx = i % best.cols, cy = Math.floor(i / best.cols);
    const cellO = { x: gx + cx * cell + (cell - isz) / 2, y: gy + cy * cell + (cell - isz) / 2, s: isz };
    // grouped: down each column when cols == den, otherwise in reading order
    const idx = best.cols % den === 0 ? cx % den : (cy * best.cols + cx) % den;
    if (grouped && idx < ratio.num) litCells.push(cellO); else cells.push(cellO);
  }
  // Lit cells first: the drawer lights cells [0, on).
  if (grouped) cells.unshift(...litCells);
  out.push(liveBox(box(gx, gy, gw, gh), 'data.picto', { cells, on, icon: iconKind, cOn: s.hi, cOff: blend(c.ink, c.ground, x.th.dark ? .78 : .82) } satisfies PictoProps, 'Icon array'));
  return out;
};

// ── 10. Composition: one stacked bar ────────────────────────────────────────
const stackDesign: SlideDesigner = d => {
  const x = X(d), { L, f, u, ty, c, s, th } = x;
  const pg = page(d), plot = pg.plot, out = pg.out;
  const ds = parseData(f.data, 8);
  const ghost = !ds.rows.length;
  const rows = ghost ? GHOST.slice(0, 4) : ds.rows.filter(r => (r.values[0] ?? 0) > 0);
  const fmt = fmtOf(f, ds);
  const total = rows.reduce((a, r) => a + (r.values[0] ?? 0), 0) || 1;
  const cols = donutColors(x, rows.length);
  const n = rows.length;
  const bh = Math.min(u * (L.vertical ? 8 : 9), plot.h * .24);
  const legCols = L.vertical ? 1 : L.stretched ? Math.min(n, 4) : Math.min(n, n > 4 ? 3 : n);
  const legRows = Math.ceil(n / legCols);
  const rowH = Math.min(u * 11, (plot.h - bh - u * 4) / Math.max(1, legRows));
  const blockH = bh + u * 3 + legRows * rowH;
  const y0 = plot.y + Math.max(0, (plot.h - blockH) / 2);
  const segs = rows.map((r, i) => ({ w: plot.w * (r.values[0] ?? 0) / total, c: cols[i] }));
  out.push(liveBox(box(plot.x, y0, plot.w, bh), 'data.stack', { x: plot.x, y: y0, w: plot.w, h: bh, segs, gap: Math.max(1, u * .25) } satisfies StackProps, 'Stacked bar'));
  if (ghost) { out.push(hint(x, box(plot.x, y0 + bh + u * 2, plot.w, plot.bottom - y0 - bh - u * 2))); return out; }
  const cw = plot.w / legCols, ly = y0 + bh + u * 3;
  const psize = Math.max(u * 1.3, Math.min(u * 5.2, rowH * .48));
  rows.forEach((r, i) => {
    const col = i % legCols, row = Math.floor(i / legCols);
    const lx = plot.x + col * cw, yy = ly + row * rowH, sw = u * 1.1;
    out.push(rect(lx, yy + psize * .2, sw, psize * .8, cols[i], { rx: s.round >= .3 ? sw / 2 : 0, label: 'Legend key' }) as SlideObj);
    const p = (r.values[0] ?? 0) / total * 100;
    const pt = text(lx + sw + u * 1, yy, cw - sw - u * 2, `${p >= 10 ? Math.round(p) : p.toFixed(1)}%`, ty.display(psize, { transform: 'none', color: c.ink, wrap: false, label: 'Share', role: 'CAPTION' }));
    out.push(pt);
    const lo = fitText(lx + sw + u * 1, yy + pt.h + u * .4, cw - sw - u * 2, `${r.label} · ${formatValue(r.values[0] ?? 0, { ...fmt, compact: true })}`, ty.body(Math.max(u * .95, Math.min(u * 1.9, rowH * .2)), { color: c.muted, weight: Math.max(400, th.t.textWeight), label: 'Legend', role: 'CAPTION' }), Math.max(u * 1.2, rowH - pt.h - u * 1), u * .95);
    out.push(lo);
  });
  return out;
};

// ── catalogue ───────────────────────────────────────────────────────────────
const F = (key: string, label: string, def: string, o: Partial<FieldDef> = {}): FieldDef => ({ key, label, default: def, ...o });
const DATA = (def: string, hint = 'One per line: Label, value — or Label, value, value for two series') => F('data', 'Data', def, { kind: 'data', multiline: true, hint });
const SRC = (def: string) => F('source', 'Source note', def, { hint: 'Optional — where the numbers come from' });
const UNIT = (pre: string, suf: string) => [F('prefix', 'Prefix', pre, { hint: 'e.g. $' }), F('suffix', 'Suffix / unit', suf, { hint: 'e.g. % or meals' })];

export const DATA_TEMPLATES: SlideTemplateDef[] = [
  { id: 'data-bars', name: 'Bar Chart', category: 'Data', media: 'data', slot: 'slide', design: barsDesign,
    blurb: 'Columns that grow with a stagger on a real axis; rows on vertical screens.',
    fields: [F('kicker', 'Kicker', 'Sunday Attendance'), F('title', 'Title', 'A Growing Family'), F('subtitle', 'Subtitle', 'Average weekly attendance, 2026'),
      DATA('Jan, 412\nFeb, 436\nMar, 458\nApr, 521\nMay, 497\nJun, 474\nJul, 455\nAug, 488\nSep, 532'), ...UNIT('', ''),
      F('orient', 'Direction', 'Auto', { kind: 'select', options: ['Auto', 'Columns', 'Rows'] }),
      F('sort', 'Order', 'As entered', { kind: 'select', options: ['As entered', 'Largest first', 'Smallest first'] }),
      F('values', 'Value labels', 'All', { kind: 'select', options: ['All', 'Highlight only', 'None'] }),
      F('highlight', 'Highlight', 'Largest', { kind: 'select', options: ['Largest', 'Latest', 'None'] }),
      SRC('Weekend headcount · all services')] },
  { id: 'data-ranked', name: 'Ranked Bars', category: 'Data', media: 'data', slot: 'slide', design: rankedDesign,
    blurb: 'Horizontal bars ranked largest first, rank numerals and values at the bar ends.',
    fields: [F('kicker', 'Kicker', 'Serve Team'), F('title', 'Title', 'Volunteers by Ministry'), F('subtitle', 'Subtitle', 'Thank you for showing up — 284 of you this fall'),
      DATA('Kids Ministry, 72\nWorship & Tech, 46\nHospitality, 58\nFood Pantry, 64\nStudents, 28\nPrayer Team, 16'), ...UNIT('', ''),
      F('sort', 'Order', 'Largest first', { kind: 'select', options: ['Largest first', 'Smallest first', 'As entered'] }),
      F('values', 'Value labels', 'All', { kind: 'select', options: ['All', 'Highlight only', 'None'] }),
      SRC('Planning Center rosters · October')] },
  { id: 'data-line', name: 'Trend Line', category: 'Data', media: 'data', slot: 'slide', design: lineDesign,
    blurb: 'A line that draws on over an area wash, points popping in and the latest value labelled.',
    fields: [F('kicker', 'Kicker', 'Food Pantry'), F('title', 'Title', 'Meals Served'), F('subtitle', 'Subtitle', 'Monthly meals, this year against last'),
      DATA('Month, 2026, 2025\nJan, 1,840, 1,420\nFeb, 1,910, 1,505\nMar, 2,240, 1,610\nApr, 2,105, 1,680\nMay, 2,460, 1,790\nJun, 2,720, 1,860\nJul, 2,980, 2,010\nAug, 3,150, 2,240'), ...UNIT('', ''),
      F('style', 'Style', 'Area', { kind: 'select', options: ['Area', 'Line'] }),
      F('points', 'Point labels', 'Last', { kind: 'select', options: ['Last', 'All', 'Peaks', 'None'] }),
      SRC('Pantry intake log')] },
  { id: 'data-donut', name: 'Donut', category: 'Data', media: 'data', slot: 'slide', design: donutDesign,
    blurb: 'A ring that sweeps round with its total counting up in the centre, and a legend.',
    fields: [F('kicker', 'Kicker', 'Generosity at Work'), F('title', 'Title', 'Where Your Giving Goes'), F('subtitle', 'Subtitle', 'General fund, fiscal year 2026'),
      DATA('Local outreach, 186,000\nGlobal missions, 142,000\nKids & students, 98,000\nWorship & media, 64,000\nFacilities, 110,000\nCare & benevolence, 40,000'), ...UNIT('$', ''),
      F('centerLabel', 'Centre caption', 'Given this year'),
      F('style', 'Style', 'Donut', { kind: 'select', options: ['Donut', 'Pie'] }),
      F('legendValues', 'Legend shows', 'Both', { kind: 'select', options: ['Both', 'Percent', 'Value'] }),
      F('sort', 'Order', 'As entered', { kind: 'select', options: ['As entered', 'Largest first'] }),
      SRC('Finance team · audited')] },
  { id: 'data-kpis', name: 'Big Numbers', category: 'Data', media: 'data', slot: 'slide', design: kpiDesign,
    blurb: 'Two to four headline numbers that count up, each with its change on last year.',
    fields: [F('kicker', 'Kicker', 'Year in Review'), F('title', 'Title', 'God Is Moving'), F('subtitle', 'Subtitle', ''),
      DATA('Baptisms, 48, 31\nNew families, 126, 104\nMeals served, 22,480, 17,960\nSmall groups, 37, 30', 'One per line: Label, value, last year (optional)'), ...UNIT('', ''),
      F('delta', 'Change shown as', 'Percent', { kind: 'select', options: ['Percent', 'Difference', 'Hide'] }),
      F('vsLabel', 'Change label', 'vs last year'),
      F('cards', 'Layout', 'Cards', { kind: 'select', options: ['Cards', 'Open'] }),
      SRC('')] },
  { id: 'data-goal', name: 'Campaign Goal', category: 'Data', media: 'data', slot: 'slide', design: goalDesign,
    blurb: 'Giving toward a goal: an arc, thermometer or track fills while the total counts up.',
    fields: [F('kicker', 'Kicker', 'Building Fund'), F('title', 'Title', 'Room to Grow'), F('subtitle', 'Subtitle', 'Thank you for building the next chapter with us'),
      F('raised', 'Raised', '186,400', { kind: 'number' }), F('goal', 'Goal', '250,000', { kind: 'number' }), ...UNIT('$', ''),
      F('caption', 'Caption', '', { hint: 'Defaults to “raised of our … goal”' }),
      F('style', 'Style', 'Auto', { kind: 'select', options: ['Auto', 'Arc', 'Thermometer', 'Bar'] }),
      SRC('Updated Sunday morning')] },
  { id: 'data-compare', name: 'This Year vs Last', category: 'Data', media: 'data', slot: 'slide', design: compareDesign,
    blurb: 'Two series side by side — a dumbbell that travels from last year to this, or grouped bars.',
    fields: [F('kicker', 'Kicker', 'Growth'), F('title', 'Title', 'Ministries Reaching More'), F('subtitle', 'Subtitle', 'Weekly participants'),
      DATA('Kids Ministry, 184, 142\nStudents, 96, 71\nSmall Groups, 312, 268\nRecovery, 44, 38\nEnglish Classes, 58, 22', 'One per line: Label, this year, last year'), ...UNIT('', ''),
      F('seriesA', 'First series', '2026'), F('seriesB', 'Second series', '2025'),
      F('style', 'Style', 'Dumbbell', { kind: 'select', options: ['Dumbbell', 'Grouped bars'] }),
      SRC('')] },
  { id: 'data-timeline', name: 'Milestones', category: 'Data', media: 'data', slot: 'slide', design: timelineDesign,
    blurb: 'A line that draws through the years, each milestone popping in as it passes.',
    fields: [F('kicker', 'Kicker', 'Our Story'), F('title', 'Title', 'Faithful Through the Years'), F('subtitle', 'Subtitle', ''),
      F('items', 'Milestones', '1998, Planted in a school gym\n2006, First building on Elm Street\n2014, Food pantry opens\n2021, Second campus launches\n2026, Breaking ground on the new hall', { kind: 'data', multiline: true, hint: 'One per line: Date, milestone' }),
      SRC('')] },
  { id: 'data-picto', name: 'One in Four', category: 'Data', media: 'data', slot: 'slide', design: pictoDesign,
    blurb: 'An icon array that lights up the share — people, hearts, homes or meals.',
    fields: [F('kicker', 'Kicker', 'Food Pantry'), F('ratio', 'Ratio', '1 in 4', { hint: 'e.g. 1 in 4, 3 of 10, 38%' }),
      F('statement', 'Statement', 'families we served this year came to us for the very first time.', { multiline: true }),
      F('icon', 'Icon', 'Person', { kind: 'select', options: ['Person', 'Heart', 'House', 'Meal'] }),
      F('count', 'Icons', 'Auto', { kind: 'select', options: ['Auto', '10', '20', '50', '100'] }),
      SRC('Pantry intake survey · 2026')] },
  { id: 'data-stack', name: 'Breakdown Bar', category: 'Data', media: 'data', slot: 'slide', design: stackDesign,
    blurb: 'One bar split into shares that sweeps in left to right, with big percentages below.',
    fields: [F('kicker', 'Kicker', 'Missions Budget'), F('title', 'Title', 'Every Dollar Sent'), F('subtitle', 'Subtitle', ''),
      DATA('Clean water, 42,000\nChurch planting, 31,000\nDisaster relief, 18,500\nScholarships, 12,500'), ...UNIT('$', ''),
      SRC('')] },
];
