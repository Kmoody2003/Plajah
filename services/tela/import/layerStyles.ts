// import/layerStyles — ag-psd layer effects → the layerStyle filter material.
import type { LayerStyleSpec } from '../geometry/materials/filters';
import type { Paint, PaintStop } from '../geometry/model';
import type { ReportBuilder } from './types';

const clamp255 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
const hex2 = (v: number) => clamp255(v).toString(16).padStart(2, '0');

/** Any ag-psd colour (RGB, float RGB, CMYK, gray, Lab) as a CSS hex colour. */
export function psdColor(c: any, cmyk?: (c: number, m: number, y: number, k: number, out: number[]) => void): string {
  if (!c) return '#000000';
  if ('r' in c) return `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`;
  if ('fr' in c) return `#${hex2(c.fr * 255)}${hex2(c.fg * 255)}${hex2(c.fb * 255)}`;
  // Effects and fills come from Photoshop descriptors, where ink is a percentage.
  if ('c' in c && 'k' in c) { const o = [0, 0, 0]; if (cmyk) { cmyk(c.c * 2.55, c.m * 2.55, c.y * 2.55, c.k * 2.55, o); return `#${hex2(o[0])}${hex2(o[1])}${hex2(o[2])}`; } const K = 1 - c.k / 100; return `#${hex2(255 * (1 - c.c / 100) * K)}${hex2(255 * (1 - c.m / 100) * K)}${hex2(255 * (1 - c.y / 100) * K)}`; }
  if ('k' in c) { const v = hex2(255 - c.k * 2.55); return `#${v}${v}${v}`; }
  if ('l' in c) { const v = hex2(c.l * 2.55); return `#${v}${v}${v}`; }
  return '#000000';
}

const px = (v: any, d = 0): number => typeof v === 'number' ? v : v?.value ?? d;
const polar = (angleDeg: number, dist: number) => { const a = angleDeg * Math.PI / 180; return { dx: -Math.cos(a) * dist, dy: Math.sin(a) * dist }; };
const on = (x: any) => !!x && x.enabled !== false;
const NEAR: Record<string, string> = { 'linear burn': 'multiply', 'linear dodge': 'screen', 'vivid light': 'hard-light', 'linear light': 'hard-light', 'pin light': 'hard-light', 'hard mix': 'hard-light', 'darker color': 'darken', 'lighter color': 'lighten', subtract: 'difference', divide: 'color-dodge', dissolve: 'normal' };
/** Photoshop blend name as an feBlend mode. */
const feMode = (b?: string) => !b || b === 'normal' ? undefined : NEAR[b] ?? b.replace(/ /g, '-');

export interface StyleOut { spec: LayerStyleSpec | null; fillGradient?: Paint; fillColor?: string }

/** Normalize gradient stops: colours and opacities live on two ramps, merged into one. */
export function gradientStops(g: any, color: (c: any) => string): PaintStop[] {
  const loc = (v: number) => v > 1 ? v / 4096 : v;
  const cs = (g?.colorStops || []).map((s: any) => ({ at: loc(s.location), c: color(s.color) })).sort((a: any, b: any) => a.at - b.at);
  const os = (g?.opacityStops || []).map((s: any) => ({ at: loc(s.location), o: s.opacity })).sort((a: any, b: any) => a.at - b.at);
  const ats = [...new Set<number>([...cs.map((s: any) => s.at), ...os.map((s: any) => s.at)])].sort((a, b) => a - b);
  const lerpC = (at: number) => {
    if (!cs.length) return '#000000'; if (at <= cs[0].at) return cs[0].c; if (at >= cs[cs.length - 1].at) return cs[cs.length - 1].c;
    for (let i = 1; i < cs.length; i++) if (at <= cs[i].at) {
      const a = cs[i - 1], b = cs[i], t = (at - a.at) / Math.max(1e-6, b.at - a.at); const ch = (s: string, n: number) => parseInt(s.slice(1 + n * 2, 3 + n * 2), 16);
      return `#${hex2(ch(a.c, 0) + (ch(b.c, 0) - ch(a.c, 0)) * t)}${hex2(ch(a.c, 1) + (ch(b.c, 1) - ch(a.c, 1)) * t)}${hex2(ch(a.c, 2) + (ch(b.c, 2) - ch(a.c, 2)) * t)}`;
    }
    return cs[0].c;
  };
  const lerpO = (at: number) => {
    if (!os.length) return 1; if (at <= os[0].at) return os[0].o; if (at >= os[os.length - 1].at) return os[os.length - 1].o;
    for (let i = 1; i < os.length; i++) if (at <= os[i].at) { const a = os[i - 1], b = os[i]; return a.o + (b.o - a.o) * (at - a.at) / Math.max(1e-6, b.at - a.at); }
    return 1;
  };
  return ats.map(at => ({ offset: at, color: lerpC(at), opacity: lerpO(at) }));
}

