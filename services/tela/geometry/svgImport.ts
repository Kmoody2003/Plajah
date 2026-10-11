// svgImport — arbitrary SVG → EDITABLE Tela vector objects (today's imports rasterise).
//
// Supported: path / rect (rx, ry) / circle / ellipse / line / polyline / polygon / text
// (+tspan, as TEXT objects) / image / g / nested svg (viewBox) / use + symbol / defs;
// transforms (baked into the geometry; stroke widths scale by √|det|); the CSS cascade
// (presentation attributes < <style> rules by specificity < inline style) with
// inheritance; fill/stroke opacity; currentColor; linear + radial gradients (href
// inheritance, objectBoundingBox → user space, gradientTransform, spread); clipPath →
// GEOMETRIC clipping (booleans, so the result stays editable) or, for heavy art, a
// carried clip; masks → approximated as clips (luminance ignored, reported); patterns →
// fallback colour (reported). The root viewBox maps into the target size
// (preserveAspectRatio honoured for meet/slice/none + alignments).
import type { TelaVectorObject } from '../../../types';
import type { CompoundPath, Matrix, Paint, PaintStop, FillRule, LineCap, LineJoin } from './model';
import { parseXml, localName, textContent, type XNode } from './xml';
import { parsePathData, parsePoints, toPathData } from './pathData';
import { rectPath, ellipseAt, polyPath } from './shapes';
import { transformPath, parseTransform, multiply, IDENTITY, meanScale, translate, scale as scaleM, apply } from './transform';
import { pathBounds } from './bezier';
import { pathToObject } from './tela';
import { clipPath as clipGeom } from './clip';
import { boolean } from './boolean';
import { withAlpha, parseColor } from './color';
import { pathCurves } from './model';

export interface SvgImportOptions { width?: number; height?: number; idPrefix?: string; /** Clip geometrically (default) or carry SVG clip paths. */ clipMode?: 'geometry' | 'carry' }
export interface SvgImportResult { objects: TelaVectorObject[]; width: number; height: number; warnings: string[] }