/** A Photoshop gradient (linear/radial/angle/reflected/diamond) across a box, as an engine paint. */
export function psdGradientPaint(fill: { gradient?: any; type?: string; angle?: number; reverse?: boolean; scale?: number; colorStops?: any; opacityStops?: any; style?: string }, box: { x: number; y: number; w: number; h: number }, color: (c: any) => string, report?: ReportBuilder): Paint {
  const g = fill.gradient ?? fill; let stops = gradientStops(g, color);
  if (fill.reverse) stops = stops.map(s => ({ ...s, offset: 1 - s.offset })).reverse();
  const type = (fill as any).style ?? fill.type ?? 'linear', angle = -(fill.angle ?? 0) * Math.PI / 180, scale = (fill.scale ?? 100) > 3 ? (fill.scale ?? 100) / 100 : (fill.scale ?? 1);
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2, c = Math.cos(angle), s = Math.sin(angle);
  const half = (Math.abs(c) * box.w + Math.abs(s) * box.h) / 2 * scale;
  if (type === 'radial' || type === 'angle' || type === 'diamond') {
    if (type !== 'radial') report?.note(`${type[0].toUpperCase()}${type.slice(1)} gradient`, 'approx', 'drawn as a radial gradient');
    return { type: 'radial', cx, cy, r: Math.hypot(box.w, box.h) / 2 * scale, stops };
  }
  if (type === 'reflected') {
    const mirrored = [...stops.map(s => ({ ...s, offset: .5 - s.offset / 2 })).reverse(), ...stops.map(s => ({ ...s, offset: .5 + s.offset / 2 }))];
    return { type: 'linear', x1: cx - c * half, y1: cy - s * half, x2: cx + c * half, y2: cy + s * half, stops: mirrored };
  }
  return { type: 'linear', x1: cx - c * half, y1: cy - s * half, x2: cx + c * half, y2: cy + s * half, stops };
}

/** Map a layer's effects. Vector and text objects take colour/gradient overlays as their real fill. */
export function layerStyleFrom(effects: any, globalAngle: number, opts: { color: (c: any) => string; report: ReportBuilder; canRepaint: boolean; box: { x: number; y: number; w: number; h: number }; fillOpacity?: number; patternSize?: (id: string) => { w: number; h: number } | null }): StyleOut {
  const { color, report } = opts; const out: StyleOut = { spec: null }; const st: LayerStyleSpec = {};
  if ((opts.fillOpacity ?? 1) < 1) st.fillOpacity = opts.fillOpacity;
  if (!effects || effects.disabled) return st.fillOpacity !== undefined ? { spec: st } : out;
  const blendNote = (fx: any, name: string) => { const b = fx.blendMode; if (b && !['normal', 'multiply'].includes(b)) report.note(`${name} blend mode`, 'approx', `${b} composites as Normal inside a filter`); };
  const angleOf = (fx: any) => fx.useGlobalLight ? globalAngle : fx.angle ?? globalAngle;
  const ds = effects.dropShadow?.find(on);
  if (ds) { const { dx, dy } = polar(angleOf(ds), px(ds.distance)), size = px(ds.size); st.dropShadow = { color: color(ds.color), opacity: ds.opacity ?? .75, dx, dy, blur: size * (1 - (ds.choke ?? 0) / 100) / 2, spread: size * (ds.choke ?? 0) / 100 }; report.note('Drop shadow', 'live'); blendNote(ds, 'Drop shadow'); }
  if (effects.dropShadow?.filter(on).length > 1) report.note('Stacked drop shadows', 'approx', 'the first one is used');
  const og = on(effects.outerGlow) ? effects.outerGlow : null;
  if (og) { const size = px(og.size), ch = px(og.choke) ; st.outerGlow = { color: color(og.color), opacity: og.opacity ?? .75, blur: size * (1 - ch / 100) / 2, spread: size * ch / 100 }; report.note('Outer glow', 'live'); blendNote(og, 'Outer glow'); }
  const is = effects.innerShadow?.find(on);
  if (is) { const { dx, dy } = polar(angleOf(is), px(is.distance)), size = px(is.size), ch = px(is.choke); st.innerShadow = { color: color(is.color), opacity: is.opacity ?? .75, dx, dy, blur: size * (1 - ch / 100) / 2, choke: size * ch / 100, blend: feMode(is.blendMode) }; report.note('Inner shadow', 'live'); }
  const ig = on(effects.innerGlow) ? effects.innerGlow : null;
  if (ig) { const size = px(ig.size), ch = px(ig.choke); st.innerGlow = { color: color(ig.color), opacity: ig.opacity ?? .75, blur: size * (1 - ch / 100) / 2, choke: size * ch / 100, center: ig.source === 'center', blend: feMode(ig.blendMode) }; report.note('Inner glow', 'live'); }
  const so = effects.solidFill?.find(on);
  if (so) {
    if (opts.canRepaint && (so.opacity ?? 1) >= .999 && (so.blendMode ?? 'normal') === 'normal') out.fillColor = color(so.color);
    else st.overlay = { color: color(so.color), opacity: so.opacity ?? 1, blend: feMode(so.blendMode) };
    report.note('Color overlay', 'live');
  }
  const gr = effects.gradientOverlay?.find(on);
  if (gr) {
    const paint = psdGradientPaint(gr, opts.box, color, report);
    if (opts.canRepaint && (gr.opacity ?? 1) >= .999 && (gr.blendMode ?? 'normal') === 'normal') { out.fillGradient = paint; report.note('Gradient overlay', 'live'); }
    else {
      st.gradient = { href: gradientDataUri(paint, opts.box), opacity: gr.opacity ?? 1, blend: feMode(gr.blendMode) };
      report.note('Gradient overlay', 'approx', 'drawn over the layer region');
    }
  }
  const sa = on(effects.satin) ? effects.satin : null;
  if (sa) { const { dx, dy } = polar(sa.angle ?? 19, px(sa.distance)); st.satin = { color: color(sa.color), opacity: sa.opacity ?? .5, dx, dy, blur: px(sa.size) / 2, blend: feMode(sa.blendMode) }; report.note('Satin', 'approx', 'shape of the effect is close, contour is ignored'); }
  const bv = on(effects.bevel) ? effects.bevel : null;
  if (bv) { st.bevel = { size: px(bv.size), soften: px(bv.soften), angle: bv.useGlobalLight ? globalAngle : bv.angle ?? globalAngle, altitude: bv.altitude ?? 30, highlight: color(bv.highlightColor), highlightOpacity: bv.highlightOpacity ?? .75, shadow: color(bv.shadowColor), shadowOpacity: bv.shadowOpacity ?? .75, highlightBlend: feMode(bv.highlightBlendMode ?? 'screen'), shadowBlend: feMode(bv.shadowBlendMode ?? 'multiply') }; report.note('Bevel & emboss', 'approx', 'lit with an SVG light; gloss contours are ignored'); }
  const sk = effects.stroke?.find(on);
  if (sk) {
    if (sk.fillType && sk.fillType !== 'color') report.note('Stroke effect with gradient or pattern', 'approx', 'uses its first colour');
    const col = sk.fillType === 'gradient' ? color(sk.gradient?.colorStops?.[0]?.color) : color(sk.color);
    st.stroke = { color: col, opacity: sk.opacity ?? 1, size: px(sk.size), position: sk.position === 'inside' ? 'inside' : sk.position === 'center' ? 'center' : 'outside' }; report.note('Stroke effect', 'live');
  }
  const po = on(effects.patternOverlay) ? effects.patternOverlay : null;
  if (po) {
    const info = opts.patternSize?.(po.pattern?.id);
    if (info) { const k = (po.scale ?? 100) > 3 ? (po.scale ?? 100) / 100 : po.scale ?? 1; st.pattern = { href: `pattern:${po.pattern.id}`, w: info.w * k, h: info.h * k, x: opts.box.x, y: opts.box.y, opacity: po.opacity ?? 1, blend: feMode(po.blendMode) }; report.note('Pattern overlay', 'live'); }
    else report.note('Pattern overlay', 'dropped', 'the pattern is not stored in this file');
  }
  if (Object.keys(st).length) out.spec = st;
  return out;
}

function gradientDataUri(p: Paint, box: { x: number; y: number; w: number; h: number }): string {
  if (typeof p === 'string' || (p.type !== 'linear' && p.type !== 'radial')) return '';
  const stops = p.stops.map(s => `<stop offset="${s.offset}" stop-color="${s.color}" stop-opacity="${s.opacity ?? 1}"/>`).join('');
  const def = p.type === 'linear'
    ? `<linearGradient id="g" gradientUnits="userSpaceOnUse" x1="${p.x1}" y1="${p.y1}" x2="${p.x2}" y2="${p.y2}">${stops}</linearGradient>`
    : `<radialGradient id="g" gradientUnits="userSpaceOnUse" cx="${p.cx}" cy="${p.cy}" r="${p.r}">${stops}</radialGradient>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.x} ${box.y} ${box.w} ${box.h}"><defs>${def}</defs><rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" fill="url(#g)"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