interface Rule { sel: string; spec: number; decl: Record<string, string>; order: number }
const INHERITED = new Set(['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'fill-rule', 'clip-rule', 'fill-opacity', 'stroke-opacity', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'visibility', 'color', 'letter-spacing']);
const PRESENTATION = new Set([...INHERITED, 'opacity', 'display', 'clip-path', 'mask', 'stop-color', 'stop-opacity', 'transform', 'mix-blend-mode', 'filter']);

function parseCss(css: string): Rule[] {
  const rules: Rule[] = []; let order = 0;
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const re = /([^{}]+)\{([^}]*)\}/g; let m: RegExpExecArray | null;
  while ((m = re.exec(css))) {
    if (m[1].trim().startsWith('@')) continue;
    const decl = parseDecl(m[2]);
    for (const sel of m[1].split(',').map(s => s.trim()).filter(Boolean)) rules.push({ sel, spec: specificity(sel), decl, order: order++ });
  }
  return rules;
}
const parseDecl = (s: string): Record<string, string> => { const d: Record<string, string> = {}; for (const part of s.split(';')) { const i = part.indexOf(':'); if (i > 0) d[part.slice(0, i).trim().toLowerCase()] = part.slice(i + 1).replace(/!important/i, '').trim(); } return d; };
const specificity = (sel: string) => { const ids = (sel.match(/#/g) || []).length, cls = (sel.match(/[.[:]/g) || []).length, tags = sel.split(/[\s>+~]+/).filter(x => /^[a-z]/i.test(x)).length; return ids * 100 + cls * 10 + tags; };
function matchCompound(n: XNode, comp: string): boolean {
  const m = /^([a-zA-Z][\w:-]*|\*)?((?:[.#][\w-]+)*)$/.exec(comp.trim()); if (!m) return false;
  if (m[1] && m[1] !== '*' && localName(n.tag) !== m[1]) return false;
  const cls = (n.attrs.class || '').split(/\s+/);
  for (const part of m[2].match(/[.#][\w-]+/g) || []) { if (part[0] === '.' && !cls.includes(part.slice(1))) return false; if (part[0] === '#' && n.attrs.id !== part.slice(1)) return false; }
  return true;
}
function matches(n: XNode, sel: string): boolean {
  const parts = sel.split(/\s*>\s*|\s+/).filter(Boolean); if (!parts.length) return false;
  if (!matchCompound(n, parts[parts.length - 1])) return false;
  let p = n.parent; for (let i = parts.length - 2; i >= 0; i--) { while (p && !matchCompound(p, parts[i])) p = p.parent; if (!p) return false; p = p.parent; }
  return true;
}

const num = (s: string | undefined, d = 0, ref = 0) => { if (s === undefined || s === '') return d; const v = parseFloat(s); if (isNaN(v)) return d; return s.trim().endsWith('%') ? v / 100 * ref : s.endsWith('pt') ? v * 4 / 3 : s.endsWith('mm') ? v * 96 / 25.4 : s.endsWith('cm') ? v * 96 / 2.54 : s.endsWith('in') ? v * 96 : v; };

export function importSvg(src: string, o: SvgImportOptions = {}): SvgImportResult {
  const doc = parseXml(src); const warnings: string[] = []; const objects: TelaVectorObject[] = [];
  const svg = doc.children.find(c => localName(c.tag) === 'svg') ?? doc;
  const ids = new Map<string, XNode>(); (function walk(n: XNode) { if (n.attrs.id) ids.set(n.attrs.id, n); n.children.forEach(walk); })(svg);
  const rules: Rule[] = []; (function walk(n: XNode) { if (localName(n.tag) === 'style') rules.push(...parseCss(textContent(n) || n.text)); n.children.forEach(walk); })(svg);
  rules.sort((a, b) => a.spec - b.spec || a.order - b.order);
  // root viewport
  const vb = (svg.attrs.viewBox || '').split(/[\s,]+/).map(Number).filter(x => !isNaN(x));
  const sw = num(svg.attrs.width, vb[2] ?? 300), sh = num(svg.attrs.height, vb[3] ?? 150);
  const W = o.width ?? sw, H = o.height ?? sh;
  let root: Matrix = IDENTITY;
  if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) root = viewBoxMatrix(vb, W, H, svg.attrs.preserveAspectRatio);
  else if (W !== sw || H !== sh) root = scaleM(W / sw, H / sh);
  let n = 0; const pid = o.idPrefix ?? 'svg';
  const styleOf = (el: XNode, inherited: Record<string, string>): Record<string, string> => {
    const st: Record<string, string> = {};
    for (const k of Object.keys(inherited)) if (INHERITED.has(k)) st[k] = inherited[k];
    for (const [k, v] of Object.entries(el.attrs)) if (PRESENTATION.has(k)) st[k] = v;
    for (const r of rules) if (matches(el, r.sel)) Object.assign(st, r.decl);
    if (el.attrs.style) Object.assign(st, parseDecl(el.attrs.style));
    for (const [k, v] of Object.entries(st)) if (v === 'inherit') st[k] = inherited[k] ?? '';
    return st;
  };
  const gradient = (id: string, bboxLocal: { x: number; y: number; w: number; h: number }, ctm: Matrix): Paint | null => {
    let g = ids.get(id); if (!g) return null; const chain: XNode[] = []; let guard = 0;
    while (g && guard++ < 8) { chain.push(g); const href: string | undefined = g.attrs.href || g.attrs['xlink:href']; g = href ? ids.get(href.replace(/^#/, '')) : undefined; }
    const attr = (k: string) => chain.find(c => c.attrs[k] !== undefined)?.attrs[k];
    const stopsNode = chain.find(c => c.children.some(ch => localName(ch.tag) === 'stop'));
    const stops: PaintStop[] = (stopsNode?.children ?? []).filter(ch => localName(ch.tag) === 'stop').map(s => {
      const st = { ...Object.fromEntries(Object.entries(s.attrs).filter(([k]) => k.startsWith('stop'))), ...(s.attrs.style ? parseDecl(s.attrs.style) : {}) };
      const off = s.attrs.offset ?? '0'; return { offset: Math.max(0, Math.min(1, off.endsWith('%') ? parseFloat(off) / 100 : parseFloat(off) || 0)), color: st['stop-color'] || '#000', opacity: st['stop-opacity'] !== undefined ? parseFloat(st['stop-opacity']) : undefined };
    });
    if (!stops.length) return null;
    const bbox = (attr('gradientUnits') ?? 'objectBoundingBox') === 'objectBoundingBox';
    const gt = parseTransform(attr('gradientTransform'));
    const unit: Matrix = bbox ? [bboxLocal.w, 0, 0, bboxLocal.h, bboxLocal.x, bboxLocal.y] : IDENTITY;
    const tf = multiply(ctm, multiply(unit, gt));
    const spread = attr('spreadMethod') as 'pad' | 'reflect' | 'repeat' | undefined;
    const L = (k: string, d: string) => { const v = attr(k) ?? d; return v.endsWith('%') ? parseFloat(v) / 100 * (bbox ? 1 : (k.includes('x') ? sw : sh)) : parseFloat(v); };
    const kind = localName(chain[0].tag);
    if (kind === 'linearGradient') return { type: 'linear', x1: L('x1', bbox ? '0' : '0%'), y1: L('y1', '0'), x2: L('x2', bbox ? '1' : '100%'), y2: L('y2', '0'), stops, transform: tf, spread };
    if (kind === 'radialGradient') { const r = L('r', bbox ? '.5' : '50%'); const cx = L('cx', bbox ? '.5' : '50%'), cy = L('cy', bbox ? '.5' : '50%'); return { type: 'radial', cx, cy, r, fx: attr('fx') ? L('fx', '0') : undefined, fy: attr('fy') ? L('fy', '0') : undefined, stops, transform: tf, spread }; }
    if (kind === 'pattern') warnings.push(`pattern #${id} imported as a flat colour`);
    return null;
  };
  const paintOf = (v: string | undefined, op: number, st: Record<string, string>, bboxLocal: { x: number; y: number; w: number; h: number }, ctm: Matrix, dflt: string): Paint | 'none' => {
    if (v === undefined || v === '') v = dflt;
    v = v.trim(); if (v === 'none' || v === 'transparent') return 'none';
    if (v === 'currentColor' || v === 'currentcolor') v = st.color || '#000';
    const m = /^url\(\s*['"]?#([^'")]+)['"]?\s*\)\s*(.*)$/.exec(v);
    if (m) { const g = gradient(m[1], bboxLocal, ctm); if (g) { if (op < 1 && typeof g !== 'string' && 'stops' in g) g.stops = g.stops.map(s => ({ ...s, opacity: (s.opacity ?? 1) * op })); return g; } return m[2] && m[2] !== 'none' ? (op < 1 ? withAlpha(m[2], op) : m[2]) : '#000000'; }
    return op < 1 ? withAlpha(v, op * parseColor(v).a) : v;
  };
  const clipRegion = (ref: string | undefined, ctm: Matrix): CompoundPath | null => {
    const m = ref && /url\(\s*['"]?#([^'")]+)/.exec(ref); if (!m) return null; const cp = ids.get(m[1]); if (!cp) return null;
    const kind = localName(cp.tag); if (kind === 'mask') warnings.push(`mask #${m[1]} approximated as a clip (luminance ignored)`);
    const units = cp.attrs.clipPathUnits ?? cp.attrs.maskContentUnits; if (units === 'objectBoundingBox') warnings.push(`clip #${m[1]} uses objectBoundingBox units (approximated)`);
    const local = multiply(ctm, parseTransform(cp.attrs.transform)); const parts: CompoundPath[] = [];
    const collect = (el: XNode, tm: Matrix) => { const t2 = multiply(tm, parseTransform(el.attrs.transform)); const g = shapeOf(el); if (g) parts.push(transformPath(g, t2)); for (const ch of el.children) collect(ch, t2); if (localName(el.tag) === 'use') { const h = (el.attrs.href || el.attrs['xlink:href'] || '').replace(/^#/, ''); const u = ids.get(h); if (u) collect(u, multiply(t2, translate(num(el.attrs.x), num(el.attrs.y)))); } };
    for (const ch of cp.children) collect(ch, local);
    if (!parts.length) return null;
    return parts.length === 1 ? parts[0] : boolean('union', parts);
  };
  const emit = (geom: CompoundPath, st: Record<string, string>, ctm: Matrix, opacity: number, label: string, clips: CompoundPath[]) => {
    const local = geom; let g = transformPath(geom, ctm); const lb = pathBounds(local);
    const fo = st['fill-opacity'] !== undefined ? parseFloat(st['fill-opacity']) : 1, so = st['stroke-opacity'] !== undefined ? parseFloat(st['stroke-opacity']) : 1;
    let fill = paintOf(st.fill, fo, st, lb, ctm, '#000'); const stroke = paintOf(st.stroke, so, st, lb, ctm, 'none');
    const open = g.subpaths.every(s => !s.closed); if (open && label === 'line') fill = 'none';
    const swLocal = num(st['stroke-width'], 1); const sw = swLocal * meanScale(ctm);
    if (clips.length) {
      const region = clips.length === 1 ? clips[0] : boolean('intersect', clips);
      const heavy = pathCurves(g).reduce((a, c) => a + c.length, 0) > 600 || o.clipMode === 'carry';
      if (heavy) return push(g, fill, stroke, sw, st, opacity, label, { d: toPathData(region) });
      g = clipGeom(g, region); if (!g.subpaths.length) return;
    }
    push(g, fill, stroke, sw, st, opacity, label);
  };
  const push = (g: CompoundPath, fill: Paint | 'none', stroke: Paint | 'none', sw: number, st: Record<string, string>, opacity: number, label: string, clip?: { d: string }) => {
    const dash = st['stroke-dasharray'] && st['stroke-dasharray'] !== 'none' ? st['stroke-dasharray'].split(/[\s,]+/).map(Number).filter(x => !isNaN(x)) : undefined;
    const ob = pathToObject({ ...g, fillRule: (st['fill-rule'] as FillRule) || 'nonzero' }, {
      fill, stroke, strokeWidth: stroke === 'none' ? 0 : sw, opacity,
      strokeStyle: { cap: (st['stroke-linecap'] as LineCap) || 'butt', join: (st['stroke-linejoin'] as LineJoin) || 'miter', miterLimit: st['stroke-miterlimit'] ? parseFloat(st['stroke-miterlimit']) : 4, dash, dashOffset: st['stroke-dashoffset'] ? parseFloat(st['stroke-dashoffset']) : undefined },
      fillRule: (st['fill-rule'] as FillRule) || 'nonzero', blend: (st['mix-blend-mode'] as TelaVectorObject['blendMode']) || undefined, clip, label,
    }, `${pid}_${++n}`);
    objects.push(ob);
  };
  const walk = (el: XNode, ctm: Matrix, inherited: Record<string, string>, opacity: number, clips: CompoundPath[], depth: number) => {
    if (depth > 64) return;
    const tag = localName(el.tag);
    if (['defs', 'style', 'title', 'desc', 'metadata', 'clipPath', 'mask', 'linearGradient', 'radialGradient', 'pattern', 'symbol', 'marker', 'filter', 'script'].includes(tag)) return;
    const st = styleOf(el, inherited);
    if (st.display === 'none' || st.visibility === 'hidden') return;
    let m = multiply(ctm, parseTransform(st.transform ?? el.attrs.transform));
    const op = opacity * (st.opacity !== undefined ? parseFloat(st.opacity) : 1);
    let cl = clips;
    const cref = st['clip-path'] ?? st.mask; if (cref && cref !== 'none') { const r = clipRegion(cref, m); if (r) cl = [...clips, r]; }
    if (st.filter && st.filter !== 'none') warnings.push(`filter on <${tag}> dropped`);
    if (tag === 'svg' && el !== svg) {
      const x = num(el.attrs.x), y = num(el.attrs.y), w = num(el.attrs.width, W), h = num(el.attrs.height, H);
      const v = (el.attrs.viewBox || '').split(/[\s,]+/).map(Number);
      m = multiply(m, translate(x, y)); if (v.length === 4 && v[2] > 0) m = multiply(m, viewBoxMatrix(v, w, h, el.attrs.preserveAspectRatio));
    }
    if (tag === 'use') {
      const h = (el.attrs.href || el.attrs['xlink:href'] || '').replace(/^#/, ''); const ref = ids.get(h); if (!ref) return;
      const um = multiply(m, translate(num(el.attrs.x), num(el.attrs.y)));
      if (localName(ref.tag) === 'symbol') {
        const v = (ref.attrs.viewBox || '').split(/[\s,]+/).map(Number); const sm = v.length === 4 && v[2] > 0 ? multiply(um, viewBoxMatrix(v, num(el.attrs.width, v[2]), num(el.attrs.height, v[3]), ref.attrs.preserveAspectRatio)) : um;
        for (const ch of ref.children) walk(ch, sm, st, op, cl, depth + 1);
      } else walk(ref, um, st, op, cl, depth + 1);
      return;
    }
    if (tag === 'text') {
      const fs = num(st['font-size'], 16); const x = num(el.attrs.x?.split(/[\s,]+/)[0]), y = num(el.attrs.y?.split(/[\s,]+/)[0]);
      const p = apply(m, { x, y }); const k = meanScale(m); const size = fs * k; const anchor = st['text-anchor'];
      const txt = textContent(el); if (!txt) return; const w = Math.max(size, txt.length * size * .55);
      const fillPaint = paintOf(st.fill, st['fill-opacity'] !== undefined ? parseFloat(st['fill-opacity']) : 1, st, { x, y: y - fs, w: w / k, h: fs }, m, '#000');
      objects.push({ id: `${pid}_${++n}`, kind: 'TEXT', x: anchor === 'middle' ? p.x - w / 2 : anchor === 'end' ? p.x - w : p.x, y: p.y - size, w, h: size * 1.3, text: txt, fill: typeof fillPaint === 'string' ? fillPaint : '#000', stroke: 'none', strokeWidth: 0, rotation: 0, opacity: op, fontSize: Math.round(size * 100) / 100, fontFamily: st['font-family'] || 'system-ui, sans-serif', fontWeight: st['font-weight'] === 'bold' ? 700 : parseInt(st['font-weight'] || '400', 10) || 400, fontStyle: st['font-style'] === 'italic' ? 'italic' : undefined, textAlign: anchor === 'middle' ? 'center' : anchor === 'end' ? 'right' : 'left', wrap: false, objectLabel: 'Text', templateRole: 'BODY' });
      return;
    }
    if (tag === 'image') {
      const href = el.attrs.href || el.attrs['xlink:href']; if (!href) return;
      const x = num(el.attrs.x), y = num(el.attrs.y), w = num(el.attrs.width), h = num(el.attrs.height); const a = apply(m, { x, y }), b = apply(m, { x: x + w, y: y + h });
      objects.push({ id: `${pid}_${++n}`, kind: 'IMAGE', x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y), fill: 'none', stroke: 'none', strokeWidth: 0, rotation: 0, opacity: op, sourceImageSrc: href, sourceCrop: { x: 0, y: 0, width: w, height: h, sourceWidth: w, sourceHeight: h }, objectLabel: 'Image', templateRole: 'IMAGE_SLOT' });
      return;
    }
    const g = shapeOf(el);
    if (g) emit(g, st, m, op, tag, cl);
    for (const ch of el.children) walk(ch, m, st, op, cl, depth + 1);
  };
  const shapeOf = (el: XNode): CompoundPath | null => {
    const a = el.attrs; const tag = localName(el.tag);
    switch (tag) {
      case 'path': return a.d ? parsePathData(a.d) : null;
      case 'rect': {
        const w = num(a.width), h = num(a.height); if (w <= 0 || h <= 0) return null;
        let rx = a.rx !== undefined ? num(a.rx) : a.ry !== undefined ? num(a.ry) : 0, ry = a.ry !== undefined ? num(a.ry) : rx; rx = Math.min(rx, w / 2); ry = Math.min(ry, h / 2);
        const x = num(a.x), y = num(a.y);
        if (rx > 0 && Math.abs(rx - ry) > 1e-9) { const k = ry / rx; return transformPath(rectPath(x, y / k, w, h / k, rx), [1, 0, 0, k, 0, 0]); }
        return rectPath(x, y, w, h, rx);
      }
      case 'circle': { const r = num(a.r); return r > 0 ? ellipseAt(num(a.cx), num(a.cy), r, r) : null; }
      case 'ellipse': { const rx = num(a.rx), ry = num(a.ry); return rx > 0 && ry > 0 ? ellipseAt(num(a.cx), num(a.cy), rx, ry) : null; }
      case 'line': return polyPath([{ x: num(a.x1), y: num(a.y1) }, { x: num(a.x2), y: num(a.y2) }], false);
      case 'polyline': case 'polygon': { const v = parsePoints(a.points || ''); const pts = []; for (let i = 0; i + 1 < v.length; i += 2) pts.push({ x: v[i], y: v[i + 1] }); return pts.length > 1 ? polyPath(pts, tag === 'polygon') : null; }
    }
    return null;
  };
  for (const ch of svg.children) walk(ch, root, styleOf(svg, {}), 1, [], 0);
  return { objects, width: W, height: H, warnings: [...new Set(warnings)] };
}

function viewBoxMatrix(vb: number[], w: number, h: number, par?: string): Matrix {
  const [vx, vy, vw, vh] = vb; const p = (par || 'xMidYMid meet').trim();
  if (p.startsWith('none')) return multiply(scaleM(w / vw, h / vh), translate(-vx, -vy));
  const slice = p.includes('slice'); const k = slice ? Math.max(w / vw, h / vh) : Math.min(w / vw, h / vh);
  const al = p.split(/\s+/)[0]; const ax = al.includes('xMin') ? 0 : al.includes('xMax') ? 1 : .5, ay = al.includes('YMin') ? 0 : al.includes('YMax') ? 1 : .5;
  return multiply(translate((w - vw * k) * ax, (h - vh * k) * ay), multiply(scaleM(k), translate(-vx, -vy)));
}
